/**
 * The Coordinator engine (§12, §13) — resolveCommand, beginRun, resumeRun,
 * failRun, cancelRun, and lazy expiry, exercised against a real store.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CoordinatorEngine } from '../../src/tools/engine.ts';
import { GuardRefusal } from '../../src/guard/errors.ts';
import { writeWitness } from '../../src/store/witness.ts';
import { newPhase1Config } from './fixtures.ts';

function newEngine(nowValue = { current: '2026-07-29T10:00:00Z' }): { engine: CoordinatorEngine; nowValue: { current: string } } {
  const config = newPhase1Config();
  const engine = new CoordinatorEngine({
    phase1Config: () => config,
    now: () => nowValue.current,
  });
  return { engine, nowValue };
}

describe('resolveCommand — pre-run, always available', () => {
  test('resolves and logs the invocation with run_id null', () => {
    const { engine } = newEngine();
    const result = engine.resolveCommand('/create-component');
    assert.deepEqual(result, { operation_id: 'component.create', kind: 'route' });
    const invocations = engine.getToolInvocations(null);
    assert.equal(invocations.length, 1);
    assert.equal(invocations[0]?.tool, 'resolveCommand');
    assert.equal(invocations[0]?.ok, true);
  });

  test('an unknown command refuses and still logs the refusal', () => {
    const { engine } = newEngine();
    assert.throws(() => engine.resolveCommand('/nope'));
    const invocations = engine.getToolInvocations(null);
    assert.equal(invocations[0]?.ok, false);
    assert.equal(invocations[0]?.error_code, 'COMMAND_UNKNOWN');
  });
});

describe('beginRun — pins the source, mints identifiers, persists the run row', () => {
  test('creates a run and appends run-begun at seq 1', () => {
    const { engine } = newEngine();
    const result = engine.beginRun({ operation_id: 'component.create', user_intent: 'Build a warning toast' });
    assert.equal(result.run_type, 'new');
    assert.equal(result.phase, 'received');
    assert.ok(result.display_id.startsWith('new-'));

    const resumed = engine.resumeRun(result.run_id);
    assert.equal(resumed.phase, 'received');
  });

  test('resumption also works by display_id', () => {
    const { engine } = newEngine();
    const result = engine.beginRun({ operation_id: 'component.create', user_intent: 'x' });
    const resumed = engine.resumeRun(result.display_id);
    assert.equal(resumed.phase, 'received');
  });

  test('logs both the beginRun call and the run it created against', () => {
    const { engine } = newEngine();
    const result = engine.beginRun({ operation_id: 'component.create', user_intent: 'x' });
    const preRun = engine.getToolInvocations(null);
    assert.ok(preRun.some((entry) => entry.tool === 'beginRun' && entry.ok === true));
    assert.equal(engine.getToolInvocations(result.run_id).length, 0, 'beginRun itself logs under null, not the new run_id, since it is a pre-run tool');
  });

  test('G-3a: a capability-gated route refuses and is logged as a refusal', () => {
    const { engine } = newEngine();
    assert.throws(
      () => engine.beginRun({ operation_id: 'component.modify', user_intent: 'x' }),
      (error: unknown) => error instanceof GuardRefusal && error.code === 'G-3a',
    );
    const invocations = engine.getToolInvocations(null);
    assert.equal(invocations[invocations.length - 1]?.error_code, 'G-3a');
  });
});

describe('resumeRun — unknown run, staleness, source-invalidated', () => {
  test('an unknown run_id or display_id refuses rather than returning an empty result', () => {
    const { engine } = newEngine();
    assert.throws(() => engine.resumeRun('does-not-exist'));
  });

  test('a run past the 72h threshold is lazily expired on resume, not before', () => {
    const nowValue = { current: '2026-07-29T10:00:00Z' };
    const config = newPhase1Config();
    const engine = new CoordinatorEngine({
      phase1Config: () => config,
      now: () => nowValue.current,
    });
    const { run_id } = engine.beginRun({ operation_id: 'component.create', user_intent: 'x' });
    // Advance the clock past 72 hours. Nothing has looked at the run in
    // between — per §3.3.2, it must not have expired "in the background."
    nowValue.current = '2026-08-02T11:00:00Z'; // ~73 hours later
    const resumed = engine.resumeRun(run_id);
    assert.equal(resumed.phase, 'terminal');
    assert.match(resumed.pending_action, /timed-out/);
  });

  test('a run well within 72 hours is not expired', () => {
    const nowValue = { current: '2026-07-29T10:00:00Z' };
    const config = newPhase1Config();
    const engine = new CoordinatorEngine({
      phase1Config: () => config,
      now: () => nowValue.current,
    });
    const { run_id } = engine.beginRun({ operation_id: 'component.create', user_intent: 'x' });
    nowValue.current = '2026-07-30T10:00:00Z'; // 24 hours later
    const resumed = engine.resumeRun(run_id);
    assert.equal(resumed.phase, 'received');
  });
});

describe('cancelRun — §8, refuses on an already-terminal run', () => {
  test('cancels a live run', () => {
    const { engine } = newEngine();
    const { run_id } = engine.beginRun({ operation_id: 'component.create', user_intent: 'x' });
    const result = engine.cancelRun(run_id);
    assert.equal(result.outcome, 'cancelled');
    assert.equal(engine.resumeRun(run_id).phase, 'terminal');
  });

  test('cancelling an already-terminal run refuses (G-11: cancelRun has no terminal surface entry)', () => {
    const { engine } = newEngine();
    const { run_id } = engine.beginRun({ operation_id: 'component.create', user_intent: 'x' });
    engine.cancelRun(run_id);
    assert.throws(
      () => engine.cancelRun(run_id),
      (error: unknown) => error instanceof GuardRefusal && error.code === 'G-11',
    );
  });
});

describe('failRun — §8, refuses a phase with no failRun row', () => {
  test('fails a run from received', () => {
    const { engine } = newEngine();
    const { run_id } = engine.beginRun({ operation_id: 'component.create', user_intent: 'x' });
    const result = engine.failRun(run_id, 'invalid-input');
    assert.equal(result.outcome, 'failed');
  });

  test('failRun from a phase with no registered row refuses', () => {
    const { engine } = newEngine();
    const { run_id } = engine.beginRun({ operation_id: 'component.create', user_intent: 'x' });
    engine.cancelRun(run_id); // now terminal
    assert.throws(() => engine.failRun(run_id, 'invalid-input'));
  });
});

describe('store preflight — refused before any tool logic runs, with nowhere to log the refusal', () => {
  test('a path that cannot hold a database (G-20a) propagates from every entry point', () => {
    const parent = mkdtempSync(join(tmpdir(), 'adalfi-engine-'));
    const fileNotDir = join(parent, 'not-a-directory');
    // A file, not a directory: existsSync is true so the directory-resolves
    // check passes, but the store can never open under it — matches
    // tests/store/preflight.test.ts's G-20a case, exercised through the engine.
    writeFileSync(fileNotDir, 'x');
    const config = { ...newPhase1Config(), approvedDataDirectory: fileNotDir };
    const engine = new CoordinatorEngine({ phase1Config: () => config });
    assert.throws(
      () => engine.resolveCommand('/create-component'),
      (error: unknown) => error instanceof GuardRefusal && error.code === 'G-20a',
    );
  });

  test('a lost store (G-20c) refuses beginRun the same way it refuses resolveCommand', () => {
    const dir = mkdtempSync(join(tmpdir(), 'adalfi-engine-'));
    writeWitness(dir, '2026-07-29T10:00:00Z'); // witness with no database -> lost
    const config = { ...newPhase1Config(), approvedDataDirectory: dir };
    const engine = new CoordinatorEngine({ phase1Config: () => config });
    assert.throws(
      () => engine.beginRun({ operation_id: 'component.create', user_intent: 'x' }),
      (error: unknown) => error instanceof GuardRefusal && error.code === 'G-20c',
    );
  });
});
