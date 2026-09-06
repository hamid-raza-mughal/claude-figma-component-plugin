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
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENFORCEMENT_OWNERS } from '../../src/contracts/failures.ts';
import {
  REPRESENTATION_INVARIANTS,
  REPRESENTATION_INVARIANTS_BY_ID,
} from '../../src/representation/validation/invariant-registry.ts';
import {
  PROMOTION_LEDGER,
  NEW_IN_PROMOTION,
} from '../../src/representation/validation/promotion-ledger.ts';

const HERE = dirname(fileURLToPath(import.meta.url));

type FixtureRow = {
  readonly file: string;
  readonly validator: 'schema' | 'reference' | 'semantic' | 'evidence';
  readonly expect: 'valid' | 'invalid';
  readonly rule_id: string | null;
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

  test('ids are unique, well-formed and in order', () => {
    const ids = REPRESENTATION_INVARIANTS.map((i) => i.id);
    assert.equal(new Set(ids).size, ids.length, 'duplicate REP id');
    for (const id of ids) assert.match(id, /^REP-\d{2}$/);
    assert.deepEqual([...ids], [...ids].sort());
  });

  test('error codes are unique — a shared code cannot be grouped or repaired', () => {
    const codes = REPRESENTATION_INVARIANTS.map((i) => i.error_code);
    assert.equal(new Set(codes).size, codes.length);
    for (const code of codes) assert.match(code, /^REP_[A-Z0-9_]+$/);
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
      const source = readFileSync(join(HERE, '..', '..', row.file), 'utf8');
      assert.ok(
        source.includes(`'${row.covered_by}'`) || source.includes(`\`${row.covered_by}\``),
        `${row.file} contains no test named "${String(row.covered_by)}"`,
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
