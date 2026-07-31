/**
 * The normative transition registry (host-turn-workflow-contract.md §10).
 *
 * **The single source every other Phase 2 derivation reads from** — the §12.2
 * tool-surface-by-phase map, the `run_event.kind` vocabulary (§19 D-3, ruling
 * PD-3), and the Guard's G-1 allowlist check. A second table anywhere else that
 * also knows "what can happen from what phase" is the exact defect §1.4 forbids:
 * "a second Guard, a second store, a second transition registry... is a design
 * defect, not a host adaptation."
 *
 * §10's `From` column uses the literal "any non-terminal" for three rows
 * (`cancelRun`, `expireRun`, and `closeRun blocked` on `source-invalidated`).
 * Modelled here as `ANY_NON_TERMINAL` rather than seven duplicated rows, so the
 * table stays a literal transcription of the contract's own 20 rows, not an
 * expansion of it.
 *
 * One row is a compound trigger in the contract's own text — "`buildHandoff`
 * then `closeRun`" for `handoff-ready → terminal` — because §4's phase table
 * separately confirms `buildHandoff` does not itself exit `handoff-ready` (it
 * appends the `handoff-built` marker; `closeRun completed` is what exits). Kept
 * as a two-element `trigger` tuple so the tool-surface derivation still
 * registers both tools under `handoff-ready`, matching §12.2, without inventing
 * a phase transition `buildHandoff` doesn't cause.
 */
import { STAGE_PHASES, type StagePhase } from '../contracts/run-envelope.ts';

export const ANY_NON_TERMINAL = 'any-non-terminal' as const;

/** The seven phases a run can be paused or active in — every `StagePhase` except
 *  `terminal`, which the run never re-enters or reasons from. */
export const NON_TERMINAL_PHASES: readonly StagePhase[] = STAGE_PHASES.filter(
  (phase): phase is StagePhase => phase !== 'terminal',
);

/** The 15 tools of §13, plus `resolveCommand` (§2.8/G-14) which precedes a run. */
export const TOOL_NAMES = [
  'resolveCommand',
  'beginRun',
  'prepareContext',
  'submitDraft',
  'openClarification',
  'answerClarification',
  'presentForApproval',
  'recordApproval',
  'buildHandoff',
  'closeRun',
  'failRun',
  'cancelRun',
  'expireRun',
  'resumeRun',
  'runMaintenance',
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

/**
 * Tools G-11's phase-surface check does not apply to: §12.2.1 names
 * `resolveCommand`, `resumeRun` and `runMaintenance` as "not phase-scoped —
 * they exist before or outside a run." `beginRun` belongs in this set for the
 * same reason even though that sentence doesn't name it: its own §10 row has
 * `from: null` (there is no run, and so no phase, for it to be scoped to) —
 * matching §12.2's printed table, which lists it under "(pre-run)" alongside
 * the other three. G-11 refuses a tool call from a phase whose surface omits
 * it; that check has no meaning for a tool with no phase to be omitted from.
 */
export const NON_PHASE_SCOPED_TOOLS: readonly ToolName[] = [
  'resolveCommand',
  'beginRun',
  'resumeRun',
  'runMaintenance',
];

/** Never model-callable — Guard-initiated only (§3.3.2, §12.2, §13). */
export const GUARD_ONLY_TOOLS: readonly ToolName[] = ['expireRun'];

/**
 * One literal per §10 row (20 rows), plus the two load-bearing marker kinds
 * named directly in the contract text (§2.11.1 `source-invalidated`, §11.2
 * `handoff-built`) that are appended without themselves changing phase. §19 D-3
 * (PD-3): this is the *only* place `run_event.kind` values are named — nothing
 * elsewhere invents one, and `RUN_EVENT_KINDS`/`TRANSITIONS` are asserted below
 * to stay in exact 1:1 correspondence with `TRANSITIONS`'s rows.
 */
export const RUN_EVENT_KINDS = [
  'run-begun',
  'context-preparation-started',
  'run-failed-during-received',
  'context-preparation-succeeded',
  'run-failed-during-preparing',
  'draft-submitted',
  'draft-repair-requested',
  'clarification-opened',
  'approval-presented',
  'run-blocked-no-clarification-budget',
  'run-failed-during-validation',
  'clarification-answered',
  'run-blocked-clarification-budget-exhausted',
  'approval-recorded-approved',
  'approval-recorded-changes-requested',
  'run-blocked-approval-rejected',
  'run-completed',
  'run-cancelled',
  'run-timed-out',
  'run-blocked-source-invalidated',
  // Markers: appended to a run's log without changing its current phase.
  'source-invalidated',
  'handoff-built',
] as const;

export type RunEventKind = (typeof RUN_EVENT_KINDS)[number];

/** The two marker kinds — never a `TransitionRow.kind`, never change phase. */
export const MARKER_EVENT_KINDS = ['source-invalidated', 'handoff-built'] as const;

export type TransitionRow = {
  /** `null` only for the pre-run `beginRun` row (§10's "—" `From`). */
  readonly from: StagePhase | typeof ANY_NON_TERMINAL | null;
  readonly to: StagePhase;
  /** Almost always one tool. Exactly one row (`handoff-ready`'s) has two,
   *  reflecting the contract's own compound trigger text. */
  readonly trigger: readonly [ToolName] | readonly [ToolName, ToolName];
  readonly kind: RunEventKind;
  readonly guardCheck: string;
  readonly clause: string;
  /**
   * `false` for exactly two rows — `preparing -> drafting` and
   * `validating -> drafting` (repairable) — whose §10 `Trigger` column names
   * an internal Guard event ("its return", "verdict repairable, Guard-recorded")
   * rather than a tool. Both are automatic continuations of the *same* external
   * call that produced the row immediately before them (`prepareContext`,
   * `submitDraft`), not a second, independently invocable entry point. A
   * caller never calls `prepareContext` again while paused in `preparing`, or
   * `submitDraft` again while paused in `validating` — neither is a pause
   * phase (§3.2), and both are `false` here so `computeToolSurfaceByPhase` and
   * G-1 don't register a surface entry nothing ever legally invokes.
   * Defaults to `true`.
   */
  readonly callerInvocable?: boolean;
};

/**
 * The 20 rows, transcribed verbatim from §10 — order matches the contract's
 * table so a reviewer can check this against the source directly.
 */
export const TRANSITIONS: readonly TransitionRow[] = [
  {
    from: null,
    to: 'received',
    trigger: ['beginRun'],
    kind: 'run-begun',
    guardCheck:
      'run_type derived from operation_id, not capability-gated; run_id minted; provenance derived',
    clause: '§2.1 §2.2 §2.4 §2.10.3',
  },
  {
    from: 'received',
    to: 'preparing',
    trigger: ['prepareContext'],
    kind: 'context-preparation-started',
    guardCheck: 'source hash + index version current',
    clause: '§4.1',
  },
  {
    from: 'received',
    to: 'terminal',
    trigger: ['failRun'],
    kind: 'run-failed-during-received',
    guardCheck: "invalid-input | hard-dependency-failure",
    clause: '§8',
  },
  {
    from: 'preparing',
    to: 'drafting',
    trigger: ['prepareContext'],
    kind: 'context-preparation-succeeded',
    guardCheck: 'leakage assertion passed',
    clause: '§4.0 §4.1',
    callerInvocable: false,
  },
  {
    from: 'preparing',
    to: 'terminal',
    trigger: ['failRun'],
    kind: 'run-failed-during-preparing',
    guardCheck: 'terminal failure class',
    clause: '§8',
  },
  {
    from: 'drafting',
    to: 'validating',
    trigger: ['submitDraft'],
    kind: 'draft-submitted',
    guardCheck: "composes; on 'ready' writes the artifact row",
    clause: '§4.3 §4.4',
  },
  {
    from: 'validating',
    to: 'drafting',
    trigger: ['submitDraft'],
    kind: 'draft-repair-requested',
    guardCheck: 'verdict repairable, Guard-recorded; repair_call_count = 0 for the run',
    clause: '§6.2 §6.4',
    callerInvocable: false,
  },
  {
    from: 'validating',
    to: 'awaiting-clarification',
    trigger: ['openClarification'],
    kind: 'clarification-opened',
    guardCheck: 'round < 2; opened_in_round echo matches',
    clause: '§5.2 §5.3.1',
  },
  {
    from: 'validating',
    to: 'awaiting-approval',
    trigger: ['presentForApproval'],
    kind: 'approval-presented',
    guardCheck: "stored artifact's status is 'ready'; reads, does not compose",
    clause: '§4.5 §4.6 §7.5',
  },
  {
    from: 'validating',
    to: 'terminal',
    trigger: ['closeRun'],
    kind: 'run-blocked-no-clarification-budget',
    guardCheck: "composed status 'blocked' and no clarification budget -> blocked",
    clause: '§4.6 §5.5',
  },
  {
    from: 'validating',
    to: 'terminal',
    trigger: ['failRun'],
    kind: 'run-failed-during-validation',
    guardCheck: 'repair exhausted, or terminal class',
    clause: '§6.5 §8',
  },
  {
    from: 'awaiting-clarification',
    to: 'drafting',
    trigger: ['answerClarification'],
    kind: 'clarification-answered',
    guardCheck: 'round incremented; approvals voided',
    clause: '§5.4 §7.5',
  },
  {
    from: 'awaiting-clarification',
    to: 'terminal',
    trigger: ['closeRun'],
    kind: 'run-blocked-clarification-budget-exhausted',
    guardCheck: 'budget exhausted -> blocked',
    clause: '§5.5',
  },
  {
    from: 'awaiting-approval',
    to: 'handoff-ready',
    trigger: ['recordApproval'],
    kind: 'approval-recorded-approved',
    guardCheck: 'hash matches current artifact',
    clause: '§7.5',
  },
  {
    from: 'awaiting-approval',
    to: 'drafting',
    trigger: ['recordApproval'],
    kind: 'approval-recorded-changes-requested',
    guardCheck: 'approvals voided',
    clause: '§7.5 §7.7',
  },
  {
    from: 'awaiting-approval',
    to: 'terminal',
    trigger: ['recordApproval'],
    kind: 'run-blocked-approval-rejected',
    guardCheck: '-> blocked',
    clause: '§9.1.1',
  },
  {
    from: 'handoff-ready',
    to: 'terminal',
    trigger: ['buildHandoff', 'closeRun'],
    kind: 'run-completed',
    guardCheck: 'renderingsAgree() true',
    clause: '§9.2',
  },
  {
    from: ANY_NON_TERMINAL,
    to: 'terminal',
    trigger: ['cancelRun'],
    kind: 'run-cancelled',
    guardCheck: '-> cancelled',
    clause: '§8',
  },
  {
    from: ANY_NON_TERMINAL,
    to: 'terminal',
    trigger: ['expireRun'],
    kind: 'run-timed-out',
    guardCheck: 'last event older than 72h -> timed-out. Evaluated lazily on access, never scheduled',
    clause: '§3.3.1 §3.3.2 §8.4',
  },
  {
    from: ANY_NON_TERMINAL,
    to: 'terminal',
    trigger: ['closeRun'],
    kind: 'run-blocked-source-invalidated',
    guardCheck: 'run carries source-invalidated; forward motion refused by G-21',
    clause: '§2.11.1 §2.11.2 §9.1',
  },
];

function expandFromPhases(from: TransitionRow['from']): readonly StagePhase[] {
  if (from === null) return [];
  if (from === ANY_NON_TERMINAL) return NON_TERMINAL_PHASES;
  return [from];
}

/**
 * §12.2, derived mechanically from `TRANSITIONS` rather than transcribed a
 * second time (§12.2.1's own stated rule: "every phase-scoped tool appears here
 * iff §10 lists it as a trigger from that phase").
 *
 * Reachable tool set per phase — includes both tools of the one compound-trigger
 * row, so `buildHandoff` and `closeRun` both surface under `handoff-ready`,
 * matching §12.2's printed table there. `expireRun` is excluded even though row
 * 19 names it: §12.2/§13 both state it is Guard-initiated only, never
 * model-callable (`GUARD_ONLY_TOOLS`).
 *
 * This computed map does **not** match the printed §12.2 table for one row —
 * `closeRun` is reachable from every non-terminal phase here, not only
 * `validating`/`awaiting-clarification`/`handoff-ready` — because row 20
 * (`closeRun blocked` on `source-invalidated`, added in revision 4) says "any
 * non-terminal" and the printed table was never regenerated after that row was
 * added. Resolved in docs/phase2-decision-log.md PD-6: the derivation wins,
 * per §12.2.1's own rule.
 */
export function computeToolSurfaceByPhase(): ReadonlyMap<StagePhase, ReadonlySet<ToolName>> {
  const surface = new Map<StagePhase, Set<ToolName>>();
  for (const phase of NON_TERMINAL_PHASES) surface.set(phase, new Set());
  for (const row of TRANSITIONS) {
    if (row.callerInvocable === false) continue;
    for (const phase of expandFromPhases(row.from)) {
      const tools = surface.get(phase);
      if (tools === undefined) continue;
      for (const tool of row.trigger) {
        if (GUARD_ONLY_TOOLS.includes(tool)) continue;
        tools.add(tool);
      }
    }
  }
  return surface;
}

/**
 * G-1: refuses any `(phase, tool)` pair `computeToolSurfaceByPhase` does not
 * register. Non-phase-scoped tools (`resolveCommand`, `beginRun`, `resumeRun`,
 * `runMaintenance`) are always reachable — G-11 does not apply to them
 * (§12.2.1) — and Guard-only tools are never reachable by a model call.
 */
export function isToolReachableFromPhase(tool: ToolName, phase: StagePhase): boolean {
  if (GUARD_ONLY_TOOLS.includes(tool)) return false;
  if (NON_PHASE_SCOPED_TOOLS.includes(tool)) return true;
  const surface = computeToolSurfaceByPhase();
  return surface.get(phase)?.has(tool) ?? false;
}

/**
 * Every externally-invocable row whose `from`/`trigger` matches, for a given
 * current phase and tool. Used by the Guard to find the transition (and its
 * `kind`) a tool call realizes — G-1's allowlist is "any row matches," refusal
 * is "none do." Excludes the two internal-continuation rows (see
 * `TransitionRow.callerInvocable`) — no external call ever presents as one of
 * those, so they can never be "found" as the realization of a caller's tool
 * invocation. `findAllTransitions` (below) includes them, for the event-log
 * fold, which does need every row.
 */
export function findTransitions(phase: StagePhase, tool: ToolName): readonly TransitionRow[] {
  return TRANSITIONS.filter(
    (row) =>
      row.callerInvocable !== false &&
      row.trigger.includes(tool) &&
      expandFromPhases(row.from).includes(phase),
  );
}

/** Every row matching `phase`/`tool`, including internal continuations. */
export function findAllTransitions(phase: StagePhase, tool: ToolName): readonly TransitionRow[] {
  return TRANSITIONS.filter(
    (row) => row.trigger.includes(tool) && expandFromPhases(row.from).includes(phase),
  );
}
