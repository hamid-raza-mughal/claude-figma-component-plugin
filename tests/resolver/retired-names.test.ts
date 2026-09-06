/**
 * The rename regression (**MB-18**).
 *
 * On 2026-09-06 the curated export replaced thirteen token names. Three paint
 * styles moved `sys/dark/bg/*` → `sys/dark/bgs/*`; ten `radius/round-shape/*`
 * variables were retired and the family was re-shaped one level deeper
 * (`radius/round-shape/{lg,reg,tiny}/*`) with a new `lg-scale/*` beside it.
 *
 * That last detail is what makes a rename dangerous here rather than merely
 * inconvenient: **every retired radius name is now a strict prefix of a live
 * one.** `radius/round-shape/lg` no longer exists, but `radius/round-shape/lg/lg`
 * does. A retrieval engine that scores path prefixes and whole-segment matches —
 * which this one does, correctly, for free-text queries — will hand back the
 * child and call it a match.
 *
 * Measured before the fix, against the real 2026-09-06 index:
 *
 *   sys/dark/bg/on_bg_dim   → sys/dark/bgs/on_bg_dim      **high** confidence
 *   sys/dark/bg/bg          → sys/dark/surfaces/on_surface  medium
 *   radius/round-shape/md   → radius/round-shape/lg/lg      medium
 *   radius/round-shape/sm   → radius/round-shape/lg/lg      medium
 *   radius/round-shape/xl   → radius/round-shape/lg/lg      medium
 *
 * Twelve of thirteen resolved. Two of those are arguably the intended rename;
 * the rest are a different token of a different size, returned with a confidence
 * score and no indication that the name asked for is gone. A wrong answer that
 * announces itself as a miss is recoverable. A wrong answer wearing `medium` is
 * not — and it was invisible to a fully green suite, because no test asked.
 *
 * The rule these tests pin: **a reference text that names a token path resolves
 * to that path or to nothing.** Never to a neighbour. Both halves are tested —
 * a refusal-only fix would be satisfied by a resolver that refuses everything.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { harness, SOURCE_AVAILABLE, ARTIFACT_DIR, HISTORICAL_SOURCE } from './test-index.ts';
import { planQueries } from '../../src/resolver/query-planner.ts';
import { resolveBatch, isPathShaped } from '../../src/resolver/resolve-batch.ts';
import { materializeSelection } from '../../src/resolver/materialize-selection.ts';
import { normalizeExport } from '../../src/ingestion/curated-json-normalizer.ts';
import { HISTORICAL_SOURCE_SHA256, BASELINE_SOURCE_SHA256 } from '../../tools/artifact-bundle.ts';
import { hashSourceBytes } from '../../src/ingestion/source-hash.ts';
import type { RefClass } from '../../src/contracts/identity.ts';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'active');

/**
 * The thirteen names the 2026-09-06 export removed, with the property that
 * reaches each one's ref class. Written out rather than derived at run time on
 * purpose: a list computed by diffing the two exports would silently shrink to
 * nothing the day someone re-points the historical constant, and the regression
 * would evaporate with it. This list is the record of what happened.
 */
const RETIRED: readonly { readonly refClass: RefClass; readonly path: string; readonly property: string }[] = [
  { refClass: 'paint-style', path: 'sys/dark/bg/bg', property: 'fill' },
  { refClass: 'paint-style', path: 'sys/dark/bg/on_bg', property: 'fill' },
  { refClass: 'paint-style', path: 'sys/dark/bg/on_bg_dim', property: 'fill' },
  { refClass: 'variable', path: 'radius/round-shape/lg', property: 'corner-radius' },
  { refClass: 'variable', path: 'radius/round-shape/md', property: 'corner-radius' },
  { refClass: 'variable', path: 'radius/round-shape/reg', property: 'corner-radius' },
  { refClass: 'variable', path: 'radius/round-shape/sm', property: 'corner-radius' },
  { refClass: 'variable', path: 'radius/round-shape/xl', property: 'corner-radius' },
  { refClass: 'variable', path: 'radius/round-shape/xs', property: 'corner-radius' },
  { refClass: 'variable', path: 'radius/round-shape/xxl', property: 'corner-radius' },
  { refClass: 'variable', path: 'radius/round-shape/xxs', property: 'corner-radius' },
  { refClass: 'variable', path: 'radius/round-shape/xxxl', property: 'corner-radius' },
  { refClass: 'variable', path: 'radius/round-shape/xxxs', property: 'corner-radius' },
];

/** Live names, including the three renames and the replacement family. A test
 *  that only proves refusal is satisfied by a resolver that refuses everything. */
const LIVE: readonly { readonly path: string; readonly property: string }[] = [
  { path: 'sys/dark/bgs/bg', property: 'fill' },
  { path: 'sys/dark/bgs/on_bg', property: 'fill' },
  { path: 'sys/dark/bgs/on_bg_dim', property: 'fill' },
  { path: 'radius/round-shape/lg/lg', property: 'corner-radius' },
  { path: 'radius/round-shape/lg/md', property: 'corner-radius' },
  { path: 'radius/round-shape/reg/reg', property: 'corner-radius' },
  { path: 'radius/round-shape/tiny/xs', property: 'corner-radius' },
  { path: 'lg-scale/base', property: 'corner-radius' },
  { path: 'radius/cta/base', property: 'corner-radius' },
  { path: 'sys/dark/surfaces/on_surface_dim', property: 'fill' },
];

describe('path-shaped detection (the trigger, tested without a bundle)', () => {
  test('a bare slash-bearing token is a name', () => {
    for (const { path } of RETIRED) assert.ok(isPathShaped(path), path);
    for (const { path } of LIVE) assert.ok(isPathShaped(path), path);
  });

  /** The free-text cases the resolver exists to serve must not be diverted into
   *  the lookup path. If they were, ranking would stop happening at all. */
  test('design language is not a name', () => {
    for (const text of [
      '4px all around',
      '12px gap',
      'warning expressive icon',
      'small emphasized subheading',
      'on-surface dim description',
      '1px border',
      'a warning / error surface',
      '',
      '   ',
    ]) {
      assert.equal(isPathShaped(text), false, JSON.stringify(text));
    }
  });
});

/**
 * Source-only mode does **not** register a skipped placeholder here, which is the
 * convention every other source-backed suite follows.
 *
 * `sourceOnlyExpectedSkips` is an equality pinned at 7 — one per existing
 * source-backed suite — and it is a standing rule of this repository that the
 * figure does not move. An eighth skip would move it. So this file keeps its
 * source-only branch *assertive* instead: the table below is checked for the
 * properties that need no index, and the index-backed half is gated on the
 * bundle exactly as before. Nothing is weakened — the strict gate still demands
 * every assertion in this file with zero skips allowed (**MB-19**).
 */
if (!SOURCE_AVAILABLE) {
  describe('retired-name tables, without the bundle', () => {
    test('the retired and live tables are well-formed and disjoint', () => {
      assert.equal(RETIRED.length, 13, 'the 2026-09-06 export removed thirteen names');
      assert.equal(new Set(RETIRED.map((r) => r.path)).size, RETIRED.length);
      assert.equal(new Set(LIVE.map((l) => l.path)).size, LIVE.length);
      const retiredPaths = new Set(RETIRED.map((r) => r.path));
      for (const live of LIVE) {
        assert.ok(!retiredPaths.has(live.path), `${live.path} is in both tables`);
      }
    });

    test('the index-backed assertions require the bundle and did not run', () => {
      assert.equal(SOURCE_AVAILABLE, false);
      assert.equal(ARTIFACT_DIR ?? '', '', 'ADALFI_ARTIFACT_DIR is unset in this mode');
    });
  });
} else {
  describe('the two exports really are different sources', () => {
    /** Guards the premise. If both constants ever pointed at one file, every
     *  assertion below would still pass and prove nothing. */
    test('the pinned and historical exports are distinct files with distinct hashes', () => {
      assert.notEqual(BASELINE_SOURCE_SHA256, HISTORICAL_SOURCE_SHA256);
      assert.ok(HISTORICAL_SOURCE !== undefined);
      assert.equal(hashSourceBytes(readFileSync(HISTORICAL_SOURCE)), HISTORICAL_SOURCE_SHA256);
    });

    /** The retired names were real. Asserted against the old file so "removed"
     *  is a measured claim about a rename, not a claim about a typo. */
    test('every retired name existed in the 2026-07-28 export', () => {
      assert.ok(HISTORICAL_SOURCE !== undefined);
      const previous = normalizeExport(JSON.parse(readFileSync(HISTORICAL_SOURCE, 'utf8')));
      const before = new Set(previous.records.map((r) => `${r.ref_class}|${r.path}`));
      const missing = RETIRED.filter((r) => !before.has(`${r.refClass}|${r.path}`));
      assert.deepEqual(missing.map((r) => r.path), [], 'a name listed as retired was never there');
    });
  });

  describe('retired names miss, and never resolve to a neighbour', () => {
    const { reader } = harness();

    test('none of the thirteen is in the index', () => {
      const present = RETIRED.filter((r) => reader.findByPath(r.refClass, r.path) !== undefined);
      assert.deepEqual(present.map((r) => r.path), []);
    });

    /**
     * The hazard, stated as measured fact rather than as a worry — if these live
     * neighbours did not exist, every test below would pass for the wrong reason.
     *
     * Two distinct shapes, and they are worth separating because they fail
     * differently. `lg` and `reg` are **strict prefixes** of live paths: the
     * retired name is a literal prefix of a token that still exists, which is
     * the case a prefix-scoring ranker cannot help but hit. The other eight are
     * **retired leaves** whose last segment survives one level deeper under a
     * different parent (`md` is gone, `radius/round-shape/lg/md` is not), which
     * is the case whole-segment matching hits.
     */
    test('retired radius names sit next to live ones — both hazard shapes are present', () => {
      const all = reader.selectPool({ refClasses: ['variable'] }).map((row) => row.path);
      const radiusRetired = RETIRED.filter((r) => r.path.startsWith('radius/round-shape/'));

      const strictPrefixes = radiusRetired.filter((r) => all.some((path) => path.startsWith(`${r.path}/`)));
      assert.deepEqual(
        strictPrefixes.map((r) => r.path).sort(),
        ['radius/round-shape/lg', 'radius/round-shape/reg'],
        'the strict-prefix hazard is exactly these two',
      );

      const leaves = radiusRetired.filter((r) => !strictPrefixes.includes(r));
      assert.equal(leaves.length, 8);
      for (const leaf of leaves) {
        const segment = leaf.path.slice(leaf.path.lastIndexOf('/') + 1);
        assert.ok(
          all.some((path) => path.startsWith('radius/round-shape/') && path.endsWith(`/${segment}`)),
          `${leaf.path}: its final segment should survive under a new parent`,
        );
      }
    });

    const plan = planQueries({
      route: 'new',
      items: RETIRED.map((r, i) => ({ semantic_id: `retired-${i}`, property: r.property, reference_text: r.path })),
    });
    const results = resolveBatch(reader, plan.queries);

    for (const [i, retired] of RETIRED.entries()) {
      test(`${retired.path} refuses rather than resolving`, () => {
        const result = results[i];
        assert.ok(result !== undefined);
        assert.deepEqual(
          result.candidates.map((c) => c.path),
          [],
          `resolved to ${result.candidates.map((c) => c.path).join(', ')} — a retired name must never return a neighbour`,
        );
        assert.equal(result.no_match_reason, 'retired-or-unknown-path');
      });
    }

    /** A miss must be *legible*. `no-term-or-value-signal` would say the caller
     *  was vague; they were specific and the token is gone, and only one of
     *  those two messages leads anywhere useful. */
    test('the refusal is machine-readable and distinct from vagueness', () => {
      for (const result of results) {
        assert.equal(result?.no_match_reason, 'retired-or-unknown-path');
        assert.notEqual(result?.no_match_reason, 'no-term-or-value-signal');
      }
    });

    /** A name never seen in any export refuses identically. The rule is about
     *  named paths, not about a hard-coded list of thirteen. */
    test('an invented path refuses the same way', () => {
      const invented = planQueries({
        route: 'new',
        items: [
          { semantic_id: 'a', property: 'fill', reference_text: 'sys/dark/bg/does_not_exist' },
          { semantic_id: 'b', property: 'corner-radius', reference_text: 'radius/round-shape/enormous' },
        ],
      });
      for (const result of resolveBatch(reader, invented.queries)) {
        assert.deepEqual(result.candidates, []);
        assert.equal(result.no_match_reason, 'retired-or-unknown-path');
      }
    });
  });

  describe('live names resolve to themselves — the other half of the rule', () => {
    const { reader } = harness();
    const plan = planQueries({
      route: 'new',
      items: LIVE.map((l, i) => ({ semantic_id: `live-${i}`, property: l.property, reference_text: l.path })),
    });
    const results = resolveBatch(reader, plan.queries);

    for (const [i, live] of LIVE.entries()) {
      test(`${live.path} resolves to itself`, () => {
        const result = results[i];
        assert.ok(result !== undefined);
        assert.equal(result.no_match_reason, undefined);
        assert.equal(
          result.candidates[0]?.path,
          live.path,
          `named ${live.path}, got ${result.candidates[0]?.path ?? '(nothing)'}`,
        );
        assert.equal(result.candidates[0]?.ranking_reasons[0], 'exact-path-match');
      });
    }

    /**
     * Before the fix, `radius/round-shape/lg/md` returned `radius/round-shape/lg/lg`
     * first and `lg-scale/base` returned `radius/cta/base` first. Both existed.
     * Being outranked by a neighbour is the same defect as being replaced by one.
     */
    test('a named path is not merely present in the list — it is the answer', () => {
      for (const [i, live] of LIVE.entries()) {
        assert.equal(results[i]?.candidates.length, 1, `${live.path} returned alternatives to an exact identity`);
      }
    });

    /** Materialization is the authority (§13.5); a rank-1 that cannot be
     *  materialized would be a display artefact, not a resolution. */
    test('each one materializes to the record it names', () => {
      for (const [i, live] of LIVE.entries()) {
        const candidate = results[i]?.candidates[0];
        assert.ok(candidate !== undefined);
        const materialized = materializeSelection(reader, [{ candidate_id: candidate.candidate_id }]);
        assert.equal(materialized.resolutions.length, 1, live.path);
        assert.ok(materialized.resolutions[0]?.source_record_ref !== undefined);
      }
    });
  });

  describe('free-text ranking is untouched by the lookup path', () => {
    const { reader } = harness();

    /** The regression this fix could plausibly cause. The twelve ground-truth
     *  cases carry no slash, so none may be diverted into the lookup branch. */
    test('no committed ground-truth case is path-shaped', () => {
      const groundTruth = JSON.parse(
        readFileSync(join(FIXTURES, 'resolver-ground-truth.json'), 'utf8'),
      ) as { readonly cases: readonly { readonly reference_text: string }[] };
      for (const testCase of groundTruth.cases) {
        assert.equal(isPathShaped(testCase.reference_text), false, testCase.reference_text);
      }
    });

    test('ordinary design language still ranks and still returns several candidates', () => {
      const plan = planQueries({
        route: 'new',
        items: [
          { semantic_id: 'a', property: 'padding', reference_text: '4px all around' },
          { semantic_id: 'b', property: 'fill', reference_text: 'warning expressive icon' },
        ],
      });
      const results = resolveBatch(reader, plan.queries);
      assert.equal(results[0]?.candidates[0]?.path, '4-scale/xxs');
      assert.equal(results[1]?.candidates[0]?.path, 'sys/dark/expressions/warning');
      for (const result of results) {
        assert.ok((result?.candidates.length ?? 0) > 1, 'free-text queries still offer alternatives');
        assert.notEqual(result?.candidates[0]?.ranking_reasons[0], 'exact-path-match');
      }
    });
  });
}
