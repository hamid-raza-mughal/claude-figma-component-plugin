/**
 * Gate 1: "lifecycle and operational-field boundaries are represented in closed
 * schemas", and the TypeScript types agree with them.
 *
 * Two representations of one contract is the project's known failure mode — a
 * schema and a type that drift apart produce a fixture that passes one and
 * violates the other. So the schemas are validated against values built by the
 * real constructors, not against hand-written literals.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SchemaRegistry } from '../../src/validation/schema-validator.ts';
import { makeCandidateIdentity } from '../../src/contracts/identity.ts';
import { resolveInvocation } from '../../src/contracts/invocation.ts';
import { STAGE_PHASES, RUN_OUTCOMES, STAGE_NAMES } from '../../src/contracts/run-envelope.ts';
import type { RunEnvelope } from '../../src/contracts/run-envelope.ts';
import { ENFORCEMENT_OWNERS } from '../../src/contracts/failures.ts';

const SCHEMA_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'schemas', 'shared');
const COORDINATOR_SCHEMA_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'schemas', 'coordinator');

function loadSchema(name: string): { $id: string } & Record<string, unknown> {
  return JSON.parse(readFileSync(join(SCHEMA_DIR, name), 'utf8')) as { $id: string } & Record<
    string,
    unknown
  >;
}

function loadOutputSchema(): { $id: string } & Record<string, unknown> {
  return JSON.parse(
    readFileSync(join(COORDINATOR_SCHEMA_DIR, 'coordinator-output.schema.json'), 'utf8'),
  ) as { $id: string } & Record<string, unknown>;
}

const IDENTITY_SCHEMA = loadSchema('candidate-identity.schema.json');
const ENVELOPE_SCHEMA = loadSchema('run-envelope.schema.json');
const INVOCATION_SCHEMA = loadSchema('invocation.schema.json');

function registry(): SchemaRegistry {
  const reg = new SchemaRegistry();
  reg.register(IDENTITY_SCHEMA);
  reg.register(ENVELOPE_SCHEMA);
  reg.register(INVOCATION_SCHEMA);
  return reg;
}

const SHA = '2222a2b8eff4224f76ddad591cf6f46c6e8bb25ec7f96aebbf13941876356627';
const UUID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

const ENVELOPE: RunEnvelope = {
  run_id: UUID,
  spec_schema_version: '2.0.0',
  source_sha256: SHA,
  index_version: '1.0.0',
  created_at: '2026-07-29T10:00:00Z',
  updated_at: '2026-07-29T10:00:05Z',
  state: { active_stage: 'coordinator', stage_phase: 'validating' },
  tool_invocations: [],
  retry_count: 0,
  repair_call_count: 0,
  clarification_round_count: 0,
  approvals: [],
};

describe('all three schemas compile as Draft 2020-12 and are closed', () => {
  test('they register without error', () => {
    assert.doesNotThrow(() => registry());
  });

  test('each declares unevaluatedProperties: false at the top level', () => {
    for (const schema of [IDENTITY_SCHEMA, ENVELOPE_SCHEMA, INVOCATION_SCHEMA]) {
      assert.equal(
        schema['unevaluatedProperties'],
        false,
        `${schema.$id} must be closed (SA-12: the v1 schema had zero such declarations)`,
      );
    }
  });

  /** Nested objects are where openness usually survives a cleanup pass. */
  test('every nested object definition is closed too', () => {
    const openDefs: string[] = [];
    const walk = (node: unknown, path: string): void => {
      if (node === null || typeof node !== 'object') return;
      if (Array.isArray(node)) {
        node.forEach((item, i) => walk(item, `${path}/${i}`));
        return;
      }
      const record = node as Record<string, unknown>;
      if (record['type'] === 'object' && record['properties'] !== undefined) {
        const closed =
          record['unevaluatedProperties'] === false || record['additionalProperties'] === false;
        if (!closed) openDefs.push(path);
      }
      for (const [key, child] of Object.entries(record)) walk(child, `${path}/${key}`);
    };
    for (const schema of [IDENTITY_SCHEMA, ENVELOPE_SCHEMA, INVOCATION_SCHEMA]) {
      walk(schema, schema.$id);
    }
    assert.deepEqual(openDefs, [], 'these object definitions accept arbitrary fields');
  });
});

describe('CandidateIdentity — schema accepts what the constructor produces', () => {
  test('a constructed identity validates', () => {
    const identity = makeCandidateIdentity({
      refClass: 'paint-style',
      normalizedId: 'S:cfdda1d5d4bf3ab67fd2d15413224854c1b143ca',
      sourceSha256: SHA,
      indexVersion: '1.0.0',
    });
    const result = registry().validate(IDENTITY_SCHEMA.$id, identity);
    assert.equal(result.ok, true, JSON.stringify(!result.ok ? result.violations : []));
  });

  test('a mode-scoped ref validates', () => {
    const identity = makeCandidateIdentity({
      refClass: 'variable',
      normalizedId: 'Colors/warning',
      sourceSha256: SHA,
      indexVersion: '1.0.0',
      mode: 'Dark',
    });
    assert.equal(registry().validate(IDENTITY_SCHEMA.$id, identity).ok, true);
  });

  test('an extra field is rejected', () => {
    const identity = {
      ...makeCandidateIdentity({
        refClass: 'variable',
        normalizedId: 'Body/sm/size',
        sourceSha256: SHA,
        indexVersion: '1.0.0',
      }),
      rowid: 417,
    };
    const result = registry().validate(IDENTITY_SCHEMA.$id, identity);
    assert.equal(result.ok, false, 'a SQLite row id must not be smuggled into the identity');
  });

  test('a hand-written candidate_id fails the pattern', () => {
    const result = registry().validate(IDENTITY_SCHEMA.$id, {
      candidate_id: 'stroke/base',
      source_record_ref: 'paint-style:S:x',
      source_sha256: SHA,
      index_version: '1.0.0',
    });
    assert.equal(result.ok, false);
  });
});

describe('RunEnvelope — schema and type agree', () => {
  test('a minimal valid envelope validates', () => {
    const result = registry().validate(ENVELOPE_SCHEMA.$id, ENVELOPE);
    assert.equal(result.ok, true, JSON.stringify(!result.ok ? result.violations : []));
  });

  test('the schema enumerates exactly the eight phases, five outcomes and seven stages', () => {
    const defs = ENVELOPE_SCHEMA['$defs'] as Record<string, { enum?: string[] }>;
    assert.deepEqual(defs['stagePhase']?.enum, [...STAGE_PHASES]);
    assert.deepEqual(defs['runOutcome']?.enum, [...RUN_OUTCOMES]);
    assert.deepEqual(defs['stageName']?.enum, [...STAGE_NAMES]);
  });

  test('an unknown phase is rejected', () => {
    const result = registry().validate(ENVELOPE_SCHEMA.$id, {
      ...ENVELOPE,
      state: { active_stage: 'coordinator', stage_phase: 'thinking' },
    });
    assert.equal(result.ok, false);
  });

  /** §15.5: the repair budget and the clarification budget are different limits,
   *  and each is capped independently. */
  test('the repair budget is capped at one and clarification rounds at three', () => {
    assert.equal(registry().validate(ENVELOPE_SCHEMA.$id, { ...ENVELOPE, repair_call_count: 2 }).ok, false);
    assert.equal(
      registry().validate(ENVELOPE_SCHEMA.$id, { ...ENVELOPE, clarification_round_count: 4 }).ok,
      false,
    );
  });

  test('an approval must bind an artifact hash and a gate_mode', () => {
    const result = registry().validate(ENVELOPE_SCHEMA.$id, {
      ...ENVELOPE,
      approvals: [
        {
          gate: 'gate-1-semantic',
          approved_at: '2026-07-29T10:00:00Z',
          approved_by: 'ux@techlogix.com',
          decision: 'approved',
        },
      ],
    });
    assert.equal(result.ok, false, 'an approval without a bound artifact hash refers to nothing');
  });

  test('a complete observe-only approval validates', () => {
    const result = registry().validate(ENVELOPE_SCHEMA.$id, {
      ...ENVELOPE,
      approvals: [
        {
          gate: 'gate-1-semantic',
          gate_mode: 'observe-only-validation',
          approved_artifact_sha256: SHA,
          approved_at: '2026-07-29T10:00:00Z',
          approved_by: 'ux@techlogix.com',
          decision: 'approved',
          response_source: 'model-relayed',
          verified: false,
          authorizing: false,
        },
      ],
    });
    assert.equal(result.ok, true, JSON.stringify(!result.ok ? result.violations : []));
  });

  /**
   * §7.4.1 / §19 D-7, v4 §F widening. Absent, the schema rejects the record —
   * proving `response_source`/`verified`/`authorizing` are required, not optional
   * (N-5: "an absent flag is indistinguishable from false").
   */
  test('an approval missing the three Phase 2 response-source fields is rejected', () => {
    const result = registry().validate(ENVELOPE_SCHEMA.$id, {
      ...ENVELOPE,
      approvals: [
        {
          gate: 'gate-1-semantic',
          gate_mode: 'observe-only-validation',
          approved_artifact_sha256: SHA,
          approved_at: '2026-07-29T10:00:00Z',
          approved_by: 'ux@techlogix.com',
          decision: 'approved',
        },
      ],
    });
    assert.equal(result.ok, false);
  });

  /** G-9b only means something if the schema can represent true at all
   *  (docs/phase2-decision-log.md PD-5) — this is the type-level half of that. */
  test('verified: true and authorizing: true are representable at the schema level', () => {
    const result = registry().validate(ENVELOPE_SCHEMA.$id, {
      ...ENVELOPE,
      approvals: [
        {
          gate: 'gate-1-semantic',
          gate_mode: 'observe-only-validation',
          approved_artifact_sha256: SHA,
          approved_at: '2026-07-29T10:00:00Z',
          approved_by: 'ux@techlogix.com',
          decision: 'approved',
          response_source: 'model-relayed',
          verified: true,
          authorizing: true,
        },
      ],
    });
    assert.equal(
      result.ok,
      true,
      'the schema must not forbid true — G-9b is a Guard-enforced runtime refusal, not a type-level one',
    );
  });
});

describe('ENFORCEMENT_OWNERS — TS tuple and schema enum agree (§8.5, §11.7 row 1)', () => {
  test('the schema enum matches the TS tuple exactly, including run-guard', () => {
    const outputSchema = loadOutputSchema();
    const defs = outputSchema['$defs'] as Record<string, unknown>;
    const failureReport = defs['failureReport'] as {
      properties: { evidence: { items: { properties: { enforced_by: { enum: string[] } } } } };
    };
    const schemaEnum = failureReport.properties.evidence.items.properties.enforced_by.enum;
    assert.deepEqual(schemaEnum, [...ENFORCEMENT_OWNERS]);
    assert.ok(schemaEnum.includes('run-guard'));
  });
});

describe("ClarificationGap.owner / Disclosure.owner — 'controller' retargeted to 'run-guard' (§11.7 row 3)", () => {
  test('neither owner enum contains the retired controller literal', () => {
    const outputSchema = loadOutputSchema();
    const defs = outputSchema['$defs'] as Record<string, unknown>;
    const gap = defs['clarificationGap'] as { properties: { owner: { enum: string[] } } };
    const disclosure = defs['disclosure'] as { properties: { owner: { enum: string[] } } };
    assert.ok(!gap.properties.owner.enum.includes('controller'));
    assert.ok(!disclosure.properties.owner.enum.includes('controller'));
    assert.ok(gap.properties.owner.enum.includes('run-guard'));
    assert.ok(disclosure.properties.owner.enum.includes('run-guard'));
  });
});

describe('ResolvedCoordinatorInvocation — schema and validator agree', () => {
  test('a resolved new invocation validates', () => {
    const resolved = resolveInvocation({
      run_id: UUID,
      run_type: 'new',
      user_intent: 'Build a warning toast',
      requested_at: '2026-07-29T10:00:00Z',
    });
    const result = registry().validate(INVOCATION_SCHEMA.$id, resolved);
    assert.equal(result.ok, true, JSON.stringify(!result.ok ? result.violations : []));
  });

  test('a resolved modify invocation with a target validates', () => {
    const resolved = resolveInvocation({
      run_id: UUID,
      run_type: 'modify',
      user_intent: 'Add a disabled state to the Primary Button',
      requested_at: '2026-07-29T10:00:00Z',
      target: {
        tree_ref: 'figma://node/1:23',
        tree_sha256: 'c'.repeat(64),
        node_count: 18,
        captured_at: '2026-07-29T09:59:00Z',
      },
    });
    const result = registry().validate(INVOCATION_SCHEMA.$id, resolved);
    assert.equal(result.ok, true, JSON.stringify(!result.ok ? result.violations : []));
  });

  test('the schema rejects a missing route, matching the programmatic validator', () => {
    const result = registry().validate(INVOCATION_SCHEMA.$id, {
      run_id: UUID,
      user_intent: 'x',
      requested_at: '2026-07-29T10:00:00Z',
    });
    assert.equal(result.ok, false);
  });

  test('the schema rejects modify without a target', () => {
    const result = registry().validate(INVOCATION_SCHEMA.$id, {
      run_id: UUID,
      run_type: 'modify',
      user_intent: 'x',
      requested_at: '2026-07-29T10:00:00Z',
    });
    assert.equal(result.ok, false);
  });

  /** A target on `new` is not merely redundant — it contradicts the route. */
  test('the schema rejects a target on new', () => {
    const result = registry().validate(INVOCATION_SCHEMA.$id, {
      run_id: UUID,
      run_type: 'new',
      user_intent: 'x',
      requested_at: '2026-07-29T10:00:00Z',
      target: {
        tree_ref: 'figma://node/1:23',
        tree_sha256: 'c'.repeat(64),
        node_count: 3,
        captured_at: '2026-07-29T09:00:00Z',
      },
    });
    assert.equal(result.ok, false);
  });

  test('the schema asserts UUID format on run_id', () => {
    const result = registry().validate(INVOCATION_SCHEMA.$id, {
      run_id: 'warning-toast-run-002',
      run_type: 'new',
      user_intent: 'x',
      requested_at: '2026-07-29T10:00:00Z',
    });
    assert.equal(result.ok, false, 'format assertion must be on');
  });
});
