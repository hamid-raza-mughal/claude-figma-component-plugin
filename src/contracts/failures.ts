/**
 * Failure classification (P1-FINAL §14.3.18).
 *
 * Seven classes are required, and the distinctions are operational rather than
 * cosmetic — each implies a different response:
 *
 *   - `invalid-input` and `hard-dependency-failure` mean stop.
 *   - `optional-enrichment-failure` means proceed and disclose.
 *   - `partial-audit-extraction` means proceed with recorded coverage, because
 *     an unrecorded exclusion makes audit coverage unfalsifiable (`SA-8`).
 *   - `timeout` is the outcome the earlier lifecycle model could not express.
 *   - `validation-failure` is eligible for exactly one compact repair call.
 *   - `cancellation` is not a defect and must never be reported as one.
 *
 * Collapsing these into a single "error" is how a recoverable condition comes to
 * look like a broken run, and how a broken run comes to look recoverable.
 */

export const FAILURE_CLASSES = [
  'invalid-input',
  'hard-dependency-failure',
  'optional-enrichment-failure',
  'partial-audit-extraction',
  'timeout',
  'validation-failure',
  'cancellation',
] as const;

export type FailureClass = (typeof FAILURE_CLASSES)[number];

/** Whether a class permits the run to continue. Encoded so the policy is one
 *  lookup rather than a conditional repeated at each call site. */
export const FAILURE_IS_TERMINAL: Readonly<Record<FailureClass, boolean>> = {
  'invalid-input': true,
  'hard-dependency-failure': true,
  'optional-enrichment-failure': false,
  'partial-audit-extraction': false,
  timeout: true,
  'validation-failure': false,
  cancellation: true,
};

/** Whether a class is eligible for the single compact repair call (§15.5).
 *  Only validation failures are: a repair call cannot conjure a missing
 *  dependency, and retrying an invalid input just spends budget. */
export const FAILURE_IS_REPAIRABLE: Readonly<Record<FailureClass, boolean>> = {
  'invalid-input': false,
  'hard-dependency-failure': false,
  'optional-enrichment-failure': false,
  'partial-audit-extraction': false,
  timeout: false,
  'validation-failure': true,
  cancellation: false,
};

/**
 * Evidence attached to a failure. `enforced_by` names the owner, so every
 * invariant has exactly one accountable enforcement point (§14.3.15).
 */
export const ENFORCEMENT_OWNERS = [
  'schema',
  'semantic-validator',
  'reference-validator',
  'deterministic-composer',
  'renderer',
  'human-gate',
  'run-guard',
] as const;

export type EnforcementOwner = (typeof ENFORCEMENT_OWNERS)[number];

export type FailureEvidence = {
  /** Stable machine-readable code. Never free prose — a repair prompt has to be
   *  compact and a metric has to be groupable. */
  readonly code: string;
  readonly message: string;
  /** JSON Pointer into the offending instance, when applicable. */
  readonly instance_path?: string | undefined;
  /** JSON Pointer into the contract — the location, not just the symptom. */
  readonly contract_path?: string | undefined;
  readonly enforced_by: EnforcementOwner;
};

export type FailureReport = {
  readonly failure_class: FailureClass;
  readonly terminal: boolean;
  readonly repairable: boolean;
  readonly evidence: readonly FailureEvidence[];
  readonly occurred_at: string;
};

export function classifyFailure(
  failureClass: FailureClass,
  evidence: readonly FailureEvidence[],
  occurredAt: string,
): FailureReport {
  return {
    failure_class: failureClass,
    terminal: FAILURE_IS_TERMINAL[failureClass],
    repairable: FAILURE_IS_REPAIRABLE[failureClass],
    evidence,
    occurred_at: occurredAt,
  };
}
