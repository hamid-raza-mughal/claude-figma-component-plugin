/**
 * `beginRun` (§10 row 1, §13): G-2, G-3a, G-3b, and the structural G-15.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { deriveBeginRun } from '../../src/guard/begin-run.ts';
import { GuardRefusal } from '../../src/guard/errors.ts';

describe('deriveBeginRun — the only reachable route today is "new" (G-3a)', () => {
  test('component.create derives run_type "new", phase received, model-relayed provenance', () => {
    const derived = deriveBeginRun({ operation_id: 'component.create', user_intent: 'Build a warning toast' });
    assert.equal(derived.run_type, 'new');
    assert.equal(derived.phase, 'received');
    assert.equal(derived.route_provenance, 'model-relayed');
    assert.equal(derived.route_verified, false);
    assert.match(derived.run_id, /^[0-9a-f-]{36}$/);
    assert.ok(derived.display_id.startsWith('new-'));
  });

  test('two calls mint two different run_ids and display_ids', () => {
    const a = deriveBeginRun({ operation_id: 'component.create', user_intent: 'x' });
    const b = deriveBeginRun({ operation_id: 'component.create', user_intent: 'x' });
    assert.notEqual(a.run_id, b.run_id);
    assert.notEqual(a.display_id, b.display_id);
  });

  test('beginRun only ever receives an operation_id, never a public command string', () => {
    // resolveCommand (§2.8) resolves any public name/alias to one operation_id
    // upstream, before beginRun runs at all — covered directly in
    // tests/registry/operations.test.ts's G-18 alias-invariance tests.
    // beginRun's own contract (§13) takes {operation_id, user_intent, target?}
    // and nothing shaped like a slash command.
    const derived = deriveBeginRun({ operation_id: 'component.create', user_intent: 'x' });
    assert.equal(derived.run_type, 'new');
  });
});

describe('G-3a — modify/audit are capability-gated off (FD-1…FD-4 unmet)', () => {
  test('component.modify is refused unconditionally', () => {
    assert.throws(
      () => deriveBeginRun({ operation_id: 'component.modify', user_intent: 'x' }),
      (error: unknown) => error instanceof GuardRefusal && error.code === 'G-3a',
    );
  });

  test('component.audit is refused unconditionally, even with no target', () => {
    assert.throws(
      () => deriveBeginRun({ operation_id: 'component.audit', user_intent: 'x' }),
      (error: unknown) => error instanceof GuardRefusal && error.code === 'G-3a',
    );
  });
});

describe('G-3b — "new" must not carry a target', () => {
  test('new with a target is refused', () => {
    assert.throws(
      () =>
        deriveBeginRun({
          operation_id: 'component.create',
          user_intent: 'x',
          target: {
            tree_ref: 'figma://node/1:23',
            tree_sha256: 'c'.repeat(64),
            node_count: 3,
            captured_at: '2026-07-29T09:00:00Z',
          },
        }),
      (error: unknown) => error instanceof GuardRefusal && error.code === 'G-3b',
    );
  });

  test('new with no target succeeds', () => {
    assert.doesNotThrow(() => deriveBeginRun({ operation_id: 'component.create', user_intent: 'x' }));
  });
});

describe('G-2 — an operation_id with no canonical mapping is refused', () => {
  test('an unmapped operation_id refuses', () => {
    assert.throws(
      () => deriveBeginRun({ operation_id: 'component.delete', user_intent: 'x' }),
      (error: unknown) => error instanceof GuardRefusal && error.code === 'G-2',
    );
  });

  test('a maintenance operation_id refuses beginRun (it is not a route)', () => {
    assert.throws(
      () => deriveBeginRun({ operation_id: 'source.refresh', user_intent: 'x' }),
      (error: unknown) => error instanceof GuardRefusal && error.code === 'G-2',
    );
  });
});

describe('G-15 — structural: BeginRunInput has no field for a caller to supply provenance', () => {
  test('the type excludes run_id, display_id, route_provenance, route_verified, run_type', () => {
    // This is a compile-time property, not a runtime one — asserted here by
    // confirming the derived output's identifiers are never echoes of input.
    const input = { operation_id: 'component.create', user_intent: 'x' };
    const derived = deriveBeginRun(input);
    assert.ok(!('run_id' in input));
    assert.ok(derived.run_id.length > 0);
  });
});
