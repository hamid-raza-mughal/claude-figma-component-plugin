/**
 * B3 — structured target resolution and the semantic checks beside it.
 *
 * The load-bearing assertion in this file is not that the resolvers reject bad
 * references. It is that **every negative fixture here is schema-valid.**
 *
 * D-1, D-2, D-3 and D-7 all passed the research schema. They were not malformed
 * documents; they were well-formed documents making false references. A test
 * suite that only proved "the resolver rejects a thing the schema also rejects"
 * would be measuring the schema again under a new name. So each negative is
 * asserted twice: valid against the schema, invalid against the resolver. The
 * gap between those two results is the entire value of this work package, and
 * if it ever closes — if a fixture starts failing schema validation — the
 * evidence is gone and the test says so.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SchemaRegistry } from '../../src/validation/schema-validator.ts';
import { REPRESENTATION_CONTRACT_SCHEMA_ID } from '../../src/representation/index.ts';
import {
  resolveReferences,
  checkSemantics,
  REPRESENTATION_INVARIANTS_BY_ID,
  type ArtifactReader,
} from '../../src/representation/index.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');

function loadJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

const schemaDocument = loadJson<object>(
  join(ROOT, 'schemas', 'representation', 'representation-contract.schema.json'),
);

function registry(): SchemaRegistry {
  const reg = new SchemaRegistry();
  reg.register(schemaDocument);
  reg.compile(schemaDocument);
  return reg;
}

type FixtureRow = {
  readonly file: string;
  readonly validator: 'schema' | 'reference' | 'semantic' | 'evidence';
  readonly expect: 'valid' | 'invalid';
  readonly rule_id: string | null;
  readonly intended_error_code: string | null;
  readonly artifact_reader?: Record<string, string> | null;
  readonly purpose: string;
};

const rows = (
  loadJson<{ readonly fixtures: readonly FixtureRow[] }>(join(HERE, 'fixtures', 'index.json'))
).fixtures.filter((row) => row.validator === 'reference' || row.validator === 'semantic');

/** A reader over a declared map. `null` in the index means no reader at all,
 *  which REP-13 treats as a violation rather than a skip. */
function readerFor(row: FixtureRow): ArtifactReader | undefined {
  const declared = row.artifact_reader;
  if (declared === null || declared === undefined) return undefined;
  return {
    read: (path) => (path in declared ? { sha256: declared[path] as string } : null),
  };
}

function runValidator(row: FixtureRow, contract: unknown) {
  return row.validator === 'reference'
    ? resolveReferences({ contract, artifacts: readerFor(row) })
    : checkSemantics(contract);
}

describe('B3 · every reference fixture is a document the schema accepts', () => {
  for (const row of rows) {
    test(`${row.file} passes schema validation`, () => {
      const result = registry().validate(
        REPRESENTATION_CONTRACT_SCHEMA_ID,
        loadJson(join(HERE, 'fixtures', row.file)),
      );
      assert.equal(
        result.ok,
        true,
        result.ok
          ? ''
          : 'this fixture is evidence only while the schema accepts it — otherwise it proves ' +
            'the schema works, not the resolver: ' +
            JSON.stringify(result.violations, null, 2),
      );
    });
  }
});

describe('B3 · the resolvers reach what the schema cannot', () => {
  for (const row of rows) {
    test(`${row.file} — ${row.purpose.slice(0, 70)}`, () => {
      const contract = loadJson(join(HERE, 'fixtures', row.file));
      const result = runValidator(row, contract);

      if (row.expect === 'valid') {
        assert.equal(
          result.ok,
          true,
          result.ok ? '' : JSON.stringify(result.violations, null, 2),
        );
        return;
      }

      assert.equal(result.ok, false, `${row.file} was expected to be rejected`);
      if (result.ok) return;

      const codes = result.violations.map((v) => v.code);
      assert.ok(
        codes.includes(row.intended_error_code as string),
        `${row.file} failed, but for ${codes.join(', ')} rather than ${String(
          row.intended_error_code,
        )}`,
      );
      const attributed = result.violations.filter((v) => v.code === row.intended_error_code);
      for (const violation of attributed) {
        assert.equal(
          violation.rule_id,
          row.rule_id,
          `${row.file} reported ${violation.code} against ${violation.rule_id}, not ${String(
            row.rule_id,
          )}`,
        );
        assert.match(violation.instance_path, /^\//, 'a violation must name where it happened');
        // BP-6 says one invariant, one owner. A violation reported by a
        // validator that is not the declared owner means the registry and the
        // code disagree about who enforces the rule, which is precisely the
        // condition INV-15 exists to prevent.
        const declared = REPRESENTATION_INVARIANTS_BY_ID.get(violation.rule_id);
        assert.ok(declared !== undefined, `${violation.rule_id} is not declared`);
        assert.equal(
          violation.enforced_by,
          declared.owner,
          `${violation.rule_id} is declared owned by ${declared.owner} but was reported by ` +
            violation.enforced_by,
        );
      }
    });
  }
});

describe('B3 · resolver behaviour that no fixture shape reaches', () => {
  test('a malformed contract produces violations rather than an exception', () => {
    for (const input of [null, undefined, 42, 'a contract', []]) {
      assert.doesNotThrow(() => resolveReferences({ contract: input }));
      assert.doesNotThrow(() => checkSemantics(input));
    }
  });

  test('a resolver reports every violation, not just the first', () => {
    const contract = loadJson<Record<string, unknown>>(
      join(HERE, 'fixtures', 'reference', 'rep-11-negative-dangling-component-set.json'),
    );
    const approval = contract['approvalStatus'] as Record<string, unknown>;
    const blockers = approval['blockers'] as Record<string, unknown>[];
    blockers[0]!['target'] = { targetKind: 'naming_rule', targetRef: 'NR-404' };
    const result = resolveReferences({ contract });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.violations.length, 2, 'a resolver that stops at the first hides the rest');
  });

  test('evidenceNodeIds is provenance and never resolves a node target', () => {
    // The schema says so in prose. Prose is what B3 exists to stop trusting, so
    // the rule gets a test: a node id present only as layout evidence must not
    // satisfy a node target, because the operational locator table is the only
    // thing a Builder can actually address.
    const contract = loadJson<Record<string, unknown>>(
      join(HERE, 'fixtures', 'positive', 'minimal-contract.json'),
    );
    contract['representationNodeBindings'] = [];
    const findings = contract['structuralFindings'] as Record<string, unknown>[];
    findings[0]!['target'] = { targetKind: 'node', targetRef: 'SAMPLE:1' };
    findings[0]!['appliesToScopes'] = [];
    const result = resolveReferences({ contract });
    assert.equal(result.ok, false, 'SAMPLE:1 is an evidenceNodeId and must not resolve');
    if (result.ok) return;
    assert.equal(result.violations[0]?.rule_id, 'REP-11');
  });

  test('D-3 is caught by kind, not by existence — drop requiredStrategy and it resolves', () => {
    // The claim this file rests on, made checkable. If the D-3 fixture failed
    // because LR-1 was missing, the kind check would be unevidenced and the
    // whole of REP-12 would be a restatement of REP-11.
    const contract = loadJson<Record<string, unknown>>(
      join(HERE, 'fixtures', 'reference', 'rep-12-negative-matrix-rule-targets-list.json'),
    );
    assert.equal(resolveReferences({ contract }).ok, false);

    const findings = contract['structuralFindings'] as Record<string, unknown>[];
    const target = findings[0]!['target'] as Record<string, unknown>;
    delete target['requiredStrategy'];
    assert.equal(
      resolveReferences({ contract }).ok,
      true,
      'LR-1 resolves perfectly well — existence checking alone would have shipped D-3',
    );
  });

  test('an unknown scopeType is named rather than ignored', () => {
    const contract = loadJson<Record<string, unknown>>(
      join(HERE, 'fixtures', 'positive', 'minimal-contract.json'),
    );
    const findings = contract['structuralFindings'] as Record<string, unknown>[];
    findings[0]!['appliesToScopes'] = [{ scopeType: 'component', scopeRef: 'CS-1' }];
    const result = resolveReferences({ contract });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.ok(result.violations.some((v) => v.code === 'REP_SCOPE_TYPE_UNKNOWN'));
  });

  test('a contract target resolves by "self" and by the contract id, and by nothing else', () => {
    const contract = loadJson<Record<string, unknown>>(
      join(HERE, 'fixtures', 'positive', 'minimal-contract.json'),
    );
    const limitations = contract['knownLimitations'] as Record<string, unknown>[];
    for (const [ref, expected] of [
      ['self', true],
      ['CRC-SAMPLE-1', true],
      ['CRC-OTHER', false],
    ] as const) {
      limitations[0]!['target'] = { targetKind: 'contract', targetRef: ref };
      assert.equal(resolveReferences({ contract }).ok, expected, `contract target ${ref}`);
    }
  });
});
