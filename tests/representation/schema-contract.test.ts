/**
 * B1 — the promoted representation contract schema (0.4.1-draft).
 *
 * Two things are being proved here, and only the second is obvious.
 *
 * The first is that the schema **compiles** under this repository's registry.
 * `SchemaRegistry.register` is `ajv.addSchema`, which defers compilation until
 * first use — so a schema with strict-mode defects registers happily and throws
 * later, at the call site of whoever validates first. The research schema had
 * thirty-six such defects: twenty subschemas carrying a type-implying keyword
 * with no `type`, and sixteen `required` names never declared where they were
 * required. Its own Python validator does not enforce either, so a fully green
 * research suite said nothing about them. `registry()` below compiles eagerly,
 * which is the only version of this check worth having.
 *
 * The second is that every negative fixture fails **at its intended gate**, not
 * merely fails. `expected_schema_path_contains` is the assertion that makes the
 * difference; without it, correcting the schema for strict mode could have
 * silently moved a gate and the suite would still be green.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SchemaRegistry } from '../../src/validation/schema-validator.ts';
import {
  REPRESENTATION_CONTRACT_SCHEMA_ID,
  REPRESENTATION_CONTRACT_VERSION,
  REPRESENTATION_CONTRACT_SCHEMA_PATH,
  TARGET_KINDS,
  LAYOUT_STRATEGIES,
  parseSchemaIdVersion,
} from '../../src/representation/index.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
/** Always named with a child segment, never as a bare root: `tests/unit/fixture-isolation.test.ts`
 *  requires it, and the requirement is the discipline that keeps a fixture read
 *  explicit rather than a directory listing. */
const FIXTURE_INDEX = join(HERE, 'fixtures', 'index.json');

function loadJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

const schemaDocument = loadJson<Record<string, unknown>>(
  join(ROOT, REPRESENTATION_CONTRACT_SCHEMA_PATH),
);

/** Compiles rather than merely registering — see the header. */
function registry(): SchemaRegistry {
  const reg = new SchemaRegistry();
  reg.register(schemaDocument);
  reg.compile(schemaDocument);
  return reg;
}

type FixtureRow = {
  readonly file: string;
  /** Which check the row is evidence for. B1 owns only the schema rows; the
   *  `reference` and `semantic` rows are deliberately schema-VALID, so running
   *  them here would assert the opposite of what they exist to show. */
  readonly validator: 'schema' | 'reference' | 'semantic' | 'evidence';
  readonly expect: 'valid' | 'invalid';
  readonly intended_error_code: string | null;
  readonly expected_schema_path_contains: readonly string[];
  readonly expected_instance_path_contains: readonly string[];
  readonly purpose: string;
};

const allRows = loadJson<{ readonly fixtures: readonly FixtureRow[] }>(FIXTURE_INDEX).fixtures;
const schemaRows = allRows.filter((row) => row.validator === 'schema');

/** A fixture is addressed by its tracked relative name, never discovered. */
function fixturePath(relativeName: string): string {
  return join(HERE, 'fixtures', relativeName);
}

describe('B1 · schema identity and version', () => {
  test('the schema document carries the pinned $id', () => {
    assert.equal(schemaDocument['$id'], REPRESENTATION_CONTRACT_SCHEMA_ID);
  });

  test('the $id is a client-neutral URN (BP-8)', () => {
    assert.match(REPRESENTATION_CONTRACT_SCHEMA_ID, /^urn:component-representation:/);
    assert.doesNotMatch(REPRESENTATION_CONTRACT_SCHEMA_ID, /https?:\/\//);
  });

  test('the $id version segment and the exported version agree (the D-12 discipline)', () => {
    assert.equal(
      parseSchemaIdVersion(REPRESENTATION_CONTRACT_SCHEMA_ID),
      REPRESENTATION_CONTRACT_VERSION,
    );
  });

  test('parseSchemaIdVersion returns null rather than guessing', () => {
    assert.equal(parseSchemaIdVersion('urn:something-else:0.4.1-draft'), null);
    assert.equal(parseSchemaIdVersion(REPRESENTATION_CONTRACT_SCHEMA_ID + ':extra'), null);
    assert.equal(parseSchemaIdVersion('urn:component-representation:schema:representation-contract:'), null);
  });

  test('the version is a draft (BP-3) — a non-draft version would encode a false approval claim', () => {
    assert.match(REPRESENTATION_CONTRACT_VERSION, /-draft$/);
    assert.notEqual(REPRESENTATION_CONTRACT_VERSION, '0.4.0-draft');
  });

  test('no client identity survives the promotion', () => {
    const bytes = readFileSync(join(ROOT, REPRESENTATION_CONTRACT_SCHEMA_PATH), 'utf8');
    assert.doesNotMatch(bytes, /adalfi/i);
  });
});

describe('B1 · the schema compiles under the production registry', () => {
  test('registering and compiling raises nothing', () => {
    assert.doesNotThrow(() => registry());
  });

  test('the compiled schema is reachable by its pinned id', () => {
    const result = registry().validate(
      REPRESENTATION_CONTRACT_SCHEMA_ID,
      loadJson(fixturePath('positive/minimal-contract.json')),
    );
    assert.equal(result.ok, true);
  });

  test('an unregistered id raises rather than reporting a pass', () => {
    // The registry throws on an unknown $id by design: a validation that never
    // ran must not be indistinguishable from one that passed.
    assert.throws(
      () =>
        registry().validate(
          'urn:component-representation:schema:representation-contract:9.9.9-draft',
          {},
        ),
      /No schema registered/,
    );
  });
});

describe('B1 · fixtures fail at their intended gate', () => {
  for (const fixture of schemaRows) {
    test(`${fixture.file} — ${fixture.purpose.slice(0, 70)}`, () => {
      const data = loadJson(fixturePath(fixture.file));
      const result = registry().validate(REPRESENTATION_CONTRACT_SCHEMA_ID, data);

      if (fixture.expect === 'valid') {
        assert.equal(
          result.ok,
          true,
          result.ok ? '' : JSON.stringify(result.violations, null, 2),
        );
        return;
      }

      assert.equal(result.ok, false, `${fixture.file} was expected to be rejected`);
      if (result.ok) return;

      // `schemaPath` is reported relative to the innermost `$ref`ed subschema,
      // so `#/allOf/1/then/required` names a gate inside `$defs/ruleTarget` and an
      // identical string names one at the document root. `instancePath` is what
      // separates them, and a fixture that named only the schema path would be
      // asserting against a string two different gates can produce.
      const matching = result.violations.filter(
        (v) =>
          fixture.expected_schema_path_contains.every((segment) =>
            v.schemaPath.includes(segment),
          ) &&
          fixture.expected_instance_path_contains.every((segment) =>
            v.instancePath.includes(segment),
          ),
      );
      assert.ok(
        matching.length > 0,
        `${fixture.file} failed, but not at its intended gate ` +
          `(${fixture.expected_schema_path_contains.join(' / ')} at ` +
          `${fixture.expected_instance_path_contains.join(' / ') || '<root>'}). Actual: ` +
          result.violations.map((v) => `${v.code} ${v.instancePath} ${v.schemaPath}`).join(', '),
      );
      assert.ok(
        matching.some((v) => v.code === fixture.intended_error_code),
        `${fixture.file} failed at its gate but with the wrong code. Expected ` +
          `${String(fixture.intended_error_code)}, got ` +
          matching.map((v) => v.code).join(', '),
      );
    });
  }

  test('every schema negative names a gate — an unanchored expectation is not evidence', () => {
    for (const fixture of schemaRows) {
      if (fixture.expect !== 'invalid') continue;
      assert.ok(
        fixture.expected_schema_path_contains.length > 0,
        `${fixture.file} declares no intended gate`,
      );
      assert.ok(fixture.intended_error_code !== null, `${fixture.file} declares no error code`);
    }
  });
});

describe('B1 · the target model is closed', () => {
  test('the exported target kinds and the schema enum are one list', () => {
    const defs = schemaDocument['$defs'] as Record<string, { enum?: readonly string[] }>;
    assert.deepEqual([...(defs['targetKind']?.enum ?? [])], [...TARGET_KINDS]);
  });

  test('the exported layout strategies and the schema enum are one list', () => {
    const defs = schemaDocument['$defs'] as Record<string, Record<string, unknown>>;
    const strategy = (
      (defs['layoutRepresentation']?.['properties'] as Record<string, { enum?: readonly string[] }>)
    )['strategy'];
    assert.deepEqual([...(strategy?.enum ?? [])], [...LAYOUT_STRATEGIES]);
  });

  test('the contract instance declares no rule catalogue of its own (MB-7)', () => {
    const properties = schemaDocument['properties'] as Record<string, unknown>;
    assert.equal('validationRules' in properties, false);
    assert.equal('contractIntegrityRules' in properties, false);
  });
});
