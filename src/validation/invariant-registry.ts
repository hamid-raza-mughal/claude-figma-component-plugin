/**
 * The invariant registry (§14.3.15).
 *
 * Every invariant names **exactly one enforcement owner**. That rule is doing real
 * work: an invariant owned by "the schema and also the validator" is in practice
 * owned by neither, which is how blocking severity came to have no route effect in
 * v1 while everyone assumed something checked it.
 *
 * This registry is the index. Each entry says what must hold, who enforces it, and
 * — where relevant — which verified defect it exists to prevent. A test asserts
 * that every entry has an owner and that the owners are distinct per invariant.
 */
import type { EnforcementOwner } from '../contracts/failures.ts';

export type Invariant = {
  /** Stable id, referenced by error codes and by tests. */
  readonly id: string;
  readonly statement: string;
  readonly owner: EnforcementOwner;
  /** The verified v1 defect or plan finding this prevents, where there is one. */
  readonly prevents?: string | undefined;
  /** Machine-readable code emitted on violation. */
  readonly error_code: string;
};

export const INVARIANTS: readonly Invariant[] = [
  {
    id: 'INV-01',
    statement: 'ResolvedCoordinatorInvocation.run_type is required and one of new | modify | audit.',
    owner: 'schema',
    prevents: 'a misrouted run; there is no model route classifier (decision D3)',
    error_code: 'INV_ROUTE_MISSING_OR_INVALID',
  },
  {
    id: 'INV-02',
    statement: 'run_id is a UUID; a readable identity lives in a separate display_id.',
    owner: 'schema',
    prevents: 'the v1 schema declaring format: uuid while its fixture used a slug, passing only because format assertion was off',
    error_code: 'INV_RUN_ID_NOT_UUID',
  },
  {
    id: 'INV-03',
    statement: 'RunEnvelope owns every operational fact: ids, versions, hashes, timestamps, phase, tool results, retries, approvals, metrics.',
    owner: 'schema',
    error_code: 'INV_OPERATIONAL_FIELD_MISPLACED',
  },
  {
    id: 'INV-04',
    statement: 'CoordinatorJudgmentDraft contains no operational field at any depth.',
    owner: 'semantic-validator',
    prevents: 'a model authoring its own approval, telemetry or tool results',
    error_code: 'INV_DRAFT_CARRIES_OPERATIONAL_FIELD',
  },
  {
    id: 'INV-05',
    statement: 'A model selects candidate_id only; deterministic code creates every TypedResolution.',
    owner: 'deterministic-composer',
    prevents: 'defect #1 — a real key paired with a fabricated path at High confidence',
    error_code: 'INV_RESOLUTION_NOT_MATERIALIZED',
  },
  {
    id: 'INV-06',
    statement: 'TypedResolution discriminates every supported reference class and contains no binding_call or Figma API instruction.',
    owner: 'schema',
    prevents: 'an implementation decision leaking into semantic intent; ref_class is the contract, the Plugin API call is Builder’s',
    error_code: 'INV_RESOLUTION_CARRIES_BINDING_CALL',
  },
  {
    id: 'INV-07',
    statement: 'NewReadyOutput carries semantic intent, never an authored LayerNode tree.',
    owner: 'semantic-validator',
    prevents: "prompt v1.2's Step 4, which always built a layer tree regardless of route",
    error_code: 'INV_AUTHORED_TREE_IN_NEW',
  },
  {
    id: 'INV-08',
    statement: 'ModifyReadyOutput carries semantic changes and preservation obligations, never a replacement implementation tree.',
    owner: 'semantic-validator',
    error_code: 'INV_AUTHORED_TREE_IN_MODIFY',
  },
  {
    id: 'INV-09',
    statement: 'AuditReadyOutput carries audit intent and coverage, and cannot carry a Builder route or Builder payload.',
    owner: 'schema',
    prevents: 'two v1 eval cases expecting route: synthesizer being graded PASS against a prompt with no Synthesizer terminus',
    error_code: 'INV_AUDIT_ROUTED_TO_BUILDER',
  },
  {
    id: 'INV-10',
    statement: 'BlockedOutput and FailedOutput do not inherit ready-payload requirements.',
    owner: 'schema',
    prevents: 'the v1 defect where a blocked new run failed its own schema',
    error_code: 'INV_BLOCKED_REQUIRES_READY_PAYLOAD',
  },
  {
    id: 'INV-11',
    statement: 'Any active blocking gap deterministically yields status blocked and next_route null.',
    owner: 'deterministic-composer',
    prevents: 'the v1 defect where route: builder plus a blocking flag validated cleanly',
    error_code: 'INV_BLOCKING_GAP_WITH_FORWARD_ROUTE',
  },
  {
    id: 'INV-12',
    statement: 'change_status appears only on SemanticDelta items.',
    owner: 'schema',
    prevents: 'the earlier SA-13 wording placing it globally on SemanticBrief (corrected by §5.7)',
    error_code: 'INV_CHANGE_STATUS_MISPLACED',
  },
  {
    id: 'INV-13',
    statement: 'mode appears only on mode-bearing source or typed-resolution records.',
    owner: 'schema',
    error_code: 'INV_MODE_MISPLACED',
  },
  {
    id: 'INV-14',
    statement: 'A short video is represented only by reference, hash, duration, extraction status and artifact references. Raw frames and full transcripts are never inlined.',
    owner: 'schema',
    error_code: 'INV_VIDEO_CONTENT_INLINED',
  },
  {
    id: 'INV-15',
    statement: 'Every invariant names exactly one enforcement owner.',
    owner: 'semantic-validator',
    prevents: 'an invariant nominally owned by two layers and actually enforced by neither',
    error_code: 'INV_OWNER_AMBIGUOUS',
  },
  {
    id: 'INV-16',
    statement: 'Every clarification gap has a stable gap_id, a lifecycle state, an explicit owner, a blocking severity, evidence and a required answer.',
    owner: 'schema',
    error_code: 'INV_GAP_INCOMPLETE',
  },
  {
    id: 'INV-17',
    statement: 'Array length is never used as clarification convergence evidence.',
    owner: 'semantic-validator',
    prevents: 'treating "fewer gaps this round" as progress when a gap was silently dropped',
    error_code: 'INV_CONVERGENCE_FROM_ARRAY_LENGTH',
  },
  {
    id: 'INV-18',
    statement: 'Failures distinguish invalid input, hard dependency failure, optional enrichment failure, partial audit extraction, timeout, validation failure and cancellation.',
    owner: 'schema',
    error_code: 'INV_FAILURE_CLASS_UNSPECIFIC',
  },
  {
    id: 'INV-19',
    statement: 'ApprovalRecord binds the approved artifact SHA-256 and carries gate_mode.',
    owner: 'schema',
    prevents: 'an approval that refers to a moment in time rather than to a specific artifact',
    error_code: 'INV_APPROVAL_UNBOUND',
  },
  {
    id: 'INV-20',
    statement: 'Phase 1 uses gate_mode observe-only-validation.',
    owner: 'human-gate',
    prevents: 'an observation-only run being mistaken for an authorising one',
    error_code: 'INV_GATE_MODE_NOT_OBSERVE_ONLY',
  },
  {
    id: 'INV-21',
    statement: 'Large artifacts are passed by reference and hash, never inline.',
    owner: 'schema',
    error_code: 'INV_LARGE_ARTIFACT_INLINED',
  },
  {
    id: 'INV-22',
    statement: 'Every contract object rejects unknown fields.',
    owner: 'schema',
    prevents: 'the v1 schema having zero occurrences of additionalProperties or unevaluatedProperties (SA-12)',
    error_code: 'INV_UNKNOWN_FIELD_ACCEPTED',
  },
  {
    id: 'INV-23',
    statement: 'Aggregate confidence takes the weakest child, never an average.',
    owner: 'deterministic-composer',
    prevents: 'a low-confidence resolution hiding inside a high aggregate',
    error_code: 'INV_CONFIDENCE_AVERAGED',
  },
  {
    id: 'INV-24',
    statement: 'An interaction-state coverage gap travels as a Disclosure and can never produce blocked status.',
    owner: 'schema',
    prevents: 'a non-blocking advisory tripping the blocking-gap rule (decision D-D, finding C7)',
    error_code: 'INV_DISCLOSURE_BLOCKED_A_RUN',
  },
  {
    id: 'INV-25',
    statement: 'Every excluded region of an observed tree is recorded in ExtractionCoverage.',
    owner: 'semantic-validator',
    prevents: 'an unrecorded exclusion making audit coverage unfalsifiable (SA-8)',
    error_code: 'INV_UNRECORDED_TREE_EXCLUSION',
  },
  {
    id: 'INV-26',
    statement: 'Semantic ids are unique within an output.',
    owner: 'semantic-validator',
    error_code: 'INV_DUPLICATE_SEMANTIC_ID',
  },
  {
    id: 'INV-27',
    statement: 'The variant/property model is preserved in SemanticBrief and SemanticDelta.',
    owner: 'schema',
    prevents: 'the modify route regressing against v1, whose own worked example adds a state to a variant axis (decision D-D.3)',
    error_code: 'INV_VARIANT_MODEL_MISSING',
  },
];

export const INVARIANTS_BY_ID: ReadonlyMap<string, Invariant> = new Map(
  INVARIANTS.map((invariant) => [invariant.id, invariant]),
);

export function invariantsOwnedBy(owner: EnforcementOwner): readonly Invariant[] {
  return INVARIANTS.filter((invariant) => invariant.owner === owner);
}

export function lookupByErrorCode(errorCode: string): Invariant | undefined {
  return INVARIANTS.find((invariant) => invariant.error_code === errorCode);
}
