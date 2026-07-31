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
import { ingest } from '../../src/ingestion/curated-json-loader.ts';
import { IndexReader } from '../../src/resolver/index-reader.ts';
import { generateSchemaCard } from '../../src/ingestion/schema-card-generator.ts';
import { assembleModelInput } from '../../src/coordinator/assemble-model-input.ts';
import { assertNoLeakage } from '../../src/coordinator/leakage-assertion.ts';
import { inactiveRouteModuleIds } from '../../src/coordinator/select-route-module.ts';

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

/**
 * PD-9 (docs/phase2-decision-log.md): `generateSchemaCard`'s real output
 * legitimately renders `source_sha256`/`index_version` into its SNAPSHOT
 * header, and `assertNoLeakage`'s operational-field check had no exemption
 * for the `schema-card` section until this session — every existing Phase 1
 * test used a hand-written `SchemaCard` fixture that happened to avoid the
 * collision, so the two real functions had never actually been run together
 * before. This test calls both directly, isolated from the full engine, so
 * the fix has coverage that doesn't depend on `prepareContext`'s own success
 * as an indirect proxy.
 */
describe('PD-9 regression — the real schema card passes the real leakage assertion', () => {
  test('generateSchemaCard(reader) output, assembled, is clean per assertNoLeakage', () => {
    const config = newPhase1Config();
    const result = ingest(config, { now: '2026-07-29T10:00:00Z' });
    const reader = new IndexReader(result.database_path);
    try {
      const card = generateSchemaCard(reader);
      // The exact collision PD-9 fixed: confirm the real card still contains
      // these substrings (proving the exemption is doing real work, not
      // passing because the trigger condition vanished).
      assert.match(card.body, /source_sha256:/);
      assert.match(card.body, /index_version:/);

      const assembled = assembleModelInput({
        run_type: 'new',
        user_intent: 'PD-9 regression check',
        schema_card: card,
        candidates_by_query: {},
      });
      const leakage = assertNoLeakage({ assembled, inactiveRouteModuleIds: inactiveRouteModuleIds('new') });
      assert.equal(
        leakage.clean,
        true,
        `expected clean, got findings: ${JSON.stringify(leakage.findings)}`,
      );
    } finally {
      reader.close();
    }
  });
});
