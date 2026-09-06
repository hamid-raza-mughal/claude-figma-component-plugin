/**
 * B1's other acceptance item: the eleven v0.4 changes are carried into the
 * promoted contract.
 *
 * This had no test until audit cycle 2. B1 says "carry the eleven v0.4 changes
 * (C-1…C-11 in the research CHANGELOG) into the production document", and
 * nothing checked it — an acceptance claim resting on the promotion having
 * copied the right file. That is the shape this phase exists to remove.
 *
 * **Every check here is structural, never a search for the string `C-5`.**
 * Grepping the schema's own `description` fields for change ids would be D-4
 * exactly: a check that reads the prose asserting a thing was done rather than
 * the thing. Each change is verified by the artifact it introduced — the
 * `$def` that exists, the enum members that are present, the property key that
 * is *gone*.
 *
 * The distinction between "gone as a field" and "gone as a word" matters here
 * and cost a first draft. The schema's own descriptions say `documentedPairingCount`
 * and `treatmentLabel` were replaced — that is a migration note, and a check
 * that treated it as a live field would be flagging the schema for explaining
 * itself. Retirement is checked at property keys, where a live field would
 * actually be.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REPRESENTATION_CONTRACT_SCHEMA_PATH } from '../../src/representation/index.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

type Schema = {
  readonly properties: Record<string, Record<string, unknown>>;
  readonly $defs: Record<string, Record<string, unknown>>;
};

const schema = JSON.parse(
  readFileSync(join(ROOT, REPRESENTATION_CONTRACT_SCHEMA_PATH), 'utf8'),
) as Schema;

/** Every property key anywhere in the document — the only place a retired field
 *  could still be live. A `description` mentioning it is a migration note. */
function propertyKeys(node: unknown, out: Set<string> = new Set()): Set<string> {
  if (Array.isArray(node)) {
    for (const child of node) propertyKeys(child, out);
    return out;
  }
  if (typeof node !== 'object' || node === null) return out;
  const record = node as Record<string, unknown>;
  const properties = record['properties'];
  if (typeof properties === 'object' && properties !== null && !Array.isArray(properties)) {
    for (const key of Object.keys(properties as Record<string, unknown>)) out.add(key);
  }
  for (const value of Object.values(record)) propertyKeys(value, out);
  return out;
}

const keys = propertyKeys(schema);

function oneOfKinds(definition: Record<string, unknown>): readonly string[] {
  const branches = definition['oneOf'] as { properties: { kind: { const: string } } }[];
  return branches.map((branch) => branch.properties.kind.const).sort();
}

function enumOf(definition: Record<string, unknown>): readonly string[] {
  return (definition['enum'] as string[]) ?? [];
}

describe('B1 · the eleven v0.4 changes are carried (C-1 … C-11)', () => {
  test('C-1 — layoutRepresentations[] replaces the scalar strategy and top-level allocations', () => {
    assert.ok('layoutRepresentations' in schema.properties);
    assert.ok('undocumentedSchemaVariantIds' in schema.properties, 'silence must be explicit');
    assert.equal(keys.has('layoutStrategy'), false, 'the scalar survived as a live field');
    assert.equal(keys.has('matrixAllocations'), false);
  });

  test('C-2 — dimensions are a tagged union with an explicit ordering rule', () => {
    assert.deepEqual(oneOfKinds(schema.$defs['dimension'] as Record<string, unknown>), [
      'component_set_identity',
      'fixed_filter',
      'variant_property',
    ]);
    assert.ok('orderingRule' in schema.$defs, 'no magic strings means the rule is a $def');
  });

  test('C-3 — scope is typed and plural, and generalization left the evidence record', () => {
    const findings = schema.properties['structuralFindings'] as {
      items: { properties: Record<string, unknown> };
    };
    assert.ok('appliesToScopes' in findings.items.properties, 'plural: a finding may span several');
    assert.ok('corroboration' in findings.items.properties);
    const evidence = schema.$defs['evidenceRecord'] as { properties: Record<string, unknown> };
    assert.equal(
      'generalizationScope' in evidence.properties,
      false,
      'C-3 removes it rather than translating it — generalization belongs on the finding',
    );
  });

  test('C-4 — allocation evidence is recomputable, and `verified` costs something', () => {
    assert.deepEqual(enumOf(schema.$defs['allocationEvidenceStatus'] as Record<string, unknown>), [
      'verified',
      'legacy_unverified',
      'not_applicable',
    ]);
    const allocation = schema.$defs['allocation'] as {
      properties: { allocationEvidence: { allOf: { if: unknown; then: { required?: string[] } }[] } };
    };
    const verifiedBranch = allocation.properties.allocationEvidence.allOf[0];
    assert.deepEqual(verifiedBranch?.then.required, [
      'artifactPath',
      'artifactSha256',
      'derivationMethod',
    ]);
  });

  test('C-5 — coverage metrics are discriminated, and the untyped count is gone', () => {
    assert.deepEqual(oneOfKinds(schema.$defs['coverageMetric'] as Record<string, unknown>), [
      'classified',
      'legacy_unclassified',
    ]);
    assert.equal(
      keys.has('documentedPairingCount'),
      false,
      'the schema explains that it replaced this; explaining is not carrying',
    );
  });

  test('C-6 — enumeration provenance records how children were enumerated', () => {
    const method = schema.$defs['enumerationMethodRecord'] as {
      required: string[];
      properties: Record<string, unknown>;
    };
    assert.ok(method.required.includes('class'));
    assert.ok(
      enumOf(schema.$defs['enumerationMethodClass'] as Record<string, unknown>).includes(
        'node_name_parse',
      ),
      'the class that cannot back a completeness claim on its own must be nameable',
    );
  });

  test('C-7 — theme binding is collection→mode, with status separate from provenance', () => {
    const theme = schema.properties['themeModel'] as { properties: Record<string, unknown> };
    for (const key of ['collections', 'containers', 'variablesUsedByDescendants']) {
      assert.ok(key in theme.properties, `${key} is part of the C-7 model`);
    }
    const binding = schema.$defs['modeBinding'] as { properties: Record<string, unknown> };
    assert.ok('provenanceStatus' in binding.properties);
    assert.ok('provenance' in binding.properties);
    assert.equal(
      keys.has('boundVariableId'),
      false,
      'the singular container model is deleted, not deprecated',
    );
  });

  test('C-8 — treatment identity is typed, with no sentinel strings', () => {
    const treatment = schema.$defs['treatment'] as { properties: { kind: Record<string, unknown> } };
    assert.deepEqual(enumOf(treatment.properties.kind), [
      'set_identity',
      'in_set_variant_axis',
      'none',
    ]);
    assert.equal(keys.has('treatmentLabel'), false);
  });

  test('C-9 — every property carries a role, and override evidence is tri-state', () => {
    const definition = schema.$defs['propertyDefinition'] as { required: string[] };
    assert.ok(definition.required.includes('role'), 'a required role is the whole of C-9');
    assert.ok('nonVariantPropertyCoverageEntry' in schema.$defs);
    assert.equal(
      enumOf(schema.$defs['overrideEvidenceStatus'] as Record<string, unknown>).length,
      3,
      'tri-state: a bare boolean cannot say "we did not look"',
    );
  });

  test('C-10 — display-label mappings can be scoped', () => {
    const map = schema.properties['canonicalValueDisplayLabelMap'] as {
      items: { properties: Record<string, unknown> };
    };
    assert.ok('appliesToScopes' in map.items.properties);
  });

  test('C-11 — buildFrameId is a reference, not an identifier', () => {
    const sets = schema.properties['componentSets'] as {
      items: { required: string[]; properties: Record<string, { $ref?: string }> };
    };
    // My first version of this asserted `buildFrameId` is optional, and it was
    // the assertion that was wrong rather than the schema. It is **required and
    // nullable**, which is the stronger arrangement: every set must state
    // whether it has a build frame, and `null` is a real answer rather than an
    // absence someone has to interpret. Optional would have made "no build
    // frame" and "nobody looked" the same value — the condition C-1's
    // `undocumentedSchemaVariantIds` exists to prevent one field over.
    assert.ok(sets.items.required.includes('buildFrameId'), 'the field is stated, always');
    assert.equal(
      sets.items.properties['buildFrameId']?.$ref,
      '#/$defs/nullableString',
      'and null is a legitimate answer, which is what makes it a reference rather than an identity',
    );
    // Uniqueness on `id` only, with no collision between the two namespaces, is
    // REP-16 — declared, owned by the semantic validator, and covered in both
    // directions by `reference/rep-16-*`.
    const identity = schema.properties['componentSets'] as { items: { properties: object } };
    assert.ok('id' in (identity.items.properties as Record<string, unknown>));
  });

  test('all eleven are checked, and none by reading the schema\'s own prose', () => {
    // Guards this file. Eleven changes, eleven structural tests — and none of
    // them greps a `description` for "C-5", because a document asserting that a
    // change was made is not the change.
    const source = readFileSync(
      join(ROOT, 'tests', 'representation', 'v04-changes-carried.test.ts'),
      'utf8',
    );
    for (let n = 1; n <= 11; n += 1) {
      assert.ok(source.includes(`C-${n} —`), `C-${n} has no test`);
    }
    assert.doesNotMatch(
      source,
      /description.*includes\(['"`]C-\d/,
      'a change verified by its own description is verified by nothing',
    );
  });
});
