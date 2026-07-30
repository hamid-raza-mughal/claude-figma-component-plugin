/**
 * One test per ranking weight (decision **D-C**).
 *
 * The weights are the resolver's actual product: the schema needed no iterations,
 * the configuration needed three. So each weight is asserted individually — a
 * transcription error fails a named assertion instead of quietly lowering recall,
 * which is the failure Gate 2 could not otherwise detect.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  RANKING_WEIGHTS,
  STEM_PREFIX_LENGTH,
  STOP_TERMS,
  extractTerms,
  extractNumericTokens,
  scoreCandidate,
  confidenceFromScore,
} from '../../src/resolver/candidate-ranking.ts';

const BASE = {
  path: 'sys/dark/surfaces/surface',
  pathFolded: 'sys/dark/surfaces/surface',
  description: '',
  scopes: [] as readonly string[],
  modes: [] as readonly string[],
  ftsHit: false,
  terms: [] as readonly string[],
};

function amountFor(weight: keyof typeof RANKING_WEIGHTS, input: Parameters<typeof scoreCandidate>[0]): number {
  return scoreCandidate(input)
    .contributions.filter((contribution) => contribution.weight === weight)
    .reduce((total, contribution) => total + contribution.amount, 0);
}

describe('term extraction', () => {
  test('lowercases, drops short tokens, and dedupes preserving order', () => {
    assert.deepEqual(extractTerms('Warning WARNING opacity ab fill'), ['warning', 'opacity', 'fill']);
  });

  test('drops stop terms', () => {
    assert.deepEqual(extractTerms('4px all around the gap'), ['gap']);
    for (const stop of STOP_TERMS) assert.deepEqual(extractTerms(`${stop} spacing`), ['spacing']);
  });

  /** The prototype's `[a-z_]{3,}` discards digits entirely — the gap that made a
   *  ten-member opacity family indistinguishable. */
  test('bare numeric tokens are extracted separately from words', () => {
    assert.deepEqual(extractTerms('warning 6 opacity'), ['warning', 'opacity']);
    assert.deepEqual(extractNumericTokens('warning 6 opacity'), [6]);
    assert.deepEqual(extractNumericTokens('opacity 6 and 10'), [6, 10]);
    assert.deepEqual(extractNumericTokens('no digits here'), []);
  });
});

describe('the three ported weights', () => {
  test('EXACT_VALUE_MATCH fires on an exact numeric match', () => {
    assert.equal(
      amountFor('EXACT_VALUE_MATCH', { ...BASE, valueNum: 14, requestedValue: 14 }),
      RANKING_WEIGHTS.EXACT_VALUE_MATCH,
    );
  });

  /**
   * Fix 3, and the one that matters most for the known defect class: `stroke/thin`
   * (1.0) and `stroke/reg` (2.0) have near-identical names, so without a penalty a
   * request for 1px can land on the wrong one by name similarity alone.
   */
  test('VALUE_MISMATCH penalises a contradicting numeric value', () => {
    assert.equal(
      amountFor('VALUE_MISMATCH', { ...BASE, valueNum: 2, requestedValue: 1 }),
      RANKING_WEIGHTS.VALUE_MISMATCH,
    );
    assert.ok(RANKING_WEIGHTS.VALUE_MISMATCH < 0, 'must be a penalty');
  });

  test('a record with no numeric value is neither rewarded nor penalised', () => {
    const result = scoreCandidate({ ...BASE, requestedValue: 14 });
    assert.equal(
      result.contributions.filter((c) => c.weight === 'VALUE_MISMATCH' || c.weight === 'EXACT_VALUE_MATCH')
        .length,
      0,
    );
  });

  test('SEMANTIC_TIER rewards sys/ and PRIMITIVE_TIER penalises ref/', () => {
    assert.equal(
      amountFor('SEMANTIC_TIER', { ...BASE, pathFolded: 'sys/dark/x' }),
      RANKING_WEIGHTS.SEMANTIC_TIER,
    );
    assert.equal(
      amountFor('PRIMITIVE_TIER', { ...BASE, pathFolded: 'ref/grey/100' }),
      RANKING_WEIGHTS.PRIMITIVE_TIER,
    );
    assert.ok(RANKING_WEIGHTS.PRIMITIVE_TIER < 0, 'ref/ is not a binding target');
  });

  test('the tiers are mutually exclusive', () => {
    const result = scoreCandidate({ ...BASE, pathFolded: 'sys/dark/x' });
    assert.equal(result.contributions.filter((c) => c.weight === 'PRIMITIVE_TIER').length, 0);
  });

  test('PATH_PREFIX_MATCH stems at exactly six characters', () => {
    assert.equal(STEM_PREFIX_LENGTH, 6);
    // "spacings" stems to "spacin", which matches the segment "spacing".
    assert.equal(
      amountFor('PATH_PREFIX_MATCH', {
        ...BASE,
        pathFolded: 'layout/spacing/md',
        terms: ['spacings'],
      }),
      RANKING_WEIGHTS.PATH_PREFIX_MATCH,
    );
  });

  test('PATH_TERM_MATCH scales with the number of matching terms', () => {
    assert.equal(
      amountFor('PATH_TERM_MATCH', {
        ...BASE,
        pathFolded: 'alphas/dark/expressions/warning/opacity_6',
        terms: ['warning', 'opacity'],
      }),
      RANKING_WEIGHTS.PATH_TERM_MATCH * 2,
    );
  });
});

describe('the two weights added during the port', () => {
  /**
   * `sys/dark/expressions/warning` vs `.../on_warning`: both contain "warning", so
   * a substring rule ties them and the winner falls out of row order. Matching on
   * slash components rather than `[/_-]` segments is what breaks the tie on merit —
   * `on_warning` is a different token, not a variant spelling.
   */
  test('PATH_SEGMENT_EXACT distinguishes warning from on_warning', () => {
    const exact = amountFor('PATH_SEGMENT_EXACT', {
      ...BASE,
      pathFolded: 'sys/dark/expressions/warning',
      terms: ['warning'],
    });
    const notExact = amountFor('PATH_SEGMENT_EXACT', {
      ...BASE,
      pathFolded: 'sys/dark/expressions/on_warning',
      terms: ['warning'],
    });
    assert.equal(exact, RANKING_WEIGHTS.PATH_SEGMENT_EXACT);
    assert.equal(notExact, 0, 'on_warning must not count as an exact component match');
  });

  /** The ten-member opacity family ties on words alone; the digit is the
   *  discriminator, and the prototype's top-1 here was a lucky tie. */
  test('PATH_NUMERIC_MATCH picks the right member of a numeric family', () => {
    const right = scoreCandidate({
      ...BASE,
      pathFolded: 'alphas/dark/expressions/warning/opacity_6',
      terms: ['warning', 'opacity'],
      numericTokens: [6],
    });
    const wrong = scoreCandidate({
      ...BASE,
      pathFolded: 'alphas/dark/expressions/warning/opacity_10',
      terms: ['warning', 'opacity'],
      numericTokens: [6],
    });
    assert.ok(right.score > wrong.score, 'the requested number must win');
    assert.equal(
      right.contributions.find((c) => c.weight === 'PATH_NUMERIC_MATCH')?.amount,
      RANKING_WEIGHTS.PATH_NUMERIC_MATCH,
    );
    assert.equal(
      wrong.contributions.find((c) => c.weight === 'PATH_NUMERIC_MISMATCH')?.amount,
      RANKING_WEIGHTS.PATH_NUMERIC_MISMATCH,
    );
  });

  /** A path with no numeric segment must not be penalised for a property it never
   *  claimed. */
  test('a path without numeric segments is unaffected by numeric tokens', () => {
    const result = scoreCandidate({
      ...BASE,
      pathFolded: 'sys/dark/surfaces/surface',
      terms: ['surface'],
      numericTokens: [6],
    });
    assert.equal(
      result.contributions.filter(
        (c) => c.weight === 'PATH_NUMERIC_MATCH' || c.weight === 'PATH_NUMERIC_MISMATCH',
      ).length,
      0,
    );
  });
});

describe('the remaining weights', () => {
  test('FULL_TEXT_MATCH fires on an FTS hit', () => {
    assert.equal(amountFor('FULL_TEXT_MATCH', { ...BASE, ftsHit: true }), RANKING_WEIGHTS.FULL_TEXT_MATCH);
  });

  /** Deliberately weak: descriptions cover 18% of entries and are formulaic, so
   *  leaning on them would lean on the least discriminating field available. */
  test('DESCRIPTION_PRESENT is a weak signal', () => {
    assert.equal(
      amountFor('DESCRIPTION_PRESENT', { ...BASE, description: 'a description' }),
      RANKING_WEIGHTS.DESCRIPTION_PRESENT,
    );
    assert.ok(RANKING_WEIGHTS.DESCRIPTION_PRESENT < RANKING_WEIGHTS.PATH_PREFIX_MATCH);
  });

  test('MODE_MATCH is case-insensitive', () => {
    assert.equal(
      amountFor('MODE_MATCH', { ...BASE, modes: ['Dark'], requestedMode: 'dark' }),
      RANKING_WEIGHTS.MODE_MATCH,
    );
  });

  /** `scopes` is populated on all 504 variables — the real discriminator. */
  test('SCOPE_MATCH scales with matching scopes', () => {
    assert.equal(
      amountFor('SCOPE_MATCH', {
        ...BASE,
        scopes: ['GAP', 'WIDTH_HEIGHT'],
        requestedScopes: ['GAP', 'WIDTH_HEIGHT'],
      }),
      RANKING_WEIGHTS.SCOPE_MATCH * 2,
    );
  });
});

describe('scoring properties', () => {
  test('scoring is pure — identical input, identical output', () => {
    const input = { ...BASE, pathFolded: 'sys/dark/x', terms: ['dark'], valueNum: 4, requestedValue: 4 };
    assert.deepEqual(scoreCandidate(input), scoreCandidate(input));
  });

  test('the total equals the sum of its contributions', () => {
    const result = scoreCandidate({
      ...BASE,
      pathFolded: 'sys/dark/expressions/warning',
      terms: ['warning', 'dark'],
      description: 'x',
      ftsHit: true,
      numericTokens: [],
    });
    assert.equal(
      result.score,
      result.contributions.reduce((total, c) => total + c.amount, 0),
    );
  });

  test('zero-amount contributions are omitted rather than recorded', () => {
    for (const contribution of scoreCandidate(BASE).contributions) {
      assert.notEqual(contribution.amount, 0);
    }
  });

  /** Confidence is a ranking statement. Only exact materialization authorizes
   *  acceptance (§13.5). */
  test('confidence needs both a strong score and a clear margin', () => {
    assert.equal(confidenceFromScore(12, 2), 'high');
    assert.equal(confidenceFromScore(12, 11), 'medium', 'a narrow margin is not high confidence');
    assert.equal(confidenceFromScore(6, 1), 'medium');
    assert.equal(confidenceFromScore(1, undefined), 'low');
  });
});
