/**
 * AC-1 (docs/builder-master-audit-cycle-1.md) — the aggregate confidence in
 * the approval view must be the weakest confidence the model was actually
 * shown, not a default that happens to look like one.
 *
 * **Why this file exists and the adversarial suite was not enough.**
 * `tests/adversarial/adversarial-suite.test.ts` A6 already asserted that
 * `composeTrustedOutput` honours a `perResolutionConfidence` map — by passing
 * one. It could not fail, because it supplied the very input the production
 * path was missing: `submitDraft` never passed the map, so every real run took
 * the `?? 'medium'` fallback and the composer's correct rule was never
 * exercised by anything a designer would see. A test that hands the code the
 * input production omits is a test of the code and not of the system.
 *
 * So these tests enter where the run does, and check the value in both
 * directions: that a low candidate produces a low aggregate, and that a high
 * one produces a high one — a check that a hardcoded constant of any value
 * cannot pass.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { CoordinatorEngine } from '../../src/tools/engine.ts';
import { DatabaseSync } from 'node:sqlite';
import { RunStore } from '../../src/store/run-store.ts';
import { STORE_FILE_NAME } from '../../src/store/schema.ts';
import { join } from 'node:path';
import { newPhase1Config } from './fixtures.ts';
import type { Phase1Config } from '../../src/config/phase1-config.ts';
import type { CoordinatorJudgmentDraft } from '../../src/contracts/coordinator-draft.ts';
import type { ResolverCandidate, Confidence } from '../../src/contracts/resolution.ts';
import type { CoordinatorOutput } from '../../src/contracts/coordinator-output.ts';

function newEngine(config: Phase1Config): CoordinatorEngine {
  return new CoordinatorEngine({ phase1Config: () => config });
}

function paintCandidate(candidates: Readonly<Record<string, readonly ResolverCandidate[]>>): ResolverCandidate {
  for (const list of Object.values(candidates)) {
    const found = list.find((candidate) => candidate.ref_class === 'paint-style');
    if (found !== undefined) return found;
  }
  throw new Error('no paint-style candidate — the fixture or PD-7 categories changed');
}

function draftFor(candidateId: string): CoordinatorJudgmentDraft {
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
          bindings: [{ property: 'fill', reference_text: 'warning fill', selected_candidate_id: candidateId }],
        },
      ],
    },
  };
}

/** The composed artifact, read back from the store as bytes — not from the
 *  in-memory return, so what is asserted is what the run actually persisted. */
function storedOutput(config: Phase1Config, runId: string): CoordinatorOutput {
  const store = new RunStore(join(config.approvedDataDirectory, STORE_FILE_NAME));
  const artifact = store.getCurrentArtifact(runId);
  assert.ok(artifact !== undefined, 'no artifact was persisted');
  return JSON.parse(artifact.canonical_json) as CoordinatorOutput;
}

describe('the aggregate confidence tracks the retrieval it summarises (AC-1)', () => {
  test('a low candidate yields a low aggregate, in the artifact and in the view', () => {
    const config = newPhase1Config();
    const engine = newEngine(config);
    const { run_id } = engine.beginRun({ operation_id: 'component.create', user_intent: 'a warning toast' });
    const prepared = engine.prepareContext(run_id);
    const candidate = paintCandidate(prepared.candidates);

    // The premise of the test, asserted rather than assumed: PD-7's broadened
    // listing really does return low-confidence candidates. If this ever
    // stopped being true the test below would pass for the wrong reason.
    assert.equal(candidate.confidence, 'low', 'PD-7 broadened retrieval is expected to be low confidence');

    assert.equal(engine.submitDraft(run_id, draftFor(candidate.candidate_id)).outcome, 'accepted');

    const output = storedOutput(config, run_id);
    assert.equal(output.status, 'ready');
    if (output.status !== 'ready' || output.run_type !== 'new') return;
    assert.equal(output.aggregate_confidence, 'low', 'the artifact must not claim a confidence nothing measured');

    const view = engine.presentForApproval(run_id).approval_view;
    assert.ok(view.body.includes('Aggregate confidence: low'), view.body);
    assert.ok(!view.body.includes('Aggregate confidence: medium'));
  });

  test('the value is derived, not constant — a high candidate yields a high aggregate', () => {
    // The direction a hardcoded value of ANY level cannot satisfy together
    // with the test above. The recorded confidence is rewritten in the store
    // to `high`, which is exactly what a different retrieval would have
    // written, and the composed artifact must follow it.
    const config = newPhase1Config();
    const engine = newEngine(config);
    const { run_id } = engine.beginRun({ operation_id: 'component.create', user_intent: 'a warning toast' });
    const prepared = engine.prepareContext(run_id);
    const candidate = paintCandidate(prepared.candidates);

    rewriteRecordedConfidence(config, run_id, candidate.candidate_id, 'high');

    assert.equal(engine.submitDraft(run_id, draftFor(candidate.candidate_id)).outcome, 'accepted');
    const output = storedOutput(config, run_id);
    if (output.status !== 'ready' || output.run_type !== 'new') {
      assert.fail('expected a ready new-route output');
    }
    assert.equal(output.aggregate_confidence, 'high');
  });

  test('an unrecorded confidence is low, never medium — "unknown" is not "middling"', () => {
    const config = newPhase1Config();
    const engine = newEngine(config);
    const { run_id } = engine.beginRun({ operation_id: 'component.create', user_intent: 'a warning toast' });
    const prepared = engine.prepareContext(run_id);
    const candidate = paintCandidate(prepared.candidates);

    // Erase the recording entirely: the composer must fall back to `low`.
    // Before AC-1 this same state produced `medium` — a value higher than the
    // truth, printed under a line explaining a rule it did not follow.
    eraseRecordedConfidence(config, run_id);

    assert.equal(engine.submitDraft(run_id, draftFor(candidate.candidate_id)).outcome, 'accepted');
    const output = storedOutput(config, run_id);
    if (output.status !== 'ready' || output.run_type !== 'new') assert.fail('expected a ready new-route output');
    assert.equal(output.aggregate_confidence, 'low');
  });
});

describe('prepareContext records the confidence of every candidate it showed', () => {
  test('the recorded map covers exactly the candidates returned — both directions', () => {
    const config = newPhase1Config();
    const engine = newEngine(config);
    const { run_id } = engine.beginRun({ operation_id: 'component.create', user_intent: 'x' });
    const prepared = engine.prepareContext(run_id);

    const returned = new Map<string, Confidence>();
    for (const list of Object.values(prepared.candidates)) {
      for (const candidate of list) returned.set(candidate.candidate_id, candidate.confidence);
    }
    assert.ok(returned.size > 0, 'the check would pass vacuously with no candidates');

    const recorded = recordedConfidence(config, run_id);
    // Direction 1: nothing shown is unrecorded.
    for (const [candidateId, confidence] of returned) {
      assert.equal(recorded[candidateId], confidence, `${candidateId} was shown but not recorded, or recorded differently`);
    }
    // Direction 2: nothing recorded was never shown. A one-way check could not
    // see an invented entry, and BP-6 is explicit that one-way is not enough.
    for (const candidateId of Object.keys(recorded)) {
      assert.ok(returned.has(candidateId), `${candidateId} was recorded but never shown to the model`);
    }
  });

  test('the recorded values are real confidence levels, not free text', () => {
    const config = newPhase1Config();
    const engine = newEngine(config);
    const { run_id } = engine.beginRun({ operation_id: 'component.create', user_intent: 'x' });
    engine.prepareContext(run_id);
    for (const value of Object.values(recordedConfidence(config, run_id))) {
      assert.ok(['high', 'medium', 'low'].includes(value), `"${value}" is not a Confidence`);
    }
  });
});

// --- store helpers -----------------------------------------------------------
// These reach into the persisted event to read and to rewrite what
// `prepareContext` recorded. Rewriting is how the "derived, not constant"
// direction is tested: it stands in for a retrieval that ranked differently,
// which the synthetic fixture is too small to produce naturally.

function preparationEvent(config: Phase1Config, runId: string): { seq: number; payload: Record<string, unknown> } {
  const store = new RunStore(join(config.approvedDataDirectory, STORE_FILE_NAME));
  const events = store.getEvents(runId);
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i];
    if (event?.kind === 'context-preparation-succeeded') return { seq: event.seq, payload: event.payload };
  }
  throw new Error('no context-preparation-succeeded event');
}

function recordedConfidence(config: Phase1Config, runId: string): Record<string, string> {
  const recorded = preparationEvent(config, runId).payload['candidate_confidence'];
  assert.ok(typeof recorded === 'object' && recorded !== null, 'no candidate_confidence was recorded');
  return recorded as Record<string, string>;
}

function writePreparationPayload(config: Phase1Config, runId: string, payload: Record<string, unknown>): void {
  // `run_event` is append-only through the store's own API (G-12), so this
  // rewrites the row directly with SQL — a test fixture manipulation, not a
  // path any production code has. It is deliberately not exposed on RunStore.
  const db = new DatabaseSync(join(config.approvedDataDirectory, STORE_FILE_NAME));
  try {
    const { seq } = preparationEvent(config, runId);
    db.prepare('UPDATE run_event SET payload_json = ? WHERE run_id = ? AND seq = ?').run(JSON.stringify(payload), runId, seq);
  } finally {
    db.close();
  }
}

function rewriteRecordedConfidence(config: Phase1Config, runId: string, candidateId: string, to: Confidence): void {
  const recorded = { ...recordedConfidence(config, runId), [candidateId]: to };
  writePreparationPayload(config, runId, { candidate_confidence: recorded });
}

function eraseRecordedConfidence(config: Phase1Config, runId: string): void {
  writePreparationPayload(config, runId, {});
}
