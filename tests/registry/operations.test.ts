/**
 * §2.7–§2.9: public labels are not identities, and the registry is data.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  OPERATIONS,
  resolveCommand,
  deriveRunTypeFromOperationId,
  canonicalPublicNameFor,
  lookupOperation,
  ResolveCommandError,
  OperationMappingError,
} from '../../src/registry/operations.ts';
import { RUN_TYPES } from '../../src/contracts/invocation.ts';

describe('the registry has no duplicate public name or alias (resolveCommand assumes this)', () => {
  test('every public name and alias appears exactly once across the table', () => {
    const names = OPERATIONS.flatMap((row) => [row.publicName, ...row.aliases]);
    assert.equal(new Set(names).size, names.length);
  });
});

describe('resolveCommand (§13) — G-14', () => {
  test('resolves a canonical public name', () => {
    assert.deepEqual(resolveCommand('/create-component'), {
      operation_id: 'component.create',
      kind: 'route',
    });
  });

  test('resolves an alias to the same operation_id as its canonical name (§2.7.0, G-18)', () => {
    const alias = resolveCommand('/review-component');
    const canonical = resolveCommand('/audit-component');
    assert.deepEqual(alias, canonical);
  });

  test('there is no component.review operation (§2.7.0)', () => {
    assert.ok(!OPERATIONS.some((row) => row.operationId === 'component.review'));
    assert.equal(RUN_TYPES.length, 3);
  });

  test('an unknown command is refused', () => {
    assert.throws(
      () => resolveCommand('/does-not-exist'),
      (error: unknown) => error instanceof ResolveCommandError && error.code === 'COMMAND_UNKNOWN',
    );
  });

  test('maintenance operations resolve too, distinguished by kind', () => {
    assert.deepEqual(resolveCommand('source.refresh'), {
      operation_id: 'source.refresh',
      kind: 'maintenance',
    });
  });
});

describe('run_type derivation (§2.10.3.1) — G-2', () => {
  test('every route operation derives its registered RunType', () => {
    assert.equal(deriveRunTypeFromOperationId('component.create'), 'new');
    assert.equal(deriveRunTypeFromOperationId('component.modify'), 'modify');
    assert.equal(deriveRunTypeFromOperationId('component.audit'), 'audit');
  });

  test('a maintenance operation_id has no RunType — refused, not null', () => {
    assert.throws(
      () => deriveRunTypeFromOperationId('source.refresh'),
      (error: unknown) => error instanceof OperationMappingError,
    );
  });

  test('an unmapped operation_id is refused (the only reachable G-2 defect post-revision-4)', () => {
    assert.throws(
      () => deriveRunTypeFromOperationId('component.delete'),
      (error: unknown) => error instanceof OperationMappingError,
    );
  });
});

describe('G-18 — alias invariance', () => {
  test('canonicalPublicNameFor recovers the canonical name regardless of which alias resolved it', () => {
    const { operation_id } = resolveCommand('/review-component');
    assert.equal(canonicalPublicNameFor(operation_id), '/audit-component');
  });

  test('lookupOperation returns one row shared by every alias', () => {
    const canonical = lookupOperation('component.audit');
    assert.ok(canonical !== undefined);
    assert.ok(canonical.aliases.includes('/review-component'));
    // The run configuration (operationId, runType) is the same object for both
    // names — there is no separate code path for an alias to diverge through.
    assert.equal(canonical.runType, 'audit');
  });
});
