/**
 * Ranking weights — the resolver's actual product (decision **D-C**).
 *
 * The index schema needed no iterations. The *ranking configuration* needed
 * three, and those three are what moved recall from unusable to 9/12 top-1 and
 * 11/12 top-5 on the prototype:
 *
 *   1. `SEMANTIC_TIER` / `PRIMITIVE_TIER` — `sys/*` is where bindings belong;
 *      `ref/*` is primitive (362 entries) and should not be bound to.
 *   2. `PATH_PREFIX_MATCH` — 6-character prefix stemming, so "spacing" matches
 *      "spacings" and "space".
 *   3. `VALUE_MISMATCH` — a *negative* weight for a record whose numeric value
 *      contradicts an explicitly requested one. Absence of a penalty was letting
 *      wrong-value records outrank right ones on name similarity alone.
 *
 * Each weight is a named constant with its own test, so a transcription error
 * fails a specific assertion rather than quietly lowering recall. That is the
 * whole reason the port carries a cross-check.
 */

export const RANKING_WEIGHTS = {
  /** An explicitly requested numeric value that matches exactly. Dominant by
   *  design: when the user says 14px, a record that *is* 14 should win. */
  EXACT_VALUE_MATCH: 10,
  /**
   * A record with a numeric value that is **not** the requested one.
   *
   * Negative, and deliberately large. This is fix 3, and it is the one that
   * matters most for the known defect class: `stroke/thin` (1.0) and
   * `stroke/reg` (2.0) have near-identical names, so without a penalty a request
   * for "1px border" can land on the wrong one by name similarity.
   */
  VALUE_MISMATCH: -4,
  /** `sys/*` — semantic tier. Bindings belong here. */
  SEMANTIC_TIER: 4,
  /** `ref/*` — primitive tier, 362 entries, not a binding target. */
  PRIMITIVE_TIER: -3,
  /** A query term appearing anywhere in the path. */
  PATH_TERM_MATCH: 3,
  /** A path segment starting with the first 6 characters of a query term. */
  PATH_PREFIX_MATCH: 2,
  /** The record was returned by the FTS5 index. */
  FULL_TEXT_MATCH: 2,
  /** A description exists. Weak by design: descriptions cover only 212/1,177
   *  (18%) of entries and are formulaic, so leaning on them would be leaning on
   *  the least discriminating field in the export. */
  DESCRIPTION_PRESENT: 0.5,
  /** The requested mode is among the record's modes. */
  MODE_MATCH: 1,
  /** A requested scope appears in the record's `scopes`. `scopes` is populated
   *  504/504 and is the real discriminator, which is why it is a positive signal
   *  rather than a tiebreak. */
  SCOPE_MATCH: 2,
  /**
   * A term matches a whole path segment, not merely a substring of one.
   *
   * Added during the port (divergence 2, decision D-C). `sys/dark/expressions/warning`
   * and `sys/dark/expressions/on_warning` both *contain* "warning", so a substring
   * rule scores them identically and the winner falls out of row order. The
   * prototype got the right answer here **by luck** — an arbitrary SQLite tie.
   *
   * Matched against **slash-delimited components**, deliberately not against the
   * `[/_-]` split used for stemming. Splitting on `_` would make `on_warning`
   * contain the component "warning" and the tie would survive — but `on_warning`
   * is a genuinely different token from `warning` (the `on-` prefix is the
   * foreground/background convention), so treating them as equal discards real
   * meaning.
   */
  PATH_SEGMENT_EXACT: 3,
  /**
   * A bare numeric token in the request matches a numeric path segment.
   *
   * Added during the port (divergence 3, decision D-C). `[a-z_]{3,}` discards
   * digits, so "warning 6 opacity" carried no signal distinguishing `opacity_6`
   * from the nine other members of its family — they tied, and the prototype's
   * top-1 was again luck. The digit is information the user supplied; discarding
   * it and then breaking the tie arbitrarily is the worst of both options.
   */
  PATH_NUMERIC_MATCH: 5,
  /** A numeric path segment that contradicts the requested number. The
   *  path-embedded twin of `VALUE_MISMATCH`, which cannot fire here because paint
   *  styles carry no `value_num`. */
  PATH_NUMERIC_MISMATCH: -3,
} as const;

export type RankingWeightName = keyof typeof RANKING_WEIGHTS;

/** Prefix length for stemming. 6 characters, ported exactly — shortening it
 *  produces false matches, lengthening it loses "spacing"/"space". */
export const STEM_PREFIX_LENGTH = 6;

/** Terms carrying no discriminating power, ported from the prototype. */
export const STOP_TERMS: readonly string[] = [
  'the',
  'for',
  'and',
  'from',
  'with',
  'all',
  'around',
  'px',
];

/** Minimum term length. Shorter tokens match too much to be useful. */
export const MIN_TERM_LENGTH = 3;

const TERM_PATTERN = /[a-z_]{3,}/g;
const SEGMENT_SPLIT = /[/_-]/;
/** Bare integers in the request — the signal `TERM_PATTERN` discards. */
const NUMERIC_TOKEN_PATTERN = /\b(\d{1,4})\b/g;
/** Numeric tail of a path segment: `opacity_6` → 6, `xs` → none. */
const SEGMENT_NUMERIC = /^(\d{1,4})$/;

/**
 * Bare integers appearing in free text.
 *
 * Separate from {@link extractTerms} because they behave differently: a number is
 * a near-exact discriminator, whereas a word is fuzzy evidence.
 */
export function extractNumericTokens(text: string): readonly number[] {
  const found = new Set<number>();
  for (const match of text.matchAll(NUMERIC_TOKEN_PATTERN)) {
    const raw = match[1];
    if (raw === undefined) continue;
    const value = Number.parseInt(raw, 10);
    if (Number.isFinite(value)) found.add(value);
  }
  return [...found].sort((a, b) => a - b);
}

/**
 * Extracts query terms from free text.
 *
 * Lowercased, stop-terms removed, deduplicated while preserving first-seen order
 * so scoring is deterministic.
 */
export function extractTerms(text: string): readonly string[] {
  const matches = text.toLowerCase().match(TERM_PATTERN) ?? [];
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const term of matches) {
    if (term.length < MIN_TERM_LENGTH) continue;
    if (STOP_TERMS.includes(term)) continue;
    if (seen.has(term)) continue;
    seen.add(term);
    terms.push(term);
  }
  return terms;
}

/** One weight's contribution, retained so a cross-check can localise a
 *  divergence to a rule instead of reporting "ranking differs". */
export type ScoreContribution = {
  readonly weight: RankingWeightName;
  readonly amount: number;
  readonly detail?: string | undefined;
};

export type ScoreInput = {
  readonly path: string;
  readonly pathFolded: string;
  readonly description: string;
  readonly scopes: readonly string[];
  readonly modes: readonly string[];
  readonly valueNum?: number | undefined;
  readonly ftsHit: boolean;
  readonly terms: readonly string[];
  /** Bare integers from the request. Distinct from `requestedValue`, which comes
   *  from a unit-bearing expression like "14px". */
  readonly numericTokens?: readonly number[] | undefined;
  readonly requestedValue?: number | undefined;
  readonly requestedMode?: string | undefined;
  readonly requestedScopes?: readonly string[] | undefined;
};

export type ScoreResult = {
  readonly score: number;
  readonly contributions: readonly ScoreContribution[];
};

/**
 * Scores one candidate. Pure, and it reports its own breakdown.
 *
 * The breakdown is not decoration: decision D-C.4 requires the cross-check to
 * compare per-rule contributions, because "total scores differ" does not tell you
 * which weight was transcribed wrong.
 */
export function scoreCandidate(input: ScoreInput): ScoreResult {
  const contributions: ScoreContribution[] = [];
  const add = (weight: RankingWeightName, amount: number, detail?: string): void => {
    if (amount === 0) return;
    contributions.push({ weight, amount, ...(detail === undefined ? {} : { detail }) });
  };

  // Value agreement, checked before anything else: it is the strongest signal in
  // both directions.
  if (input.requestedValue !== undefined) {
    if (input.valueNum !== undefined && input.valueNum === input.requestedValue) {
      add('EXACT_VALUE_MATCH', RANKING_WEIGHTS.EXACT_VALUE_MATCH, `${input.valueNum}`);
    } else if (input.valueNum !== undefined) {
      add(
        'VALUE_MISMATCH',
        RANKING_WEIGHTS.VALUE_MISMATCH,
        `has ${input.valueNum}, requested ${input.requestedValue}`,
      );
    }
  }

  // Token tier.
  if (input.pathFolded.startsWith('sys/')) {
    add('SEMANTIC_TIER', RANKING_WEIGHTS.SEMANTIC_TIER, 'sys/');
  } else if (input.pathFolded.startsWith('ref/')) {
    add('PRIMITIVE_TIER', RANKING_WEIGHTS.PRIMITIVE_TIER, 'ref/');
  }

  // Path term matching, on the folded path so variables (TitleCase) and styles
  // (lowercase) are treated alike.
  // Two different splits, for two different jobs: `[/_-]` segments for fuzzy stem
  // matching, and `/` components for exact matching. See PATH_SEGMENT_EXACT.
  const segments = input.pathFolded.split(SEGMENT_SPLIT);
  const components = input.pathFolded.split('/');
  let termMatches = 0;
  let prefixMatches = 0;
  let exactSegmentMatches = 0;
  for (const term of input.terms) {
    if (input.pathFolded.includes(term)) termMatches += 1;
    const stem = term.slice(0, STEM_PREFIX_LENGTH);
    if (segments.some((segment) => segment.startsWith(stem))) prefixMatches += 1;
    if (components.includes(term)) exactSegmentMatches += 1;
  }
  if (termMatches > 0) {
    add('PATH_TERM_MATCH', RANKING_WEIGHTS.PATH_TERM_MATCH * termMatches, `${termMatches} term(s)`);
  }
  if (prefixMatches > 0) {
    add('PATH_PREFIX_MATCH', RANKING_WEIGHTS.PATH_PREFIX_MATCH * prefixMatches, `${prefixMatches} stem(s)`);
  }
  if (exactSegmentMatches > 0) {
    add(
      'PATH_SEGMENT_EXACT',
      RANKING_WEIGHTS.PATH_SEGMENT_EXACT * exactSegmentMatches,
      `${exactSegmentMatches} whole segment(s)`,
    );
  }

  // Numeric path segments. Only scored when the request actually contained a bare
  // number and the path actually has a numeric segment — otherwise a path without
  // numbers would be penalised for a property it never claimed.
  const numericTokens = input.numericTokens ?? [];
  if (numericTokens.length > 0) {
    const pathNumbers = segments
      .map((segment) => SEGMENT_NUMERIC.exec(segment)?.[1])
      .filter((digits): digits is string => digits !== undefined)
      .map((digits) => Number.parseInt(digits, 10));
    if (pathNumbers.length > 0) {
      const hits = pathNumbers.filter((value) => numericTokens.includes(value));
      if (hits.length > 0) {
        add('PATH_NUMERIC_MATCH', RANKING_WEIGHTS.PATH_NUMERIC_MATCH * hits.length, hits.join(','));
      } else {
        add(
          'PATH_NUMERIC_MISMATCH',
          RANKING_WEIGHTS.PATH_NUMERIC_MISMATCH,
          `path has ${pathNumbers.join(',')}, requested ${numericTokens.join(',')}`,
        );
      }
    }
  }

  if (input.ftsHit) add('FULL_TEXT_MATCH', RANKING_WEIGHTS.FULL_TEXT_MATCH);
  if (input.description.trim() !== '') add('DESCRIPTION_PRESENT', RANKING_WEIGHTS.DESCRIPTION_PRESENT);

  if (input.requestedMode !== undefined) {
    const wanted = input.requestedMode.toLowerCase();
    if (input.modes.some((mode) => mode.toLowerCase() === wanted)) {
      add('MODE_MATCH', RANKING_WEIGHTS.MODE_MATCH, input.requestedMode);
    }
  }

  if (input.requestedScopes !== undefined && input.requestedScopes.length > 0) {
    const hits = input.requestedScopes.filter((scope) => input.scopes.includes(scope)).length;
    if (hits > 0) add('SCOPE_MATCH', RANKING_WEIGHTS.SCOPE_MATCH * hits, `${hits} scope(s)`);
  }

  const score = contributions.reduce((total, contribution) => total + contribution.amount, 0);
  return { score, contributions };
}

/** Confidence from score, for display only. **Confidence does not authorize
 *  acceptance** — exact materialization does (§13.5). A `high` here means "ranked
 *  strongly", never "verified". */
export function confidenceFromScore(score: number, runnerUpScore: number | undefined): 'high' | 'medium' | 'low' {
  const margin = runnerUpScore === undefined ? score : score - runnerUpScore;
  if (score >= 10 && margin >= 4) return 'high';
  if (score >= 5) return 'medium';
  return 'low';
}
