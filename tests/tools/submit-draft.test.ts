/**
 * `submitDraft` (§4.3/§4.4, §10 rows 6/7/11) and `presentForApproval` (§4.5,
 * §10 row 9) — materialization (never trusting the model's claims about a
 * selection), composition, artifact persistence, and rendering.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { CoordinatorEngine } from '../../src/tools/engine.ts';
import { GuardRefusal } from '../../src/guard/errors.ts';
import { newPhase1Config } from './fixtures.ts';
import type { CoordinatorJudgmentDraft } from '../../src/contracts/coordinator-draft.ts';
import type { ResolverCandidate } from '../../src/contracts/resolution.ts';

function newEngine(): CoordinatorEngine {
  const config = newPhase1Config();
  return new CoordinatorEngine({ phase1Config: () => config, now: () => '2026-07-29T10:00:00Z' });
}

/** Candidate ids are derived, never hand-written — picked from a real
 *  prepareContext call, matching the fixture's own discipline. */
function findCandidate(
  candidates: Readonly<Record<string, readonly ResolverCandidate[]>>,
  refClass: ResolverCandidate['ref_class'],
): ResolverCandidate {
  for (const list of Object.values(candidates)) {
    const found = list.find((c) => c.ref_class === refClass);
    if (found !== undefined) return found;
  }
  throw new Error(`no ${refClass} candidate found — fixture or PD-7 categories changed`);
}

function readyDraft(paintCandidateId: string): CoordinatorJudgmentDraft {
  return {
    run_type: 'new',
    self_assessment: 'believe-complete',
    semantic_brief: {
      component_name: 'Warning Toast',
      intent_summary: 'A dismissible warning notification.',
      variant_properties: [{ name: 'state', options: ['default'], default_option: 'default' }],
      elements: [
        {
          semantic_id: 'root',
          role: 'container',
          bindings: [{ property: 'fill', reference_text: 'warning fill', selected_candidate_id: paintCandidateId }],
        },
      ],
    },
  };
}

describe('submitDraft — accepted', () => {
  test('a valid draft composes, persists an artifact, and moves to validating', () => {
    const engine = newEngine();
    const { run_id } = engine.beginRun({ operation_id: 'component.create', user_intent: 'Build a warning toast' });
    const prepared = engine.prepareContext(run_id);
    const paint = findCandidate(prepared.candidates, 'paint-style');
    const result = engine.submitDraft(run_id, readyDraft(paint.candidate_id));
    assert.equal(result.outcome, 'accepted');
    if (result.outcome === 'accepted') assert.match(result.artifact_sha256, /^[0-9a-f]{64}$/);
    assert.equal(engine.resumeRun(run_id).phase, 'validating');
  });

  test('the artifact is readable by presentForApproval afterwards', () => {
    const engine = newEngine();
    const { run_id } = engine.beginRun({ operation_id: 'component.create', user_intent: 'x' });
    const prepared = engine.prepareContext(run_id);
    const paint = findCandidate(prepared.candidates, 'paint-style');
    engine.submitDraft(run_id, readyDraft(paint.candidate_id));
    const presented = engine.presentForApproval(run_id);
    assert.match(presented.artifact_sha256, /^[0-9a-f]{64}$/);
    assert.ok(presented.approval_view.body.includes('NOTHING HAS BEEN BUILT'));
    assert.equal(engine.resumeRun(run_id).phase, 'awaiting-approval');
  });
});

describe('submitDraft — never trusts the model\'s claim about a selection', () => {
  test('a fabricated candidate_id is refused as unresolved (§3-resolve-selections), not accepted', () => {
    const engine = newEngine();
    const { run_id } = engine.beginRun({ operation_id: 'component.create', user_intent: 'x' });
    engine.prepareContext(run_id);
    const result = engine.submitDraft(run_id, readyDraft('c_000000000000000000000000'));
    assert.notEqual(result.outcome, 'accepted');
  });

  test('a repairable failure is eligible once, then the budget is spent', () => {
    const engine = newEngine();
    const { run_id } = engine.beginRun({ operation_id: 'component.create', user_intent: 'x' });
    engine.prepareContext(run_id);
    const first = engine.submitDraft(run_id, readyDraft('c_000000000000000000000000'));
    assert.equal(first.outcome, 'repairable');
    assert.equal(engine.resumeRun(run_id).phase, 'drafting', 'a repairable verdict returns to drafting for resubmission');
    const second = engine.submitDraft(run_id, readyDraft('c_000000000000000000000000'));
    assert.equal(second.outcome, 'terminal', 'the one-call repair budget (§6.2) is spent');
    assert.equal(engine.resumeRun(run_id).phase, 'validating', 'terminal stays in validating for an explicit failRun (§6.5)');
  });

  test('operational fields in a draft are refused before composition even runs (G-4)', () => {
    const engine = newEngine();
    const { run_id } = engine.beginRun({ operation_id: 'component.create', user_intent: 'x' });
    engine.prepareContext(run_id);
    const draft = readyDraft('c_000000000000000000000000') as unknown as Record<string, unknown>;
    const poisoned = { ...draft, run_id };
    assert.throws(
      () => engine.submitDraft(run_id, poisoned as unknown as CoordinatorJudgmentDraft),
      (error: unknown) => error instanceof GuardRefusal && error.code === 'G-4',
    );
  });
});

describe('presentForApproval — G-19a', () => {
  test('refuses when the run sits in validating with no ready artifact (repair budget exhausted)', () => {
    const engine = newEngine();
    const { run_id } = engine.beginRun({ operation_id: 'component.create', user_intent: 'x' });
    engine.prepareContext(run_id);
    engine.submitDraft(run_id, readyDraft('c_000000000000000000000000')); // repairable -> back to drafting
    const second = engine.submitDraft(run_id, readyDraft('c_000000000000000000000000')); // budget spent
    assert.equal(second.outcome, 'terminal');
    assert.equal(engine.resumeRun(run_id).phase, 'validating');
    assert.throws(
      () => engine.presentForApproval(run_id),
      (error: unknown) => error instanceof GuardRefusal && error.code === 'G-19a',
    );
  });

  test('G-11: presentForApproval is unreachable from drafting', () => {
    const engine = newEngine();
    const { run_id } = engine.beginRun({ operation_id: 'component.create', user_intent: 'x' });
    engine.prepareContext(run_id);
    assert.throws(
      () => engine.presentForApproval(run_id),
      (error: unknown) => error instanceof GuardRefusal && error.code === 'G-11',
    );
  });
});
