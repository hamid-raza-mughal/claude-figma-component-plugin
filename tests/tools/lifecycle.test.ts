/**
 * The remaining flows (§5, §7, §9, §2.11) — clarification, approval,
 * handoff, completion, and maintenance-driven invalidation. Exercises the
 * full lifecycle end to end against a real store and a real (synthetic)
 * curated source.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CoordinatorEngine } from '../../src/tools/engine.ts';
import { GuardRefusal } from '../../src/guard/errors.ts';
import { STORE_FILE_NAME } from '../../src/store/schema.ts';
import { newPhase1Config } from './fixtures.ts';
import type { CoordinatorJudgmentDraft } from '../../src/contracts/coordinator-draft.ts';
import type { ResolverCandidate } from '../../src/contracts/resolution.ts';

function newEngine(nowValue = { current: '2026-07-29T10:00:00Z' }): { engine: CoordinatorEngine; nowValue: { current: string } } {
  const config = newPhase1Config();
  const engine = new CoordinatorEngine({ phase1Config: () => config, now: () => nowValue.current });
  return { engine, nowValue };
}

function findCandidate(
  candidates: Readonly<Record<string, readonly ResolverCandidate[]>>,
  refClass: ResolverCandidate['ref_class'],
): ResolverCandidate {
  for (const list of Object.values(candidates)) {
    const found = list.find((c) => c.ref_class === refClass);
    if (found !== undefined) return found;
  }
  throw new Error(`no ${refClass} candidate found`);
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

function blockedDraft(round: number): CoordinatorJudgmentDraft {
  return {
    run_type: 'new',
    self_assessment: 'need-clarification',
    semantic_brief: {
      component_name: 'Warning Toast',
      intent_summary: 'A dismissible warning notification.',
      variant_properties: [{ name: 'state', options: ['default'], default_option: 'default' }],
      elements: [{ semantic_id: 'root', role: 'container', bindings: [] }],
    },
    clarification_gaps: [
      {
        gap_id: 'gap-1',
        state: 'active',
        severity: 'blocking',
        owner: 'user',
        question: 'Which surface token for the fill?',
        evidence: 'no candidate scored above the floor',
        required_answer: 'a token path',
        opened_in_round: round,
      },
    ],
  };
}

describe('the full happy path — beginRun through closeRun(completed)', () => {
  test('completes end to end and G-10 agrees on all four values', () => {
    const { engine } = newEngine();
    const { run_id } = engine.beginRun({ operation_id: 'component.create', user_intent: 'Build a warning toast' });
    const prepared = engine.prepareContext(run_id);
    const paint = findCandidate(prepared.candidates, 'paint-style');

    const submitted = engine.submitDraft(run_id, readyDraft(paint.candidate_id));
    assert.equal(submitted.outcome, 'accepted');

    const presented = engine.presentForApproval(run_id);
    assert.match(presented.artifact_sha256, /^[0-9a-f]{64}$/);

    const recorded = engine.recordApproval(run_id, 'approved', 'ux@techlogix.com');
    assert.equal(recorded.outcome, 'advance');
    assert.equal(engine.resumeRun(run_id).phase, 'handoff-ready');

    const handoff = engine.buildHandoff(run_id);
    assert.equal(handoff.next_route, 'builder');
    assert.equal(handoff.machine_handoff.approval?.verified, false);
    assert.equal(handoff.machine_handoff.approval?.authorizing, false);

    const closed = engine.closeRun(run_id, 'completed');
    assert.equal(closed.outcome, 'completed');
    assert.equal(engine.resumeRun(run_id).phase, 'terminal');
  });

  test('G-10 refuses closeRun(completed) when stored artifact bytes have been tampered with', () => {
    // Value 3 (§9.2.1) re-derives the hash from `artifact.canonical_json` read
    // back from storage, specifically so storage corruption is reachable —
    // proven here by corrupting the row directly through a second raw
    // connection to the same database file, bypassing RunStore's API (which
    // correctly has no update method for `artifact`, by design).
    const config = newPhase1Config();
    const engine = new CoordinatorEngine({ phase1Config: () => config, now: () => '2026-07-29T10:00:00Z' });
    const { run_id } = engine.beginRun({ operation_id: 'component.create', user_intent: 'x' });
    const prepared = engine.prepareContext(run_id);
    const paint = findCandidate(prepared.candidates, 'paint-style');
    engine.submitDraft(run_id, readyDraft(paint.candidate_id));
    engine.presentForApproval(run_id);
    engine.recordApproval(run_id, 'approved', 'ux@techlogix.com');
    engine.buildHandoff(run_id);

    const dbPath = join(config.approvedDataDirectory, STORE_FILE_NAME);
    const raw = new DatabaseSync(dbPath);
    try {
      const row = raw.prepare('SELECT canonical_json FROM artifact WHERE run_id = ?').get(run_id) as
        | { canonical_json: string }
        | undefined;
      assert.ok(row !== undefined);
      const tampered = JSON.parse(row.canonical_json) as Record<string, unknown>;
      tampered['composed_at'] = '1999-01-01T00:00:00Z'; // any byte-level change
      raw.prepare('UPDATE artifact SET canonical_json = ? WHERE run_id = ?').run(JSON.stringify(tampered), run_id);
    } finally {
      raw.close();
    }

    assert.throws(
      () => engine.closeRun(run_id, 'completed'),
      (error: unknown) => error instanceof GuardRefusal && error.code === 'G-10',
    );
  });

  test('G-19b refuses buildHandoff when the bound artifact has a null next_route', () => {
    // A 'ready' composition (the only kind ever written to the artifact
    // table, §4.4) always has a non-null next_route by construction — this
    // condition is defense-in-depth against storage corruption, matching the
    // G-10 tamper test's pattern, not a path reachable through the ordinary
    // flow (composed status determines next_route, not the reverse).
    const config = newPhase1Config();
    const engine = new CoordinatorEngine({ phase1Config: () => config, now: () => '2026-07-29T10:00:00Z' });
    const { run_id } = engine.beginRun({ operation_id: 'component.create', user_intent: 'x' });
    const prepared = engine.prepareContext(run_id);
    const paint = findCandidate(prepared.candidates, 'paint-style');
    engine.submitDraft(run_id, readyDraft(paint.candidate_id));
    engine.presentForApproval(run_id);
    engine.recordApproval(run_id, 'approved', 'ux@techlogix.com');

    const dbPath = join(config.approvedDataDirectory, STORE_FILE_NAME);
    const raw = new DatabaseSync(dbPath);
    try {
      const row = raw.prepare('SELECT canonical_json FROM artifact WHERE run_id = ?').get(run_id) as
        | { canonical_json: string }
        | undefined;
      assert.ok(row !== undefined);
      const tampered = JSON.parse(row.canonical_json) as Record<string, unknown>;
      tampered['next_route'] = null;
      raw.prepare('UPDATE artifact SET canonical_json = ? WHERE run_id = ?').run(JSON.stringify(tampered), run_id);
    } finally {
      raw.close();
    }

    assert.throws(
      () => engine.buildHandoff(run_id),
      (error: unknown) => error instanceof GuardRefusal && error.code === 'G-19b',
    );
  });
});

describe('clarification — §5, gaps read from the submitted draft, never re-supplied', () => {
  test('a blocked composition opens round 1, is answered, and re-drafts', () => {
    const { engine } = newEngine();
    const { run_id } = engine.beginRun({ operation_id: 'component.create', user_intent: 'x' });
    engine.prepareContext(run_id);
    const submitted = engine.submitDraft(run_id, blockedDraft(1));
    assert.equal(submitted.outcome, 'accepted');
    assert.equal(engine.resumeRun(run_id).phase, 'validating');

    const opened = engine.openClarification(run_id);
    assert.equal(opened.round, 1);
    assert.equal(opened.phase, 'awaiting-clarification');

    const answered = engine.answerClarification(run_id, 1, [{ gap_id: 'gap-1', answer: 'sys/color/warning' }]);
    assert.equal(answered.phase, 'drafting');
  });

  test('G-6b: opened_in_round must match the Guard-derived round, not the model\'s own count', () => {
    const { engine } = newEngine();
    const { run_id } = engine.beginRun({ operation_id: 'component.create', user_intent: 'x' });
    engine.prepareContext(run_id);
    engine.submitDraft(run_id, blockedDraft(2)); // claims round 2 when round 1 is actually next
    assert.throws(
      () => engine.openClarification(run_id),
      (error: unknown) => error instanceof GuardRefusal && error.code === 'G-6b',
    );
  });

  test('G-6a: the round budget (2) is enforced — a third round is refused', () => {
    const { engine } = newEngine();
    const { run_id } = engine.beginRun({ operation_id: 'component.create', user_intent: 'x' });
    engine.prepareContext(run_id);
    engine.submitDraft(run_id, blockedDraft(1));
    engine.openClarification(run_id); // round 1
    engine.answerClarification(run_id, 1, [{ gap_id: 'gap-1', answer: 'still unsure' }]);
    engine.submitDraft(run_id, blockedDraft(2));
    engine.openClarification(run_id); // round 2 — the soft budget
    engine.answerClarification(run_id, 2, [{ gap_id: 'gap-1', answer: 'still unsure' }]);
    engine.submitDraft(run_id, blockedDraft(3));
    assert.throws(
      () => engine.openClarification(run_id),
      (error: unknown) => error instanceof GuardRefusal && error.code === 'G-6a',
    );
  });

  test('wrong round is refused by answerClarification', () => {
    const { engine } = newEngine();
    const { run_id } = engine.beginRun({ operation_id: 'component.create', user_intent: 'x' });
    engine.prepareContext(run_id);
    engine.submitDraft(run_id, blockedDraft(1));
    engine.openClarification(run_id);
    assert.throws(() => engine.answerClarification(run_id, 2, [{ gap_id: 'gap-1', answer: 'x' }]));
  });

  test('closeRun(blocked) is refused from validating while clarification budget remains', () => {
    const { engine } = newEngine();
    const { run_id } = engine.beginRun({ operation_id: 'component.create', user_intent: 'x' });
    engine.prepareContext(run_id);
    engine.submitDraft(run_id, blockedDraft(1));
    assert.throws(
      () => engine.closeRun(run_id, 'blocked'),
      (error: unknown) => error instanceof GuardRefusal && error.code === 'G-1',
    );
  });

  test('closeRun(blocked) succeeds once the clarification budget is exhausted', () => {
    const { engine } = newEngine();
    const { run_id } = engine.beginRun({ operation_id: 'component.create', user_intent: 'x' });
    engine.prepareContext(run_id);
    engine.submitDraft(run_id, blockedDraft(1));
    engine.openClarification(run_id);
    engine.answerClarification(run_id, 1, [{ gap_id: 'gap-1', answer: 'still unsure' }]);
    engine.submitDraft(run_id, blockedDraft(2));
    engine.openClarification(run_id); // round 2, the soft budget — no round 3 possible
    const closed = engine.closeRun(run_id, 'blocked');
    assert.equal(closed.outcome, 'blocked');
    assert.equal(engine.resumeRun(run_id).phase, 'terminal');
  });
});

describe('recordApproval — §7, G-9a/G-9b structural, G-8 re-presentation', () => {
  test('every recorded approval is model-relayed, unverified, non-authorizing — no caller field can change that', () => {
    const { engine } = newEngine();
    const { run_id } = engine.beginRun({ operation_id: 'component.create', user_intent: 'x' });
    const prepared = engine.prepareContext(run_id);
    const paint = findCandidate(prepared.candidates, 'paint-style');
    engine.submitDraft(run_id, readyDraft(paint.candidate_id));
    engine.presentForApproval(run_id);
    const recorded = engine.recordApproval(run_id, 'approved', 'ux@techlogix.com');
    assert.equal(recorded.outcome, 'advance');
    // recordApproval's own parameters (run_id, decision, approved_by) have no
    // field for verified/authorizing/response_source at all (G-9a/G-9b).
  });

  test('changes-requested returns the run to drafting', () => {
    const { engine } = newEngine();
    const { run_id } = engine.beginRun({ operation_id: 'component.create', user_intent: 'x' });
    const prepared = engine.prepareContext(run_id);
    const paint = findCandidate(prepared.candidates, 'paint-style');
    engine.submitDraft(run_id, readyDraft(paint.candidate_id));
    engine.presentForApproval(run_id);
    const recorded = engine.recordApproval(run_id, 'changes-requested', 'ux@techlogix.com');
    assert.equal(recorded.outcome, 'redraft');
    assert.equal(engine.resumeRun(run_id).phase, 'drafting');
  });

  test('rejected closes the run blocked (§9.1.1)', () => {
    const { engine } = newEngine();
    const { run_id } = engine.beginRun({ operation_id: 'component.create', user_intent: 'x' });
    const prepared = engine.prepareContext(run_id);
    const paint = findCandidate(prepared.candidates, 'paint-style');
    engine.submitDraft(run_id, readyDraft(paint.candidate_id));
    engine.presentForApproval(run_id);
    const recorded = engine.recordApproval(run_id, 'rejected', 'ux@techlogix.com');
    assert.equal(recorded.outcome, 'terminal');
    assert.equal(engine.resumeRun(run_id).phase, 'terminal');
  });

  test('G-11: recordApproval is unreachable before presentForApproval has run', () => {
    const { engine } = newEngine();
    const { run_id } = engine.beginRun({ operation_id: 'component.create', user_intent: 'x' });
    engine.prepareContext(run_id);
    assert.throws(
      () => engine.recordApproval(run_id, 'approved', 'ux@techlogix.com'),
      (error: unknown) => error instanceof GuardRefusal && error.code === 'G-11',
    );
  });
});

describe('runMaintenance — §2.11, source-invalidated fanout, G-21', () => {
  test('source.validate never fanouts and never changes any run', () => {
    const { engine } = newEngine();
    const { run_id } = engine.beginRun({ operation_id: 'component.create', user_intent: 'x' });
    const result = engine.runMaintenance('source.validate');
    assert.equal(result.ok, true);
    assert.deepEqual(result.invalidated_run_ids, []);
    assert.equal(engine.resumeRun(run_id).phase, 'received');
  });

  test('source.refresh against an unchanged source invalidates nothing', () => {
    const { engine } = newEngine();
    const { run_id } = engine.beginRun({ operation_id: 'component.create', user_intent: 'x' });
    const result = engine.runMaintenance('source.refresh');
    assert.equal(result.outcome, 'unchanged');
    assert.deepEqual(result.invalidated_run_ids, []);
    assert.equal(engine.resumeRun(run_id).phase, 'received');
  });

  test('G-21: an invalidated run refuses every forward tool except closeRun(blocked)/cancelRun', () => {
    const config = newPhase1Config();
    const engine = new CoordinatorEngine({ phase1Config: () => config, now: () => '2026-07-29T10:00:00Z' });
    const { run_id } = engine.beginRun({ operation_id: 'component.create', user_intent: 'x' });
    const prepared = engine.prepareContext(run_id);
    const paint = findCandidate(prepared.candidates, 'paint-style');
    // Reach validating first, so presentForApproval would otherwise be
    // reachable — proving G-21 is what refuses it, not G-11.
    engine.submitDraft(run_id, readyDraft(paint.candidate_id));
    assert.equal(engine.resumeRun(run_id).phase, 'validating');

    // Simulate a refresh that changes the source: append the marker directly
    // via runMaintenance's own mechanism by mutating the curated file first.
    writeFileSync(
      config.curatedSourcePath,
      JSON.stringify({
        meta: { schema_version: '1.1' },
        variables: {
          collections: [{ id: 'c1', key: 'c1', name: 'Colors', modes: [{ modeId: '1:0', name: 'Light' }] }],
          items: [
            {
              id: 'v2',
              key: 'def',
              name: 'color/new',
              collection_id: 'c1',
              type: 'COLOR',
              values_by_mode: { '1:0': { r: 0.5, g: 0.5, b: 0.5 } },
              scopes: ['ALL_FILLS'],
              description: 'x',
            },
          ],
        },
        styles: { paint: [{ id: 'p2', key: 'p2key', name: 'x', description: 'x', paints: [{ type: 'SOLID' }] }], text: [], effect: [], grid: [] },
        diagnostics: {},
      }),
    );

    const refreshed = engine.runMaintenance('source.refresh');
    assert.equal(refreshed.outcome, 'refreshed');
    assert.ok(refreshed.invalidated_run_ids.includes(run_id));

    assert.throws(
      () => engine.presentForApproval(run_id),
      (error: unknown) => error instanceof GuardRefusal && error.code === 'G-21',
    );
    assert.throws(
      () => engine.resumeRun(run_id),
      (error: unknown) => error instanceof GuardRefusal && error.code === 'G-21',
    );

    const closed = engine.closeRun(run_id, 'blocked');
    assert.equal(closed.outcome, 'blocked');
  });

  test('a terminal run is never invalidated — the fanout skips it', () => {
    const config = newPhase1Config();
    const engine = new CoordinatorEngine({ phase1Config: () => config, now: () => '2026-07-29T10:00:00Z' });
    const { run_id } = engine.beginRun({ operation_id: 'component.create', user_intent: 'x' });
    engine.cancelRun(run_id);

    writeFileSync(
      config.curatedSourcePath,
      JSON.stringify({
        meta: { schema_version: '1.1' },
        variables: {
          collections: [{ id: 'c1', key: 'c1', name: 'Colors', modes: [{ modeId: '1:0', name: 'Light' }] }],
          items: [{ id: 'v3', key: 'ghi', name: 'color/other', collection_id: 'c1', type: 'COLOR', values_by_mode: { '1:0': { r: 1, g: 1, b: 1 } }, scopes: ['ALL_FILLS'], description: 'x' }],
        },
        styles: { paint: [{ id: 'p3', key: 'p3key', name: 'x', description: 'x', paints: [{ type: 'SOLID' }] }], text: [], effect: [], grid: [] },
        diagnostics: {},
      }),
    );

    const refreshed = engine.runMaintenance('source.refresh');
    assert.ok(!refreshed.invalidated_run_ids.includes(run_id));
  });
});
