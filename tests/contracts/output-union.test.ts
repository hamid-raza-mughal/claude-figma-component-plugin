/**
 * Gate 3 (§14.5): the ten canonical fixtures, plus the structural guarantees.
 *
 * Every valid fixture must pass **with format assertion on**. Every invalid
 * fixture must fail **for its intended error code**, not merely fail — a fixture
 * that fails for an unrelated reason is not evidence the rule works, and it is how
 * a test suite comes to look green while the invariant it names is unenforced.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SchemaRegistry, type SchemaViolation } from '../../src/validation/schema-validator.ts';
import {
  aggregateConfidence,
  MUTUALLY_EXCLUSIVE_PAYLOADS,
  variantKeyOf,
  isReady,
  type CoordinatorOutput,
} from '../../src/contracts/coordinator-output.ts';
import {
  findAuthoredTreeLeaks,
  ROUTE_TO_PAYLOAD_FIELD,
  collectSelectedCandidateIds,
  type CoordinatorJudgmentDraft,
} from '../../src/contracts/coordinator-draft.ts';
import { findOperationalLeaks } from '../../src/contracts/run-envelope.ts';
import { hasInlinedVideoContent } from '../../src/contracts/observed-tree.ts';
import { isCoverageAccounted } from '../../src/contracts/semantic.ts';
import { INVARIANTS, INVARIANTS_BY_ID } from '../../src/validation/invariant-registry.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCHEMA_DIR = join(HERE, '..', '..', 'schemas');
const FIXTURE_DIR = join(HERE, '..', 'fixtures', 'active', 'outputs');

function loadJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

const OUTPUT_SCHEMA_ID = 'https://adalfi.dev/schemas/coordinator/coordinator-output.schema.json';
const DRAFT_SCHEMA_ID = 'https://adalfi.dev/schemas/coordinator/coordinator-judgment-draft.schema.json';

function registry(): SchemaRegistry {
  const reg = new SchemaRegistry();
  // Registered before the schemas that $ref them.
  reg.register(loadJson(join(SCHEMA_DIR, 'coordinator', 'semantic.schema.json')));
  reg.register(loadJson(join(SCHEMA_DIR, 'coordinator', 'coordinator-output.schema.json')));
  reg.register(loadJson(join(SCHEMA_DIR, 'coordinator', 'coordinator-judgment-draft.schema.json')));
  return reg;
}

type FixtureIndex = {
  readonly fixtures: readonly {
    readonly file: string;
    readonly expect: 'valid' | 'invalid';
    readonly intended_error_code: string | null;
  }[];
};

const index = loadJson<FixtureIndex>(join(FIXTURE_DIR, 'index.json'));

describe('fixture set completeness (§14.5)', () => {
  test('ten fixtures: five valid, five invalid', () => {
    assert.equal(index.fixtures.length, 10);
    assert.equal(index.fixtures.filter((f) => f.expect === 'valid').length, 5);
    assert.equal(index.fixtures.filter((f) => f.expect === 'invalid').length, 5);
  });

  test('every invalid fixture declares an intended error code', () => {
    for (const fixture of index.fixtures.filter((f) => f.expect === 'invalid')) {
      assert.ok(
        fixture.intended_error_code !== null,
        `${fixture.file} must declare why it is expected to fail`,
      );
    }
  });
});

describe('schemas compile and are closed', () => {
  test('all three register without error', () => {
    assert.doesNotThrow(() => registry());
  });

  test('every nested object definition rejects unknown fields (INV-22)', () => {
    const open: string[] = [];
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
        // `common` is intentionally open: it is composed into each variant via
        // allOf, and closing it there would reject the variant's own fields.
        if (!closed && !path.endsWith('/common')) open.push(path);
      }
      for (const [key, child] of Object.entries(record)) walk(child, `${path}/${key}`);
    };
    for (const file of ['semantic.schema.json', 'coordinator-output.schema.json']) {
      walk(loadJson(join(SCHEMA_DIR, 'coordinator', file)), file);
    }
    assert.deepEqual(open, [], 'these definitions accept arbitrary fields (SA-12)');
  });
});

describe('valid fixtures pass with format assertion', () => {
  for (const fixture of index.fixtures.filter((f) => f.expect === 'valid')) {
    test(`${fixture.file} validates`, () => {
      const result = registry().validate(OUTPUT_SCHEMA_ID, loadJson(join(FIXTURE_DIR, fixture.file)));
      assert.equal(
        result.ok,
        true,
        result.ok ? '' : JSON.stringify((result.violations as SchemaViolation[]).slice(0, 4), null, 1),
      );
    });
  }
});

describe('invalid fixtures fail for their intended reason', () => {
  for (const fixture of index.fixtures.filter((f) => f.expect === 'invalid')) {
    test(`${fixture.file} fails with ${String(fixture.intended_error_code)}`, () => {
      const result = registry().validate(OUTPUT_SCHEMA_ID, loadJson(join(FIXTURE_DIR, fixture.file)));
      assert.equal(result.ok, false, 'fixture was expected to be rejected');
      if (result.ok) return;
      assert.ok(
        result.violations.some((violation) => violation.code === fixture.intended_error_code),
        `expected ${String(fixture.intended_error_code)}, got ${[
          ...new Set(result.violations.map((v) => v.code)),
        ].join(', ')}`,
      );
    });
  }
});

describe('structural guarantees, not runtime checks', () => {
  /** Defect 3: `audit` → Builder. The literal makes it unrepresentable. */
  test('audit-ready cannot carry a Builder route (INV-09)', () => {
    const audit = loadJson<CoordinatorOutput>(join(FIXTURE_DIR, 'audit-ready.json'));
    assert.ok(isReady(audit) && audit.run_type === 'audit');
    if (!isReady(audit) || audit.run_type !== 'audit') return;
    assert.equal(audit.next_route, 'synthesizer');
    const tampered = { ...audit, next_route: 'builder' };
    assert.equal(registry().validate(OUTPUT_SCHEMA_ID, tampered).ok, false);
  });

  /** Defect 1: in v1 a blocked `new` run failed its own schema. */
  test('blocked needs no ready payload (INV-10)', () => {
    const blocked = loadJson<Record<string, unknown>>(join(FIXTURE_DIR, 'blocked.json'));
    assert.ok(!Object.hasOwn(blocked, 'semantic_brief'));
    assert.equal(registry().validate(OUTPUT_SCHEMA_ID, blocked).ok, true);
  });

  /** Defect 2: in v1 `route: builder` plus a blocking flag validated cleanly. */
  test('a forward route alongside active gaps is rejected (INV-11)', () => {
    const ready = loadJson<Record<string, unknown>>(join(FIXTURE_DIR, 'new-ready.json'));
    const withGaps = { ...ready, active_gaps: [] };
    assert.equal(registry().validate(OUTPUT_SCHEMA_ID, withGaps).ok, false);
  });

  test('blocked and failed carry an explicit null route, never an omission', () => {
    for (const file of ['blocked.json', 'failed.json']) {
      const output = loadJson<Record<string, unknown>>(join(FIXTURE_DIR, file));
      assert.ok(Object.hasOwn(output, 'next_route'));
      assert.equal(output['next_route'], null);
      const omitted = { ...output };
      delete omitted['next_route'];
      assert.equal(registry().validate(OUTPUT_SCHEMA_ID, omitted).ok, false);
    }
  });

  test('no two mutually exclusive payloads may coexist', () => {
    const base = loadJson<Record<string, unknown>>(join(FIXTURE_DIR, 'new-ready.json'));
    const audit = loadJson<Record<string, unknown>>(join(FIXTURE_DIR, 'audit-ready.json'));
    for (const [left, right] of MUTUALLY_EXCLUSIVE_PAYLOADS) {
      if (!Object.hasOwn(base, left) && !Object.hasOwn(audit, left)) continue;
      const merged = {
        ...base,
        [left]: base[left] ?? audit[left],
        [right]: base[right] ?? audit[right] ?? [],
      };
      assert.equal(
        registry().validate(OUTPUT_SCHEMA_ID, merged).ok,
        false,
        `${left} and ${right} must not coexist`,
      );
    }
  });

  test('no resolution may carry binding_call (INV-06)', () => {
    const ready = loadJson<Record<string, unknown>>(join(FIXTURE_DIR, 'new-ready.json'));
    const resolutions = ready['resolutions'] as Record<string, unknown>[];
    const tampered = {
      ...ready,
      resolutions: [{ ...resolutions[0], binding_call: 'setBoundVariableForPaint(...)' }, ...resolutions.slice(1)],
    };
    assert.equal(registry().validate(OUTPUT_SCHEMA_ID, tampered).ok, false);
  });

  test('a disclosure cannot be marked actionable (INV-24)', () => {
    const audit = loadJson<Record<string, unknown>>(join(FIXTURE_DIR, 'audit-ready.json'));
    const disclosures = audit['disclosures'] as Record<string, unknown>[];
    const tampered = { ...audit, disclosures: [{ ...disclosures[0], actionable: true }] };
    assert.equal(registry().validate(OUTPUT_SCHEMA_ID, tampered).ok, false);
  });
});

describe('variant/property model survives (decision D-D.3, INV-27)', () => {
  /** The bar is the spec's own worked example. Without it, `modify` regresses. */
  test('the modify fixture expresses the state-axis transition', () => {
    const modify = loadJson<Extract<CoordinatorOutput, { run_type: 'modify' }>>(
      join(FIXTURE_DIR, 'modify-ready.json'),
    );
    const item = modify.semantic_delta.items[0];
    assert.equal(item?.change_type, 'state');
    assert.equal(item?.change_status, 'add');
    assert.deepEqual(item?.variant_transition?.options_before, ['default', 'hover', 'pressed']);
    assert.deepEqual(item?.variant_transition?.options_after, [
      'default',
      'hover',
      'pressed',
      'disabled',
    ]);
  });

  test('a state-specific binding names the option it applies to', () => {
    const modify = loadJson<Extract<CoordinatorOutput, { run_type: 'modify' }>>(
      join(FIXTURE_DIR, 'modify-ready.json'),
    );
    assert.equal(modify.semantic_delta.items[0]?.bindings?.[0]?.applies_to_option, 'disabled');
  });

  test('a brief without variant_properties is rejected', () => {
    const ready = loadJson<Record<string, unknown>>(join(FIXTURE_DIR, 'new-ready.json'));
    const brief = { ...(ready['semantic_brief'] as Record<string, unknown>) };
    delete brief['variant_properties'];
    assert.equal(registry().validate(OUTPUT_SCHEMA_ID, { ...ready, semantic_brief: brief }).ok, false);
  });

  /** §5.7: `change_status` lives only on delta items. */
  test('change_status is rejected on a semantic brief (INV-12)', () => {
    const ready = loadJson<Record<string, unknown>>(join(FIXTURE_DIR, 'new-ready.json'));
    const brief = { ...(ready['semantic_brief'] as Record<string, unknown>), change_status: 'add' };
    assert.equal(registry().validate(OUTPUT_SCHEMA_ID, { ...ready, semantic_brief: brief }).ok, false);
  });
});

describe('the judgment draft accepts only judgment', () => {
  const draft: CoordinatorJudgmentDraft = {
    run_type: 'new',
    self_assessment: 'believe-complete',
    semantic_brief: loadJson<Extract<CoordinatorOutput, { run_type: 'new'; status: 'ready' }>>(
      join(FIXTURE_DIR, 'new-ready.json'),
    ).semantic_brief,
  };

  test('a clean draft validates', () => {
    const result = registry().validate(DRAFT_SCHEMA_ID, draft);
    assert.equal(result.ok, true, result.ok ? '' : JSON.stringify(result.violations.slice(0, 3)));
  });

  test('operational metadata cannot enter through the draft schema (INV-04)', () => {
    for (const injected of [
      { run_id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301' },
      { approvals: [] },
      { token_metrics: { input_tokens: 1 } },
      { next_route: 'builder' },
      { status: 'ready' },
    ]) {
      assert.equal(
        registry().validate(DRAFT_SCHEMA_ID, { ...draft, ...injected }).ok,
        false,
        `draft accepted ${Object.keys(injected).join(',')}`,
      );
    }
  });

  test('a draft may not carry another route’s payload', () => {
    const audit = loadJson<Extract<CoordinatorOutput, { run_type: 'audit' }>>(
      join(FIXTURE_DIR, 'audit-ready.json'),
    );
    assert.equal(
      registry().validate(DRAFT_SCHEMA_ID, { ...draft, audit_brief: audit.audit_brief }).ok,
      false,
    );
  });

  test('each route requires its own payload field', () => {
    assert.equal(ROUTE_TO_PAYLOAD_FIELD.new, 'semantic_brief');
    assert.equal(ROUTE_TO_PAYLOAD_FIELD.modify, 'semantic_delta');
    assert.equal(ROUTE_TO_PAYLOAD_FIELD.audit, 'audit_brief');
    assert.equal(registry().validate(DRAFT_SCHEMA_ID, { run_type: 'modify', self_assessment: 'believe-complete' }).ok, false);
  });

  test('selections are collected in document order, duplicates preserved', () => {
    const ids = collectSelectedCandidateIds(draft);
    assert.equal(ids.length, 2);
    for (const id of ids) assert.match(id, /^c_[0-9a-f]{24}$/);
  });
});

describe('authored-tree detection (INV-07, INV-08)', () => {
  test('a clean brief has no leaks', () => {
    const ready = loadJson<Extract<CoordinatorOutput, { run_type: 'new'; status: 'ready' }>>(
      join(FIXTURE_DIR, 'new-ready.json'),
    );
    assert.deepEqual(findAuthoredTreeLeaks(ready.semantic_brief), []);
  });

  /** Prompt v1.2's Step 4 always built a layer tree, on every route. */
  test('a children array is detected with its path', () => {
    const leaks = findAuthoredTreeLeaks({ elements: [{ semantic_id: 'root', children: [] }] });
    assert.equal(leaks[0]?.kind, 'forbidden-key');
    assert.equal(leaks[0]?.detail, 'children');
    assert.equal(leaks[0]?.path, '/elements/0/children');
  });

  /** A node-type literal is a tree even when the key looks innocent. */
  test('a Figma node type is detected regardless of key name', () => {
    const leaks = findAuthoredTreeLeaks({ elements: [{ role: 'FRAME' }] });
    assert.equal(leaks[0]?.kind, 'figma-node-type');
    assert.equal(leaks[0]?.detail, 'FRAME');
  });

  test('layout and binding_call keys are detected', () => {
    for (const key of ['auto_layout', 'layoutMode', 'binding_call', 'absoluteBoundingBox']) {
      assert.equal(findAuthoredTreeLeaks({ [key]: 1 }).length, 1, `${key} not detected`);
    }
  });

  test('all leaks are reported at once so one repair call suffices', () => {
    const leaks = findAuthoredTreeLeaks({ children: [], nodes: [], frame: {} });
    assert.equal(leaks.length, 3);
  });

  test('the authored-tree fixture is caught by the detector too', () => {
    const fixture = loadJson<Record<string, unknown>>(join(FIXTURE_DIR, 'invalid-authored-tree.json'));
    assert.ok(findAuthoredTreeLeaks(fixture).length > 0);
  });
});

describe('composition rules', () => {
  /** Averaging is how a low-confidence resolution hides inside a high aggregate. */
  test('aggregate confidence takes the weakest child (INV-23)', () => {
    assert.equal(aggregateConfidence(['high', 'high', 'low']), 'low');
    assert.equal(aggregateConfidence(['high', 'medium']), 'medium');
    assert.equal(aggregateConfidence(['high', 'high']), 'high');
    assert.equal(aggregateConfidence([]), 'low', 'nothing resolved is not high confidence');
  });

  test('extraction coverage arithmetic is verified, not trusted (INV-25)', () => {
    const audit = loadJson<Extract<CoordinatorOutput, { run_type: 'audit' }>>(
      join(FIXTURE_DIR, 'audit-ready.json'),
    );
    assert.equal(isCoverageAccounted(audit.extraction_coverage), true);
    assert.equal(
      isCoverageAccounted({ ...audit.extraction_coverage, examined_nodes: 10 }),
      false,
      'a mis-stated examined count must not pass',
    );
  });

  test('variant keys distinguish every case', () => {
    const keys = ['new-ready.json', 'modify-ready.json', 'audit-ready.json', 'blocked.json', 'failed.json'].map(
      (file) => variantKeyOf(loadJson<CoordinatorOutput>(join(FIXTURE_DIR, file))),
    );
    assert.deepEqual(keys, ['new-ready', 'modify-ready', 'audit-ready', 'blocked', 'failed']);
    assert.equal(new Set(keys).size, 5);
  });

  test('no valid fixture inlines video content or leaks operational fields into intent', () => {
    for (const file of ['new-ready.json', 'modify-ready.json', 'audit-ready.json']) {
      const output = loadJson<Record<string, unknown>>(join(FIXTURE_DIR, file));
      assert.equal(hasInlinedVideoContent(output), false, `${file} inlines video content`);
      const intent =
        output['semantic_brief'] ?? output['semantic_delta'] ?? output['audit_brief'];
      assert.deepEqual(findOperationalLeaks(intent), [], `${file} leaks operational fields into intent`);
    }
  });
});

describe('invariant registry (INV-15)', () => {
  test('every invariant has an id, a statement, an owner and an error code', () => {
    for (const invariant of INVARIANTS) {
      assert.match(invariant.id, /^INV-\d{2}$/);
      assert.ok(invariant.statement.length > 20, invariant.id);
      assert.ok(invariant.owner.length > 0, invariant.id);
      assert.match(invariant.error_code, /^INV_[A-Z_]+$/);
    }
  });

  /** One owner per invariant is the rule: two nominal owners means none in
   *  practice, which is how blocking severity came to have no route effect. */
  test('ids and error codes are unique', () => {
    assert.equal(new Set(INVARIANTS.map((i) => i.id)).size, INVARIANTS.length);
    assert.equal(new Set(INVARIANTS.map((i) => i.error_code)).size, INVARIANTS.length);
  });

  test('the registry covers all 22 numbered contract invariants plus the additions', () => {
    assert.ok(INVARIANTS.length >= 22, `only ${INVARIANTS.length} invariants registered`);
    for (const id of ['INV-01', 'INV-10', 'INV-11', 'INV-22', 'INV-24', 'INV-27']) {
      assert.ok(INVARIANTS_BY_ID.has(id), `${id} missing`);
    }
  });

  test('the invariants that prevent a known defect say which one', () => {
    const withCause = INVARIANTS.filter((i) => i.prevents !== undefined);
    assert.ok(withCause.length >= 10, 'most invariants should name what they prevent');
  });
});
