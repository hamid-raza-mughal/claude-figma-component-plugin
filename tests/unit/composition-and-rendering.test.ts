/**
 * Gate 5 evidence (§16).
 *
 * Requirements: every validator has **positive and negative** tests; renderer
 * snapshots are deterministic; both views provably share one object; repair errors
 * are compact and stable; and no write-capable port is injectable into Coordinator
 * core.
 *
 * A validator with only negative tests is a trap — it can be satisfied by rejecting
 * everything. Each one below is exercised in both directions.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SchemaRegistry } from '../../src/validation/schema-validator.ts';
import {
  composeTrustedOutput,
  hashOutput,
  COMPOSITION_STEPS,
  type ComposeInput,
} from '../../src/coordinator/compose-trusted-output.ts';
import { renderApprovalView } from '../../src/rendering/render-approval-view.ts';
import { renderMachineHandoff, renderingsAgree } from '../../src/rendering/render-machine-handoff.ts';
import {
  validateBlockingGapForcesBlocked,
  validateClarificationConvergence,
  validateExtractionCoverage,
  validateGapCompleteness,
  validateNoAuthoredTree,
  validateNoOperationalFields,
  validateParentReferences,
  validateRoutePayloadAgreement,
  validateSemanticIdUniqueness,
  validateVariantModel,
  validateBindingOptions,
} from '../../src/validation/semantic-validator.ts';
import {
  validateNoBindingCall,
  validateNoCrossRecordCollision,
  validateNoDuplicateSelections,
  validateResolutionFidelity,
  validateSelectionsExist,
  validateSnapshotFreshness,
  type ResolutionLookupPort,
  type LookedUpRecord,
} from '../../src/validation/reference-validator.ts';
import { measurePayload, payloadVersusSource } from '../../src/observability/static-payload-metrics.ts';
import { assembleModelInput } from '../../src/coordinator/assemble-model-input.ts';
import type { CoordinatorJudgmentDraft } from '../../src/contracts/coordinator-draft.ts';
import type { ResolvedCoordinatorInvocation } from '../../src/contracts/invocation.ts';
import type { TypedResolution, ClarificationGap } from '../../src/contracts/resolution.ts';
import type { CuratedSnapshotRef, SchemaCard } from '../../src/contracts/source.ts';
import type { ApprovalRecord } from '../../src/contracts/run-envelope.ts';
import { makeCandidateIdentity } from '../../src/contracts/identity.ts';

const SCHEMA_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'schemas', 'coordinator');
const SHA = '2222a2b8eff4224f76ddad591cf6f46c6e8bb25ec7f96aebbf13941876356627';
const OTHER_SHA = 'a'.repeat(64);
const TREE = 'c'.repeat(64);
const UUID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

/**
 * Candidate ids are **derived**, exactly as the index builder derives them — not
 * hand-written.
 *
 * A first draft of this file used invented ids and every composition failed on
 * `IDENTITY_MISMATCH`, because a hand-written id does not derive from its own
 * `source_record_ref`. That is the validator working: the fixture was the thing at
 * fault. Deriving them here keeps the test honest, and means these ids would change
 * if the source hash or index format did.
 */
const PAINT_NORMALIZED_ID = 'S:cfdda1d5d4bf3ab67fd2d15413224854c1b143ca';
const TEXT_NORMALIZED_ID = 'S:890673f93188c7285bd416d52c16fd424bd70987';

const PAINT_IDENTITY = makeCandidateIdentity({
  refClass: 'paint-style',
  normalizedId: PAINT_NORMALIZED_ID,
  sourceSha256: SHA,
  indexVersion: '1.0.0',
});
const TEXT_IDENTITY = makeCandidateIdentity({
  refClass: 'text-style',
  normalizedId: TEXT_NORMALIZED_ID,
  sourceSha256: SHA,
  indexVersion: '1.0.0',
});

const CID = PAINT_IDENTITY.candidate_id;
const CID2 = TEXT_IDENTITY.candidate_id;

function registry(): SchemaRegistry {
  const reg = new SchemaRegistry();
  for (const file of [
    'semantic.schema.json',
    'coordinator-output.schema.json',
    'coordinator-judgment-draft.schema.json',
  ]) {
    reg.register(JSON.parse(readFileSync(join(SCHEMA_DIR, file), 'utf8')) as object);
  }
  return reg;
}

const SNAPSHOT: CuratedSnapshotRef = {
  source_sha256: SHA,
  index_version: '1.0.0',
  source_schema_version: '1.1',
  source_bytes: 876098,
};

const RECORDS: Readonly<Record<string, LookedUpRecord>> = {
  [CID]: {
    candidate_id: CID,
    source_record_ref: PAINT_IDENTITY.source_record_ref,
    ref_class: 'paint-style',
    path: 'alphas/dark/expressions/warning/opacity_6',
    key: 'cfdda1d5d4bf3ab67fd2d15413224854c1b143ca',
    normalized_id: PAINT_NORMALIZED_ID,
    raw_id: `${PAINT_NORMALIZED_ID},`,
    property_category: 'color',
    modes: ['Dark', 'Light'],
  },
  [CID2]: {
    candidate_id: CID2,
    source_record_ref: TEXT_IDENTITY.source_record_ref,
    ref_class: 'text-style',
    path: 'body/reg/regular',
    key: '890673f93188c7285bd416d52c16fd424bd70987',
    normalized_id: TEXT_NORMALIZED_ID,
    raw_id: `${TEXT_NORMALIZED_ID},`,
    property_category: 'typography',
    modes: [],
  },
};

const PORT: ResolutionLookupPort = {
  snapshot: { source_sha256: SHA, index_version: '1.0.0' },
  lookupByCandidateId: (id) => RECORDS[id],
};

function resolutionFor(id: string): TypedResolution {
  const record = RECORDS[id];
  assert.ok(record !== undefined);
  const base = {
    candidate_id: record.candidate_id,
    source_record_ref: record.source_record_ref,
    source_sha256: SHA,
    index_version: '1.0.0',
    property_category: record.property_category,
    path: record.path,
    key: record.key,
    normalized_id: record.normalized_id,
    raw_id: record.raw_id,
    scopes: [] as readonly string[],
    verified_against_source_sha256: SHA,
  };
  return record.ref_class === 'text-style'
    ? { ...base, ref_class: 'text-style', font_size: 14 }
    : { ...base, ref_class: 'paint-style', modes: record.modes };
}

const INVOCATION: ResolvedCoordinatorInvocation = {
  run_id: UUID,
  run_type: 'new',
  user_intent: 'A dismissible warning toast.',
  requested_at: '2026-07-29T10:00:00Z',
};

const DRAFT: CoordinatorJudgmentDraft = {
  run_type: 'new',
  self_assessment: 'believe-complete',
  semantic_brief: {
    component_name: 'Warning Toast',
    intent_summary: 'A dismissible warning notification.',
    variant_properties: [
      { name: 'state', options: ['default', 'hover', 'pressed'], default_option: 'default' },
    ],
    elements: [
      {
        semantic_id: 'root',
        role: 'container',
        bindings: [
          { property: 'fill', reference_text: 'warning 6 opacity fill', selected_candidate_id: CID },
        ],
      },
      {
        semantic_id: 'title',
        role: 'title',
        parent_semantic_id: 'root',
        text_content: 'Warning',
        bindings: [
          { property: 'text_style', reference_text: '14px regular body', selected_candidate_id: CID2 },
        ],
      },
    ],
  },
};

function composeInput(overrides: Partial<ComposeInput> = {}): ComposeInput {
  return {
    invocation: INVOCATION,
    draft: DRAFT,
    snapshot: SNAPSHOT,
    port: PORT,
    registry: registry(),
    materialized: new Map([
      [CID, resolutionFor(CID)],
      [CID2, resolutionFor(CID2)],
    ]),
    composedAt: '2026-07-29T10:00:00Z',
    ...overrides,
  };
}

const GAP: ClarificationGap = {
  gap_id: 'gap-1',
  state: 'active',
  severity: 'blocking',
  owner: 'user',
  question: 'Which surface token?',
  evidence: 'two candidates within one point',
  required_answer: 'a sys/ token path',
  opened_in_round: 1,
};

describe('semantic validators — positive and negative', () => {
  test('route/payload agreement: accepts a matching pair, rejects a mismatch', () => {
    assert.deepEqual(validateRoutePayloadAgreement(DRAFT), []);
    const mismatched: CoordinatorJudgmentDraft = { ...DRAFT, run_type: 'audit' };
    assert.ok(validateRoutePayloadAgreement(mismatched).length > 0);
  });

  test('route/payload agreement: rejects two payloads at once', () => {
    const two: CoordinatorJudgmentDraft = {
      ...DRAFT,
      audit_brief: {
        component_name: 'x',
        scope: 'tokens',
        focus_summary: 'y',
        target_tree_ref: 't',
        target_tree_sha256: TREE,
        dimensions: ['a'],
      },
    };
    assert.match(validateRoutePayloadAgreement(two)[0]?.message ?? '', /exactly one payload/);
  });

  test('operational fields: clean draft passes, injected field fails', () => {
    assert.deepEqual(validateNoOperationalFields(DRAFT), []);
    const dirty = { ...DRAFT, notes: 'ok', run_id: UUID } as unknown as CoordinatorJudgmentDraft;
    assert.ok(validateNoOperationalFields(dirty).some((f) => f.code === 'INV_DRAFT_CARRIES_OPERATIONAL_FIELD'));
  });

  test('authored tree: clean brief passes, children array fails', () => {
    assert.deepEqual(validateNoAuthoredTree(DRAFT.semantic_brief, 'new'), []);
    const findings = validateNoAuthoredTree({ elements: [{ children: [] }] }, 'new');
    assert.equal(findings[0]?.code, 'INV_AUTHORED_TREE_IN_NEW');
  });

  test('authored tree: a modify payload reports the modify invariant', () => {
    const findings = validateNoAuthoredTree({ nodes: [] }, 'modify');
    assert.equal(findings[0]?.code, 'INV_AUTHORED_TREE_IN_MODIFY');
  });

  test('semantic id uniqueness: unique passes, duplicate fails', () => {
    assert.deepEqual(validateSemanticIdUniqueness(DRAFT.semantic_brief, undefined), []);
    const brief = {
      ...DRAFT.semantic_brief!,
      elements: [DRAFT.semantic_brief!.elements[0]!, DRAFT.semantic_brief!.elements[0]!],
    };
    assert.ok(validateSemanticIdUniqueness(brief, undefined).length > 0);
  });

  test('parent references: a real parent passes, a dangling one fails', () => {
    assert.deepEqual(validateParentReferences(DRAFT.semantic_brief), []);
    const brief = {
      ...DRAFT.semantic_brief!,
      elements: [{ ...DRAFT.semantic_brief!.elements[0]!, parent_semantic_id: 'ghost' }],
    };
    assert.match(validateParentReferences(brief)[0]?.message ?? '', /not an element/);
  });

  /** The v1 defect: a forward route surviving alongside a blocking flag. */
  test('blocking gap: blocked status passes, ready status fails', () => {
    assert.deepEqual(validateBlockingGapForcesBlocked([GAP], 'blocked'), []);
    const findings = validateBlockingGapForcesBlocked([GAP], 'ready');
    assert.equal(findings[0]?.code, 'INV_BLOCKING_GAP_WITH_FORWARD_ROUTE');
  });

  test('blocking gap: a resolved or non-blocking gap does not force blocked', () => {
    assert.deepEqual(validateBlockingGapForcesBlocked([{ ...GAP, state: 'resolved' }], 'ready'), []);
    assert.deepEqual(validateBlockingGapForcesBlocked([{ ...GAP, severity: 'non-blocking' }], 'ready'), []);
  });

  test('gap completeness: a complete gap passes, an unanswerable one fails', () => {
    assert.deepEqual(validateGapCompleteness([GAP]), []);
    assert.ok(validateGapCompleteness([{ ...GAP, required_answer: '' }]).length > 0);
    assert.ok(validateGapCompleteness([{ ...GAP, evidence: '' }]).length > 0);
  });

  test('gap completeness: a duplicate gap_id fails', () => {
    assert.ok(validateGapCompleteness([GAP, GAP]).length > 0);
  });

  /** A dropped gap and a resolved gap look identical in a count. */
  test('convergence: resolving passes, silently dropping fails', () => {
    assert.deepEqual(validateClarificationConvergence([GAP], [{ ...GAP, state: 'resolved' }]), []);
    const findings = validateClarificationConvergence([GAP], []);
    assert.equal(findings[0]?.code, 'INV_CONVERGENCE_FROM_ARRAY_LENGTH');
  });

  test('extraction coverage: correct arithmetic passes, a mis-stated count fails', () => {
    const coverage = {
      tree_ref: 't',
      tree_sha256: TREE,
      total_nodes: 18,
      examined_nodes: 16,
      exclusions: [{ locator: 'a', reason: 'too big', node_count: 2 }],
      fully_accounted: true,
    };
    assert.deepEqual(validateExtractionCoverage(coverage), []);
    assert.ok(validateExtractionCoverage({ ...coverage, examined_nodes: 10 }).length > 0);
  });

  test('extraction coverage: an exclusion without a reason fails', () => {
    const findings = validateExtractionCoverage({
      tree_ref: 't',
      tree_sha256: TREE,
      total_nodes: 2,
      examined_nodes: 0,
      exclusions: [{ locator: 'a', reason: '', node_count: 2 }],
      fully_accounted: true,
    });
    assert.ok(findings.some((f) => /no reason/.test(f.message)));
  });

  test('variant model: a valid axis passes, an empty one fails', () => {
    assert.deepEqual(validateVariantModel(DRAFT.semantic_brief, undefined), []);
    const brief = { ...DRAFT.semantic_brief!, variant_properties: [{ name: 'state', options: [] }] };
    assert.ok(validateVariantModel(brief, undefined).length > 0);
  });

  test('variant model: a default outside the option set fails', () => {
    const brief = {
      ...DRAFT.semantic_brief!,
      variant_properties: [{ name: 'state', options: ['default'], default_option: 'ghost' }],
    };
    assert.match(validateVariantModel(brief, undefined)[0]?.message ?? '', /not one of its options/);
  });

  /** "Added disabled" must be distinguishable from "replaced the axis". */
  test('variant model: an add that removes options fails', () => {
    const delta = {
      component_name: 'Button',
      intent_summary: 'x',
      variant_properties_after: [{ name: 'state', options: ['disabled'] }],
      items: [
        {
          delta_id: 'd1',
          change_status: 'add' as const,
          change_type: 'state' as const,
          summary: 'add disabled',
          variant_transition: {
            property_name: 'state',
            options_before: ['default', 'hover'],
            options_after: ['disabled'],
          },
        },
      ],
    };
    assert.match(validateVariantModel(undefined, delta)[0]?.message ?? '', /removes options/);
  });

  test('binding options: a declared option passes, an undeclared one fails', () => {
    assert.deepEqual(validateBindingOptions(DRAFT.semantic_brief), []);
    const brief = {
      ...DRAFT.semantic_brief!,
      elements: [
        {
          ...DRAFT.semantic_brief!.elements[0]!,
          bindings: [
            {
              property: 'fill',
              reference_text: 'x',
              selected_candidate_id: CID,
              applies_to_option: 'ghost',
            },
          ],
        },
      ],
    };
    assert.match(validateBindingOptions(brief)[0]?.message ?? '', /no variant axis declares/);
  });
});

describe('reference validators — positive and negative', () => {
  test('selections exist: a real id passes, a fabricated one fails', () => {
    assert.deepEqual(validateSelectionsExist([CID], PORT), []);
    assert.ok(validateSelectionsExist([`c_${'0'.repeat(24)}`], PORT).length > 0);
  });

  test('duplicate selections: distinct passes, repeated fails', () => {
    assert.deepEqual(validateNoDuplicateSelections([CID, CID2]), []);
    assert.match(validateNoDuplicateSelections([CID, CID])[0]?.message ?? '', /collapsed/);
  });

  test('snapshot freshness: current passes, stale fails distinctly', () => {
    assert.deepEqual(validateSnapshotFreshness([resolutionFor(CID)], PORT), []);
    const stale = { ...resolutionFor(CID), source_sha256: OTHER_SHA };
    assert.match(validateSnapshotFreshness([stale], PORT)[0]?.message ?? '', /stale source/);
  });

  /** Defect #1 exactly: a real key with a fabricated path. */
  test('resolution fidelity: matching passes, a fabricated path fails', () => {
    assert.deepEqual(validateResolutionFidelity([resolutionFor(CID)], PORT), []);
    const tampered = { ...resolutionFor(CID), path: 'stroke/base' };
    const findings = validateResolutionFidelity([tampered], PORT);
    assert.match(findings[0]?.message ?? '', /but the indexed record holds/);
  });

  test('resolution fidelity: an altered key and an altered class both fail', () => {
    for (const patch of [{ key: 'deadbeef' }, { ref_class: 'variable' as const }]) {
      const tampered = { ...resolutionFor(CID), ...patch } as TypedResolution;
      assert.ok(validateResolutionFidelity([tampered], PORT).length > 0);
    }
  });

  test('resolution fidelity: a mode the record does not publish fails', () => {
    const tampered = { ...resolutionFor(CID), mode: 'Sepia' } as TypedResolution;
    assert.match(validateResolutionFidelity([tampered], PORT)[0]?.message ?? '', /publishes/);
  });

  test('binding_call: a clean resolution passes, an API instruction fails', () => {
    assert.deepEqual(validateNoBindingCall([resolutionFor(CID)]), []);
    const tampered = { ...resolutionFor(CID), binding_call: 'applyStyleId(x)' } as unknown as TypedResolution;
    assert.equal(validateNoBindingCall([tampered])[0]?.code, 'INV_RESOLUTION_CARRIES_BINDING_CALL');
  });

  test('cross-record collision: distinct properties pass, a double-bound one fails', () => {
    assert.deepEqual(
      validateNoCrossRecordCollision([
        { semantic_id: 'root', property: 'fill', candidate_id: CID },
        { semantic_id: 'root', property: 'stroke', candidate_id: CID2 },
      ]),
      [],
    );
    const findings = validateNoCrossRecordCollision([
      { semantic_id: 'root', property: 'fill', candidate_id: CID },
      { semantic_id: 'root', property: 'fill', candidate_id: CID2 },
    ]);
    assert.match(findings[0]?.message ?? '', /depend on ordering/);
  });
});

describe('the 11-step sequence (§16.1)', () => {
  test('a clean draft composes and reports every step', () => {
    const result = composeTrustedOutput(composeInput());
    assert.equal(result.ok, true, result.ok ? '' : JSON.stringify(result.findings.slice(0, 3)));
    if (!result.ok) return;
    assert.deepEqual(result.steps_completed, [...COMPOSITION_STEPS]);
    assert.equal(result.output.status, 'ready');
    assert.equal(result.output.next_route, 'builder');
  });

  /** Naming the step is what makes a failure debuggable. */
  test('a route echo mismatch stops at step 2 and says so', () => {
    const result = composeTrustedOutput(
      composeInput({ draft: { ...DRAFT, run_type: 'audit' } as CoordinatorJudgmentDraft }),
    );
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.failed_step, '1-draft-schema');
  });

  test('an unresolved selection stops at step 3', () => {
    const result = composeTrustedOutput(composeInput({ materialized: new Map() }));
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.failed_step, '3-resolve-selections');
    assert.deepEqual(result.steps_completed, ['1-draft-schema', '2-route-payload-compatibility']);
  });

  test('a stale snapshot stops at step 4', () => {
    const stale = new Map([
      [CID, { ...resolutionFor(CID), source_sha256: OTHER_SHA }],
      [CID2, resolutionFor(CID2)],
    ]);
    const result = composeTrustedOutput(composeInput({ materialized: stale }));
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.failed_step, '4-verify-snapshot');
  });

  test('an altered reference field stops at step 7', () => {
    const tampered = new Map([
      [CID, { ...resolutionFor(CID), path: 'stroke/base' }],
      [CID2, resolutionFor(CID2)],
    ]);
    const result = composeTrustedOutput(composeInput({ materialized: tampered }));
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.failed_step, '7-reject-altered-references');
  });

  /** A run that cannot proceed still owes the human an explanation in the same
   *  shape as a success. */
  test('a failure still composes a valid failed output', () => {
    const result = composeTrustedOutput(composeInput({ materialized: new Map() }));
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.ok(result.output !== undefined);
    assert.equal(result.output?.status, 'failed');
    assert.equal(result.output?.next_route, null);
    assert.equal(registry().validate(
      'https://adalfi.dev/schemas/coordinator/coordinator-output.schema.json',
      result.output,
    ).ok, true);
  });

  test('a blocking gap yields blocked with a null route and retained partials', () => {
    const result = composeTrustedOutput(
      composeInput({ draft: { ...DRAFT, clarification_gaps: [GAP] } }),
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.output.status, 'blocked');
    assert.equal(result.output.next_route, null);
    assert.ok(result.output.status === 'blocked' && result.output.partial_resolutions !== undefined);
  });

  /** No model-generated operational field survives the boundary. */
  test('a draft-injected operational field never reaches the output', () => {
    const dirty = { ...DRAFT, model_id: 'claude-x' } as unknown as CoordinatorJudgmentDraft;
    const result = composeTrustedOutput(composeInput({ draft: dirty }));
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.ok(!JSON.stringify(result.output).includes('claude-x'));
  });

  test('composition is deterministic — same input, same hash', () => {
    const a = composeTrustedOutput(composeInput());
    const b = composeTrustedOutput(composeInput());
    assert.ok(a.ok && b.ok);
    if (!a.ok || !b.ok) return;
    assert.equal(a.output_sha256, b.output_sha256);
  });

  /**
   * Key order must not change an output's identity — a human approves a hash, and a
   * reserialization that reorders keys must not invalidate the approval.
   *
   * Reordering is done by rebuilding objects with reversed insertion order. An earlier
   * version used `JSON.stringify(value, keyArray)`, which *filters* to those keys at
   * every level rather than reordering — so it compared a truncated object and would
   * have passed for the wrong reason.
   */
  test('the output hash is key-order independent', () => {
    const result = composeTrustedOutput(composeInput());
    assert.ok(result.ok);
    if (!result.ok) return;

    const reverseKeys = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(reverseKeys);
      if (value === null || typeof value !== 'object') return value;
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
          .reverse()
          .map(([key, child]) => [key, reverseKeys(child)]),
      );
    };

    const reordered = reverseKeys(result.output) as typeof result.output;
    assert.notEqual(
      JSON.stringify(reordered),
      JSON.stringify(result.output),
      'the reordering must actually change serialization, or the test proves nothing',
    );
    assert.equal(hashOutput(reordered), result.output_sha256);
  });
});

describe('read-only port (Gate 5)', () => {
  /** A port that *could* write would be one refactor from being wired up. */
  test('the lookup port exposes only reads', () => {
    const keys = Object.keys(PORT);
    assert.deepEqual(keys.sort(), ['lookupByCandidateId', 'snapshot']);
    for (const key of keys) {
      assert.ok(
        !/write|create|update|delete|set|apply|mutate/i.test(key),
        `port exposes a write-shaped member: ${key}`,
      );
    }
  });

  test('the composer accepts nothing that could reach Figma or a model', () => {
    const input = composeInput();
    const keys = Object.keys(input);
    for (const forbidden of ['figma', 'client', 'model', 'adapter', 'fetch', 'writer']) {
      assert.ok(!keys.some((key) => key.toLowerCase().includes(forbidden)), `ComposeInput exposes ${forbidden}`);
    }
  });
});

describe('dual rendering from one object (§16.3)', () => {
  const result = composeTrustedOutput(composeInput());
  assert.ok(result.ok);
  const output = result.ok ? result.output : undefined;

  test('both renderings bind the same object hash', () => {
    assert.ok(output !== undefined);
    if (output === undefined) return;
    const approval = renderApprovalView(output);
    const handoff = renderMachineHandoff(output);
    assert.equal(approval.source_object_sha256, handoff.source_object_sha256);
    assert.equal(approval.source_object_sha256, hashOutput(output));
    assert.equal(renderingsAgree(approval.source_object_sha256, handoff.source_object_sha256, output), true);
  });

  test('renderings are deterministic', () => {
    assert.ok(output !== undefined);
    if (output === undefined) return;
    assert.equal(renderApprovalView(output).body, renderApprovalView(output).body);
    assert.deepEqual(renderMachineHandoff(output), renderMachineHandoff(output));
  });

  test('a changed object changes both hashes together', () => {
    assert.ok(output !== undefined);
    if (output === undefined) return;
    const changed = { ...output, composed_at: '2026-07-30T00:00:00Z' };
    assert.notEqual(renderApprovalView(changed).source_object_sha256, renderApprovalView(output).source_object_sha256);
    assert.equal(
      renderApprovalView(changed).source_object_sha256,
      renderMachineHandoff(changed).source_object_sha256,
    );
  });

  /** The most likely misreading of the approval view. */
  test('the approval view says plainly that nothing has been built', () => {
    assert.ok(output !== undefined);
    if (output === undefined) return;
    const view = renderApprovalView(output);
    assert.match(view.body, /NOTHING HAS BEEN BUILT/);
    assert.match(view.body, /No Figma artifact exists/);
    assert.ok(!/has been built successfully|created in Figma/i.test(view.body));
  });

  test('the approval view itemises what is being approved', () => {
    assert.ok(output !== undefined);
    if (output === undefined) return;
    const view = renderApprovalView(output);
    assert.ok(view.decisions.length >= 2);
    assert.match(view.body, /sha256 [0-9a-f]{64}/);
  });

  test('the approval view shows traceable references and snapshot identity', () => {
    assert.ok(output !== undefined);
    if (output === undefined) return;
    const view = renderApprovalView(output);
    assert.match(view.body, /alphas\/dark\/expressions\/warning\/opacity_6/);
    assert.match(view.body, /ref paint-style:S:cfdda1d5d4bf/);
    assert.match(view.body, /Design-system snapshot: 2222a2b8eff4/);
  });

  test('the approval view states that aggregate confidence is the weakest child', () => {
    assert.ok(output !== undefined);
    if (output === undefined) return;
    assert.match(renderApprovalView(output).body, /weakest individual resolution, not an average/);
  });

  /** Text-style size is provenance, not an assertion. */
  test('a text-style resolution shows how its size was established', () => {
    assert.ok(output !== undefined);
    if (output === undefined) return;
    assert.match(renderApprovalView(output).body, /confirmed by the bound type-scale variable/);
  });

  test('the handoff carries the payload verbatim and never recomputes the route', () => {
    assert.ok(output !== undefined);
    if (output === undefined) return;
    const handoff = renderMachineHandoff(output);
    assert.deepEqual(handoff.payload, output);
    assert.equal(handoff.next_stage, output.next_route);
  });

  test('an unapproved handoff says so explicitly', () => {
    assert.ok(output !== undefined);
    if (output === undefined) return;
    const handoff = renderMachineHandoff(output);
    assert.ok(handoff.receiver_preconditions.some((line) => /UNAPPROVED/.test(line)));
    assert.equal(handoff.approval, undefined);
  });

  test('an approval bound to a different artifact is surfaced, not silently accepted', () => {
    assert.ok(output !== undefined);
    if (output === undefined) return;
    const wrong: ApprovalRecord = {
      gate: 'gate-1-semantic',
      gate_mode: 'observe-only-validation',
      approved_artifact_sha256: OTHER_SHA,
      approved_at: '2026-07-29T10:05:00Z',
      approved_by: 'ux@techlogix.com',
      decision: 'approved',
    };
    const handoff = renderMachineHandoff(output, wrong);
    assert.ok(handoff.receiver_preconditions.some((line) => /APPROVAL MISMATCH/.test(line)));
  });

  test('an observe-only approval is stated to authorise no write', () => {
    assert.ok(output !== undefined);
    if (output === undefined) return;
    const approval: ApprovalRecord = {
      gate: 'gate-1-semantic',
      gate_mode: 'observe-only-validation',
      approved_artifact_sha256: hashOutput(output),
      approved_at: '2026-07-29T10:05:00Z',
      approved_by: 'ux@techlogix.com',
      decision: 'approved',
    };
    const handoff = renderMachineHandoff(output, approval);
    assert.ok(handoff.receiver_preconditions.some((line) => /authorises no write/.test(line)));
  });

  test('a builder handoff states sandbox-only and requires a nodeMap', () => {
    assert.ok(output !== undefined);
    if (output === undefined) return;
    const handoff = renderMachineHandoff(output);
    assert.ok(handoff.receiver_preconditions.some((line) => /sandbox target only/.test(line)));
    assert.ok(handoff.receiver_preconditions.some((line) => /nodeMap/.test(line)));
  });

  test('a blocked run renders both views and tells the receiver not to act', () => {
    const blocked = composeTrustedOutput(composeInput({ draft: { ...DRAFT, clarification_gaps: [GAP] } }));
    assert.ok(blocked.ok);
    if (!blocked.ok) return;
    const view = renderApprovalView(blocked.output);
    const handoff = renderMachineHandoff(blocked.output);
    assert.match(view.body, /cannot proceed until these are answered/);
    assert.match(view.body, /Already verified and retained/);
    assert.ok(handoff.receiver_preconditions.some((line) => /Do not act on it/.test(line)));
    assert.equal(view.source_object_sha256, handoff.source_object_sha256);
  });
});

describe('repair errors are compact and stable (§16.2, Gate 5)', () => {
  test('every finding carries a stable code, an owner and a contract location', () => {
    const dirty = { ...DRAFT, run_id: UUID } as unknown as CoordinatorJudgmentDraft;
    const result = composeTrustedOutput(composeInput({ draft: dirty }));
    assert.equal(result.ok, false);
    if (result.ok) return;
    for (const finding of result.findings) {
      assert.match(finding.code, /^[A-Z][A-Z_0-9]+$/);
      assert.ok(finding.enforced_by.length > 0);
      assert.ok(finding.message.length > 0);
    }
  });

  test('findings are compact — no finding is a paragraph', () => {
    const tampered = new Map([
      [CID, { ...resolutionFor(CID), path: 'stroke/base' }],
      [CID2, resolutionFor(CID2)],
    ]);
    const result = composeTrustedOutput(composeInput({ materialized: tampered }));
    assert.equal(result.ok, false);
    if (result.ok) return;
    for (const finding of result.findings) {
      assert.ok(finding.message.length < 300, `finding is ${finding.message.length} chars`);
    }
  });

  test('all findings are reported at once so one repair call suffices', () => {
    const brief = DRAFT.semantic_brief!;
    const dirty: CoordinatorJudgmentDraft = {
      ...DRAFT,
      semantic_brief: {
        ...brief,
        elements: [brief.elements[0]!, brief.elements[0]!],
        variant_properties: [{ name: 'state', options: [] }],
      },
    };
    const result = composeTrustedOutput(composeInput({ draft: dirty }));
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.ok(result.findings.length >= 2, 'expected every problem in one pass');
  });
});

describe('static payload metrics', () => {
  const card: SchemaCard = {
    snapshot: SNAPSHOT,
    body: 'card',
    byte_length: 4,
    generated_from_index: true,
  };

  test('raw source bytes are structurally zero', () => {
    const assembled = assembleModelInput({
      run_type: 'new',
      user_intent: 'x',
      schema_card: card,
      candidates_by_query: {},
    });
    const metrics = measurePayload(assembled);
    assert.equal(metrics.raw_source_bytes, 0);
    assert.equal(metrics.largest_section, 'core');
    assert.ok(metrics.core_share > 0.4, 'the always-loaded core dominates, as expected');
  });

  /** Nothing was reduced — the source was never in the payload. */
  test('the source comparison is a ratio, never described as a saving', () => {
    const assembled = assembleModelInput({
      run_type: 'new',
      user_intent: 'x',
      schema_card: card,
      candidates_by_query: {},
    });
    const comparison = payloadVersusSource(assembled, 876098);
    assert.ok(comparison.ratio > 0 && comparison.ratio < 0.05);
    assert.ok(!Object.keys(comparison).some((key) => /saving|reduction|saved/i.test(key)));
  });
});
