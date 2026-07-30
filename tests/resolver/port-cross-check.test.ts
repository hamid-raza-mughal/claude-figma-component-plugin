/**
 * Gate 2 centrepiece: the port cross-check (decision **D-C**).
 *
 * The Python prototype is the reference answer sheet, used **once**, to confirm the
 * TypeScript port preserved the ranking. Its output was captured to
 * `prototype-baseline.json` with provenance so this comparison runs without a
 * Python runtime.
 *
 * What is compared, per D-C.3–4:
 *   - **case-specific rank windows**, not byte-identical ordering — the port adds a
 *     deterministic tiebreak the prototype lacks, so exact-order equality would
 *     produce false failures and the test would end up deleted;
 *   - **candidate eligibility** — does the expected record survive the class and
 *     category filter at all;
 *   - **per-rule score contributions** and **total scores** — so a divergence
 *     localises to a named weight instead of reporting "ranking differs";
 *   - **materialized record IDs** — the identity actually resolved to.
 *
 * Recall is reported as **fractions with explicit n**. n = 12. One case is eight
 * percentage points, so a percentage here would imply precision that does not
 * exist (finding C20).
 *
 * **This suite retires at Gate 2 pass** (D-C.8–9). The committed ground truth then
 * becomes the permanent baseline and the Python reference is frozen, not deleted.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { harness, SOURCE_AVAILABLE } from './test-index.ts';
import { planQueries } from '../../src/resolver/query-planner.ts';
import { resolveBatch } from '../../src/resolver/resolve-batch.ts';
import { materializeSelection } from '../../src/resolver/materialize-selection.ts';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'active');

type GroundTruthCase = {
  readonly case_id: string;
  readonly property: string;
  readonly reference_text: string;
  readonly expected_path: string;
  readonly allowed_rank: number;
  readonly window_basis: string;
  readonly prototype_rank: number | null;
};

type GroundTruth = {
  readonly schema: string;
  readonly n: number;
  readonly cases: readonly GroundTruthCase[];
};

const groundTruth = JSON.parse(
  readFileSync(join(FIXTURES, 'resolver-ground-truth.json'), 'utf8'),
) as GroundTruth;

describe('ground-truth fixture integrity', () => {
  test('has 12 cases and declares its own n', () => {
    assert.equal(groundTruth.cases.length, 12);
    assert.equal(groundTruth.n, 12);
  });

  /** SA-14: the fixture this ground truth derives from carried a fabricated path
   *  at High confidence, and every resolver metric taken against it was invalid. */
  test('carries no fabricated token path', () => {
    const text = JSON.stringify(groundTruth);
    assert.ok(!text.includes(['stroke', 'base'].join('/')));
    assert.ok(text.includes('stroke/thin'));
    assert.ok(text.includes('body/reg/regular'));
  });

  /** Windows were assigned before the resolver ran and are immutable (C12).
   *  Without a written basis, a window gets quietly refitted to the result. */
  test('every case declares an allowed rank and a written basis', () => {
    for (const testCase of groundTruth.cases) {
      assert.ok(testCase.allowed_rank >= 1 && testCase.allowed_rank <= 5, testCase.case_id);
      assert.ok(testCase.window_basis.length > 20, `${testCase.case_id} needs a real basis`);
    }
  });
});

if (!SOURCE_AVAILABLE) {
  describe('port cross-check', () => {
    test('curated source unavailable — set ADALFI_ARTIFACT_DIR', { skip: true }, () => {});
  });
} else {
  type Measured = {
    readonly testCase: GroundTruthCase;
    readonly rank: number | null;
    readonly paths: readonly string[];
    readonly eligible: boolean;
    readonly score: number | undefined;
    readonly contributions: readonly string[];
    readonly materializedRef: string | undefined;
  };

  /** One shared run, so every assertion below observes the same measurement. */
  const measured: readonly Measured[] = (() => {
    const { reader } = harness();
    const plan = planQueries({
      route: 'new',
      items: groundTruth.cases.map((testCase) => ({
        semantic_id: testCase.case_id,
        property: testCase.property,
        reference_text: testCase.reference_text,
      })),
    });
    assert.equal(plan.gaps.length, 0, 'no ground-truth case should be unplannable');
    const results = resolveBatch(reader, plan.queries);

    return groundTruth.cases.map((testCase, index) => {
      const result = results[index];
      const paths = (result?.candidates ?? []).map((candidate) => candidate.path);
      const at = paths.indexOf(testCase.expected_path);
      const scoredHit = result?.scored.find((entry) => entry.candidate.path === testCase.expected_path);
      const pool = reader.selectPool({
        refClasses: plan.queries[index]?.permitted_ref_classes ?? [],
        propertyCategory: plan.queries[index]?.property_category,
      });
      const selected = result?.candidates[0];
      const materialized =
        selected === undefined
          ? undefined
          : materializeSelection(reader, [{ candidate_id: selected.candidate_id }]).resolutions[0]
              ?.source_record_ref;
      return {
        testCase,
        rank: at < 0 ? null : at + 1,
        paths,
        eligible: pool.some((row) => row.path === testCase.expected_path),
        score: scoredHit?.score,
        contributions: (scoredHit?.contributions ?? []).map((c) => c.weight),
        materializedRef: materialized,
      };
    });
  })();

  describe('D-C.3 — case-specific rank windows', () => {
    for (const entry of measured) {
      test(`${entry.testCase.case_id} ${entry.testCase.expected_path} within rank ${entry.testCase.allowed_rank}`, () => {
        assert.ok(
          entry.rank !== null,
          `expected record absent from the candidate set (returned: ${entry.paths.join(', ')})`,
        );
        assert.ok(
          entry.rank !== null && entry.rank <= entry.testCase.allowed_rank,
          `ranked ${String(entry.rank)}, window is ${entry.testCase.allowed_rank}. Basis: ${entry.testCase.window_basis}`,
        );
      });
    }
  });

  describe('D-C.4 — eligibility, contributions, scores, materialized ids', () => {
    test('every expected record survives its class and category filter', () => {
      const ineligible = measured.filter((entry) => !entry.eligible).map((e) => e.testCase.case_id);
      assert.deepEqual(ineligible, [], 'a filter excluded a record the query should reach');
    });

    test('every expected record carries a score and named contributions', () => {
      for (const entry of measured) {
        assert.ok(entry.score !== undefined, `${entry.testCase.case_id} has no score`);
        assert.ok(entry.contributions.length > 0, `${entry.testCase.case_id} has no contributions`);
      }
    });

    /** Localises a divergence to a rule: a value-bearing case must actually be
     *  scored by the value rule, not arrive at the right answer another way. */
    test('cases with an explicit unit value are scored by the value rule', () => {
      for (const entry of measured) {
        if (!/\d\s*px/.test(entry.testCase.reference_text)) continue;
        assert.ok(
          entry.contributions.includes('EXACT_VALUE_MATCH'),
          `${entry.testCase.case_id} should score on EXACT_VALUE_MATCH; got ${entry.contributions.join(', ')}`,
        );
      }
    });

    test('the top candidate materializes to a real indexed record', () => {
      for (const entry of measured) {
        assert.ok(entry.materializedRef !== undefined, `${entry.testCase.case_id} failed to materialize`);
      }
    });
  });

  describe('D-C.7 — recall as fractions with explicit n', () => {
    const n = measured.length;
    const top1 = measured.filter((entry) => entry.rank === 1).length;
    const top3 = measured.filter((entry) => entry.rank !== null && entry.rank <= 3).length;
    const top5 = measured.filter((entry) => entry.rank !== null && entry.rank <= 5).length;
    const prototypeTop1 = groundTruth.cases.filter((c) => c.prototype_rank === 1).length;
    const prototypeTop5 = groundTruth.cases.filter((c) => c.prototype_rank !== null).length;

    test(`recall@1 = ${top1}/${n}, recall@3 = ${top3}/${n}, recall@5 = ${top5}/${n} (n=${n})`, () => {
      // Reported, not thresholded. n=12 makes one case ~8 points, so a percentage
      // would imply precision that does not exist.
      assert.equal(n, 12);
      assert.ok(top1 <= n && top3 <= n && top5 <= n);
    });

    /** The bar from D-C: at least the ported baseline. Not "identical" — the port
     *  legitimately diverges in three recorded ways. */
    test(`does not regress against the prototype (${prototypeTop1}/${n} top-1, ${prototypeTop5}/${n} top-5)`, () => {
      assert.ok(
        top1 >= prototypeTop1,
        `top-1 regressed: ${top1}/${n} vs prototype ${prototypeTop1}/${n}`,
      );
      assert.ok(
        top5 >= prototypeTop5,
        `top-5 regressed: ${top5}/${n} vs prototype ${prototypeTop5}/${n}`,
      );
    });

    /**
     * Two of the prototype's top-1 results were ties broken by arbitrary SQLite row
     * order rather than by scoring merit — it had no `ORDER BY`. The port scores
     * both on merit, which is why it exceeds the baseline rather than matching it.
     */
    test('cases the prototype won by luck are now won on merit', () => {
      const opacity = measured.find((e) => e.testCase.expected_path.endsWith('opacity_6'));
      assert.equal(opacity?.rank, 1);
      assert.ok(opacity?.contributions.includes('PATH_NUMERIC_MATCH'));

      const warning = measured.find((e) => e.testCase.expected_path === 'sys/dark/expressions/warning');
      assert.equal(warning?.rank, 1);
      assert.ok(warning?.contributions.includes('PATH_SEGMENT_EXACT'));
    });

    test('top-1 is not treated as the sole readiness metric', () => {
      // Recorded explicitly: §13 forbids it, and reporting the three separately is
      // how that stays true rather than becoming a habit.
      assert.ok(top3 >= top1 && top5 >= top3, 'recall must be monotonic in k');
    });
  });

  describe('zero model calls (§13.4, §18)', () => {
    /** Asserted structurally, not by inspection: the resolver has no network or
     *  model client reachable at all. */
    test('no resolver module imports a network or model client', () => {
      const dir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'resolver');
      const files = readdirSync(dir).filter((name) => name.endsWith('.ts'));
      assert.ok(files.length >= 8, `expected the resolver modules, found ${files.length}`);
      for (const file of files) {
        const text = readFileSync(join(dir, file), 'utf8');
        const code = text
          .split('\n')
          .filter((line) => !/^\s*(?:\/\/|\*|\/\*)/.test(line))
          .join('\n');
        for (const forbidden of ['node:http', 'node:https', '@anthropic-ai', 'fetch(']) {
          assert.ok(!code.includes(forbidden), `${file} references ${forbidden}`);
        }
      }
    });
  });
}
