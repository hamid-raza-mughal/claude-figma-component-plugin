/**
 * `resolveBatch` — bounded candidate retrieval (§13.4.1).
 *
 * Contract:
 *   - **zero model calls**;
 *   - three candidates by default, at most five and only for genuine close
 *     ambiguity;
 *   - stable ordering and at most three reason codes per candidate;
 *   - no complete record and no full description leaves this function;
 *   - never an empty set without a machine-readable `no_match_reason`;
 *   - **a reference text that names a token path resolves to that path or to
 *     nothing** — never to a neighbour (see `isPathShaped` below).
 *
 * Batching is the point: every reference in a request is resolved in one pass,
 * because fourteen sequential round trips would cost more than one wide scan.
 */
import {
  extractTerms,
  extractNumericTokens,
  scoreCandidate,
  confidenceFromScore,
} from './candidate-ranking.ts';
import { rankStably } from '../contracts/identity.ts';
import { MAX_CANDIDATE_COUNT, MAX_RANKING_REASONS } from '../contracts/resolution.ts';
import { WEIGHT_TO_REASON_CODE } from './resolver-types.ts';
import type { IndexReader, IndexRow } from './index-reader.ts';
import type { ResolveBatchResult, ResolverQuery, ScoredCandidate, NoMatchReason } from './resolver-types.ts';
import type { ResolverCandidate, ResolverReasonCode } from '../contracts/resolution.ts';

/** Candidates scoring at or below this are noise rather than answers. Negative
 *  because the value-mismatch penalty legitimately pushes real records down. */
export const SCORE_FLOOR = -2;

/**
 * Does this reference text *name* a token rather than describe one?
 *
 * A single slash-bearing token with no whitespace — `radius/round-shape/sm`,
 * `sys/dark/bg/on_bg_dim`. Design language never looks like this ("4px all
 * around", "warning surface"); a token name copied from an export, a previous
 * run's output, or a stored binding always does.
 *
 * The distinction matters because the two are different speech acts. A
 * description invites ranking. A name is a **claim of identity**, and the only
 * honest answers to a claim of identity are "here it is" and "that does not
 * exist". Ranking a name produces the third answer — "here is something else,
 * at medium confidence" — which is the one that gets a wrong token shipped.
 *
 * Deliberately narrow. A false positive here costs a ranked answer the caller
 * could have had; a false negative restores exactly today's behaviour. Erring
 * toward refusal is the safe direction when the input was specific.
 */
export function isPathShaped(referenceText: string): boolean {
  const trimmed = referenceText.trim();
  return trimmed.length > 0 && !/\s/.test(trimmed) && trimmed.includes('/');
}

/** Score gap within which a runner-up counts as genuinely ambiguous, justifying
 *  widening beyond the default three. */
export const AMBIGUITY_MARGIN = 2;

function reasonCodesFor(
  contributions: readonly { readonly weight: string; readonly amount: number }[],
): readonly ResolverReasonCode[] {
  // Strongest absolute contributions first: a large penalty explains a ranking as
  // usefully as a large bonus.
  return [...contributions]
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
    .map((contribution) => WEIGHT_TO_REASON_CODE[contribution.weight])
    .filter((code): code is ResolverReasonCode => code !== undefined)
    .slice(0, MAX_RANKING_REASONS);
}

function compactValuePreview(row: IndexRow): string | number | boolean | undefined {
  if (row.value_num !== undefined) return row.value_num;
  const first = row.values[0];
  if (first === undefined) return undefined;
  if (first.color_hex !== undefined) return first.color_hex;
  if (first.scalar !== undefined) return first.scalar;
  return undefined;
}

function toCandidate(row: IndexRow, score: number, runnerUp: number | undefined, contributions: readonly { readonly weight: string; readonly amount: number }[]): ResolverCandidate {
  const preview = compactValuePreview(row);
  return {
    candidate_id: row.candidate_id,
    source_record_ref: row.source_record_ref,
    source_sha256: '',
    index_version: '',
    ref_class: row.ref_class,
    property_category: row.property_category,
    path: row.path,
    key: row.key,
    ...(row.normalized_id === '' ? {} : { normalized_id: row.normalized_id }),
    ...(row.modes.length === 1 && row.modes[0] !== undefined ? { mode: row.modes[0] } : {}),
    ...(preview === undefined ? {} : { value_preview: preview }),
    confidence: confidenceFromScore(score, runnerUp),
    ranking_reasons: reasonCodesFor(contributions),
  };
}

export type ResolveBatchOptions = {
  /** Allows widening to five on genuine ambiguity. Default true. */
  readonly allowAmbiguityWidening?: boolean | undefined;
};

export function resolveBatch(
  reader: IndexReader,
  queries: readonly ResolverQuery[],
  options: ResolveBatchOptions = {},
): readonly ResolveBatchResult[] {
  return queries.map((query) => resolveOne(reader, query, options));
}

function resolveOne(
  reader: IndexReader,
  query: ResolverQuery,
  options: ResolveBatchOptions,
): ResolveBatchResult {
  const terms = extractTerms(query.reference_text);
  const numericTokens = extractNumericTokens(query.reference_text);
  const snapshot = { source_sha256: reader.meta.source_sha256, index_version: reader.meta.index_version };

  // A named path resolves to itself or to nothing. Checked before the pool is
  // built, because once a pool exists the ranker will always find *something*
  // plausible in it — and "plausible" is precisely the failure mode here.
  // `findByPath` matches on `path_folded`, so the variables-are-TitleCase /
  // styles-are-lowercase split (finding C4) does not turn a real hit into a miss.
  if (isPathShaped(query.reference_text)) {
    const named = query.reference_text.trim();
    const hits = query.permitted_ref_classes
      .map((refClass) => reader.findByPath(refClass, named))
      .filter((row): row is IndexRow => row !== undefined);
    const hit = hits[0];
    if (hit === undefined) {
      return emptyResult(query, 'retired-or-unknown-path', 0);
    }
    // Found: answer with it and nothing else. Ranking was measured to bury a
    // named record under a neighbour — `radius/round-shape/lg/md` returned
    // `radius/round-shape/lg/lg` at rank 1 — and "alternatives" to an exact
    // identity request are noise, not help. `high` here still means "ranked
    // strongly", never "verified": materialization remains the authority (§13.5).
    const exact: ResolverCandidate = {
      ...toCandidate(hit, 0, undefined, []),
      source_sha256: snapshot.source_sha256,
      index_version: snapshot.index_version,
      confidence: 'high',
      ranking_reasons: ['exact-path-match'],
    };
    return {
      query_id: query.query_id,
      candidates: [exact],
      scored: [{ candidate: exact, score: 0, contributions: [], full_description: hit.description }],
      considered_count: hits.length,
    };
  }

  let pool = reader.selectPool({
    refClasses: query.permitted_ref_classes,
    propertyCategory: query.property_category,
    ...(query.collection_hint === undefined ? {} : { collection: query.collection_hint }),
  });
  let broadenedFrom: string | undefined;

  // Broadening is visible or it does not happen. The model cannot see what it
  // never retrieved, so an unrecorded relaxation is an unrecorded loss.
  if (pool.length === 0) {
    pool = reader.selectPool({ refClasses: query.permitted_ref_classes });
    if (pool.length > 0) broadenedFrom = `property_category=${query.property_category}`;
  }

  if (pool.length === 0) {
    return emptyResult(query, 'no-records-in-ref-class', 0);
  }

  const ftsHits = reader.ftsHits(terms);
  const scored: ScoredCandidate[] = [];

  for (const row of pool) {
    const { score, contributions } = scoreCandidate({
      path: row.path,
      pathFolded: row.path_folded,
      description: row.description,
      scopes: row.scopes,
      modes: row.modes,
      ...(row.value_num === undefined ? {} : { valueNum: row.value_num }),
      ftsHit: ftsHits.has(row.uid),
      terms,
      numericTokens,
      ...(query.requested_value === undefined ? {} : { requestedValue: query.requested_value }),
      ...(query.mode_hint === undefined ? {} : { requestedMode: query.mode_hint }),
      ...(query.requested_scopes === undefined ? {} : { requestedScopes: query.requested_scopes }),
    });
    scored.push({
      candidate: {
        ...toCandidate(row, score, undefined, contributions),
        source_sha256: snapshot.source_sha256,
        index_version: snapshot.index_version,
      },
      score,
      contributions,
      full_description: row.description,
    });
  }

  // Stable ordering, using the frozen tiebreak: score, normalized path, immutable
  // record ref (decision D-C.5).
  const ranked = rankStably(
    scored.map((entry) => ({
      ...entry,
      path: entry.candidate.path,
      source_record_ref: entry.candidate.source_record_ref,
    })),
  );

  const above = ranked.filter((entry) => entry.score > SCORE_FLOOR);
  if (above.length === 0) {
    return emptyResult(query, 'all-candidates-below-floor', pool.length, broadenedFrom);
  }

  // Widen to the ceiling only when the runner-up is genuinely close — not as a
  // default. The cap is a governance-valve decision, not an accident.
  let limit = Math.min(query.limit, MAX_CANDIDATE_COUNT);
  if (options.allowAmbiguityWidening !== false && above.length > limit) {
    const boundary = above[limit - 1]?.score;
    const next = above[limit]?.score;
    if (boundary !== undefined && next !== undefined && boundary - next <= AMBIGUITY_MARGIN) {
      limit = MAX_CANDIDATE_COUNT;
    }
  }

  const selected = above.slice(0, limit);
  const runnerUpScore = selected[1]?.score;

  const finalScored: ScoredCandidate[] = selected.map((entry, index) => ({
    candidate: {
      ...entry.candidate,
      confidence: confidenceFromScore(entry.score, index === 0 ? runnerUpScore : undefined),
    },
    score: entry.score,
    contributions: entry.contributions,
    full_description: entry.full_description,
  }));

  return {
    query_id: query.query_id,
    candidates: finalScored.map((entry) => entry.candidate),
    scored: finalScored,
    ...(broadenedFrom === undefined ? {} : { broadened_from: broadenedFrom }),
    considered_count: pool.length,
  };
}

function emptyResult(
  query: ResolverQuery,
  reason: NoMatchReason,
  consideredCount: number,
  broadenedFrom?: string,
): ResolveBatchResult {
  return {
    query_id: query.query_id,
    candidates: [],
    scored: [],
    no_match_reason: reason,
    considered_count: consideredCount,
    ...(broadenedFrom === undefined ? {} : { broadened_from: broadenedFrom }),
  };
}
