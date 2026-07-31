/**
 * Resolution contracts — the identity-bearing core both WP2 and WP3 depend on.
 *
 * The division of labour this file encodes (P1-FINAL §14.3.5):
 *   - a model may select a `candidate_id`, and nothing else;
 *   - **deterministic code** produces every `TypedResolution`.
 *
 * That is the executable form of the never-hallucinate rule. In the v1 design the
 * rule was prose, and prose let a real key be paired with a fabricated path at
 * High confidence.
 */
import type { CandidateIdentity, RefClass } from './identity.ts';

/**
 * Why a candidate ranked where it did. Stable codes, at most three per candidate
 * (§13.5) — enough to explain a ranking, too few to become a payload.
 */
export const RESOLVER_REASON_CODES = [
  'exact-value-match',
  'value-mismatch-penalty',
  'semantic-tier-preferred',
  'primitive-tier-penalised',
  'path-term-match',
  'path-prefix-match',
  'full-text-match',
  'scope-match',
  'mode-match',
  'description-present',
  'category-routed',
  'broadened-retrieval',
] as const;

export type ResolverReasonCode = (typeof RESOLVER_REASON_CODES)[number];

export const CONFIDENCE_LEVELS = ['high', 'medium', 'low'] as const;
export type Confidence = (typeof CONFIDENCE_LEVELS)[number];

/**
 * What the model sees. Compact by contract.
 *
 * Full descriptions and complete records stay outside model context (§13.5), and
 * **confidence does not authorize acceptance** — exact materialization does. A
 * `high` here is a ranking statement, not a verification.
 */
export type ResolverCandidate = CandidateIdentity & {
  readonly ref_class: RefClass;
  readonly property_category: string;
  readonly path: string;
  readonly key: string;
  readonly normalized_id?: string | undefined;
  readonly mode?: string | undefined;
  readonly value_preview?: string | number | boolean | undefined;
  readonly confidence: Confidence;
  readonly ranking_reasons: readonly ResolverReasonCode[];
};

/** Max reason codes carried on a candidate (§13.5). */
export const MAX_RANKING_REASONS = 3;

/** Default and hard-ceiling candidate counts (§13.4.1). The ceiling is a
 *  deliberate override of the token-model doc's 7–10 broadening suggestion,
 *  justified because descriptions cover only 18% of entries and are formulaic.
 *  Logged as a governance-valve default; not re-litigated per run. */
export const DEFAULT_CANDIDATE_COUNT = 3;
export const MAX_CANDIDATE_COUNT = 5;

/**
 * A verified resolution, produced only by deterministic materialization.
 *
 * Discriminated on `ref_class` so a text style cannot be silently treated as a
 * paint style. Note what is **absent by contract**: no `binding_call`, no Figma
 * API instruction. `ref_class` is the contract; choosing the Plugin API call is
 * Builder's job (§14.3.6). Encoding the call here would leak an implementation
 * decision into semantic intent and make the same resolution wrong on a
 * different surface.
 */
export type TypedResolutionBase = CandidateIdentity & {
  readonly property_category: string;
  /** Normalized path, as stored. Casing differs by class in the source —
   *  variables are TitleCase, styles lowercase — so this preserves the real
   *  value rather than a folded one. */
  readonly path: string;
  readonly key: string;
  /** Normalized id: the export's trailing comma removed for styles. */
  readonly normalized_id: string;
  /** The export's original id, comma intact. Both are kept so a mismatch
   *  between representations is detectable rather than lost (`SA-11`). */
  readonly raw_id: string;
  readonly scopes: readonly string[];
  readonly verified_against_source_sha256: string;
};

export type VariableResolution = TypedResolutionBase & {
  readonly ref_class: 'variable';
  readonly collection: string;
  /** Present only on mode-bearing records (§5.7). */
  readonly mode?: string | undefined;
  readonly value: string | number | boolean;
};

export type PaintStyleResolution = TypedResolutionBase & {
  readonly ref_class: 'paint-style';
  /** The variable bound behind the paint, when there is one. Informational
   *  only — **never** the binding target for a style. Measured: 381 of 567 paint
   *  styles have no bound variable at all, so absence is normal and is not
   *  evidence of mode asymmetry. */
  readonly bound_variable_id?: string | undefined;
  readonly modes: readonly string[];
};

export type TextStyleResolution = TypedResolutionBase & {
  readonly ref_class: 'text-style';
  /**
   * Resolved through the style → variable join, not read off the style.
   *
   * This is the field that catches the second verified v1 defect: a text style
   * claimed at 14px that is 12px, "justified" by the false assertion that font
   * sizes were absent from the export. They are present as 205 `type-scale`
   * variables, reachable via `bound_variables`.
   */
  readonly font_size?: number | undefined;
  readonly line_height?: number | undefined;
  readonly letter_spacing?: number | undefined;
  readonly font_family?: string | undefined;
  /** Text styles key `bound_variables` by field name — a dict, not a list. */
  readonly bound_variable_ids?: Readonly<Record<string, string>> | undefined;
};

export type EffectStyleResolution = TypedResolutionBase & {
  readonly ref_class: 'effect-style';
  readonly bound_variable_ids?: readonly string[] | undefined;
};

export type GridStyleResolution = TypedResolutionBase & {
  readonly ref_class: 'grid-style';
};

/**
 * The closed union. Every supported reference class is discriminated (§14.3.6).
 *
 * `grid-style` has **zero** instances in the export and `effect-style` exactly
 * one, so both are exercised by synthetic fixtures only and must never be
 * reported as verified class routing.
 */
export type TypedResolution =
  | VariableResolution
  | PaintStyleResolution
  | TextStyleResolution
  | EffectStyleResolution
  | GridStyleResolution;

/**
 * A gap that **blocks**. Any active blocking gap deterministically forces
 * `blocked` status and a null forward route (§14.3.11).
 *
 * `gap_id` is stable across clarification rounds so a reopened gap is traceable
 * rather than appearing as a new one — and array length is never convergence
 * evidence (§14.3.17), which is why lifecycle is explicit here.
 */
export const GAP_STATES = ['active', 'resolved', 'reopened'] as const;
export type GapState = (typeof GAP_STATES)[number];

export const GAP_SEVERITIES = ['blocking', 'non-blocking'] as const;
export type GapSeverity = (typeof GAP_SEVERITIES)[number];

export type ClarificationGap = {
  readonly gap_id: string;
  readonly state: GapState;
  readonly severity: GapSeverity;
  readonly owner: 'user' | 'coordinator' | 'run-guard';
  readonly question: string;
  readonly evidence: string;
  readonly required_answer: string;
  readonly opened_in_round: number;
};

/**
 * A disclosure that **cannot block** (finding C7).
 *
 * `ClarificationGap` carries blocking severity, so routing a non-blocking
 * disclosure through it would trip §14.3.11 and block a run that should proceed.
 * `actionable: false` is a literal type, not a boolean, so the "can never block"
 * property is enforced by the type system rather than by discipline.
 *
 * Two kinds exist today: `mode_coverage_gap` (rule R14 — a multi-mode collection
 * with incomplete published style coverage, where there is no alternative to
 * offer and asking would be a dead end) and `interaction_state_gap` (decision
 * D-D — interaction-state coverage is advisory and non-gating).
 */
export const DISCLOSURE_KINDS = [
  'mode_coverage_gap',
  'interaction_state_gap',
  'broadened_retrieval',
  'partial_extraction',
] as const;

export type DisclosureKind = (typeof DISCLOSURE_KINDS)[number];

export type Disclosure = {
  readonly disclosure_id: string;
  readonly kind: DisclosureKind;
  readonly owner: 'coordinator' | 'synthesizer' | 'run-guard';
  readonly evidence: string;
  /** Literal `false`. A disclosure can never demand action, and therefore can
   *  never produce `blocked`. */
  readonly actionable: false;
};

export function isBlockingGap(gap: ClarificationGap): boolean {
  return gap.severity === 'blocking' && (gap.state === 'active' || gap.state === 'reopened');
}

export function hasBlockingGap(gaps: readonly ClarificationGap[]): boolean {
  return gaps.some(isBlockingGap);
}
