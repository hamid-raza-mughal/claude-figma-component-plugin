/**
 * Gate 0 evidence: the JSON Schema setup actually enforces what P1-FINAL §11.5
 * requires. Each test corresponds to a verified v1 defect, so a regression here
 * re-opens a known hole rather than breaking an abstract rule.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { SchemaRegistry } from '../../src/validation/schema-validator.ts';

const CLOSED_OBJECT = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://adalfi.test/closed-object.schema.json',
  type: 'object',
  properties: {
    run_id: { type: 'string', format: 'uuid' },
    created_at: { type: 'string', format: 'date-time' },
    source_ref: { type: 'string', format: 'uri' },
  },
  required: ['run_id'],
  unevaluatedProperties: false,
} as const;

describe('SchemaRegistry', () => {
  test('supports Draft 2020-12 keywords (unevaluatedProperties compiles)', () => {
    const registry = new SchemaRegistry();
    assert.doesNotThrow(() => registry.register(CLOSED_OBJECT));
  });

  test('accepts a valid instance', () => {
    const registry = new SchemaRegistry();
    registry.register(CLOSED_OBJECT);
    const result = registry.validate(CLOSED_OBJECT.$id, {
      run_id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
      created_at: '2026-07-29T12:00:00Z',
      source_ref: 'https://example.test/a.json',
    });
    assert.equal(result.ok, true);
  });

  /**
   * SA-12 / plan finding: the v1 schema had zero occurrences of
   * `additionalProperties` or `unevaluatedProperties`, so every contract object
   * accepted arbitrary fields — the hole that lets a model inject operational
   * metadata.
   */
  test('rejects unknown fields with SCHEMA_UNKNOWN_FIELD', () => {
    const registry = new SchemaRegistry();
    registry.register(CLOSED_OBJECT);
    const result = registry.validate(CLOSED_OBJECT.$id, {
      run_id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
      injected_telemetry: { input_tokens: 999 },
    });
    assert.equal(result.ok, false);
    assert.ok(!result.ok && result.violations.some((v) => v.code === 'SCHEMA_UNKNOWN_FIELD'));
  });

  /**
   * Verified v1 defect: `run_id` declared `format: uuid` while the canonical
   * fixture used `warning-toast-run-002`. It validated only because format
   * assertion was disabled.
   */
  test('asserts formats — a non-UUID run_id fails', () => {
    const registry = new SchemaRegistry();
    registry.register(CLOSED_OBJECT);
    const result = registry.validate(CLOSED_OBJECT.$id, { run_id: 'warning-toast-run-002' });
    assert.equal(result.ok, false);
    assert.ok(!result.ok && result.violations.some((v) => v.code === 'SCHEMA_FORMAT_INVALID'));
  });

  test('reports missing required fields', () => {
    const registry = new SchemaRegistry();
    registry.register(CLOSED_OBJECT);
    const result = registry.validate(CLOSED_OBJECT.$id, {});
    assert.equal(result.ok, false);
    assert.ok(!result.ok && result.violations.some((v) => v.code === 'SCHEMA_MISSING_REQUIRED'));
  });

  test('violations carry a contract location and an enforcement owner', () => {
    const registry = new SchemaRegistry();
    registry.register(CLOSED_OBJECT);
    const result = registry.validate(CLOSED_OBJECT.$id, { run_id: 'nope' });
    assert.equal(result.ok, false);
    if (result.ok) return;
    for (const violation of result.violations) {
      assert.equal(violation.enforcedBy, 'schema');
      assert.ok(violation.schemaPath.length > 0, 'schemaPath must locate the contract');
    }
  });
});
