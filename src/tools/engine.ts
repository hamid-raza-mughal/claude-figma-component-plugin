/**
 * The Coordinator engine (§12, §13) — the Guard-mediated tool surface a host
 * integration calls into. **One engine, two host integrations** (§1.4): this
 * class and everything under `src/guard/`, `src/store/`, `src/registry/` are
 * shared and identical across every runtime; only how a caller reaches this
 * class differs (WP9).
 *
 * This file wires the tools that need no Phase 1 engine call —
 * `resolveCommand`, `beginRun`, `resumeRun`, `failRun`, `cancelRun`, and
 * Guard-initiated staleness (`expireRun`, never model-callable). The four
 * tools that call into Phase 1's resolver/composer/renderer
 * (`prepareContext`, `submitDraft`, `presentForApproval`, `buildHandoff`) and
 * the artifact-dependent flows (`openClarification`, `answerClarification`,
 * `recordApproval`, `closeRun`, `runMaintenance`) are added by later work
 * packages on this same class, not a second one (§1.4 forbids a second
 * engine surface).
 */
import { RunStore } from '../store/run-store.ts';
import { storePreflight } from '../store/preflight.ts';
import { GuardRefusal } from '../guard/errors.ts';
import { deriveBeginRun, type BeginRunInput } from '../guard/begin-run.ts';
import { foldRunEvents, type DerivedRunState } from '../guard/fold.ts';
import type { HostCommandMetadata } from '../guard/provenance.ts';
import { resolveCommand as registryResolveCommand, type ResolveCommandResult } from '../registry/operations.ts';
import { isToolReachableFromPhase, type ToolName } from '../registry/transitions.ts';
import type { StagePhase } from '../contracts/run-envelope.ts';
import type { RunType } from '../contracts/invocation.ts';

/** §11.3.1's constant, until a Phase 3+ artifact widens the spec. Not a config
 *  value: it names the P1-FINAL spec revision this engine implements, not
 *  anything that varies by environment. */
const SPEC_SCHEMA_VERSION = '2.0.0';

/** The current curated-source pin (§11.2's immutable `run` columns). A thunk,
 *  not a value, so `beginRun` always pins whatever is genuinely current at
 *  call time — computing it is Phase 1 ingestion's job (`source-hash.ts` /
 *  `resolvePhase1Config`), not this engine's; WP9 supplies the real thunk. */
export type SourcePin = {
  readonly source_sha256: string;
  readonly index_version: string;
};

export type EngineConfig = {
  readonly approvedDataDirectory: string;
  readonly sourcePin: () => SourcePin;
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
  private readonly config: EngineConfig;

  constructor(config: EngineConfig) {
    this.config = config;
  }

  private now(): string {
    return this.config.now?.() ?? new Date().toISOString();
  }

  /** §11.0.1: preflight runs before any run-bearing tool, at the first
   *  resolveCommand/beginRun/resumeRun of a session — enforced by every
   *  tool method routing through this before doing anything else. */
  private getStore(): RunStore {
    if (this.store !== undefined) return this.store;
    const result = storePreflight(this.config.approvedDataDirectory, this.now());
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
      const pin = this.config.sourcePin();
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
        source_sha256: pin.source_sha256,
        index_version: pin.index_version,
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
}
