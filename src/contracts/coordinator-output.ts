/**
 * The closed output union (§14.2) — what deterministic code composes.
 *
 * Three defects in the v1 schema are structurally impossible here, not merely
 * validated against:
 *
 *   1. **Blocked and failed outputs no longer inherit a ready payload.** In v1 a
 *      blocked `new` run failed its own schema, because `allOf` demanded a brief
 *      that a blocked run by definition does not have.
 *   2. **A blocking gap forces `blocked` and a null route.** In v1 blocking
 *      severity had no route effect, so `route: builder` alongside a blocking flag
 *      validated cleanly.
 *   3. **`audit` cannot reach Builder.** `AuditReadyOutput.next_route` is the
 *      literal `'synthesizer'`, so the wrong value is a type error rather than a
 *      runtime check.
 *
 * Each variant carries only its own fields. `next_route` is `null` on blocked and
 * failed — a value, not an omission, so it cannot be defaulted.
 */
import type { RunType } from './invocation.ts';
import type { TypedResolution, ClarificationGap, Disclosure } from './resolution.ts';
import type { FailureReport } from './failures.ts';
import type { CuratedSnapshotRef } from './source.ts';
import type {
  SemanticBrief,
  SemanticDelta,
  AuditBrief,
  PreservationContract,
  ExtractionCoverage,
} from './semantic.ts';
import type { ObservedComponentTreeRef } from './invocation.ts';
import type { ObservedTreeExcerpt } from './observed-tree.ts';

export const OUTPUT_STATUSES = ['ready', 'blocked', 'failed'] as const;
export type OutputStatus = (typeof OUTPUT_STATUSES)[number];

/**
 * Fields every variant carries.
 *
 * `snapshot` is here rather than optional: an output that cannot say which source
 * it was composed against is not auditable, and that applies to a failure as much
 * as to a success.
 */
export type OutputCommon = {
  readonly run_id: string;
  readonly spec_schema_version: string;
  readonly snapshot: CuratedSnapshotRef;
  readonly composed_at: string;
  /** Non-blocking disclosures. Present on every variant, including blocked and
   *  failed — a disclosure is information, and withholding it on failure is how
   *  a known limitation becomes invisible. */
  readonly disclosures: readonly Disclosure[];
};

export type NewReadyOutput = OutputCommon & {
  readonly status: 'ready';
  readonly run_type: 'new';
  readonly next_route: 'builder';
  readonly semantic_brief: SemanticBrief;
  readonly resolutions: readonly TypedResolution[];
  /** Trusted aggregate, computed from materialized resolutions — never taken from
   *  the model (§16.1 step 8). */
  readonly aggregate_confidence: 'high' | 'medium' | 'low';
};

export type ModifyReadyOutput = OutputCommon & {
  readonly status: 'ready';
  readonly run_type: 'modify';
  readonly next_route: 'builder';
  readonly target: ObservedComponentTreeRef;
  readonly semantic_delta: SemanticDelta;
  readonly preservation_contract: PreservationContract;
  readonly resolutions: readonly TypedResolution[];
  readonly aggregate_confidence: 'high' | 'medium' | 'low';
  readonly excerpts?: readonly ObservedTreeExcerpt[] | undefined;
};

export type AuditReadyOutput = OutputCommon & {
  readonly status: 'ready';
  readonly run_type: 'audit';
  /** A literal. `audit` → Builder is a type error, not a runtime rejection. */
  readonly next_route: 'synthesizer';
  readonly target: ObservedComponentTreeRef;
  readonly audit_brief: AuditBrief;
  readonly extraction_coverage: ExtractionCoverage;
  /** Present only where the audit resolved references. An audit need not resolve
   *  anything to be valid. */
  readonly resolutions?: readonly TypedResolution[] | undefined;
  readonly excerpts?: readonly ObservedTreeExcerpt[] | undefined;
};

/**
 * Blocked: active gaps, no forward route, **no ready payload required**.
 *
 * This is defect 1 fixed. A blocked run legitimately has no brief, and a schema
 * demanding one made a blocked `new` run unrepresentable.
 */
export type BlockedOutput = OutputCommon & {
  readonly status: 'blocked';
  readonly run_type: RunType;
  readonly next_route: null;
  readonly active_gaps: readonly ClarificationGap[];
  /** Partial resolutions already verified, if any. Discarding verified work on a
   *  block would force needless re-resolution after clarification. */
  readonly partial_resolutions?: readonly TypedResolution[] | undefined;
};

export type FailedOutput = OutputCommon & {
  readonly status: 'failed';
  readonly run_type: RunType;
  readonly next_route: null;
  readonly failure: FailureReport;
};

/** The closed union. No variant may carry another's fields. */
export type CoordinatorOutput =
  | NewReadyOutput
  | ModifyReadyOutput
  | AuditReadyOutput
  | BlockedOutput
  | FailedOutput;

export function isReady(
  output: CoordinatorOutput,
): output is NewReadyOutput | ModifyReadyOutput | AuditReadyOutput {
  return output.status === 'ready';
}

/**
 * Fields belonging to exactly one variant, used to reject cross-variant leakage.
 *
 * Enumerated rather than derived: a derived list would silently absorb a new field
 * and stop rejecting it, which is the opposite of what this is for.
 */
export const VARIANT_EXCLUSIVE_FIELDS: Readonly<Record<string, readonly string[]>> = {
  'new-ready': ['semantic_brief', 'aggregate_confidence'],
  'modify-ready': ['semantic_delta', 'preservation_contract', 'aggregate_confidence'],
  'audit-ready': ['audit_brief', 'extraction_coverage'],
  blocked: ['active_gaps'],
  failed: ['failure'],
};

/** Fields that must never appear together, whatever the status. */
export const MUTUALLY_EXCLUSIVE_PAYLOADS: readonly (readonly [string, string])[] = [
  ['semantic_brief', 'semantic_delta'],
  ['semantic_brief', 'audit_brief'],
  ['semantic_delta', 'audit_brief'],
  ['active_gaps', 'semantic_brief'],
  ['active_gaps', 'semantic_delta'],
  ['active_gaps', 'audit_brief'],
  ['failure', 'semantic_brief'],
  ['failure', 'semantic_delta'],
  ['failure', 'audit_brief'],
  ['failure', 'active_gaps'],
];

/** Variant key for an output, used for schema selection and error messages. */
export function variantKeyOf(output: CoordinatorOutput): string {
  return output.status === 'ready' ? `${output.run_type}-ready` : output.status;
}

/**
 * Aggregate confidence, computed from materialized resolutions.
 *
 * **Takes the weakest child, not an average.** Averaging is how a low-confidence
 * resolution hides inside a high aggregate — one of the enumerated adversarial
 * cases (§17.2), and a real failure mode rather than a hypothetical one.
 */
export function aggregateConfidence(
  perResolution: readonly ('high' | 'medium' | 'low')[],
): 'high' | 'medium' | 'low' {
  if (perResolution.length === 0) return 'low';
  if (perResolution.includes('low')) return 'low';
  if (perResolution.includes('medium')) return 'medium';
  return 'high';
}
