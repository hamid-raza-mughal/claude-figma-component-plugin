/**
 * Resolver query and result contracts (§13.3).
 *
 * `ResolverQuery` is a **closed typed contract**, never SQL. No model ever sees
 * a database path or composes a statement — the honest residual risk of this
 * architecture is query formulation replacing hallucination as the failure mode,
 * and a typed query is what keeps that risk inspectable.
 */
import type { RefClass } from '../contracts/identity.ts';
import type { ResolverCandidate, ResolverReasonCode } from '../contracts/resolution.ts';
import type { RunType } from '../contracts/invocation.ts';
import type { ScoreContribution } from './candidate-ranking.ts';

export type ResolverQuery = {
  /** Stable within a run so results can be correlated with requests. */
  readonly query_id: string;
  readonly route: RunType;
  /** Derived from the property being resolved (`fill`, `padding`, `text_style`…). */
  readonly property_category: string;
  /** The user's own words for the reference. Untrusted data. */
  readonly reference_text: string;
  /** Classes this query may return. Empty means unconstrained. */
  readonly permitted_ref_classes: readonly RefClass[];
  readonly requested_value?: number | undefined;
  readonly requested_range?: { readonly min: number; readonly max: number } | undefined;
  readonly collection_hint?: string | undefined;
  readonly path_hint?: string | undefined;
  readonly mode_hint?: string | undefined;
  readonly requested_scopes?: readonly string[] | undefined;
  /** Observed-tree property hints for `modify` / `audit`. */
  readonly observed_property_hints?: readonly string[] | undefined;
  readonly limit: number;
};

/** A candidate plus the internal detail the model never sees. Split so the
 *  compact model-facing shape cannot accidentally carry the breakdown. */
export type ScoredCandidate = {
  readonly candidate: ResolverCandidate;
  readonly score: number;
  readonly contributions: readonly ScoreContribution[];
  /** Full description, retained for validators and the cross-check. Never sent to
   *  a model — §13.5 keeps full descriptions outside model context. */
  readonly full_description: string;
};

export type ResolveBatchResult = {
  readonly query_id: string;
  readonly candidates: readonly ResolverCandidate[];
  /** Internal detail, aligned by index with `candidates`. */
  readonly scored: readonly ScoredCandidate[];
  /**
   * Set when a filter was auto-relaxed, naming what was dropped.
   *
   * Mandatory whenever broadening occurred: the model cannot see what it never
   * retrieved, so an invisible broadening is an invisible loss of precision.
   */
  readonly broadened_from?: string | undefined;
  /**
   * Machine-readable reason for an empty result. Never return an empty set
   * without one — "no candidates" and "no candidates because the class filter
   * excluded everything" demand different responses.
   */
  readonly no_match_reason?: NoMatchReason | undefined;
  readonly considered_count: number;
};

export const NO_MATCH_REASONS = [
  'no-records-in-ref-class',
  'no-records-in-category',
  'no-term-or-value-signal',
  'all-candidates-below-floor',
  'query-too-vague',
  /**
   * The reference text *named a token path* and that path is not in this index.
   *
   * Distinct from every reason above, because it is the only one that says the
   * caller was specific and was wrong. Introduced after the 2026-09-06 export
   * renamed thirteen tokens: measured, twelve of the thirteen retired names
   * still resolved — `sys/dark/bg/on_bg_dim` to its rename at **high**
   * confidence, and `radius/round-shape/md` to `radius/round-shape/lg/lg`,
   * a different size, at medium. A retired name resolving to a neighbour is
   * worse than no answer: it is a wrong answer wearing a confidence score.
   */
  'retired-or-unknown-path',
] as const;

export type NoMatchReason = (typeof NO_MATCH_REASONS)[number];

/** Maps a scoring contribution to the stable reason code a candidate carries. */
export const WEIGHT_TO_REASON_CODE: Readonly<Record<string, ResolverReasonCode>> = {
  EXACT_VALUE_MATCH: 'exact-value-match',
  VALUE_MISMATCH: 'value-mismatch-penalty',
  SEMANTIC_TIER: 'semantic-tier-preferred',
  PRIMITIVE_TIER: 'primitive-tier-penalised',
  PATH_TERM_MATCH: 'path-term-match',
  PATH_PREFIX_MATCH: 'path-prefix-match',
  FULL_TEXT_MATCH: 'full-text-match',
  DESCRIPTION_PRESENT: 'description-present',
  MODE_MATCH: 'mode-match',
  SCOPE_MATCH: 'scope-match',
};

export type ClarificationNeeded = {
  readonly kind: 'clarification-needed';
  readonly query_id: string;
  readonly reason: NoMatchReason;
  readonly question: string;
  readonly evidence: string;
};

export type QueryPlanResult = {
  readonly queries: readonly ResolverQuery[];
  /** Requests too vague for a safe bounded query. A structured gap, not a guess
   *  (§13.3). */
  readonly gaps: readonly ClarificationNeeded[];
};
