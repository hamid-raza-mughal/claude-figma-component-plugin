/**
 * `CoordinatorJudgmentDraft` — the only thing a model produces (§14.3.4).
 *
 * Everything the model is entitled to say, and nothing else:
 *   - semantic intent (a brief, a delta, or an audit focus);
 *   - selections, **by opaque `candidate_id` only**;
 *   - clarification gaps it needs answered.
 *
 * Everything it is **not** entitled to say is absent by construction — no ids, no
 * hashes, no timestamps, no tool results, no approvals, no telemetry, no route, no
 * status, no confidence aggregate, and no node tree. Those are facts about the run
 * rather than judgments about the design, and `RunEnvelope` owns them.
 *
 * The draft is deliberately *not* the output. Deterministic code validates it,
 * materializes its selections, and composes the trusted output (§16.1) — so
 * nothing the model asserts about a token survives without being checked.
 */
import type { RunType } from './invocation.ts';
import type { ClarificationGap } from './resolution.ts';
import type { SemanticBrief, SemanticDelta, AuditBrief } from './semantic.ts';

/**
 * What the model believes it produced. **Advisory only.**
 *
 * Not a status: deterministic code decides status from evidence (§14.3.11). A
 * model claiming `ready` while carrying a blocking gap is a contradiction the
 * validator resolves against the model.
 */
export const DRAFT_SELF_ASSESSMENTS = ['believe-complete', 'need-clarification', 'cannot-proceed'] as const;
export type DraftSelfAssessment = (typeof DRAFT_SELF_ASSESSMENTS)[number];

export type CoordinatorJudgmentDraft = {
  /** Echoed so a route/payload mismatch is detectable. The model may not *choose*
   *  it — an echo that disagrees with the invocation is a validation failure. */
  readonly run_type: RunType;
  readonly self_assessment: DraftSelfAssessment;
  /** Exactly one payload, matching `run_type`. */
  readonly semantic_brief?: SemanticBrief | undefined;
  readonly semantic_delta?: SemanticDelta | undefined;
  readonly audit_brief?: AuditBrief | undefined;
  /** Gaps the model needs resolved. Severity is the model's *proposal*; the
   *  validator decides whether a blocking gap forces `blocked`. */
  readonly clarification_gaps?: readonly ClarificationGap[] | undefined;
  /** Free-text reasoning. Never parsed for facts — a note is not evidence. */
  readonly notes?: string | undefined;
};

/**
 * Keys that betray an authored implementation tree (§14.3.7–8, §16.2).
 *
 * Builder owns the exact node hierarchy. A draft carrying a node tree has taken a
 * decision that belongs downstream of the human gate — and it is the v1 failure
 * shape exactly: prompt v1.2's Step 4 always built a layer tree, on every route.
 */
export const AUTHORED_TREE_KEYS: readonly string[] = [
  'children',
  'layers',
  'layer_tree',
  'layerTree',
  'nodes',
  'node_tree',
  'nodeTree',
  'frame',
  'frames',
  'auto_layout',
  'autoLayout',
  'layout_mode',
  'layoutMode',
  'constraints',
  'absolute_bounding_box',
  'absoluteBoundingBox',
  'binding_call',
  'bindingCall',
];

/** Figma node type names. Their presence means a node tree, whatever the key. */
export const FIGMA_NODE_TYPES: readonly string[] = [
  'FRAME',
  'GROUP',
  'INSTANCE',
  'COMPONENT',
  'COMPONENT_SET',
  'RECTANGLE',
  'VECTOR',
  'TEXT',
  'ELLIPSE',
  'LINE',
  'POLYGON',
  'STAR',
  'BOOLEAN_OPERATION',
];

export type AuthoredTreeLeak = {
  readonly kind: 'forbidden-key' | 'figma-node-type';
  readonly detail: string;
  readonly path: string;
};

/**
 * Detects an authored implementation tree at any depth.
 *
 * Returns every leak rather than the first, so one repair call can address all of
 * them — the repair budget is one (§15.5).
 */
export function findAuthoredTreeLeaks(value: unknown, basePath = ''): AuthoredTreeLeak[] {
  const leaks: AuthoredTreeLeak[] = [];
  const visit = (node: unknown, path: string): void => {
    if (Array.isArray(node)) {
      node.forEach((item, index) => visit(item, `${path}/${index}`));
      return;
    }
    if (typeof node === 'string') {
      // A node-type literal is a tree even when the key looks innocent.
      if (FIGMA_NODE_TYPES.includes(node)) {
        leaks.push({ kind: 'figma-node-type', detail: node, path });
      }
      return;
    }
    if (node === null || typeof node !== 'object') return;
    for (const [key, child] of Object.entries(node)) {
      const childPath = `${path}/${key}`;
      if (AUTHORED_TREE_KEYS.includes(key)) {
        leaks.push({ kind: 'forbidden-key', detail: key, path: childPath });
      }
      visit(child, childPath);
    }
  };
  visit(value, basePath);
  return leaks;
}

/** Which payload field a route requires. Exactly one, and never another's. */
export const ROUTE_TO_PAYLOAD_FIELD: Readonly<Record<RunType, keyof CoordinatorJudgmentDraft>> = {
  new: 'semantic_brief',
  modify: 'semantic_delta',
  audit: 'audit_brief',
};

/** All payload fields, so cross-variant presence can be checked. */
export const ALL_PAYLOAD_FIELDS: readonly (keyof CoordinatorJudgmentDraft)[] = [
  'semantic_brief',
  'semantic_delta',
  'audit_brief',
];

/** Every `candidate_id` the draft selected, in document order. Duplicates are
 *  preserved: a repeated selection is a signal, not noise (§13.4.2). */
export function collectSelectedCandidateIds(draft: CoordinatorJudgmentDraft): readonly string[] {
  const ids: string[] = [];
  const fromBindings = (
    bindings: readonly { readonly selected_candidate_id: string }[] | undefined,
  ): void => {
    for (const binding of bindings ?? []) ids.push(binding.selected_candidate_id);
  };
  for (const element of draft.semantic_brief?.elements ?? []) fromBindings(element.bindings);
  for (const item of draft.semantic_delta?.items ?? []) fromBindings(item.bindings);
  return ids;
}
