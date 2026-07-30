/**
 * Semantic intent contracts (§14.1) — what the Coordinator authors.
 *
 * The boundary this file defends: these types carry **semantic intent**, never an
 * implementation tree. `NewReadyOutput` contains what the component *means*;
 * Builder owns the exact node hierarchy (§14.3.7–8). A brief that specified nodes
 * would move implementation authority upstream of the human gate and make the
 * same intent wrong on any other surface.
 *
 * The variant/property model is required by decision **D-D.3**. Without it the
 * spec's own worked `modify` example — "add a disabled state to the Primary
 * Button", `state: [default, hover, pressed] → [+disabled]` — becomes
 * inexpressible, and the `modify` route regresses against v1. It is also where
 * interaction-state coverage evidence lives.
 */
import type { RefClass } from './identity.ts';

/**
 * A variant axis and its options — `state`, `size`, `emphasis`.
 *
 * Interaction states are **options on a variant axis**, not separate components.
 * That is what makes coverage countable: `state: [default, hover, …]` can be
 * compared against the taxonomy, whereas a pile of separate components cannot.
 */
export type VariantProperty = {
  readonly name: string;
  readonly options: readonly string[];
  /** Which option applies when unspecified. */
  readonly default_option?: string | undefined;
};

/** One resolved design-system reference on a semantic element. */
export type SemanticPropertyBinding = {
  /** The property being set: `fill`, `padding`, `text_style`, … */
  readonly property: string;
  /** The user's words for the reference. Retained as provenance — untrusted data,
   *  never an instruction. */
  readonly reference_text: string;
  /**
   * The model's selection: an opaque `candidate_id` and nothing else.
   *
   * Deterministic code turns this into a `TypedResolution` (§14.3.5). A path or a
   * value here would be an assertion the model is not entitled to make.
   */
  readonly selected_candidate_id: string;
  /** Which variant option this binding applies to, when it is state-specific.
   *  Absent means it applies to every option. */
  readonly applies_to_option?: string | undefined;
  /** Reference classes the author expected. Advisory. */
  readonly expected_ref_class?: RefClass | undefined;
};

/**
 * A semantic element — a *meaningful part*, not a node.
 *
 * `role` is descriptive ("icon", "title", "close-affordance"), deliberately not a
 * Figma node type. Structural relationships are expressed as `parent_semantic_id`
 * rather than nesting, because a nested shape is one refactor away from being an
 * implementation tree.
 */
export type SemanticElement = {
  readonly semantic_id: string;
  readonly role: string;
  readonly description?: string | undefined;
  readonly parent_semantic_id?: string | undefined;
  readonly bindings: readonly SemanticPropertyBinding[];
  /** Text content where the element carries copy. Content, not styling. */
  readonly text_content?: string | undefined;
};

/**
 * `new` route: what to build, semantically.
 *
 * Per corrected `SA-13`, neither `change_status` nor `mode` is a global field here:
 * `change_status` exists only on `SemanticDelta` items, and `mode` only on
 * mode-bearing resolution records.
 */
export type SemanticBrief = {
  readonly component_name: string;
  readonly intent_summary: string;
  readonly variant_properties: readonly VariantProperty[];
  readonly elements: readonly SemanticElement[];
  /** Interaction states the author intends to cover, drawn from the taxonomy.
   *  Advisory and non-gating (`SA-23`) — present so coverage is *assessable*, not
   *  so it can fail a run. */
  readonly intended_interaction_states?: readonly string[] | undefined;
};

/** How a delta item changes the target. Per §5.7 this lives **only** here. */
export const CHANGE_STATUSES = ['add', 'modify', 'remove', 'preserve'] as const;
export type ChangeStatus = (typeof CHANGE_STATUSES)[number];

/** What kind of change a `modify` run makes. */
export const CHANGE_TYPES = ['variant', 'state', 'feature', 'other'] as const;
export type ChangeType = (typeof CHANGE_TYPES)[number];

/**
 * One change in a `modify` run.
 *
 * A variant-option transition is expressed explicitly — before and after — rather
 * than as a replacement list, so "added disabled" is distinguishable from
 * "replaced the whole axis". That distinction is the difference between a safe
 * change and a destructive one.
 */
export type SemanticDeltaItem = {
  readonly delta_id: string;
  readonly change_status: ChangeStatus;
  readonly change_type: ChangeType;
  readonly target_semantic_id?: string | undefined;
  readonly summary: string;
  /** Variant-axis transition, when this item changes one. */
  readonly variant_transition?:
    | {
        readonly property_name: string;
        readonly options_before: readonly string[];
        readonly options_after: readonly string[];
      }
    | undefined;
  readonly bindings?: readonly SemanticPropertyBinding[] | undefined;
};

/**
 * An obligation the change must not break.
 *
 * Explicit rather than implied: "everything else stays the same" is not checkable,
 * whereas a named element with a stated reason is.
 */
export type PreservationObligation = {
  readonly obligation_id: string;
  readonly semantic_id?: string | undefined;
  readonly description: string;
  readonly reason: string;
  /** How the obligation is verified after the build. Naming the check is what
   *  makes the obligation falsifiable. */
  readonly verification: string;
};

export type PreservationContract = {
  readonly target_tree_ref: string;
  readonly target_tree_sha256: string;
  readonly obligations: readonly PreservationObligation[];
  /** Semantic ids explicitly out of scope for this change. */
  readonly untouched_semantic_ids: readonly string[];
};

/** `modify` route: the changes plus what must survive them. */
export type SemanticDelta = {
  readonly component_name: string;
  readonly intent_summary: string;
  readonly items: readonly SemanticDeltaItem[];
  /** The axes after the change, so the resulting shape is stated rather than
   *  inferred from a diff. */
  readonly variant_properties_after: readonly VariantProperty[];
};

export const AUDIT_SCOPES = [
  'full',
  'accessibility',
  'tokens',
  'structure',
  'states',
  'custom',
] as const;

export type AuditScope = (typeof AUDIT_SCOPES)[number];

/** `audit` route: what to examine and against what. Non-generative by design —
 *  an audit produces findings, never a component. */
export type AuditBrief = {
  readonly component_name: string;
  readonly scope: AuditScope;
  readonly focus_summary: string;
  readonly target_tree_ref: string;
  readonly target_tree_sha256: string;
  /** Dimensions to assess. Interaction-state coverage is advisory here too. */
  readonly dimensions: readonly string[];
  readonly custom_scope_detail?: string | undefined;
};

/**
 * What the audit could and could not see.
 *
 * **Every excluded region must be recorded** (`SA-8`). An unrecorded exclusion
 * makes coverage unfalsifiable: a clean audit of 30% of a component is
 * indistinguishable from a clean audit of all of it.
 */
export type ExtractionExclusion = {
  readonly locator: string;
  readonly reason: string;
  readonly node_count?: number | undefined;
};

export type ExtractionCoverage = {
  readonly tree_ref: string;
  readonly tree_sha256: string;
  readonly total_nodes: number;
  readonly examined_nodes: number;
  readonly exclusions: readonly ExtractionExclusion[];
  /** True when `examined + excluded` accounts for every node. False means the
   *  coverage claim itself is incomplete, which is worse than low coverage. */
  readonly fully_accounted: boolean;
};

/** Verifies the arithmetic rather than trusting the flag. */
export function isCoverageAccounted(coverage: ExtractionCoverage): boolean {
  const excluded = coverage.exclusions.reduce(
    (total, exclusion) => total + (exclusion.node_count ?? 0),
    0,
  );
  return coverage.examined_nodes + excluded === coverage.total_nodes;
}
