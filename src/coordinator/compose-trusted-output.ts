/**
 * The 11-step validation and composition sequence (§16.1).
 *
 * The boundary this module *is*: **no model-generated operational field survives it.**
 * A draft goes in; a trusted output comes out, composed entirely from the index and
 * the run envelope. Everything the model said about a token is verified; everything
 * it said about the run is discarded.
 *
 * The steps are named and reported so a failure is attributable to a step rather
 * than to "validation". An opaque pipeline is one nobody can debug, and this is the
 * one place where being able to say *where* it stopped matters most.
 */
import { createHash } from 'node:crypto';
import { ROUTE_POLICY } from '../contracts/invocation.ts';
import { aggregateConfidence } from '../contracts/coordinator-output.ts';
import { collectSelectedCandidateIds } from '../contracts/coordinator-draft.ts';
import { hasBlockingGap } from '../contracts/resolution.ts';
import { classifyFailure } from '../contracts/failures.ts';
import { validateSemantics, type Finding } from '../validation/semantic-validator.ts';
import { validateReferences, type ResolutionLookupPort } from '../validation/reference-validator.ts';
import type { SchemaRegistry } from '../validation/schema-validator.ts';
import type { CoordinatorJudgmentDraft } from '../contracts/coordinator-draft.ts';
import type { ResolvedCoordinatorInvocation } from '../contracts/invocation.ts';
import type { CuratedSnapshotRef } from '../contracts/source.ts';
import type { Disclosure, TypedResolution, Confidence } from '../contracts/resolution.ts';
import type { CoordinatorOutput } from '../contracts/coordinator-output.ts';
import type { PreservationContract, ExtractionCoverage } from '../contracts/semantic.ts';
import type { ObservedTreeExcerpt } from '../contracts/observed-tree.ts';

export const COMPOSITION_STEPS = [
  '1-draft-schema',
  '2-route-payload-compatibility',
  '3-resolve-selections',
  '4-verify-snapshot',
  '5-materialize-resolutions',
  '6-cross-record-semantics',
  '7-reject-altered-references',
  '8-trusted-aggregate',
  '9-compose-output',
  '10-validate-output-schema',
] as const;

export type CompositionStep = (typeof COMPOSITION_STEPS)[number];

export const DRAFT_SCHEMA_ID = 'https://adalfi.dev/schemas/coordinator/coordinator-judgment-draft.schema.json';
export const OUTPUT_SCHEMA_ID = 'https://adalfi.dev/schemas/coordinator/coordinator-output.schema.json';
export const SPEC_SCHEMA_VERSION = '2.0.0';

export type CompositionSuccess = {
  readonly ok: true;
  readonly output: CoordinatorOutput;
  /** SHA-256 of the canonical output. Both renderers bind to it, which is how
   *  "rendered from the same object" becomes provable rather than asserted. */
  readonly output_sha256: string;
  readonly steps_completed: readonly CompositionStep[];
};

export type CompositionFailure = {
  readonly ok: false;
  /** Where it stopped. Naming the step is what makes a failure debuggable. */
  readonly failed_step: CompositionStep;
  readonly findings: readonly Finding[];
  readonly steps_completed: readonly CompositionStep[];
  /** A blocked or failed output is still composed — a run that cannot proceed still
   *  owes the human an explanation in the same shape as a success. */
  readonly output?: CoordinatorOutput | undefined;
  readonly output_sha256?: string | undefined;
};

export type CompositionResult = CompositionSuccess | CompositionFailure;

/** Everything deterministic code needs. Note what is absent: no model client, and a
 *  read-only lookup port. */
export type ComposeInput = {
  readonly invocation: ResolvedCoordinatorInvocation;
  readonly draft: CoordinatorJudgmentDraft;
  readonly snapshot: CuratedSnapshotRef;
  readonly port: ResolutionLookupPort;
  readonly registry: SchemaRegistry;
  /** Materializer output, keyed by candidate id. Supplied rather than fetched so the
   *  composer stays pure and testable without a database. */
  readonly materialized: ReadonlyMap<string, TypedResolution>;
  readonly perResolutionConfidence?: ReadonlyMap<string, Confidence> | undefined;
  readonly disclosures?: readonly Disclosure[] | undefined;
  readonly preservationContract?: PreservationContract | undefined;
  readonly extractionCoverage?: ExtractionCoverage | undefined;
  readonly excerpts?: readonly ObservedTreeExcerpt[] | undefined;
  readonly composedAt: string;
};

/** Canonical JSON hash — key-sorted so formatting cannot change the identity of an
 *  output the human is about to approve. */
export function hashOutput(output: CoordinatorOutput): string {
  return createHash('sha256').update(canonical(output), 'utf8').digest('hex');
}

function canonical(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, child]) => child !== undefined)
      .sort(([a], [b]) => a.localeCompare(b, 'en'));
    return `{${entries.map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function toFinding(code: string, message: string, path?: string): Finding {
  return {
    code,
    message,
    enforced_by: 'deterministic-composer',
    ...(path === undefined ? {} : { instance_path: path }),
  };
}

export function composeTrustedOutput(input: ComposeInput): CompositionResult {
  const completed: CompositionStep[] = [];
  const { draft, invocation, snapshot } = input;

  const common = {
    run_id: invocation.run_id,
    spec_schema_version: SPEC_SCHEMA_VERSION,
    snapshot,
    composed_at: input.composedAt,
    disclosures: input.disclosures ?? [],
  };

  const fail = (step: CompositionStep, findings: readonly Finding[]): CompositionFailure => {
    // A validation failure still produces a `failed` output: the human is owed an
    // explanation in the same shape as a success, not a bare exception.
    const output: CoordinatorOutput = {
      ...common,
      status: 'failed',
      run_type: invocation.run_type,
      next_route: null,
      failure: classifyFailure('validation-failure', findings, input.composedAt),
    };
    return {
      ok: false,
      failed_step: step,
      findings,
      steps_completed: [...completed],
      output,
      output_sha256: hashOutput(output),
    };
  };

  // ---- 1. Draft against its closed schema ----
  const draftResult = input.registry.validate(DRAFT_SCHEMA_ID, draft);
  if (!draftResult.ok) {
    return fail(
      '1-draft-schema',
      draftResult.violations.map((violation) => ({
        code: violation.code,
        message: violation.message,
        instance_path: violation.instancePath,
        contract_path: violation.schemaPath,
        enforced_by: 'schema' as const,
      })),
    );
  }
  completed.push('1-draft-schema');

  // ---- 2. Route / payload compatibility ----
  if (draft.run_type !== invocation.run_type) {
    return fail('2-route-payload-compatibility', [
      toFinding(
        'INV_ROUTE_ECHO_MISMATCH',
        `draft echoes run_type "${draft.run_type}" but the invocation is "${invocation.run_type}"`,
        '/run_type',
      ),
    ]);
  }
  const proposedStatus = hasBlockingGap(draft.clarification_gaps ?? []) ? 'blocked' : 'ready';
  const semanticFindings = validateSemantics({
    draft,
    proposedStatus,
    ...(input.extractionCoverage === undefined ? {} : { auditCoverage: input.extractionCoverage }),
  });
  if (semanticFindings.length > 0) {
    return fail('2-route-payload-compatibility', semanticFindings);
  }
  completed.push('2-route-payload-compatibility');

  // ---- 3. Resolve every selected candidate_id ----
  const selectedIds = collectSelectedCandidateIds(draft);
  const missing = selectedIds.filter((id) => !input.materialized.has(id));
  if (missing.length > 0) {
    return fail(
      '3-resolve-selections',
      missing.map((id) =>
        toFinding('INV_SELECTION_UNRESOLVED', `selected candidate_id "${id}" did not materialize`, '/bindings'),
      ),
    );
  }
  completed.push('3-resolve-selections');

  const resolutions: TypedResolution[] = selectedIds
    .map((id) => input.materialized.get(id))
    .filter((resolution): resolution is TypedResolution => resolution !== undefined);

  // ---- 4-7. Snapshot, materialization, cross-record semantics, altered references ----
  const referenceFindings = validateReferences({
    selectedIds,
    resolutions,
    bindings: bindingTriples(draft),
    port: input.port,
  });
  if (referenceFindings.length > 0) {
    // The failing step is reported precisely rather than as a range: a stale
    // snapshot and an altered path need different responses.
    const step: CompositionStep = referenceFindings.some((f) => /stale/i.test(f.message))
      ? '4-verify-snapshot'
      : referenceFindings.some((f) => /indexed record holds/.test(f.message))
        ? '7-reject-altered-references'
        : '5-materialize-resolutions';
    return fail(step, referenceFindings);
  }
  completed.push('4-verify-snapshot', '5-materialize-resolutions', '6-cross-record-semantics', '7-reject-altered-references');

  // ---- 8. Trusted aggregate ----
  const perResolution: Confidence[] = resolutions.map(
    (resolution) => input.perResolutionConfidence?.get(resolution.candidate_id) ?? 'medium',
  );
  const aggregate = aggregateConfidence(perResolution);
  completed.push('8-trusted-aggregate');

  // ---- 9. Compose the route-specific output ----
  let output: CoordinatorOutput;
  if (proposedStatus === 'blocked') {
    output = {
      ...common,
      status: 'blocked',
      run_type: invocation.run_type,
      next_route: null,
      active_gaps: (draft.clarification_gaps ?? []).filter(
        (gap) => gap.state === 'active' || gap.state === 'reopened',
      ),
      ...(resolutions.length === 0 ? {} : { partial_resolutions: resolutions }),
    };
  } else if (invocation.run_type === 'new') {
    if (draft.semantic_brief === undefined) {
      return fail('9-compose-output', [toFinding('INV_MISSING_PAYLOAD', 'new route has no semantic brief', '/')]);
    }
    output = {
      ...common,
      status: 'ready',
      run_type: 'new',
      // ROUTE_POLICY yields the literal 'builder', so the union cannot widen here.
      next_route: ROUTE_POLICY.new,
      semantic_brief: draft.semantic_brief,
      resolutions,
      aggregate_confidence: aggregate,
    };
  } else if (invocation.run_type === 'modify') {
    if (draft.semantic_delta === undefined || input.preservationContract === undefined || invocation.target === undefined) {
      return fail('9-compose-output', [
        toFinding(
          'INV_MISSING_PAYLOAD',
          'modify route requires a semantic delta, a preservation contract and a target',
          '/',
        ),
      ]);
    }
    output = {
      ...common,
      status: 'ready',
      run_type: 'modify',
      next_route: ROUTE_POLICY.modify,
      target: invocation.target,
      semantic_delta: draft.semantic_delta,
      preservation_contract: input.preservationContract,
      resolutions,
      aggregate_confidence: aggregate,
      ...(input.excerpts === undefined ? {} : { excerpts: input.excerpts }),
    };
  } else {
    if (draft.audit_brief === undefined || input.extractionCoverage === undefined || invocation.target === undefined) {
      return fail('9-compose-output', [
        toFinding(
          'INV_MISSING_PAYLOAD',
          'audit route requires an audit brief, extraction coverage and a target',
          '/',
        ),
      ]);
    }
    output = {
      ...common,
      status: 'ready',
      run_type: 'audit',
      // Not read from the draft: the literal is the guarantee (§14.2).
      next_route: 'synthesizer',
      target: invocation.target,
      audit_brief: draft.audit_brief,
      extraction_coverage: input.extractionCoverage,
      ...(resolutions.length === 0 ? {} : { resolutions }),
      ...(input.excerpts === undefined ? {} : { excerpts: input.excerpts }),
    };
  }
  completed.push('9-compose-output');

  // ---- 10. The complete trusted output against its schema ----
  const outputResult = input.registry.validate(OUTPUT_SCHEMA_ID, output);
  if (!outputResult.ok) {
    return fail(
      '10-validate-output-schema',
      outputResult.violations.map((violation) => ({
        code: violation.code,
        message: violation.message,
        instance_path: violation.instancePath,
        contract_path: violation.schemaPath,
        enforced_by: 'schema' as const,
      })),
    );
  }
  completed.push('10-validate-output-schema');

  return { ok: true, output, output_sha256: hashOutput(output), steps_completed: completed };
}

/** Element/property/candidate triples, for collision detection. */
function bindingTriples(
  draft: CoordinatorJudgmentDraft,
): readonly { readonly semantic_id: string; readonly property: string; readonly candidate_id: string }[] {
  const triples: { semantic_id: string; property: string; candidate_id: string }[] = [];
  for (const element of draft.semantic_brief?.elements ?? []) {
    for (const binding of element.bindings) {
      triples.push({
        semantic_id: element.semantic_id,
        property: binding.property,
        candidate_id: binding.selected_candidate_id,
      });
    }
  }
  for (const item of draft.semantic_delta?.items ?? []) {
    for (const binding of item.bindings ?? []) {
      triples.push({
        semantic_id: item.target_semantic_id ?? item.delta_id,
        property: binding.property,
        candidate_id: binding.selected_candidate_id,
      });
    }
  }
  return triples;
}
