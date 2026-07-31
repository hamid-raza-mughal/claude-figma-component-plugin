/**
 * The Coordinator engine (§12, §13) — the Guard-mediated tool surface a host
 * integration calls into. **One engine, two host integrations** (§1.4): this
 * class and everything under `src/guard/`, `src/store/`, `src/registry/` are
 * shared and identical across every runtime; only how a caller reaches this
 * class differs (WP9).
 *
 * WP5 wired the tools needing no Phase 1 engine call. This file adds three
 * that do — `prepareContext`, `submitDraft`, `presentForApproval` — calling
 * the existing, unmodified resolver/composer/renderer chain.
 * `buildHandoff` moves to WP7 despite also needing Phase 1's renderer: it
 * embeds the approval record in the machine handoff
 * (`renderMachineHandoff(output, approval)`), and no approval exists until
 * `recordApproval` (WP7) can write one — building it now against nothing
 * would be exactly the kind of half-finished wiring this project's own
 * honesty rules refuse to ship. The remaining artifact-dependent flows
 * (`openClarification`, `answerClarification`, `recordApproval`,
 * `buildHandoff`, `closeRun`, `runMaintenance`) are added to this same class
 * in WP7, not a second one (§1.4 forbids a second engine surface).
 *
 * **PD-7 (docs/phase2-decision-log.md):** `prepareContext` for a `new` run has
 * no semantic elements yet — those are authored during `drafting`, which
 * comes *after* this tool — so the deterministic query planner
 * (`query-planner.ts`'s `PlanRequestItem[]`) has nothing to plan from. This
 * calls `listByCategory` (the Guard's own capped escape hatch, "for when the
 * deterministic planner could not form a safe narrow query") across a fixed
 * set of standard property categories instead, giving the model a bounded,
 * low-confidence spread to pick from. Revisit once `modify`/`audit` gain a
 * real target (FD-1…FD-4) and can feed `resolveBatch` narrower, item-level
 * queries.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RunStore, type ArtifactRow } from '../store/run-store.ts';
import { storePreflight } from '../store/preflight.ts';
import { GuardRefusal } from '../guard/errors.ts';
import { deriveBeginRun, type BeginRunInput } from '../guard/begin-run.ts';
import { foldRunEvents, type DerivedRunState, type RunEventRow } from '../guard/fold.ts';
import type { HostCommandMetadata } from '../guard/provenance.ts';
import { resolveCommand as registryResolveCommand, type ResolveCommandResult } from '../registry/operations.ts';
import { isToolReachableFromPhase, type ToolName, type RunEventKind } from '../registry/transitions.ts';
import { checkRepairEligibility, checkOpenClarification, hasClarificationBudgetRemaining } from '../guard/budgets.ts';
import type { StagePhase, RunOutcome } from '../contracts/run-envelope.ts';
import type { RunType, ResolvedCoordinatorInvocation } from '../contracts/invocation.ts';
import type { Phase1Config } from '../config/phase1-config.ts';
import { ingest } from '../ingestion/curated-json-loader.ts';
import { IndexReader } from '../resolver/index-reader.ts';
import { listByCategory, CALLER_RUN_GUARD } from '../resolver/list-by-category.ts';
import { materializeSelection } from '../resolver/materialize-selection.ts';
import { portFromIndexReader } from '../resolver/resolution-lookup-port.ts';
import { generateSchemaCard } from '../ingestion/schema-card-generator.ts';
import { selectRouteModule } from '../coordinator/select-route-module.ts';
import { assembleModelInput } from '../coordinator/assemble-model-input.ts';
import { assertNoLeakage } from '../coordinator/leakage-assertion.ts';
import { inactiveRouteModuleIds } from '../coordinator/select-route-module.ts';
import { composeTrustedOutput, hashOutput } from '../coordinator/compose-trusted-output.ts';
import { collectSelectedCandidateIds } from '../contracts/coordinator-draft.ts';
import { renderApprovalView, type ApprovalView } from '../rendering/render-approval-view.ts';
import { renderMachineHandoff, renderingsAgree, type MachineHandoff } from '../rendering/render-machine-handoff.ts';
import { SchemaRegistry } from '../validation/schema-validator.ts';
import { findOperationalLeaks, type ApprovalRecord } from '../contracts/run-envelope.ts';
import { hasBlockingGap } from '../contracts/resolution.ts';
import type { CoordinatorJudgmentDraft } from '../contracts/coordinator-draft.ts';
import type { CoordinatorOutput } from '../contracts/coordinator-output.ts';
import type { ResolverCandidate } from '../contracts/resolution.ts';
import type { SchemaCard } from '../contracts/source.ts';

/** §11.3.1's constant, until a Phase 3+ artifact widens the spec. Not a config
 *  value: it names the P1-FINAL spec revision this engine implements, not
 *  anything that varies by environment. */
const SPEC_SCHEMA_VERSION = '2.0.0';

/** PD-7: standard property categories probed via `listByCategory` when no
 *  semantic elements exist yet to plan narrower queries from. Small cap per
 *  category — a broadened listing is explicitly low-confidence (§13.5
 *  "compact by contract"), so this stays a bounded spread, not a dump. */
const GENERIC_CANDIDATE_CATEGORIES = ['color', 'typography', 'spacing', 'effect', 'corner-radius'] as const;
const GENERIC_CANDIDATE_CAP = 5;

export type EngineConfig = {
  readonly phase1Config: () => Phase1Config;
  readonly now?: () => string;
};

export type BeginRunToolResult = {
  readonly run_id: string;
  readonly display_id: string;
  readonly run_type: RunType;
  readonly phase: 'received';
};

export type ResumeRunResult = {
  readonly phase: StagePhase;
  readonly pending_action: string;
};

export type PrepareContextResult = {
  readonly candidates: Readonly<Record<string, readonly ResolverCandidate[]>>;
  readonly schema_card: SchemaCard;
  readonly route_module: string;
  readonly assembled_bytes: number;
};

export type SubmitDraftResult =
  | { readonly outcome: 'accepted'; readonly artifact_sha256: string }
  | { readonly outcome: 'repairable'; readonly evidence: readonly { readonly code: string; readonly message: string }[] }
  | { readonly outcome: 'terminal'; readonly evidence: readonly { readonly code: string; readonly message: string }[] };

export type PresentForApprovalResult = {
  readonly artifact_sha256: string;
  readonly approval_view: ApprovalView;
};

export type OpenClarificationResult = {
  readonly round: number;
  readonly phase: 'awaiting-clarification';
};

export type AnswerClarificationResult = {
  readonly phase: 'drafting';
};

export type ClarificationAnswer = {
  readonly gap_id: string;
  readonly answer: string;
};

export type RecordApprovalDecision = 'approved' | 'rejected' | 'changes-requested';

export type RecordApprovalResult =
  | { readonly outcome: 'advance'; readonly phase: 'handoff-ready' }
  | { readonly outcome: 'redraft'; readonly phase: 'drafting' }
  | { readonly outcome: 'terminal'; readonly phase: 'terminal' };

export type BuildHandoffResult = {
  readonly machine_handoff: MachineHandoff;
  readonly next_route: 'builder' | 'synthesizer' | null;
};

export type CloseRunResult = {
  readonly outcome: RunOutcome;
};

export type RunMaintenanceResult = {
  readonly ok: boolean;
  readonly outcome: string;
  readonly invalidated_run_ids: readonly string[];
};

/** §3.3.1: 72 hours, one value for both runtimes. */
const STALENESS_THRESHOLD_MS = 72 * 60 * 60 * 1000;

function msSince(iso: string, now: string): number {
  return new Date(now).getTime() - new Date(iso).getTime();
}

/**
 * §13.2's `error_code` is meant to be diagnosable, so it prefers a specific
 * `.code` (`GuardRefusal`, `ResolveCommandError`, `OperationMappingError`,
 * ...) over the generic `.name` every `Error` already has — falling back to
 * `.name` only for errors that never named themselves more specifically.
 */
function errorCodeOf(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code: unknown }).code;
    if (typeof code === 'string') return code;
  }
  if (error instanceof Error) return error.name;
  return 'UNKNOWN';
}

export class CoordinatorEngine {
  private store: RunStore | undefined;
  private registry: SchemaRegistry | undefined;
  private readonly config: EngineConfig;

  constructor(config: EngineConfig) {
    this.config = config;
  }

  /** Schemas are static for the process lifetime — built once, like the store. */
  private getRegistry(): SchemaRegistry {
    if (this.registry !== undefined) return this.registry;
    const dir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'schemas', 'coordinator');
    const reg = new SchemaRegistry();
    for (const file of ['semantic.schema.json', 'coordinator-output.schema.json', 'coordinator-judgment-draft.schema.json']) {
      reg.register(JSON.parse(readFileSync(join(dir, file), 'utf8')) as object);
    }
    this.registry = reg;
    return reg;
  }

  /** §4.1: "loads or reuses the index" — Phase 1's own content-addressed reuse
   *  (`ingest`) decides whether a rebuild is needed; this never re-implements
   *  that decision. Returns a reader the caller must `close()`. */
  private openCurrentIndex(): { readonly reader: IndexReader; readonly sourceSha256: string; readonly indexVersion: string } {
    const result = ingest(this.config.phase1Config(), { now: this.now() });
    const reader = new IndexReader(result.database_path);
    return { reader, sourceSha256: reader.meta.source_sha256, indexVersion: reader.meta.index_version };
  }

  private now(): string {
    return this.config.now?.() ?? new Date().toISOString();
  }

  /** §11.0.1: preflight runs before any run-bearing tool, at the first
   *  resolveCommand/beginRun/resumeRun of a session — enforced by every
   *  tool method routing through this before doing anything else. */
  private getStore(): RunStore {
    if (this.store !== undefined) return this.store;
    const result = storePreflight(this.config.phase1Config().approvedDataDirectory, this.now());
    if (!result.ok) {
      throw new GuardRefusal(
        result.guardCode,
        `Store preflight refused (${result.classification}): ${result.remedy.join(' ')}`,
      );
    }
    this.store = new RunStore(result.databasePath);
    return this.store;
  }

  /** Test-only escape hatch to inspect what §13.2 recorded. */
  getToolInvocations(runId: string | null): ReturnType<RunStore['getToolInvocations']> {
    return this.getStore().getToolInvocations(runId);
  }

  private foldRun(runId: string): DerivedRunState {
    const events = this.getStore().getEvents(runId);
    return foldRunEvents(events);
  }

  private mostRecentEventOfKind(runId: string, kind: RunEventRow['kind']): RunEventRow | undefined {
    const events = this.getStore().getEvents(runId);
    for (let i = events.length - 1; i >= 0; i -= 1) {
      if (events[i]?.kind === kind) return events[i];
    }
    return undefined;
  }

  /**
   * §13.2: every call is recorded, success or refusal. If the store itself
   * cannot be reached, `getStore()` throws before this can log anything —
   * there is nowhere to persist that refusal, which is itself the correct,
   * unavoidable exception (G-20a/c mean the store the log would live in is
   * exactly what's unreachable).
   */
  private invoke<T>(runId: string | null, tool: ToolName, fn: (store: RunStore) => T): T {
    const store = this.getStore();
    const startedAt = this.now();
    const startMs = Date.now();
    try {
      const result = fn(store);
      store.logToolInvocation(runId, tool, startedAt, Date.now() - startMs, true, null);
      return result;
    } catch (error: unknown) {
      store.logToolInvocation(runId, tool, startedAt, Date.now() - startMs, false, errorCodeOf(error));
      throw error;
    }
  }

  /** G-11: refuses a phase-scoped tool the current phase's surface omits.
   *  Non-phase-scoped tools always pass (checked upstream by the registry). */
  private assertReachable(tool: ToolName, phase: StagePhase): void {
    if (!isToolReachableFromPhase(tool, phase)) {
      throw new GuardRefusal('G-11', `"${tool}" is not reachable from phase "${phase}" (§12.2).`);
    }
  }

  /**
   * Lazy staleness (§3.3.2, D-4): evaluated here, inside a tool call that
   * already touches the run — never on a schedule, never in the background.
   * Transitions to terminal/timed-out and returns the *new* state when stale;
   * the caller must then refuse whatever it was about to do against a
   * terminal run, exactly as `resumeRun` does immediately below.
   */
  private expireIfStale(runId: string, state: DerivedRunState): DerivedRunState {
    if (state.phase === 'terminal') return state;
    if (state.lastEventAt === undefined) return state;
    if (msSince(state.lastEventAt, this.now()) <= STALENESS_THRESHOLD_MS) return state;
    const store = this.getStore();
    const seq = store.getMaxSeq(runId) + 1;
    const at = this.now();
    const appended = store.appendEvent(runId, seq, at, 'run-timed-out', state.phase, 'terminal', {});
    if (!appended.ok) {
      // Lost the CAS race to another caller expiring/advancing the same run —
      // re-fold and let the caller see whatever actually landed.
      return this.foldRun(runId);
    }
    store.logToolInvocation(runId, 'expireRun', at, 0, true, null);
    return this.foldRun(runId);
  }

  resolveCommand(publicName: string): ResolveCommandResult {
    return this.invoke(null, 'resolveCommand', () => registryResolveCommand(publicName));
  }

  /**
   * §10 row 1, §13. G-2/G-3a/G-3b are the Guard's (`deriveBeginRun`); this
   * method adds the store write and D-6's collision retry (mint a *new*
   * `run_id` and re-derive, since `display_id` is pure derivation — there is
   * nothing else to vary).
   */
  beginRun(input: BeginRunInput, hostCommandMetadata?: HostCommandMetadata): BeginRunToolResult {
    return this.invoke(null, 'beginRun', (store) => {
      let derived = deriveBeginRun(input, hostCommandMetadata);
      let attempts = 0;
      while (store.displayIdExists(derived.display_id)) {
        attempts += 1;
        if (attempts > 5) {
          throw new GuardRefusal('G-2', 'display_id collision persisted after 5 re-mints — investigate run_id entropy.');
        }
        derived = deriveBeginRun(input, hostCommandMetadata);
      }
      const { reader, sourceSha256, indexVersion } = this.openCurrentIndex();
      reader.close();
      const requestedAt = this.now();
      store.createRun({
        run_id: derived.run_id,
        display_id: derived.display_id,
        operation_id: input.operation_id,
        run_type: derived.run_type,
        route_provenance: derived.route_provenance,
        route_verified: derived.route_verified,
        user_intent: input.user_intent,
        target_ref: input.target?.tree_ref ?? null,
        requested_at: requestedAt,
        source_sha256: sourceSha256,
        index_version: indexVersion,
        spec_schema_version: SPEC_SCHEMA_VERSION,
        invoked_as: input.operation_id,
      });
      const appended = store.appendEvent(derived.run_id, 1, requestedAt, 'run-begun', null, 'received', {
        operation_id: input.operation_id,
      });
      if (!appended.ok) {
        // seq 1 on a run just created cannot lose a CAS race to anything —
        // a fresh run_id has no prior events. Unreachable in practice.
        throw new GuardRefusal('G-20b', 'Failed to append the run-begun event for a newly created run.');
      }
      return { run_id: derived.run_id, display_id: derived.display_id, run_type: derived.run_type, phase: 'received' };
    });
  }

  /**
   * §13's row: stale -> `expireRun` first, then refused against a terminal
   * run; G-20a/c already fire inside `getStore()`; G-21 is checked here since
   * a `source-invalidated` run is otherwise indistinguishable from a normal
   * one by phase alone.
   */
  resumeRun(runIdOrDisplayId: string): ResumeRunResult {
    return this.invoke(null, 'resumeRun', (store) => {
      const byId = store.getRun(runIdOrDisplayId);
      const run =
        byId ?? this.findByDisplayId(store, runIdOrDisplayId) ?? this.refuseUnknownRun(runIdOrDisplayId);
      let state = this.foldRun(run.run_id);
      state = this.expireIfStale(run.run_id, state);
      if (state.sourceInvalidated && state.phase !== 'terminal') {
        throw new GuardRefusal(
          'G-21',
          `Run "${run.run_id}" carries a source-invalidated event — only closeRun (blocked) ` +
            'and cancelRun remain reachable (§2.11.2).',
        );
      }
      return { phase: state.phase, pending_action: this.describePendingAction(state) };
    });
  }

  private describePendingAction(state: DerivedRunState): string {
    if (state.phase === 'terminal') return `terminal: ${state.outcome ?? 'unknown'}`;
    const byPhase: Partial<Record<StagePhase, string>> = {
      received: 'awaiting prepareContext',
      preparing: 'preparing context',
      drafting: 'awaiting a submitted draft',
      'awaiting-clarification': 'awaiting an answer to open clarification questions',
      validating: 'validating the submitted draft',
      'awaiting-approval': 'awaiting a recorded approval decision',
      'handoff-ready': 'awaiting buildHandoff',
    };
    return byPhase[state.phase] ?? 'unknown';
  }

  private findByDisplayId(store: RunStore, displayId: string): ReturnType<RunStore['getRun']> {
    // There is no dedicated lookup-by-display_id read path yet beyond the
    // existence check; resumeRun needs the full row, so this does one lookup
    // via a second query rather than adding a third public method that
    // duplicates getRun's shape for a single extra WHERE clause.
    return store.getRunByDisplayId(displayId);
  }

  private refuseUnknownRun(idOrDisplayId: string): never {
    throw new GuardRefusal('G-1', `No run found for "${idOrDisplayId}".`);
  }

  /** §8's table, §13's row: refuses a non-terminal failure class. */
  failRun(runId: string, failureClass: string): { readonly outcome: 'failed' } {
    return this.invoke(runId, 'failRun', (store) => {
      const state = this.foldRun(runId);
      this.assertReachable('failRun', state.phase);
      const kindByPhase: Partial<Record<StagePhase, 'run-failed-during-received' | 'run-failed-during-preparing' | 'run-failed-during-validation'>> = {
        received: 'run-failed-during-received',
        preparing: 'run-failed-during-preparing',
        validating: 'run-failed-during-validation',
      };
      const kind = kindByPhase[state.phase];
      if (kind === undefined) {
        throw new GuardRefusal('G-1', `failRun has no registered transition from phase "${state.phase}".`);
      }
      const seq = store.getMaxSeq(runId) + 1;
      const appended = store.appendEvent(runId, seq, this.now(), kind, state.phase, 'terminal', {
        failure_class: failureClass,
      });
      if (!appended.ok) throw new GuardRefusal('G-20b', 'CAS conflict appending failRun — re-read and retry.');
      return { outcome: 'failed' as const };
    });
  }

  /** §8's table, §13's row: already-terminal is refused, not a no-op. */
  cancelRun(runId: string): { readonly outcome: 'cancelled' } {
    return this.invoke(runId, 'cancelRun', (store) => {
      const state = this.foldRun(runId);
      this.assertReachable('cancelRun', state.phase);
      const seq = store.getMaxSeq(runId) + 1;
      const appended = store.appendEvent(runId, seq, this.now(), 'run-cancelled', state.phase, 'terminal', {});
      if (!appended.ok) throw new GuardRefusal('G-20b', 'CAS conflict appending cancelRun — re-read and retry.');
      return { outcome: 'cancelled' as const };
    });
  }

  private refuseIfSourceInvalidated(runId: string, state: DerivedRunState): void {
    // PD-8: G-21's literal tool list is resumeRun/presentForApproval/
    // recordApproval/buildHandoff/closeRun-completed, but the same principle —
    // never let an invalidated run make forward progress — applies one phase
    // earlier too, where nothing else would catch it.
    if (state.sourceInvalidated && state.phase !== 'terminal') {
      throw new GuardRefusal(
        'G-21',
        `Run "${runId}" carries a source-invalidated event — only closeRun (blocked) ` +
          'and cancelRun remain reachable (§2.11.2, PD-8).',
      );
    }
  }

  /**
   * §4.1, §10 row 2 (+ its non-caller-invocable continuation, row 4): loads
   * or reuses the index, generates candidates (PD-7), the schema card and
   * route module, assembles the model input, and runs the leakage assertion.
   * Both phase-transition events (`received`→`preparing`→`drafting`) are
   * appended together — the same external call realizes both §10 rows.
   */
  prepareContext(runId: string): PrepareContextResult {
    return this.invoke(runId, 'prepareContext', (store) => {
      const run = store.getRun(runId);
      if (run === undefined) throw new GuardRefusal('G-1', `No run found for "${runId}".`);
      const state = this.foldRun(runId);
      this.assertReachable('prepareContext', state.phase);
      this.refuseIfSourceInvalidated(runId, state);

      const { reader } = this.openCurrentIndex();
      try {
        const candidates: Record<string, readonly ResolverCandidate[]> = {};
        for (const category of GENERIC_CANDIDATE_CATEGORIES) {
          const broadened = listByCategory(reader, {
            caller: CALLER_RUN_GUARD,
            property_category: category,
            broadened_from: `no semantic elements exist yet for run "${runId}" (PD-7)`,
            cap: GENERIC_CANDIDATE_CAP,
          });
          candidates[`category:${category}`] = broadened.candidates;
        }

        const schemaCard = generateSchemaCard(reader);
        const routeModule = selectRouteModule(run.run_type);
        const assembled = assembleModelInput({
          run_type: run.run_type,
          user_intent: run.user_intent,
          schema_card: schemaCard,
          candidates_by_query: candidates,
        });

        // §15.6: only ingestion may read raw curated JSON, so checks 1-2 do not
        // run here — raw_source_checked correctly reads false, an honest
        // "not proven" rather than a fabricated pass.
        const leakage = assertNoLeakage({
          assembled,
          inactiveRouteModuleIds: inactiveRouteModuleIds(run.run_type),
        });
        if (!leakage.clean) {
          throw new GuardRefusal(
            'G-4',
            `Leakage assertion failed: ${leakage.findings.map((f) => `${f.kind}: ${f.detail}`).join('; ')}`,
          );
        }

        const at = this.now();
        const seq = store.getMaxSeq(runId) + 1;
        const started = store.appendEvent(runId, seq, at, 'context-preparation-started', 'received', 'preparing', {});
        if (!started.ok) throw new GuardRefusal('G-20b', 'CAS conflict starting context preparation.');
        const succeeded = store.appendEvent(runId, seq + 1, at, 'context-preparation-succeeded', 'preparing', 'drafting', {});
        if (!succeeded.ok) throw new GuardRefusal('G-20b', 'CAS conflict completing context preparation.');

        return {
          candidates,
          schema_card: schemaCard,
          route_module: routeModule.module_id,
          assembled_bytes: assembled.total_bytes,
        };
      } finally {
        reader.close();
      }
    });
  }

  /**
   * §4.3/§4.4, §10 rows 6/7/11, §13. Materializes the draft's selections
   * against the index (never trusting the model's claims about them),
   * composes, and on `ready` persists the artifact. A `repairable` verdict
   * appends both the entry into `validating` and the Guard-recorded return to
   * `drafting` in one call (row 7 is not caller-invocable); an exhausted
   * budget leaves the run in `validating` for an explicit `failRun` (row 11's
   * literal trigger), returned here as `terminal` evidence, not auto-closed.
   */
  submitDraft(runId: string, draft: CoordinatorJudgmentDraft): SubmitDraftResult {
    return this.invoke(runId, 'submitDraft', (store) => {
      const run = store.getRun(runId);
      if (run === undefined) throw new GuardRefusal('G-1', `No run found for "${runId}".`);
      const state = this.foldRun(runId);
      this.assertReachable('submitDraft', state.phase);
      this.refuseIfSourceInvalidated(runId, state);

      // G-4, belt-and-braces beyond schema closure (§14.3.4's executable form).
      const leaks = findOperationalLeaks(draft);
      if (leaks.length > 0) {
        throw new GuardRefusal(
          'G-4',
          `Draft contains operational fields: ${leaks.map((l) => `${l.field}@${l.path}`).join(', ')}`,
        );
      }

      const { reader } = this.openCurrentIndex();
      try {
        const invocation: ResolvedCoordinatorInvocation = {
          run_id: runId,
          run_type: run.run_type,
          user_intent: run.user_intent,
          requested_at: run.requested_at,
        };
        const selections = collectSelectedCandidateIds(draft).map((candidateId) => ({ candidate_id: candidateId }));
        const materialization = materializeSelection(reader, selections);
        const materialized = new Map(materialization.resolutions.map((r) => [r.candidate_id, r]));

        const composed = composeTrustedOutput({
          invocation,
          draft,
          snapshot: {
            source_sha256: reader.meta.source_sha256,
            index_version: reader.meta.index_version,
            source_schema_version: reader.meta.source_schema_version,
            source_bytes: reader.meta.source_bytes,
          },
          port: portFromIndexReader(reader),
          registry: this.getRegistry(),
          materialized,
          composedAt: this.now(),
        });

        const at = this.now();
        const seq = store.getMaxSeq(runId) + 1;

        if (composed.ok) {
          const appended = store.appendEvent(runId, seq, at, 'draft-submitted', 'drafting', 'validating', {
            output_sha256: composed.output_sha256,
            status: composed.output.status,
            canonical_output: composed.output,
          });
          if (!appended.ok) throw new GuardRefusal('G-20b', 'CAS conflict appending draft-submitted.');
          if (composed.output.status === 'ready') {
            store.putArtifact(runId, composed.output_sha256, at, JSON.stringify(composed.output));
          }
          return { outcome: 'accepted', artifact_sha256: composed.output_sha256 };
        }

        // ok:false is always validation-failure (§6.1), repairable up to the
        // one-call budget (§6.2). Either way row 6 (draft-submitted) happens
        // first — the composer ran and produced a failed-shaped output.
        const submitted = store.appendEvent(runId, seq, at, 'draft-submitted', 'drafting', 'validating', {
          failed_step: composed.failed_step,
          ...(composed.output === undefined ? {} : { canonical_output: composed.output }),
        });
        if (!submitted.ok) throw new GuardRefusal('G-20b', 'CAS conflict appending draft-submitted.');
        const evidence = composed.findings.map((f) => ({ code: f.code, message: f.message }));

        if (checkRepairEligibility(state)) {
          const repair = store.appendEvent(runId, seq + 1, at, 'draft-repair-requested', 'validating', 'drafting', {
            evidence,
          });
          if (!repair.ok) throw new GuardRefusal('G-20b', 'CAS conflict appending draft-repair-requested.');
          return { outcome: 'repairable', evidence };
        }
        // Repair budget spent — stays in validating; the caller must call
        // failRun explicitly (row 11's literal trigger, §6.5).
        return { outcome: 'terminal', evidence };
      } finally {
        reader.close();
      }
    });
  }

  /**
   * §4.5, §10 row 9, §13's row: reads the stored artifact and renders it.
   * Composes nothing and computes no hash — G-19a's refusal is structural
   * here, since `getCurrentArtifact` only ever returns a row for a `ready`
   * composition (§4.4 never writes one otherwise).
   */
  presentForApproval(runId: string): PresentForApprovalResult {
    return this.invoke(runId, 'presentForApproval', (store) => {
      const state = this.foldRun(runId);
      this.assertReachable('presentForApproval', state.phase);
      this.refuseIfSourceInvalidated(runId, state);
      const artifact = this.requireReadyArtifact(store, runId);
      const output = JSON.parse(artifact.canonical_json) as CoordinatorOutput;
      const approvalView = renderApprovalView(output);
      const seq = store.getMaxSeq(runId) + 1;
      const appended = store.appendEvent(runId, seq, this.now(), 'approval-presented', 'validating', 'awaiting-approval', {
        artifact_sha256: artifact.artifact_sha256,
      });
      if (!appended.ok) throw new GuardRefusal('G-20b', 'CAS conflict appending approval-presented.');
      return { artifact_sha256: artifact.artifact_sha256, approval_view: approvalView };
    });
  }

  private requireReadyArtifact(store: RunStore, runId: string): ArtifactRow {
    const artifact = store.getCurrentArtifact(runId);
    if (artifact === undefined) {
      throw new GuardRefusal(
        'G-19a',
        `No ready artifact exists for run "${runId}" — presentForApproval requires a ready composition (§4.6).`,
      );
    }
    return artifact;
  }

  /**
   * §5, §10 row 8, §13's row. Gaps are read from the submitted draft, not
   * re-supplied (§13's own words) — retrieved from the most recent
   * `draft-submitted` event's stored output, never from a caller-supplied
   * list. `opened_in_round` is the model's echo (§5.3.1): validated equal to
   * the Guard-derived round (G-6b), never trusted as authority.
   */
  openClarification(runId: string): OpenClarificationResult {
    return this.invoke(runId, 'openClarification', (store) => {
      const state = this.foldRun(runId);
      this.assertReachable('openClarification', state.phase);
      this.refuseIfSourceInvalidated(runId, state);

      const draftEvent = this.mostRecentEventOfKind(runId, 'draft-submitted');
      const output = draftEvent?.payload['canonical_output'] as CoordinatorOutput | undefined;
      if (output === undefined || output.status !== 'blocked') {
        throw new GuardRefusal(
          'G-1',
          `No blocked composition exists for run "${runId}" — openClarification has nothing to open.`,
        );
      }
      const gaps = output.active_gaps;
      if (!hasBlockingGap(gaps)) {
        throw new GuardRefusal('G-1', `Run "${runId}" has no active blocking gap to clarify.`);
      }
      const openedInRound = gaps[0]?.opened_in_round;
      if (openedInRound === undefined || !gaps.every((gap) => gap.opened_in_round === openedInRound)) {
        throw new GuardRefusal('G-6b', 'Every gap in one composition must share one opened_in_round.');
      }
      checkOpenClarification(state, openedInRound);

      const seq = store.getMaxSeq(runId) + 1;
      const appended = store.appendEvent(
        runId,
        seq,
        this.now(),
        'clarification-opened',
        'validating',
        'awaiting-clarification',
        { gaps },
      );
      if (!appended.ok) throw new GuardRefusal('G-20b', 'CAS conflict appending clarification-opened.');
      return { round: openedInRound, phase: 'awaiting-clarification' };
    });
  }

  /**
   * §5.4, §10 row 12, §13's row. Approvals for the superseded artifact are
   * voided by construction, not by deletion (§7.5) — the next `submitDraft`
   * composes a new artifact, and G-7/G-8 always compare against whatever
   * `getCurrentArtifact` returns at the time, never a value cached here.
   */
  answerClarification(
    runId: string,
    round: number,
    answers: readonly ClarificationAnswer[],
  ): AnswerClarificationResult {
    return this.invoke(runId, 'answerClarification', (store) => {
      const state = this.foldRun(runId);
      this.assertReachable('answerClarification', state.phase);
      this.refuseIfSourceInvalidated(runId, state);
      if (round !== state.clarificationRoundCount) {
        throw new GuardRefusal(
          'G-1',
          `Run "${runId}" is awaiting answers for round ${state.clarificationRoundCount}, not ${round}.`,
        );
      }
      const seq = store.getMaxSeq(runId) + 1;
      const appended = store.appendEvent(
        runId,
        seq,
        this.now(),
        'clarification-answered',
        'awaiting-clarification',
        'drafting',
        { round, answers },
      );
      if (!appended.ok) throw new GuardRefusal('G-20b', 'CAS conflict appending clarification-answered.');
      return { phase: 'drafting' };
    });
  }

  /**
   * §7, §10 rows 14/15/16, §13's row. `gate_mode` is always
   * `observe-only-validation` in Phase 2 (G-9a); `verified`/`authorizing` are
   * always `false` (G-9b) — structural, since `RecordApprovalDecision` and
   * this method's own parameters give a caller no field to supply otherwise.
   * G-7/G-8: the artifact presented must still be the artifact current now.
   */
  recordApproval(runId: string, decision: RecordApprovalDecision, approvedBy: string): RecordApprovalResult {
    return this.invoke(runId, 'recordApproval', (store) => {
      const state = this.foldRun(runId);
      this.assertReachable('recordApproval', state.phase);
      this.refuseIfSourceInvalidated(runId, state);

      const artifact = this.requireReadyArtifact(store, runId);
      const presented = this.mostRecentEventOfKind(runId, 'approval-presented');
      const presentedSha = presented?.payload['artifact_sha256'];
      if (presentedSha !== artifact.artifact_sha256) {
        throw new GuardRefusal(
          'G-8',
          `Run "${runId}"'s artifact changed since it was presented — re-present before recording a decision.`,
        );
      }

      const at = this.now();
      store.putApproval({
        run_id: runId,
        gate: 'gate-1-semantic',
        gate_mode: 'observe-only-validation',
        approved_artifact_sha256: artifact.artifact_sha256,
        decision,
        approved_at: at,
        approved_by: approvedBy,
        response_source: 'model-relayed',
        verified: false,
        authorizing: false,
      });

      const seq = store.getMaxSeq(runId) + 1;
      if (decision === 'approved') {
        const appended = store.appendEvent(runId, seq, at, 'approval-recorded-approved', 'awaiting-approval', 'handoff-ready', {});
        if (!appended.ok) throw new GuardRefusal('G-20b', 'CAS conflict appending approval-recorded-approved.');
        return { outcome: 'advance', phase: 'handoff-ready' };
      }
      if (decision === 'changes-requested') {
        const appended = store.appendEvent(
          runId,
          seq,
          at,
          'approval-recorded-changes-requested',
          'awaiting-approval',
          'drafting',
          {},
        );
        if (!appended.ok) {
          throw new GuardRefusal('G-20b', 'CAS conflict appending approval-recorded-changes-requested.');
        }
        return { outcome: 'redraft', phase: 'drafting' };
      }
      const appended = store.appendEvent(runId, seq, at, 'run-blocked-approval-rejected', 'awaiting-approval', 'terminal', {
        reason: 'gate-1-rejected',
      });
      if (!appended.ok) throw new GuardRefusal('G-20b', 'CAS conflict appending run-blocked-approval-rejected.');
      return { outcome: 'terminal', phase: 'terminal' };
    });
  }

  /**
   * §9.2, §10 row 17 (the compound-trigger row), §13's row. Appends the
   * `handoff-built` marker (§11.2) — carries the payload §9.2.1's value 4
   * reads, but does not itself change phase; `closeRun completed` (row 17's
   * other half) is the actual `handoff-ready -> terminal` transition, and it
   * runs G-10's four-value check, not this method.
   */
  buildHandoff(runId: string): BuildHandoffResult {
    return this.invoke(runId, 'buildHandoff', (store) => {
      const state = this.foldRun(runId);
      this.assertReachable('buildHandoff', state.phase);
      this.refuseIfSourceInvalidated(runId, state);

      const artifact = store.getCurrentArtifact(runId);
      if (artifact === undefined) throw new GuardRefusal('G-19b', `No artifact exists for run "${runId}".`);
      const output = JSON.parse(artifact.canonical_json) as CoordinatorOutput;
      if (output.next_route === null) {
        throw new GuardRefusal(
          'G-19b',
          `Run "${runId}"'s bound artifact has a null next_route — buildHandoff cannot proceed (§4.6, §9.1).`,
        );
      }

      const approvalRow = store.getLatestApproval(runId);
      const approval: ApprovalRecord | undefined =
        approvalRow === undefined
          ? undefined
          : {
              gate: approvalRow.gate,
              gate_mode: 'observe-only-validation',
              approved_artifact_sha256: approvalRow.approved_artifact_sha256,
              approved_at: approvalRow.approved_at,
              approved_by: approvalRow.approved_by,
              decision: approvalRow.decision,
              response_source: 'model-relayed',
              verified: approvalRow.verified,
              authorizing: approvalRow.authorizing,
            };

      const handoff = renderMachineHandoff(output, approval);
      const seq = store.getMaxSeq(runId) + 1;
      const appended = store.appendEvent(runId, seq, this.now(), 'handoff-built', null, null, {
        source_object_sha256: handoff.source_object_sha256,
        machine_handoff: handoff,
      });
      if (!appended.ok) throw new GuardRefusal('G-20b', 'CAS conflict appending handoff-built.');
      return { machine_handoff: handoff, next_route: output.next_route };
    });
  }

  /**
   * §9, §10 rows 10/13/17/20, §13's row. `outcome` selects which of §10's
   * terminal rows applies; `completed` is G-10's four-value check (§9.2.1,
   * D-9) — the one place a stored-bytes re-hash must actually re-parse from
   * storage, or the check proves nothing (§9.2.1's own point about the
   * tautology it replaces). `blocked` on a `source-invalidated` run is G-21's
   * designated exit and is allowed even though every *other* forward tool is
   * refused for that run.
   */
  closeRun(runId: string, outcome: 'completed' | 'blocked'): CloseRunResult {
    return this.invoke(runId, 'closeRun', (store) => {
      const state = this.foldRun(runId);
      this.assertReachable('closeRun', state.phase);

      if (outcome === 'blocked') {
        if (state.sourceInvalidated) {
          return this.appendTerminal(store, runId, 'run-blocked-source-invalidated', state.phase, { reason: 'source-invalidated' });
        }
        if (state.phase === 'validating') {
          const draftEvent = this.mostRecentEventOfKind(runId, 'draft-submitted');
          const output = draftEvent?.payload['canonical_output'] as CoordinatorOutput | undefined;
          const blocked = output !== undefined && output.status === 'blocked' && hasBlockingGap(output.active_gaps);
          if (!blocked) {
            throw new GuardRefusal('G-1', `Run "${runId}" is not blocked with active gaps — nothing to close blocked.`);
          }
          if (hasClarificationBudgetRemaining(state)) {
            throw new GuardRefusal('G-1', `Run "${runId}" still has clarification budget — call openClarification first.`);
          }
          return this.appendTerminal(store, runId, 'run-blocked-no-clarification-budget', 'validating', {});
        }
        if (state.phase === 'awaiting-clarification') {
          if (hasClarificationBudgetRemaining(state)) {
            throw new GuardRefusal('G-1', `Run "${runId}" still has clarification budget remaining (§5.5).`);
          }
          return this.appendTerminal(store, runId, 'run-blocked-clarification-budget-exhausted', 'awaiting-clarification', {});
        }
        throw new GuardRefusal('G-1', `closeRun(blocked) has no registered row from phase "${state.phase}".`);
      }

      // outcome === 'completed': G-10, four independently sourced values (§9.2.1).
      if (state.phase !== 'handoff-ready') {
        throw new GuardRefusal('G-1', `closeRun(completed) requires handoff-ready, not "${state.phase}".`);
      }
      const artifact = store.getCurrentArtifact(runId);
      if (artifact === undefined) throw new GuardRefusal('G-19b', `No artifact exists for run "${runId}".`);
      const approval = store.getLatestApproval(runId);
      if (approval === undefined) {
        throw new GuardRefusal('G-10', `Run "${runId}" has no recorded approval to compare against.`);
      }
      const handoffEvent = this.mostRecentEventOfKind(runId, 'handoff-built');
      const handoffSha = handoffEvent?.payload['source_object_sha256'];
      if (typeof handoffSha !== 'string') {
        throw new GuardRefusal('G-10', `Run "${runId}" has no built handoff to compare against.`);
      }
      // Value 3: re-derived from the stored bytes, not the in-memory object —
      // this is the check that can actually fail (§9.2.1's own argument).
      const reparsed = JSON.parse(artifact.canonical_json) as CoordinatorOutput;
      const rederivedSha = hashOutput(reparsed);
      const agree = renderingsAgree(approval.approved_artifact_sha256, handoffSha, reparsed);
      const allFour =
        agree && approval.approved_artifact_sha256 === artifact.artifact_sha256 && rederivedSha === artifact.artifact_sha256;
      if (!allFour) {
        throw new GuardRefusal(
          'G-10',
          `Run "${runId}"'s four completion values disagree — approval=${approval.approved_artifact_sha256.slice(0, 12)}…, ` +
            `artifact=${artifact.artifact_sha256.slice(0, 12)}…, rederived=${rederivedSha.slice(0, 12)}…, handoff=${handoffSha.slice(0, 12)}….`,
        );
      }
      return this.appendTerminal(store, runId, 'run-completed', 'handoff-ready', {});
    });
  }

  private appendTerminal(
    store: RunStore,
    runId: string,
    kind: Extract<
      RunEventKind,
      | 'run-blocked-source-invalidated'
      | 'run-blocked-no-clarification-budget'
      | 'run-blocked-clarification-budget-exhausted'
      | 'run-completed'
    >,
    fromPhase: StagePhase,
    payload: Readonly<Record<string, unknown>>,
  ): CloseRunResult {
    const seq = store.getMaxSeq(runId) + 1;
    const appended = store.appendEvent(runId, seq, this.now(), kind, fromPhase, 'terminal', payload);
    if (!appended.ok) throw new GuardRefusal('G-20b', `CAS conflict appending ${kind}.`);
    const outcomeByKind = {
      'run-blocked-source-invalidated': 'blocked',
      'run-blocked-no-clarification-budget': 'blocked',
      'run-blocked-clarification-budget-exhausted': 'blocked',
      'run-completed': 'completed',
    } as const;
    return { outcome: outcomeByKind[kind] };
  }

  /**
   * §2.11, §13's row: maintenance operations never enter the phase model.
   * `source.refresh` re-ingests with a forced rebuild, then compares the new
   * hash against every hash any run is currently pinned to (§2.11.1) — not
   * a single "before" snapshot taken within this same call, which would
   * always equal "after" since nothing changes the file between two reads
   * in one invocation. The old hash comes from what runs actually recorded
   * at `beginRun`, not from re-deriving a stale local variable.
   */
  runMaintenance(operationId: 'source.refresh' | 'source.validate'): RunMaintenanceResult {
    return this.invoke(null, 'runMaintenance', (store) => {
      if (operationId === 'source.validate') {
        ingest(this.config.phase1Config(), { now: this.now() });
        return { ok: true, outcome: 'validated', invalidated_run_ids: [] };
      }

      const forced = ingest(this.config.phase1Config(), { now: this.now(), forceRebuild: true });
      const newSha = forced.manifest.snapshot.source_sha256;

      const invalidated: string[] = [];
      for (const oldSha of store.listDistinctSourceHashes()) {
        if (oldSha === newSha) continue;
        for (const candidateRunId of store.listRunIdsBySourceHash(oldSha)) {
          const state = this.foldRun(candidateRunId);
          if (state.phase === 'terminal') continue;
          const seq = store.getMaxSeq(candidateRunId) + 1;
          const appended = store.appendEvent(candidateRunId, seq, this.now(), 'source-invalidated', null, null, {
            old_source_sha256: oldSha,
            new_source_sha256: newSha,
          });
          if (appended.ok) invalidated.push(candidateRunId);
          // A CAS loss here means another writer advanced this run first; that
          // advance itself pinned a phase this refresh no longer needs to
          // invalidate against — not appending is correct, not a defect.
        }
      }
      return {
        ok: true,
        outcome: invalidated.length > 0 ? 'refreshed' : 'unchanged',
        invalidated_run_ids: invalidated,
      };
    });
  }
}
