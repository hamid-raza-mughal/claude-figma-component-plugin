/**
 * AC-2 and AC-3 (docs/builder-master-audit-cycle-1.md) — what `submitDraft`
 * tells its caller, and whether the caller can act on it.
 *
 * Both defects were found by driving the tool boundary by hand rather than by
 * reading it, and neither was visible to a passing suite: the Guard refused the
 * wrong next step correctly, so nothing failed — the caller was simply sent
 * there.
 *
 * AC-2: a `blocked` composition is `ok` (§4.6), so it returned the same bare
 * `accepted` a ready one does, carrying an `artifact_sha256` for an object §4.4
 * deliberately does not persist. The documented next step then hit G-19a.
 * AC-3: the repairable verdict projected each finding to `{code, message}`,
 * discarding the JSON Pointers §6.3 requires — leaving one repair call and
 * "must be equal to one of the allowed values" with no field named.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { CoordinatorEngine } from '../../src/tools/engine.ts';
import { GuardRefusal } from '../../src/guard/errors.ts';
import { ENFORCEMENT_OWNERS } from '../../src/contracts/failures.ts';
import { newPhase1Config } from './fixtures.ts';
import type { Phase1Config } from '../../src/config/phase1-config.ts';
import type { CoordinatorJudgmentDraft } from '../../src/contracts/coordinator-draft.ts';

function prepared(): { engine: CoordinatorEngine; runId: string; candidateId: string; config: Phase1Config } {
  const config = newPhase1Config();
  const engine = new CoordinatorEngine({ phase1Config: () => config });
  const { run_id } = engine.beginRun({ operation_id: 'component.create', user_intent: 'a warning toast' });
  const context = engine.prepareContext(run_id);
  for (const list of Object.values(context.candidates)) {
    const paint = list.find((candidate) => candidate.ref_class === 'paint-style');
    if (paint !== undefined) return { engine, runId: run_id, candidateId: paint.candidate_id, config };
  }
  throw new Error('no paint-style candidate — the fixture or PD-7 categories changed');
}

const BRIEF = {
  component_name: 'Warning Toast',
  intent_summary: 'A dismissible warning notification.',
  variant_properties: [{ name: 'state', options: ['default'], default_option: 'default' }],
};

function readyDraft(candidateId: string): CoordinatorJudgmentDraft {
  return {
    run_type: 'new',
    self_assessment: 'believe-complete',
    semantic_brief: {
      ...BRIEF,
      elements: [
        { semantic_id: 'root', role: 'container', bindings: [{ property: 'fill', reference_text: 'warning fill', selected_candidate_id: candidateId }] },
      ],
    },
  };
}

/** A draft the model authored with a blocking gap still open. Composition
 *  succeeds and produces a `BlockedOutput` — `ok`, but not presentable. */
function blockedDraft(candidateId: string): CoordinatorJudgmentDraft {
  return {
    ...readyDraft(candidateId),
    self_assessment: 'need-clarification',
    clarification_gaps: [
      {
        gap_id: 'G1',
        state: 'active',
        severity: 'blocking',
        owner: 'user',
        question: 'Which warning tone was meant?',
        evidence: 'two candidates match the request equally',
        required_answer: 'a token path',
        opened_in_round: 1,
      },
    ],
  };
}

describe('AC-2 — a blocked composition is distinguishable from a ready one', () => {
  test('a ready composition reports status ready and the hash of a stored artifact', () => {
    const { engine, runId, candidateId } = prepared();
    const result = engine.submitDraft(runId, readyDraft(candidateId));
    assert.equal(result.outcome, 'accepted');
    if (result.outcome !== 'accepted') return;
    assert.equal(result.status, 'ready');
    if (result.status !== 'ready') return;
    assert.match(result.artifact_sha256, /^[0-9a-f]{64}$/);
    // The claim the field name makes: an artifact row really exists.
    assert.equal(engine.presentForApproval(runId).artifact_sha256, result.artifact_sha256);
  });

  test('a blocked composition reports status blocked and does NOT name an artifact', () => {
    const { engine, runId, candidateId } = prepared();
    const result = engine.submitDraft(runId, blockedDraft(candidateId));
    assert.equal(result.outcome, 'accepted', '§4.6: a blocked composition is still ok');
    if (result.outcome !== 'accepted') return;
    assert.equal(result.status, 'blocked');
    if (result.status !== 'blocked') return;
    assert.match(result.output_sha256, /^[0-9a-f]{64}$/);
    // The regression itself: no `artifact_sha256` field exists on this result,
    // because no artifact row was written. Before AC-2 the field was present
    // and named something the store would not return.
    assert.ok(!('artifact_sha256' in result), 'a blocked result must not name a stored artifact');
  });

  test('the status a caller reads matches what the Guard will then permit', () => {
    // The two halves are only useful together: `status` is a promise about the
    // next step, and this asserts the Guard keeps it.
    const blocked = prepared();
    const blockedResult = blocked.engine.submitDraft(blocked.runId, blockedDraft(blocked.candidateId));
    assert.ok(blockedResult.outcome === 'accepted' && blockedResult.status === 'blocked');
    assert.throws(
      () => blocked.engine.presentForApproval(blocked.runId),
      (error: unknown) => error instanceof GuardRefusal && error.code === 'G-19a',
      'status blocked must mean presentForApproval is refused',
    );
    assert.equal(blocked.engine.openClarification(blocked.runId).round, 1, 'status blocked must mean openClarification works');

    const ready = prepared();
    const readyResult = ready.engine.submitDraft(ready.runId, readyDraft(ready.candidateId));
    assert.ok(readyResult.outcome === 'accepted' && readyResult.status === 'ready');
    assert.doesNotThrow(() => ready.engine.presentForApproval(ready.runId), 'status ready must mean presentForApproval works');
  });
});

describe('AC-3 — repair evidence carries the JSON Pointers §6.3 requires', () => {
  /** A draft that fails schema validation on a *named* field, so there is a
   *  pointer to lose. `self_assessment` is not in the enum. */
  const badEnumDraft = {
    run_type: 'new',
    self_assessment: 'gaps-remain',
    semantic_brief: { ...BRIEF, elements: [{ semantic_id: 'root', role: 'container', bindings: [] }] },
  } as unknown as CoordinatorJudgmentDraft;

  test('a repairable verdict names the offending field, not only the symptom', () => {
    const { engine, runId } = prepared();
    const result = engine.submitDraft(runId, badEnumDraft);
    assert.equal(result.outcome, 'repairable');
    if (result.outcome !== 'repairable') return;
    assert.ok(result.evidence.length > 0, 'the check would pass vacuously with no evidence');
    const enumFinding = result.evidence.find((item) => item.code === 'SCHEMA_ENUM_MISMATCH');
    assert.ok(enumFinding !== undefined, `expected SCHEMA_ENUM_MISMATCH, got ${result.evidence.map((e) => e.code).join(', ')}`);
    // The regression: before AC-3 this was `{code, message}` only, so a model
    // with one repair call was told "must be equal to one of the allowed
    // values" and not which of the draft's fields it applied to.
    assert.equal(enumFinding.instance_path, '/self_assessment');
    assert.ok((enumFinding.contract_path ?? '').includes('self_assessment'));
  });

  test('every finding names an accountable enforcement owner', () => {
    const { engine, runId } = prepared();
    const result = engine.submitDraft(runId, badEnumDraft);
    if (result.outcome !== 'repairable') assert.fail('expected a repairable verdict');
    for (const finding of result.evidence) {
      assert.ok(
        (ENFORCEMENT_OWNERS as readonly string[]).includes(finding.enforced_by),
        `"${finding.enforced_by}" is not a declared EnforcementOwner`,
      );
    }
  });

  test('the terminal verdict carries the same shape — the budget being spent loses no detail', () => {
    const { engine, runId } = prepared();
    assert.equal(engine.submitDraft(runId, badEnumDraft).outcome, 'repairable');
    const second = engine.submitDraft(runId, badEnumDraft);
    assert.equal(second.outcome, 'terminal', 'one repair per run (§6.2)');
    if (second.outcome !== 'terminal') return;
    const enumFinding = second.evidence.find((item) => item.code === 'SCHEMA_ENUM_MISMATCH');
    assert.ok(enumFinding !== undefined);
    assert.equal(enumFinding.instance_path, '/self_assessment');
  });

  test('evidence is codes and pointers, never prose standing in for a location', () => {
    const { engine, runId } = prepared();
    const result = engine.submitDraft(runId, badEnumDraft);
    if (result.outcome !== 'repairable') assert.fail('expected a repairable verdict');
    for (const finding of result.evidence) {
      assert.match(finding.code, /^[A-Z][A-Z0-9_]*$/, 'a code must be a stable machine-readable token');
      if (finding.instance_path !== undefined) {
        assert.match(finding.instance_path, /^(?:$|\/)/, 'instance_path must be a JSON Pointer');
      }
    }
  });
});
