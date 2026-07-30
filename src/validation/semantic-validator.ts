/**
 * Semantic validators (§16.2) — the invariants a schema cannot express.
 *
 * A schema can say "this field is a string". It cannot say "a blocking gap forces
 * blocked status", "semantic ids are unique", or "a count is not convergence
 * evidence". Those live here, as **pure functions** returning findings rather than
 * throwing, so one pass can report everything and a single repair call can address
 * it all (§15.5).
 *
 * Every finding carries a stable code, the contract location, and the **owner** —
 * so a failure is attributable rather than merely visible.
 */
import { findOperationalLeaks } from '../contracts/run-envelope.ts';
import { findAuthoredTreeLeaks } from '../contracts/coordinator-draft.ts';
import { hasBlockingGap, isBlockingGap } from '../contracts/resolution.ts';
import { isCoverageAccounted } from '../contracts/semantic.ts';
import { INVARIANTS_BY_ID } from './invariant-registry.ts';
import type { FailureEvidence } from '../contracts/failures.ts';
import type { ClarificationGap } from '../contracts/resolution.ts';
import type { CoordinatorJudgmentDraft } from '../contracts/coordinator-draft.ts';
import type { SemanticBrief, SemanticDelta, AuditBrief } from '../contracts/semantic.ts';
import type { RunType } from '../contracts/invocation.ts';

/** A validator finding. Shaped as failure evidence so it composes into a report
 *  without translation. */
export type Finding = FailureEvidence;

function finding(invariantId: string, message: string, instancePath?: string): Finding {
  const invariant = INVARIANTS_BY_ID.get(invariantId);
  if (invariant === undefined) {
    throw new Error(`unknown invariant id: ${invariantId}`);
  }
  return {
    code: invariant.error_code,
    message,
    enforced_by: invariant.owner,
    contract_path: `#/invariants/${invariantId}`,
    ...(instancePath === undefined ? {} : { instance_path: instancePath }),
  };
}

/** INV-04: no operational field anywhere in a model draft. */
export function validateNoOperationalFields(draft: CoordinatorJudgmentDraft): readonly Finding[] {
  return findOperationalLeaks(draft).map((leak) =>
    finding('INV-04', `draft carries the operational field "${leak.field}"`, leak.path),
  );
}

/** INV-07 / INV-08: no authored implementation tree. */
export function validateNoAuthoredTree(
  payload: unknown,
  runType: RunType,
): readonly Finding[] {
  const invariantId = runType === 'modify' ? 'INV-08' : 'INV-07';
  return findAuthoredTreeLeaks(payload).map((leak) =>
    finding(
      invariantId,
      leak.kind === 'figma-node-type'
        ? `payload names the Figma node type "${leak.detail}" — Builder owns the node hierarchy`
        : `payload carries the implementation-tree field "${leak.detail}"`,
      leak.path,
    ),
  );
}

/**
 * INV-26: semantic ids are unique.
 *
 * Duplicates are not cosmetic: bindings attach to ids, so two elements sharing one
 * makes the mapping from intent to built node ambiguous — and `nodeMap` is what
 * post-build validation depends on.
 */
export function validateSemanticIdUniqueness(
  brief: SemanticBrief | undefined,
  delta: SemanticDelta | undefined,
): readonly Finding[] {
  const findings: Finding[] = [];
  const seen = new Set<string>();
  for (const element of brief?.elements ?? []) {
    if (seen.has(element.semantic_id)) {
      findings.push(
        finding('INV-26', `duplicate semantic_id "${element.semantic_id}"`, `/elements/${element.semantic_id}`),
      );
    }
    seen.add(element.semantic_id);
  }
  const deltaIds = new Set<string>();
  for (const item of delta?.items ?? []) {
    if (deltaIds.has(item.delta_id)) {
      findings.push(finding('INV-26', `duplicate delta_id "${item.delta_id}"`, `/items/${item.delta_id}`));
    }
    deltaIds.add(item.delta_id);
  }
  return findings;
}

/** A parent reference that names no element makes the structure unreconstructable. */
export function validateParentReferences(brief: SemanticBrief | undefined): readonly Finding[] {
  if (brief === undefined) return [];
  const ids = new Set(brief.elements.map((element) => element.semantic_id));
  return brief.elements
    .filter(
      (element) =>
        element.parent_semantic_id !== undefined && !ids.has(element.parent_semantic_id),
    )
    .map((element) =>
      finding(
        'INV-26',
        `element "${element.semantic_id}" names parent "${String(element.parent_semantic_id)}", which is not an element`,
        `/elements/${element.semantic_id}/parent_semantic_id`,
      ),
    );
}

/**
 * INV-11: a blocking gap forces blocked status and a null route.
 *
 * Checked here rather than trusted from the draft's `self_assessment`, because the
 * v1 defect was exactly a forward route surviving alongside a blocking flag.
 */
export function validateBlockingGapForcesBlocked(
  gaps: readonly ClarificationGap[] | undefined,
  proposedStatus: 'ready' | 'blocked' | 'failed',
): readonly Finding[] {
  if (gaps === undefined) return [];
  if (hasBlockingGap(gaps) && proposedStatus === 'ready') {
    const blocking = gaps.filter(isBlockingGap).map((gap) => gap.gap_id);
    return [
      finding(
        'INV-11',
        `status "ready" with active blocking gaps: ${blocking.join(', ')}. A blocking gap forces blocked and a null route.`,
        '/clarification_gaps',
      ),
    ];
  }
  return [];
}

/** INV-16: a gap must be complete enough to be answerable. */
export function validateGapCompleteness(
  gaps: readonly ClarificationGap[] | undefined,
): readonly Finding[] {
  const findings: Finding[] = [];
  const seen = new Set<string>();
  for (const gap of gaps ?? []) {
    const path = `/clarification_gaps/${gap.gap_id}`;
    if (gap.gap_id.trim() === '') {
      findings.push(finding('INV-16', 'gap has no id, so it cannot be tracked across rounds', path));
    }
    if (seen.has(gap.gap_id)) {
      findings.push(finding('INV-16', `duplicate gap_id "${gap.gap_id}"`, path));
    }
    seen.add(gap.gap_id);
    if (gap.required_answer.trim() === '') {
      findings.push(
        finding('INV-16', `gap "${gap.gap_id}" does not say what answer would resolve it`, path),
      );
    }
    if (gap.evidence.trim() === '') {
      findings.push(finding('INV-16', `gap "${gap.gap_id}" carries no evidence`, path));
    }
  }
  return findings;
}

/**
 * INV-17: array length is never convergence evidence.
 *
 * A gap that was *dropped* and a gap that was *resolved* look identical in a count.
 * Convergence therefore requires each earlier gap to appear as `resolved`, not
 * merely to be absent.
 */
export function validateClarificationConvergence(
  previousGaps: readonly ClarificationGap[],
  currentGaps: readonly ClarificationGap[],
): readonly Finding[] {
  const currentById = new Map(currentGaps.map((gap) => [gap.gap_id, gap]));
  return previousGaps
    .filter((previous) => {
      const current = currentById.get(previous.gap_id);
      return current === undefined && previous.state !== 'resolved';
    })
    .map((previous) =>
      finding(
        'INV-17',
        `gap "${previous.gap_id}" disappeared without being marked resolved — absence is not resolution`,
        `/clarification_gaps/${previous.gap_id}`,
      ),
    );
}

/** INV-25: extraction coverage must account for every node. */
export function validateExtractionCoverage(
  coverage: Parameters<typeof isCoverageAccounted>[0] | undefined,
): readonly Finding[] {
  if (coverage === undefined) return [];
  const findings: Finding[] = [];
  if (!isCoverageAccounted(coverage)) {
    const excluded = coverage.exclusions.reduce((total, item) => total + (item.node_count ?? 0), 0);
    findings.push(
      finding(
        'INV-25',
        `coverage does not account for every node: ${coverage.examined_nodes} examined + ${excluded} excluded ` +
          `!= ${coverage.total_nodes} total. An unrecorded exclusion makes the audit unfalsifiable.`,
        '/extraction_coverage',
      ),
    );
  }
  if (coverage.fully_accounted && !isCoverageAccounted(coverage)) {
    findings.push(
      finding(
        'INV-25',
        'coverage claims fully_accounted but the arithmetic disagrees',
        '/extraction_coverage/fully_accounted',
      ),
    );
  }
  for (const exclusion of coverage.exclusions) {
    if (exclusion.reason.trim() === '') {
      findings.push(
        finding('INV-25', `exclusion at "${exclusion.locator}" gives no reason`, '/extraction_coverage/exclusions'),
      );
    }
  }
  return findings;
}

/**
 * INV-27: the variant/property model survives.
 *
 * Without it the `modify` route regresses against v1, whose own worked example adds
 * a state to a variant axis (decision D-D.3).
 */
export function validateVariantModel(
  brief: SemanticBrief | undefined,
  delta: SemanticDelta | undefined,
): readonly Finding[] {
  const findings: Finding[] = [];
  if (brief !== undefined && !Array.isArray(brief.variant_properties)) {
    findings.push(finding('INV-27', 'semantic brief carries no variant_properties array', '/semantic_brief'));
  }
  for (const property of brief?.variant_properties ?? []) {
    if (property.options.length === 0) {
      findings.push(
        finding('INV-27', `variant axis "${property.name}" declares no options`, `/variant_properties/${property.name}`),
      );
    }
    if (
      property.default_option !== undefined &&
      !property.options.includes(property.default_option)
    ) {
      findings.push(
        finding(
          'INV-27',
          `variant axis "${property.name}" defaults to "${property.default_option}", which is not one of its options`,
          `/variant_properties/${property.name}/default_option`,
        ),
      );
    }
  }
  for (const item of delta?.items ?? []) {
    const transition = item.variant_transition;
    if (transition === undefined) continue;
    // A state change that does not state its transition is the ambiguity D-D.3
    // exists to remove: "added disabled" and "replaced the axis" must be
    // distinguishable.
    if (transition.options_after.length === 0) {
      findings.push(
        finding(
          'INV-27',
          `delta "${item.delta_id}" leaves variant axis "${transition.property_name}" with no options`,
          `/items/${item.delta_id}/variant_transition`,
        ),
      );
    }
    if (item.change_status === 'add') {
      const removed = transition.options_before.filter(
        (option) => !transition.options_after.includes(option),
      );
      if (removed.length > 0) {
        findings.push(
          finding(
            'INV-27',
            `delta "${item.delta_id}" is change_status "add" but removes options: ${removed.join(', ')}`,
            `/items/${item.delta_id}/variant_transition`,
          ),
        );
      }
    }
  }
  return findings;
}

/** A binding scoped to an option that does not exist cannot be applied. */
export function validateBindingOptions(brief: SemanticBrief | undefined): readonly Finding[] {
  if (brief === undefined) return [];
  const options = new Set(brief.variant_properties.flatMap((property) => property.options));
  const findings: Finding[] = [];
  for (const element of brief.elements) {
    for (const binding of element.bindings) {
      if (binding.applies_to_option !== undefined && !options.has(binding.applies_to_option)) {
        findings.push(
          finding(
            'INV-27',
            `binding on "${element.semantic_id}" applies to option "${binding.applies_to_option}", ` +
              'which no variant axis declares',
            `/elements/${element.semantic_id}/bindings`,
          ),
        );
      }
    }
  }
  return findings;
}

/** Route and payload must agree — a `new` draft carrying an audit brief is a
 *  category error, not a formatting slip. */
export function validateRoutePayloadAgreement(draft: CoordinatorJudgmentDraft): readonly Finding[] {
  const present: string[] = [];
  if (draft.semantic_brief !== undefined) present.push('semantic_brief');
  if (draft.semantic_delta !== undefined) present.push('semantic_delta');
  if (draft.audit_brief !== undefined) present.push('audit_brief');

  const expected =
    draft.run_type === 'new' ? 'semantic_brief' : draft.run_type === 'modify' ? 'semantic_delta' : 'audit_brief';

  const findings: Finding[] = [];
  if (present.length !== 1) {
    findings.push(
      finding(
        'INV-01',
        present.length === 0
          ? `route "${draft.run_type}" requires a ${expected} and none is present`
          : `exactly one payload is permitted; found ${present.join(', ')}`,
        '/',
      ),
    );
  } else if (present[0] !== expected) {
    findings.push(
      finding('INV-01', `route "${draft.run_type}" requires ${expected}, found ${String(present[0])}`, '/'),
    );
  }
  return findings;
}

export type SemanticValidationInput = {
  readonly draft: CoordinatorJudgmentDraft;
  readonly proposedStatus: 'ready' | 'blocked' | 'failed';
  readonly previousGaps?: readonly ClarificationGap[] | undefined;
  readonly auditCoverage?: Parameters<typeof isCoverageAccounted>[0] | undefined;
};

/** Runs every semantic validator in one pass and returns all findings. */
export function validateSemantics(input: SemanticValidationInput): readonly Finding[] {
  const { draft } = input;
  const payload: SemanticBrief | SemanticDelta | AuditBrief | undefined =
    draft.semantic_brief ?? draft.semantic_delta ?? draft.audit_brief;

  return [
    ...validateRoutePayloadAgreement(draft),
    ...validateNoOperationalFields(draft),
    ...validateNoAuthoredTree(payload, draft.run_type),
    ...validateSemanticIdUniqueness(draft.semantic_brief, draft.semantic_delta),
    ...validateParentReferences(draft.semantic_brief),
    ...validateBlockingGapForcesBlocked(draft.clarification_gaps, input.proposedStatus),
    ...validateGapCompleteness(draft.clarification_gaps),
    ...validateClarificationConvergence(input.previousGaps ?? [], draft.clarification_gaps ?? []),
    ...validateExtractionCoverage(input.auditCoverage),
    ...validateVariantModel(draft.semantic_brief, draft.semantic_delta),
    ...validateBindingOptions(draft.semantic_brief),
  ];
}
