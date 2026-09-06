/**
 * B2 — the `REP-*` registry, checked in both directions (BP-6).
 *
 * The one-way version of this check is what the research package had, and D-5 is
 * what it missed: three ids (`CV-4`, `CV-9`, `CV-19`) asserted by fixtures
 * against rules the contract never declared, and `CV-3` declared with no
 * negative fixture at all. Neither direction can see the other's failure, so
 * both are asserted here — and a positive fixture is required as well as a
 * negative, because a rule only ever evidenced by rejection has never been shown
 * to be satisfiable.
 *
 * The registry-to-ledger check is the same idea applied to the promotion itself.
 * Twenty-nine research rules do not all land at once; the ones that have not
 * landed are named with the work package that will land them, so a rule dropped
 * during promotion fails a test instead of disappearing quietly.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENFORCEMENT_OWNERS } from '../../src/contracts/failures.ts';
import {
  REPRESENTATION_INVARIANTS,
  REPRESENTATION_INVARIANTS_BY_ID,
  PROMOTION_LEDGER,
  NEW_IN_PROMOTION,
  NAMESPACES,
  checkSemantics,
} from '../../src/representation/index.ts';

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * Every name passed to a live `test(...)` in a file.
 *
 * `test.skip` and `test.todo` are deliberately not matched: a row claiming
 * coverage from a skipped test is claiming coverage from nothing, and this is
 * the one place that distinction can still be made.
 */
function testNamesIn(file: string): ReadonlySet<string> {
  const source = readFileSync(file, 'utf8');
  const names = new Set<string>();
  for (const match of source.matchAll(/(?<![.\w])test\(\s*(['"`])((?:\\.|(?!\1).)*)\1/g)) {
    names.add((match[2] as string).replace(/\\'/g, "'").replace(/\\`/g, '`'));
  }
  return names;
}

function representationSources(dir = join(HERE, '..', '..', 'src', 'representation')): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...representationSources(full));
    else if (entry.endsWith('.ts')) out.push(full);
  }
  return out.sort();
}

type FixtureRow = {
  readonly file: string;
  readonly validator: 'schema' | 'reference' | 'semantic' | 'evidence';
  readonly expect: 'valid' | 'invalid';
  readonly rule_id: string | null;
  readonly intended_error_code?: string | null | undefined;
  /** For an `evidence` row: the name of the test that is the evidence. */
  readonly covered_by?: string | undefined;
};

const fixtures = (
  JSON.parse(readFileSync(join(HERE, 'fixtures', 'index.json'), 'utf8')) as {
    readonly fixtures: readonly FixtureRow[];
  }
).fixtures;

describe('B2 · registry shape', () => {
  test('every invariant names exactly one enforcement owner', () => {
    for (const invariant of REPRESENTATION_INVARIANTS) {
      assert.ok(
        (ENFORCEMENT_OWNERS as readonly string[]).includes(invariant.owner),
        `${invariant.id} names an owner outside ENFORCEMENT_OWNERS`,
      );
    }
  });

  test('no fourth enforcement owner was invented for this phase (BP-6)', () => {
    const used = new Set(REPRESENTATION_INVARIANTS.map((i) => i.owner));
    for (const owner of used) {
      assert.ok(
        ['schema', 'semantic-validator', 'reference-validator'].includes(owner),
        `${owner} is outside the three owners BP-6 allows this phase`,
      );
    }
  });

  test('the registry has not been emptied', () => {
    // Nine assertions in this file iterate the registry, and every one of them
    // is vacuously true over an empty array. The sibling registry pins a floor
    // (`tests/contracts/output-union.test.ts`) and the promotion ledger pins an
    // exact count; this had neither.
    assert.ok(
      REPRESENTATION_INVARIANTS.length >= 22,
      `only ${REPRESENTATION_INVARIANTS.length} invariants — a shrinking registry is a silent one`,
    );
  });

  test('ids are unique, well-formed and in order', () => {
    const ids = REPRESENTATION_INVARIANTS.map((i) => i.id);
    assert.equal(new Set(ids).size, ids.length, 'duplicate REP id');
    for (const id of ids) assert.match(id, /^REP-\d{2}$/);
    assert.deepEqual([...ids], [...ids].sort());
  });

  test('every rule declares at least one code, and every code is well-formed', () => {
    for (const invariant of REPRESENTATION_INVARIANTS) {
      assert.ok(invariant.error_codes.length > 0, `${invariant.id} declares no code`);
      for (const code of invariant.error_codes) {
        assert.match(code, /^(?:REP|SCHEMA)_[A-Z0-9_]+$/, `${invariant.id} declares "${code}"`);
      }
    }
  });

  test('a REP_* code belongs to exactly one rule', () => {
    // A `SCHEMA_*` code is ajv's, shared by every schema-owned rule by nature —
    // it says what shape of failure occurred, not which rule. A `REP_*` code is
    // ours and identifies the rule, so sharing one would make a violation
    // ungroupable and unrepairable.
    const seen = new Map<string, string>();
    for (const invariant of REPRESENTATION_INVARIANTS) {
      for (const code of invariant.error_codes) {
        if (!code.startsWith('REP_')) continue;
        const owner = seen.get(code);
        assert.equal(owner, undefined, `${code} is claimed by both ${String(owner)} and ${invariant.id}`);
        seen.set(code, invariant.id);
      }
    }
  });

  /**
   * The agreement the registry did not have, found in audit cycle 2.
   *
   * Ten rows declared a `REP_*` code that occurred exactly once in the whole
   * repository — in its own declaration — while the fixtures recorded the
   * `SCHEMA_*` codes ajv actually emits. Eight codes went the other way: emitted
   * by real code paths and named in no row, one of them
   * (`REP_UNDOCUMENTED_VARIANT_NOT_DECLARED`) with no test at all.
   *
   * Three directions, because any two of them can agree while the third rots.
   */
  test('every code a fixture expects is declared by its rule', () => {
    for (const row of fixtures) {
      if (row.rule_id === null || row.intended_error_code === null) continue;
      if (row.intended_error_code === undefined) continue;
      const invariant = REPRESENTATION_INVARIANTS_BY_ID.get(row.rule_id);
      assert.ok(invariant !== undefined, `${row.file} names undeclared ${row.rule_id}`);
      assert.ok(
        invariant.error_codes.includes(row.intended_error_code),
        `${row.file} expects ${row.intended_error_code}, which ${row.rule_id} does not declare`,
      );
    }
  });

  test('every REP_* code the module emits is declared by some rule', () => {
    const declared = new Set(REPRESENTATION_INVARIANTS.flatMap((i) => i.error_codes));
    const undeclared = new Set<string>();
    for (const file of representationSources()) {
      if (file.endsWith('invariant-registry.ts')) continue; // the declaration itself
      for (const match of readFileSync(file, 'utf8').matchAll(/'(REP_[A-Z0-9_]+)'/g)) {
        if (!declared.has(match[1] as string)) undeclared.add(match[1] as string);
      }
    }
    assert.deepEqual([...undeclared].sort(), [], 'a violation nothing in the registry accounts for');
  });

  test('the validator that emits a code is the owner the registry declares', () => {
    /*
     * `owner` and `enforced_by` were two accounts of one fact with nothing
     * binding them: the registry could name `run-guard` — a legal
     * `ENFORCEMENT_OWNERS` member — while the emitter kept stamping
     * `semantic-validator`, and both existing tests passed.
     *
     * Reconciled at the source, per code, so it holds for every emission
     * rather than only for the ones a fixture happens to reach. Schema-owned
     * rules are exempt by nature: ajv violations carry no `enforced_by` at all,
     * which is itself worth stating rather than leaving as an omission.
     */
    const ownerByCode = new Map<string, string>();
    for (const invariant of REPRESENTATION_INVARIANTS) {
      for (const code of invariant.error_codes) {
        if (code.startsWith('REP_')) ownerByCode.set(code, invariant.owner);
      }
    }
    const stamped = new Map<string, Set<string>>();
    for (const file of representationSources()) {
      if (file.endsWith('invariant-registry.ts')) continue;
      const source = readFileSync(file, 'utf8');
      const owners = new Set(
        [...source.matchAll(/enforced_by:\s*'([a-z-]+)'/g)].map((match) => match[1] as string),
      );
      for (const match of source.matchAll(/'(REP_[A-Z0-9_]+)'/g)) {
        const existing = stamped.get(match[1] as string) ?? new Set<string>();
        for (const owner of owners) existing.add(owner);
        stamped.set(match[1] as string, existing);
      }
    }
    for (const [code, owners] of stamped) {
      const declared = ownerByCode.get(code);
      if (declared === undefined) continue;
      assert.ok(
        owners.has(declared),
        `${code} is declared owned by ${declared} but is stamped ${[...owners].join(', ')}`,
      );
    }
  });

  test('a schema-owned rule declares only SCHEMA_* codes', () => {
    // The other half of the same fact. A schema-owned rule cannot emit a REP_*
    // code, because ajv is what raises it and ajv knows nothing about REP ids.
    for (const invariant of REPRESENTATION_INVARIANTS) {
      if (invariant.owner !== 'schema') continue;
      for (const code of invariant.error_codes) {
        assert.ok(
          code.startsWith('SCHEMA_'),
          `${invariant.id} is schema-owned and declares ${code}, which no schema violation carries`,
        );
      }
    }
  });

  test('every REP_* code the registry declares is emitted somewhere', () => {
    const emitted = new Set<string>();
    for (const file of representationSources()) {
      if (file.endsWith('invariant-registry.ts')) continue;
      for (const match of readFileSync(file, 'utf8').matchAll(/'(REP_[A-Z0-9_]+)'/g)) {
        emitted.add(match[1] as string);
      }
    }
    const dead = REPRESENTATION_INVARIANTS.flatMap((i) => i.error_codes)
      .filter((code) => code.startsWith('REP_'))
      .filter((code) => !emitted.has(code));
    assert.deepEqual(dead.sort(), [], 'a declared code no code path can produce');
  });

  test('every statement is a statement, not a label', () => {
    for (const invariant of REPRESENTATION_INVARIANTS) {
      assert.ok(
        invariant.statement.length > 40,
        `${invariant.id}'s statement is too short to say what must hold`,
      );
    }
  });
});

describe('the semantic validator and the schema agree about identifiers', () => {
  const schema = JSON.parse(
    readFileSync(
      join(HERE, '..', '..', 'schemas', 'representation', 'representation-contract.schema.json'),
      'utf8',
    ),
  ) as { properties: Record<string, Record<string, unknown>>; $defs: Record<string, unknown> };

  test('every namespace names a collection the schema declares, and a key its members carry', () => {
    /*
     * `NAMESPACES` transcribes the schema's property and key names, and audit
     * cycle 2 found the drift would be **silent**: `field(row, key)` returns
     * null for every row, the filter empties, `duplicates([])` is `[]`, and a
     * contract with duplicate identifiers reports clean. The reference resolver
     * transcribes the same names and fails loud when they drift, which is what
     * made the asymmetry worth finding.
     *
     * This is the reconciliation, and it is why there is no fixture for the
     * silent case: the schema closes every object, so a document cannot rename
     * a key. Only the checker can drift, so the checker is what gets checked.
     */
    for (const namespace of NAMESPACES) {
      const collection = schema.properties[namespace.collection];
      assert.ok(collection !== undefined, `${namespace.collection} is not a schema property`);
      const items = (collection['items'] ?? {}) as Record<string, unknown>;
      const inline = (items['properties'] ?? {}) as Record<string, unknown>;
      const referenced = typeof items['$ref'] === 'string' ? items['$ref'].split('/').pop() : undefined;
      const viaRef =
        referenced === undefined
          ? {}
          : (((schema.$defs[referenced] as Record<string, unknown>)?.['properties'] ??
              {}) as Record<string, unknown>);
      assert.ok(
        namespace.key in inline || namespace.key in viaRef,
        `${namespace.collection} members carry no ${namespace.key}`,
      );
    }
  });

  test('a namespace whose key cannot be read reports that, rather than passing', () => {
    // Defence in depth for the case the agreement test makes unreachable. If
    // the two ever do drift, the checker says it did not run instead of saying
    // it passed.
    const result = checkSemantics({
      namingRules: [{ ruleId: 'NR-renamed', appliesToRole: 'container' }],
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.ok(result.violations.some((v) => v.code === 'REP_NAMESPACE_KEY_UNREADABLE'));
  });
});

describe('B2 · fixture coverage is bidirectional (BP-6, D-5)', () => {
  test('every declared invariant has at least one negative fixture', () => {
    const uncovered = REPRESENTATION_INVARIANTS.filter(
      (i) => !fixtures.some((f) => f.rule_id === i.id && f.expect === 'invalid'),
    ).map((i) => i.id);
    assert.deepEqual(
      uncovered,
      [],
      'D-5 direction one: CV-3 was declared in the research contract with zero negative fixture',
    );
  });

  test('every declared invariant has at least one positive fixture', () => {
    const uncovered = REPRESENTATION_INVARIANTS.filter(
      (i) => !fixtures.some((f) => f.rule_id === i.id && f.expect === 'valid'),
    ).map((i) => i.id);
    assert.deepEqual(
      uncovered,
      [],
      'a rule only ever evidenced by rejection has not been shown to be satisfiable',
    );
  });

  test('every fixture-asserted rule id is declared', () => {
    const orphans = [
      ...new Set(
        fixtures
          .map((f) => f.rule_id)
          .filter((id): id is string => id !== null)
          .filter((id) => !REPRESENTATION_INVARIANTS_BY_ID.has(id)),
      ),
    ];
    assert.deepEqual(
      orphans,
      [],
      'D-5 direction two: CV-4, CV-9 and CV-19 were fixture-asserted and never declared',
    );
  });

  test('every evidence row names a test that exists', () => {
    // A row claiming coverage from a named test is worth exactly as much as the
    // test being there. Without this, deleting or renaming a test would leave a
    // registry that still reports itself covered — which is D-5 again, with the
    // fixture manifest replaced by an index.
    for (const row of fixtures) {
      if (row.validator !== 'evidence') continue;
      assert.ok(row.covered_by !== undefined, `${row.rule_id} declares evidence but names no test`);
      // Audit cycle 2: this was `source.includes(...)`, which passes when the
      // name appears in a comment, inside a `test.skip`, or in any unrelated
      // string. Eight rows depend on it, so a substring match is eight rules
      // reporting themselves covered by text. The names are extracted from
      // actual `test(...)` calls instead.
      assert.ok(
        testNamesIn(join(HERE, '..', '..', row.file)).has(row.covered_by),
        `${row.file} declares no test named "${String(row.covered_by)}"`,
      );
    }
  });

  test('the two directions are genuinely different checks', () => {
    // Guards the check itself. If the fixture set happened to name exactly the
    // declared ids and nothing else, both assertions above would pass for a
    // registry that had drifted — so prove the inputs are not the same list by
    // construction: a fixture may carry no rule id at all.
    assert.ok(
      fixtures.some((f) => f.rule_id === null),
      'no untagged fixture exists, so the second direction is vacuous',
    );
  });
});

describe('B2 · the promotion ledger accounts for every research rule', () => {
  test('each research id appears exactly once', () => {
    const ids = PROMOTION_LEDGER.map((r) => r.research_id);
    assert.equal(new Set(ids).size, ids.length, 'duplicate research id in the ledger');
  });

  test('the ledger dispositions are counted here, not asserted in prose', () => {
    // MB-9 said "nineteen of the twenty-nine" and the ledger has never held
    // nineteen of anything. A number in a ruling that no test anchors drifts,
    // which is the D-9 class — inside a ruling about D-5. The ruling names no
    // number now; this does.
    const counts = new Map<string, number>();
    for (const row of PROMOTION_LEDGER) {
      counts.set(row.disposition, (counts.get(row.disposition) ?? 0) + 1);
    }
    assert.equal(counts.get('pending'), 21);
    assert.equal(counts.get('promoted'), 7);
    assert.equal(counts.get('partially_promoted'), 1);
    assert.equal(counts.get('retired'), undefined);
    assert.equal(
      [...counts.values()].reduce((total, value) => total + value, 0),
      PROMOTION_LEDGER.length,
    );
  });

  test('the ledger covers both research rule families', () => {
    const ids = new Set(PROMOTION_LEDGER.map((r) => r.research_id));
    for (let n = 1; n <= 9; n += 1) assert.ok(ids.has(`VR-${n}`), `VR-${n} is unaccounted for`);
    for (let n = 1; n <= 19; n += 1) assert.ok(ids.has(`CV-${n}`), `CV-${n} is unaccounted for`);
    assert.ok(ids.has('CV-3b'), 'CV-3b is unaccounted for');
    assert.equal(PROMOTION_LEDGER.length, 29);
  });

  test('a disposition and its fields agree', () => {
    for (const row of PROMOTION_LEDGER) {
      assert.ok(row.note.length > 20, `${row.research_id} carries no real reason`);
      switch (row.disposition) {
        case 'promoted':
          assert.ok(row.promoted_to.length > 0, `${row.research_id} promoted to nothing`);
          assert.equal(row.pending_in, undefined, `${row.research_id} is promoted and pending`);
          break;
        case 'partially_promoted':
          assert.ok(row.promoted_to.length > 0, `${row.research_id} promoted to nothing`);
          assert.ok(row.pending_in !== undefined, `${row.research_id} says nothing about the rest`);
          break;
        case 'pending':
          assert.deepEqual(row.promoted_to, [], `${row.research_id} is pending and promoted`);
          assert.ok(row.pending_in !== undefined, `${row.research_id} is pending nowhere`);
          break;
        case 'retired':
          assert.deepEqual(row.promoted_to, [], `${row.research_id} is retired and promoted`);
          break;
      }
    }
  });

  test('every promoted_to names a declared invariant', () => {
    for (const row of PROMOTION_LEDGER) {
      for (const id of row.promoted_to) {
        assert.ok(
          REPRESENTATION_INVARIANTS_BY_ID.has(id),
          `${row.research_id} claims to have become ${id}, which is not declared`,
        );
      }
    }
  });

  test('every declared invariant is either promoted from the ledger or declared new', () => {
    const claimed = new Set(PROMOTION_LEDGER.flatMap((r) => r.promoted_to));
    for (const invariant of REPRESENTATION_INVARIANTS) {
      const accounted = claimed.has(invariant.id) || NEW_IN_PROMOTION.includes(invariant.id);
      assert.ok(
        accounted,
        `${invariant.id} appears from nowhere — neither promoted nor declared new`,
      );
    }
  });

  test('promoted_from agrees with the ledger in both directions', () => {
    for (const invariant of REPRESENTATION_INVARIANTS) {
      if (invariant.promoted_from === null) {
        assert.ok(
          NEW_IN_PROMOTION.includes(invariant.id),
          `${invariant.id} claims no ancestor but is not listed as new`,
        );
        continue;
      }
      const row = PROMOTION_LEDGER.find((r) => r.research_id === invariant.promoted_from);
      assert.ok(row !== undefined, `${invariant.id} names ${invariant.promoted_from}, absent from the ledger`);
      assert.ok(
        row.promoted_to.includes(invariant.id),
        `${invariant.id} claims descent from ${invariant.promoted_from}, which does not claim it back`,
      );
    }
  });

  test('a rule listed as new has no ancestor', () => {
    for (const id of NEW_IN_PROMOTION) {
      const invariant = REPRESENTATION_INVARIANTS_BY_ID.get(id);
      assert.ok(invariant !== undefined, `${id} is listed as new but is not declared`);
      assert.equal(invariant.promoted_from, null, `${id} is listed as new but names an ancestor`);
    }
  });

  test('the ledger names no path into the research directory (BP-1, BP-2)', () => {
    const source = readFileSync(
      join(HERE, '..', '..', 'src', 'representation', 'validation', 'promotion-ledger.ts'),
      'utf8',
    );
    // The module's own header names the directory once, in prose, to say it is
    // never opened. Anything more than that would be a path.
    assert.equal(source.includes('plugin_explore_phase/'), true);
    assert.doesNotMatch(source, /readFileSync|readdirSync|import\s+.*plugin_explore_phase/);
  });
});
