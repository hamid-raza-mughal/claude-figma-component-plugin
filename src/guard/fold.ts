/**
 * The fold (§11.1): "the append-only event log is the sole authority; all
 * current state is derived by folding it." **No materialized `run_state`
 * table** — this function is the derivation, called fresh every time, not
 * cached against drift.
 *
 * Deliberately pure: `RunEventRow[]` in, `DerivedRunState` out, no I/O. The
 * store (WP3) is what supplies the ordered rows; this module never reads one
 * itself, so it is testable without a database and reusable unchanged by both
 * host integrations (§1.4).
 */
import type { StagePhase, RunOutcome } from '../contracts/run-envelope.ts';
import { TRANSITIONS, type RunEventKind } from '../registry/transitions.ts';

export type RunEventRow = {
  readonly seq: number;
  readonly run_id: string;
  readonly at: string;
  readonly kind: RunEventKind;
  readonly from_phase: StagePhase | null;
  readonly to_phase: StagePhase | null;
  readonly payload: Readonly<Record<string, unknown>>;
};

/** Maps a terminal-transition kind to the `RunOutcome` it records. Every
 *  kind whose row's `to` is `'terminal'` must appear here (asserted in
 *  tests/guard/fold.test.ts against `src/registry/transitions.ts`). */
const OUTCOME_BY_TERMINAL_KIND: Readonly<Partial<Record<RunEventKind, RunOutcome>>> = {
  'run-failed-during-received': 'failed',
  'run-failed-during-preparing': 'failed',
  'run-failed-during-validation': 'failed',
  'run-blocked-no-clarification-budget': 'blocked',
  'run-blocked-clarification-budget-exhausted': 'blocked',
  'run-blocked-approval-rejected': 'blocked',
  'run-blocked-source-invalidated': 'blocked',
  'run-completed': 'completed',
  'run-cancelled': 'cancelled',
  'run-timed-out': 'timed-out',
};

export type DerivedRunState = {
  readonly phase: StagePhase;
  readonly outcome: RunOutcome | undefined;
  /** §6.2: at most one, per run, ever. */
  readonly repairCallCount: number;
  /** §5.2/§5.3: rounds opened so far — a `clarification-opened` event per
   *  round, never self-reported. */
  readonly clarificationRoundCount: number;
  /** G-21: true once any `source-invalidated` marker has landed. Never
   *  cleared — §2.11.2's "never re-pinned" means this is monotonic. */
  readonly sourceInvalidated: boolean;
  /** §3.3: the timestamp staleness is measured against. `undefined` only for
   *  an empty log, which is not a state any real run can be in. */
  readonly lastEventAt: string | undefined;
  readonly eventCount: number;
};

export class FoldError extends Error {
  override readonly name = 'FoldError';
}

/**
 * Folds an ordered event log into current state. Events must already be in
 * `seq` order — this function trusts that ordering rather than re-sorting, so
 * a caller passing unordered rows is a caller bug, not a silent Guard defect.
 */
export function foldRunEvents(events: readonly RunEventRow[]): DerivedRunState {
  if (events.length === 0) {
    throw new FoldError('Cannot fold an empty event log — no run-begun event exists.');
  }
  let phase: StagePhase | undefined;
  let outcome: RunOutcome | undefined;
  let repairCallCount = 0;
  let clarificationRoundCount = 0;
  let sourceInvalidated = false;
  let lastEventAt: string | undefined;
  let previousSeq: number | undefined;

  for (const event of events) {
    if (previousSeq !== undefined && event.seq <= previousSeq) {
      throw new FoldError(
        `Events out of order: seq ${event.seq} did not increase past ${previousSeq}.`,
      );
    }
    previousSeq = event.seq;
    lastEventAt = event.at;

    if (event.kind === 'source-invalidated') {
      sourceInvalidated = true;
      continue; // Marker only — never changes phase (§2.11.1).
    }
    if (event.kind === 'handoff-built') {
      continue; // Marker only — recorded for §9.2.1 value 4, no phase change.
    }
    if (event.to_phase === null) {
      throw new FoldError(`Event kind "${event.kind}" is not a marker but carries no to_phase.`);
    }
    phase = event.to_phase;
    if (event.kind === 'draft-repair-requested') repairCallCount += 1;
    if (event.kind === 'clarification-opened') clarificationRoundCount += 1;
    outcome = OUTCOME_BY_TERMINAL_KIND[event.kind];
  }

  if (phase === undefined) {
    throw new FoldError('Event log contained only markers — no phase-bearing event.');
  }

  return {
    phase,
    outcome,
    repairCallCount,
    clarificationRoundCount,
    sourceInvalidated,
    lastEventAt,
    eventCount: events.length,
  };
}

/**
 * Every kind whose §10 row has `to: 'terminal'` must map to a real outcome —
 * checked against `TRANSITIONS` directly, not guessed from the kind's name,
 * so a future row naming convention can't silently escape this check.
 */
export function unmappedTerminalKinds(): readonly RunEventKind[] {
  return TRANSITIONS.filter((row) => row.to === 'terminal' && OUTCOME_BY_TERMINAL_KIND[row.kind] === undefined).map(
    (row) => row.kind,
  );
}
