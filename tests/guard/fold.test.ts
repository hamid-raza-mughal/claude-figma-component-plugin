/**
 * §11.1: "all current state is derived by folding" the event log. No
 * materialized state exists to compare against, so these tests build event
 * logs by hand and check the fold's output directly.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { foldRunEvents, unmappedTerminalKinds, FoldError, type RunEventRow } from '../../src/guard/fold.ts';

const RUN_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

function event(
  seq: number,
  kind: RunEventRow['kind'],
  from: RunEventRow['from_phase'],
  to: RunEventRow['to_phase'],
): RunEventRow {
  return { seq, run_id: RUN_ID, at: `2026-07-29T10:00:0${seq}Z`, kind, from_phase: from, to_phase: to, payload: {} };
}

describe('foldRunEvents — happy path traversal', () => {
  test('a single run-begun event folds to received, no outcome', () => {
    const state = foldRunEvents([event(1, 'run-begun', null, 'received')]);
    assert.equal(state.phase, 'received');
    assert.equal(state.outcome, undefined);
    assert.equal(state.repairCallCount, 0);
    assert.equal(state.clarificationRoundCount, 0);
    assert.equal(state.sourceInvalidated, false);
  });

  test('a full happy path to completed', () => {
    const events: RunEventRow[] = [
      event(1, 'run-begun', null, 'received'),
      event(2, 'context-preparation-started', 'received', 'preparing'),
      event(3, 'context-preparation-succeeded', 'preparing', 'drafting'),
      event(4, 'draft-submitted', 'drafting', 'validating'),
      event(5, 'approval-presented', 'validating', 'awaiting-approval'),
      event(6, 'approval-recorded-approved', 'awaiting-approval', 'handoff-ready'),
      event(7, 'handoff-built', 'handoff-ready', 'handoff-ready'),
      event(8, 'run-completed', 'handoff-ready', 'terminal'),
    ];
    const state = foldRunEvents(events);
    assert.equal(state.phase, 'terminal');
    assert.equal(state.outcome, 'completed');
    assert.equal(state.eventCount, 8);
  });

  test('repair_call_count counts draft-repair-requested events, capped in practice at one', () => {
    const events: RunEventRow[] = [
      event(1, 'run-begun', null, 'received'),
      event(2, 'context-preparation-started', 'received', 'preparing'),
      event(3, 'context-preparation-succeeded', 'preparing', 'drafting'),
      event(4, 'draft-submitted', 'drafting', 'validating'),
      event(5, 'draft-repair-requested', 'validating', 'drafting'),
      event(6, 'draft-submitted', 'drafting', 'validating'),
    ];
    assert.equal(foldRunEvents(events).repairCallCount, 1);
  });

  test('clarification_round_count counts clarification-opened events', () => {
    const events: RunEventRow[] = [
      event(1, 'run-begun', null, 'received'),
      event(2, 'clarification-opened', 'validating', 'awaiting-clarification'),
      event(3, 'clarification-answered', 'awaiting-clarification', 'drafting'),
      event(4, 'clarification-opened', 'validating', 'awaiting-clarification'),
    ];
    assert.equal(foldRunEvents(events).clarificationRoundCount, 2);
  });

  test('a source-invalidated marker sets the flag without changing phase', () => {
    const events: RunEventRow[] = [
      event(1, 'run-begun', null, 'received'),
      event(2, 'context-preparation-started', 'received', 'preparing'),
      { ...event(3, 'source-invalidated', null, null) },
    ];
    const state = foldRunEvents(events);
    assert.equal(state.sourceInvalidated, true);
    assert.equal(state.phase, 'preparing', 'the marker must not itself move the phase');
  });

  test('a handoff-built marker does not change phase', () => {
    const events: RunEventRow[] = [
      event(1, 'run-begun', null, 'received'),
      { ...event(2, 'handoff-built', null, null) },
    ];
    assert.equal(foldRunEvents(events).phase, 'received');
  });
});

describe('foldRunEvents — illegal input', () => {
  test('an empty log refuses rather than guessing a default phase', () => {
    assert.throws(() => foldRunEvents([]), FoldError);
  });

  test('out-of-order seq refuses', () => {
    assert.throws(
      () => foldRunEvents([event(2, 'run-begun', null, 'received'), event(1, 'run-cancelled', 'received', 'terminal')]),
      FoldError,
    );
  });

  test('a duplicate seq refuses', () => {
    assert.throws(
      () => foldRunEvents([event(1, 'run-begun', null, 'received'), event(1, 'run-cancelled', 'received', 'terminal')]),
      FoldError,
    );
  });

  test('a non-marker event with a null to_phase refuses', () => {
    assert.throws(() => foldRunEvents([event(1, 'run-begun', null, null)]), FoldError);
  });

  test('a log of only markers refuses — no phase-bearing event', () => {
    assert.throws(() => foldRunEvents([{ ...event(1, 'source-invalidated', null, null) }]), FoldError);
  });
});

describe('outcome coverage — every terminal kind maps to a RunOutcome', () => {
  test('unmappedTerminalKinds is empty', () => {
    assert.deepEqual(unmappedTerminalKinds(), []);
  });

  test('each terminal outcome is reachable via its own kind', () => {
    const base = [event(1, 'run-begun', null, 'received')];
    assert.equal(foldRunEvents([...base, event(2, 'run-cancelled', 'received', 'terminal')]).outcome, 'cancelled');
    assert.equal(foldRunEvents([...base, event(2, 'run-timed-out', 'received', 'terminal')]).outcome, 'timed-out');
    assert.equal(
      foldRunEvents([...base, event(2, 'run-failed-during-received', 'received', 'terminal')]).outcome,
      'failed',
    );
    assert.equal(
      foldRunEvents([...base, event(2, 'run-blocked-source-invalidated', 'received', 'terminal')]).outcome,
      'blocked',
    );
  });
});
