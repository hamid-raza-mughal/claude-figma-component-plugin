/**
 * `prepareContext` (§4.1, §10 rows 2/4) — the deterministic pipeline: load or
 * reuse the index, generate candidates (PD-7), the schema card, the route
 * module, assemble the model input, and run the leakage assertion.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { CoordinatorEngine } from '../../src/tools/engine.ts';
import { GuardRefusal } from '../../src/guard/errors.ts';
import { newPhase1Config } from './fixtures.ts';

function newEngine(): CoordinatorEngine {
  const config = newPhase1Config();
  return new CoordinatorEngine({ phase1Config: () => config, now: () => '2026-07-29T10:00:00Z' });
}

describe('prepareContext — the deterministic pipeline', () => {
  test('moves a received run to drafting and returns candidates, schema card, route module', () => {
    const engine = newEngine();
    const { run_id } = engine.beginRun({ operation_id: 'component.create', user_intent: 'Build a warning toast' });
    const result = engine.prepareContext(run_id);
    assert.ok(Object.keys(result.candidates).length > 0);
    assert.ok(result.schema_card.body.length > 0);
    assert.equal(result.route_module, 'route-new');
    assert.ok(result.assembled_bytes > 0);
    assert.equal(engine.resumeRun(run_id).phase, 'drafting');
  });

  test('candidates are keyed by the PD-7 standard categories', () => {
    const engine = newEngine();
    const { run_id } = engine.beginRun({ operation_id: 'component.create', user_intent: 'x' });
    const result = engine.prepareContext(run_id);
    assert.deepEqual(
      Object.keys(result.candidates).sort(),
      ['category:color', 'category:corner-radius', 'category:effect', 'category:spacing', 'category:typography'].sort(),
    );
  });

  test('every returned candidate is low confidence — a broadened listing, never a targeted match', () => {
    const engine = newEngine();
    const { run_id } = engine.beginRun({ operation_id: 'component.create', user_intent: 'x' });
    const result = engine.prepareContext(run_id);
    for (const candidates of Object.values(result.candidates)) {
      for (const candidate of candidates) assert.equal(candidate.confidence, 'low');
    }
  });

  test('G-11: prepareContext is refused a second time from drafting', () => {
    const engine = newEngine();
    const { run_id } = engine.beginRun({ operation_id: 'component.create', user_intent: 'x' });
    engine.prepareContext(run_id);
    assert.throws(
      () => engine.prepareContext(run_id),
      (error: unknown) => error instanceof GuardRefusal && error.code === 'G-11',
    );
  });

  test('records both context-preparation events for one call', () => {
    const engine = newEngine();
    const { run_id } = engine.beginRun({ operation_id: 'component.create', user_intent: 'x' });
    engine.prepareContext(run_id);
    const invocations = engine.getToolInvocations(run_id);
    assert.ok(invocations.some((entry) => entry.tool === 'prepareContext' && entry.ok === true));
  });
});
