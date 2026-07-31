/**
 * The durable store (§11.1, §11.6): append-only, CAS-sequenced, and the sole
 * authority — proved here by an actual `DatabaseSync` file on disk, not a
 * mock, so atomicity and interruption/resume are real properties of the file.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  RunStore,
  StoreAppendError,
  RunAlreadyExistsError,
  type RunRow,
  type ApprovalRow,
} from '../../src/store/run-store.ts';
import { foldRunEvents } from '../../src/guard/fold.ts';
import { GuardRefusal } from '../../src/guard/errors.ts';

function freshDbPath(): string {
  return join(mkdtempSync(join(tmpdir(), 'adalfi-runstore-')), 'store.db');
}

function sampleRun(overrides: Partial<RunRow> = {}): RunRow {
  return {
    run_id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
    display_id: 'new-7F3K2Q1B',
    operation_id: 'component.create',
    run_type: 'new',
    route_provenance: 'model-relayed',
    route_verified: false,
    user_intent: 'Build a warning toast',
    target_ref: null,
    requested_at: '2026-07-29T10:00:00Z',
    source_sha256: '2'.repeat(64),
    index_version: '1.0.0',
    spec_schema_version: '2.0.0',
    invoked_as: '/create-component',
    ...overrides,
  };
}

describe('createRun / getRun — immutable after creation', () => {
  test('a created run round-trips exactly, including boolean route_verified', () => {
    const store = new RunStore(freshDbPath());
    store.createRun(sampleRun());
    const row = store.getRun('3f2504e0-4f89-41d3-9a0c-0305e82c3301');
    assert.ok(row !== undefined);
    assert.equal(row?.display_id, 'new-7F3K2Q1B');
    assert.equal(row?.route_verified, false);
    assert.equal(row?.target_ref, null);
    store.close();
  });

  test('getRun returns undefined for an unknown run_id', () => {
    const store = new RunStore(freshDbPath());
    assert.equal(store.getRun('does-not-exist'), undefined);
    store.close();
  });

  test('a duplicate run_id is refused, not silently overwritten', () => {
    const store = new RunStore(freshDbPath());
    store.createRun(sampleRun());
    assert.throws(() => store.createRun(sampleRun()), RunAlreadyExistsError);
    store.close();
  });

  test('a duplicate display_id (different run_id) is refused — the UNIQUE constraint that makes D-6 safe', () => {
    const store = new RunStore(freshDbPath());
    store.createRun(sampleRun());
    assert.throws(
      () => store.createRun(sampleRun({ run_id: 'a'.repeat(8) + '-0000-4000-8000-000000000000' })),
      RunAlreadyExistsError,
    );
    store.close();
  });

  test('displayIdExists distinguishes a taken display_id from a free one', () => {
    const store = new RunStore(freshDbPath());
    store.createRun(sampleRun());
    assert.equal(store.displayIdExists('new-7F3K2Q1B'), true);
    assert.equal(store.displayIdExists('new-ZZZZZZZZ'), false);
    store.close();
  });
});

describe('appendEvent — CAS via PRIMARY KEY (run_id, seq)', () => {
  test('sequential appends at increasing seq all succeed', () => {
    const store = new RunStore(freshDbPath());
    store.createRun(sampleRun());
    const runId = sampleRun().run_id;
    const a = store.appendEvent(runId, 1, '2026-07-29T10:00:01Z', 'run-begun', null, 'received', {});
    const b = store.appendEvent(runId, 2, '2026-07-29T10:00:02Z', 'run-cancelled', 'received', 'terminal', {});
    assert.equal(a.ok, true);
    assert.equal(b.ok, true);
    store.close();
  });

  test('a second writer using the same (stale) seq is refused as a CAS conflict, not silently overwritten', () => {
    const store = new RunStore(freshDbPath());
    store.createRun(sampleRun());
    const runId = sampleRun().run_id;
    const first = store.appendEvent(runId, 1, '2026-07-29T10:00:01Z', 'run-begun', null, 'received', {});
    const raced = store.appendEvent(runId, 1, '2026-07-29T10:00:02Z', 'run-begun', null, 'received', {});
    assert.equal(first.ok, true);
    assert.equal(raced.ok, false);
    if (!raced.ok) assert.equal(raced.reason, 'cas-conflict');
    // The loser's payload must not be visible — only one row at seq 1.
    assert.equal(store.getEvents(runId).length, 1);
    store.close();
  });

  test('the winner of a CAS race is whichever append committed first, and getMaxSeq reflects it', () => {
    const store = new RunStore(freshDbPath());
    store.createRun(sampleRun());
    const runId = sampleRun().run_id;
    assert.equal(store.getMaxSeq(runId), 0);
    store.appendEvent(runId, 1, '2026-07-29T10:00:01Z', 'run-begun', null, 'received', {});
    assert.equal(store.getMaxSeq(runId), 1);
    const conflict = store.appendEvent(runId, 1, '2026-07-29T10:00:02Z', 'run-cancelled', 'received', 'terminal', {});
    assert.equal(conflict.ok, false);
    assert.equal(store.getMaxSeq(runId), 1, 'a losing append must not advance the observed max seq');
    store.close();
  });

  test('two runs never collide on seq — the CAS key is (run_id, seq), not seq alone', () => {
    const store = new RunStore(freshDbPath());
    store.createRun(sampleRun());
    store.createRun(sampleRun({ run_id: 'b'.repeat(8) + '-0000-4000-8000-000000000000', display_id: 'new-AAAAAAAA' }));
    const a = store.appendEvent(sampleRun().run_id, 1, '2026-07-29T10:00:01Z', 'run-begun', null, 'received', {});
    const b = store.appendEvent(
      'b'.repeat(8) + '-0000-4000-8000-000000000000',
      1,
      '2026-07-29T10:00:01Z',
      'run-begun',
      null,
      'received',
      {},
    );
    assert.equal(a.ok, true);
    assert.equal(b.ok, true);
    store.close();
  });
});

describe('atomicity (§11.6.1) and the fold round-trips real stored rows', () => {
  test('payload is stored and read back exactly, including nested structure', () => {
    const store = new RunStore(freshDbPath());
    store.createRun(sampleRun());
    const runId = sampleRun().run_id;
    store.appendEvent(runId, 1, '2026-07-29T10:00:01Z', 'run-begun', null, 'received', {
      operation_id: 'component.create',
      nested: { ok: true, list: [1, 2, 3] },
    });
    const [event] = store.getEvents(runId);
    assert.deepEqual(event?.payload, { operation_id: 'component.create', nested: { ok: true, list: [1, 2, 3] } });
    store.close();
  });

  test('events read back from the store fold to the same state the store itself agrees with', () => {
    const store = new RunStore(freshDbPath());
    store.createRun(sampleRun());
    const runId = sampleRun().run_id;
    store.appendEvent(runId, 1, '2026-07-29T10:00:01Z', 'run-begun', null, 'received', {});
    store.appendEvent(runId, 2, '2026-07-29T10:00:02Z', 'context-preparation-started', 'received', 'preparing', {});
    store.appendEvent(runId, 3, '2026-07-29T10:00:03Z', 'context-preparation-succeeded', 'preparing', 'drafting', {});
    store.appendEvent(runId, 4, '2026-07-29T10:00:04Z', 'run-cancelled', 'drafting', 'terminal', {});
    const state = foldRunEvents(store.getEvents(runId));
    assert.equal(state.phase, 'terminal');
    assert.equal(state.outcome, 'cancelled');
    assert.equal(state.eventCount, 4);
    store.close();
  });
});

describe('interruption and resume — a genuinely separate handle on the same file', () => {
  test('events survive closing the store and opening a fresh instance at the same path', () => {
    const dbPath = freshDbPath();
    const first = new RunStore(dbPath);
    first.createRun(sampleRun());
    const runId = sampleRun().run_id;
    first.appendEvent(runId, 1, '2026-07-29T10:00:01Z', 'run-begun', null, 'received', {});
    first.appendEvent(runId, 2, '2026-07-29T10:00:02Z', 'context-preparation-started', 'received', 'preparing', {});
    first.close(); // simulates the process/handle going away mid-run

    const resumed = new RunStore(dbPath); // a fresh handle, as a resumeRun call would open
    const events = resumed.getEvents(runId);
    assert.equal(events.length, 2);
    const state = foldRunEvents(events);
    assert.equal(state.phase, 'preparing');
    const run = resumed.getRun(runId);
    assert.equal(run?.display_id, 'new-7F3K2Q1B');
    resumed.close();
  });

  test('a run interrupted mid-drafting resumes to exactly the phase it was left in', () => {
    const dbPath = freshDbPath();
    const runId = sampleRun().run_id;
    {
      const store = new RunStore(dbPath);
      store.createRun(sampleRun());
      store.appendEvent(runId, 1, '2026-07-29T10:00:01Z', 'run-begun', null, 'received', {});
      store.appendEvent(runId, 2, '2026-07-29T10:00:02Z', 'context-preparation-started', 'received', 'preparing', {});
      store.appendEvent(runId, 3, '2026-07-29T10:00:03Z', 'context-preparation-succeeded', 'preparing', 'drafting', {});
      store.close();
    }
    const resumed = new RunStore(dbPath);
    assert.equal(foldRunEvents(resumed.getEvents(runId)).phase, 'drafting');
    // Resume must be able to continue the CAS chain exactly where it left off.
    assert.equal(resumed.getMaxSeq(runId), 3);
    const next = resumed.appendEvent(runId, 4, '2026-07-29T10:00:04Z', 'draft-submitted', 'drafting', 'validating', {});
    assert.equal(next.ok, true);
    resumed.close();
  });
});

describe('StoreAppendError — a genuine (non-CAS) failure', () => {
  test('appending to a closed database throws StoreAppendError, not a silent no-op', () => {
    const store = new RunStore(freshDbPath());
    store.createRun(sampleRun());
    const runId = sampleRun().run_id;
    store.close();
    assert.throws(
      () => store.appendEvent(runId, 1, '2026-07-29T10:00:01Z', 'run-begun', null, 'received', {}),
      StoreAppendError,
    );
  });
});

function sampleApproval(overrides: Partial<ApprovalRow> = {}): ApprovalRow {
  return {
    run_id: sampleRun().run_id,
    gate: 'gate-1-semantic',
    gate_mode: 'observe-only-validation',
    approved_artifact_sha256: '3'.repeat(64),
    decision: 'approved',
    approved_at: '2026-07-29T10:00:05Z',
    approved_by: 'ux@techlogix.com',
    response_source: 'model-relayed',
    verified: false,
    authorizing: false,
    ...overrides,
  };
}

describe('G-9a/G-9b — enforced at the one place any approval is written, not just absent from a parameter', () => {
  test('putApproval refuses gate_mode "authorising" (G-9a)', () => {
    const store = new RunStore(freshDbPath());
    store.createRun(sampleRun());
    assert.throws(
      () => store.putApproval(sampleApproval({ gate_mode: 'authorising' })),
      (error: unknown) => error instanceof GuardRefusal && error.code === 'G-9a',
    );
  });

  test('putApproval refuses verified: true (G-9b)', () => {
    const store = new RunStore(freshDbPath());
    store.createRun(sampleRun());
    assert.throws(
      () => store.putApproval(sampleApproval({ verified: true })),
      (error: unknown) => error instanceof GuardRefusal && error.code === 'G-9b',
    );
  });

  test('putApproval refuses authorizing: true (G-9b)', () => {
    const store = new RunStore(freshDbPath());
    store.createRun(sampleRun());
    assert.throws(
      () => store.putApproval(sampleApproval({ authorizing: true })),
      (error: unknown) => error instanceof GuardRefusal && error.code === 'G-9b',
    );
  });

  test('a refused putApproval writes no row at all', () => {
    const store = new RunStore(freshDbPath());
    store.createRun(sampleRun());
    assert.throws(() => store.putApproval(sampleApproval({ verified: true })));
    assert.equal(store.getLatestApproval(sampleRun().run_id), undefined);
  });

  test('appendEventAndPutApproval refuses the same way, before any write happens', () => {
    const store = new RunStore(freshDbPath());
    store.createRun(sampleRun());
    const runId = sampleRun().run_id;
    assert.throws(
      () =>
        store.appendEventAndPutApproval(
          runId,
          1,
          '2026-07-29T10:00:05Z',
          'approval-recorded-approved',
          'awaiting-approval',
          'handoff-ready',
          {},
          sampleApproval({ authorizing: true }),
        ),
      (error: unknown) => error instanceof GuardRefusal && error.code === 'G-9b',
    );
    assert.equal(store.getEvents(runId).length, 0, 'the refused write must not have appended an event either');
  });
});

describe('§11.6.1 atomicity — the event and its dependent write commit together or not at all', () => {
  test('appendEventAndPutArtifact: a CAS conflict on the event rolls back the artifact too', () => {
    const store = new RunStore(freshDbPath());
    store.createRun(sampleRun());
    const runId = sampleRun().run_id;
    // Occupy seq 1 first, so the real call below loses the race.
    store.appendEvent(runId, 1, '2026-07-29T10:00:01Z', 'run-begun', null, 'received', {});
    const result = store.appendEventAndPutArtifact(
      runId,
      1, // stale — seq 1 is already taken
      '2026-07-29T10:00:02Z',
      'draft-submitted',
      'drafting',
      'validating',
      {},
      '9'.repeat(64),
      '{"status":"ready"}',
    );
    assert.equal(result.ok, false);
    // The artifact write must not have survived the rollback.
    assert.equal(store.getCurrentArtifact(runId), undefined);
  });

  test('appendEventAndPutArtifact: on success, both the event and the artifact are visible', () => {
    const store = new RunStore(freshDbPath());
    store.createRun(sampleRun());
    const runId = sampleRun().run_id;
    const result = store.appendEventAndPutArtifact(
      runId,
      1,
      '2026-07-29T10:00:01Z',
      'draft-submitted',
      'drafting',
      'validating',
      {},
      '9'.repeat(64),
      '{"status":"ready"}',
    );
    assert.equal(result.ok, true);
    assert.equal(store.getEvents(runId).length, 1);
    assert.equal(store.getCurrentArtifact(runId)?.artifact_sha256, '9'.repeat(64));
  });

  test('appendEventAndPutApproval: a CAS conflict on the event rolls back the approval too', () => {
    const store = new RunStore(freshDbPath());
    store.createRun(sampleRun());
    const runId = sampleRun().run_id;
    store.appendEvent(runId, 1, '2026-07-29T10:00:01Z', 'run-begun', null, 'received', {});
    const result = store.appendEventAndPutApproval(
      runId,
      1, // stale
      '2026-07-29T10:00:02Z',
      'approval-recorded-approved',
      'awaiting-approval',
      'handoff-ready',
      {},
      sampleApproval(),
    );
    assert.equal(result.ok, false);
    assert.equal(store.getLatestApproval(runId), undefined, 'no orphaned approval row after the rollback');
  });

  test('appendEventAndPutApproval: on success, both the event and the approval are visible', () => {
    const store = new RunStore(freshDbPath());
    store.createRun(sampleRun());
    const runId = sampleRun().run_id;
    const result = store.appendEventAndPutApproval(
      runId,
      1,
      '2026-07-29T10:00:01Z',
      'approval-recorded-approved',
      'awaiting-approval',
      'handoff-ready',
      {},
      sampleApproval(),
    );
    assert.equal(result.ok, true);
    assert.equal(store.getEvents(runId).length, 1);
    assert.equal(store.getLatestApproval(runId)?.decision, 'approved');
  });
});
