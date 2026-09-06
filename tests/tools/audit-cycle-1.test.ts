/**
 * Audit cycle 1's engine-side fixes, each with the assertion that would have
 * failed before it. Findings AC-4 through AC-9 of
 * `docs/builder-master-audit-cycle-1.md`.
 *
 * Every one of these was invisible to a green 753-test suite. That is the
 * point of the cycle and the reason §5 of the plan forbids skipping one
 * because the suite is green.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { CoordinatorEngine } from '../../src/tools/engine.ts';
import { GuardRefusal } from '../../src/guard/errors.ts';
import { RunStore } from '../../src/store/run-store.ts';
import { STORE_FILE_NAME } from '../../src/store/schema.ts';
import { FAILURE_CLASSES, FAILURE_IS_TERMINAL } from '../../src/contracts/failures.ts';
import { DISCLOSURE_KINDS } from '../../src/contracts/resolution.ts';
import { newPhase1Config } from './fixtures.ts';
import type { Phase1Config } from '../../src/config/phase1-config.ts';
import type { CoordinatorJudgmentDraft } from '../../src/contracts/coordinator-draft.ts';
import type { CoordinatorOutput } from '../../src/contracts/coordinator-output.ts';

function run(): { engine: CoordinatorEngine; config: Phase1Config; runId: string; candidateId: string } {
  const config = newPhase1Config();
  const engine = new CoordinatorEngine({ phase1Config: () => config });
  const { run_id } = engine.beginRun({ operation_id: 'component.create', user_intent: 'a warning toast' });
  const context = engine.prepareContext(run_id);
  for (const list of Object.values(context.candidates)) {
    const paint = list.find((candidate) => candidate.ref_class === 'paint-style');
    if (paint !== undefined) return { engine, config, runId: run_id, candidateId: paint.candidate_id };
  }
  throw new Error('no paint-style candidate — the fixture or PD-7 categories changed');
}

/** A run in `received` — the phase §12.2 makes `failRun` reachable from.
 *  `run()` above stops in `drafting`, where G-11 refuses failRun before the
 *  class is ever inspected, so a test written against it would have asserted
 *  the wrong refusal and passed for the wrong reason. */
function receivedRun(): { engine: CoordinatorEngine; runId: string } {
  const config = newPhase1Config();
  const engine = new CoordinatorEngine({ phase1Config: () => config });
  const { run_id } = engine.beginRun({ operation_id: 'component.create', user_intent: 'a warning toast' });
  assert.equal(engine.resumeRun(run_id).phase, 'received');
  return { engine, runId: run_id };
}

function draft(candidateId: string): CoordinatorJudgmentDraft {
  return {
    run_type: 'new',
    self_assessment: 'believe-complete',
    semantic_brief: {
      component_name: 'Warning Toast',
      intent_summary: 'A dismissible warning notification.',
      variant_properties: [{ name: 'state', options: ['default'], default_option: 'default' }],
      elements: [
        { semantic_id: 'root', role: 'container', bindings: [{ property: 'fill', reference_text: 'warning fill', selected_candidate_id: candidateId }] },
      ],
    },
  };
}

function toApproval(engine: CoordinatorEngine, runId: string, candidateId: string): void {
  engine.submitDraft(runId, draft(candidateId));
  engine.presentForApproval(runId);
}

function storedOutput(config: Phase1Config, runId: string): CoordinatorOutput {
  const artifact = new RunStore(join(config.approvedDataDirectory, STORE_FILE_NAME)).getCurrentArtifact(runId);
  assert.ok(artifact !== undefined);
  return JSON.parse(artifact.canonical_json) as CoordinatorOutput;
}

describe('AC-4 — the broadened retrieval is disclosed, not left to be inferred from a low score', () => {
  test('a composed artifact carries a broadened_retrieval disclosure', () => {
    const { engine, config, runId, candidateId } = run();
    engine.submitDraft(runId, draft(candidateId));
    const output = storedOutput(config, runId);
    // Before AC-4 this was structurally always `[]`: `composeTrustedOutput` has
    // one production caller and it passed no disclosures at all, while every
    // candidate on the route carried `ranking_reasons: ['broadened-retrieval']`.
    assert.equal(output.disclosures.length, 1, 'the one honest disclosure this route can always make');
    const disclosure = output.disclosures[0];
    assert.ok(disclosure !== undefined);
    assert.equal(disclosure.kind, 'broadened_retrieval');
    assert.ok((DISCLOSURE_KINDS as readonly string[]).includes(disclosure.kind));
    assert.equal(disclosure.owner, 'coordinator');
    assert.equal(disclosure.actionable, false, 'a disclosure can never block');
    assert.match(disclosure.evidence, /PD-7/);
  });

  test('the designer sees the disclosure and the confidence together', () => {
    const { engine, runId, candidateId } = run();
    engine.submitDraft(runId, draft(candidateId));
    const body = engine.presentForApproval(runId).approval_view.body;
    assert.match(body, /Aggregate confidence: low/);
    assert.match(body, /Disclosures/);
    assert.match(body, /broadened_retrieval/);
    // The point of the pair: a low score with no explanation reads as a defect;
    // with the disclosure it reads as what it is.
    assert.ok(body.indexOf('Aggregate confidence') < body.indexOf('Disclosures'));
  });

  test('the disclosure is recorded on the preparation event, not minted at composition', () => {
    const { config, runId } = run();
    const events = new RunStore(join(config.approvedDataDirectory, STORE_FILE_NAME)).getEvents(runId);
    const prepared = events.find((event) => event.kind === 'context-preparation-succeeded');
    assert.ok(prepared !== undefined);
    assert.ok(Array.isArray(prepared.payload['disclosures']));
  });
});

describe('AC-5 — buildHandoff reads the recorded approval, it does not re-mint it', () => {
  test('the four qualifiers in the handoff come from the stored row', () => {
    const { engine, runId, candidateId } = run();
    toApproval(engine, runId, candidateId);
    engine.recordApproval(runId, 'approved', 'a designer');
    const approval = engine.buildHandoff(runId).machine_handoff.approval;
    assert.ok(approval !== undefined);
    assert.equal(approval.gate_mode, 'observe-only-validation');
    assert.equal(approval.response_source, 'model-relayed');
    assert.equal(approval.verified, false);
    assert.equal(approval.authorizing, false);
  });

  test('a stored qualifier outside its closed set is refused, never laundered into a typed record', () => {
    const { engine, config, runId, candidateId } = run();
    toApproval(engine, runId, candidateId);
    engine.recordApproval(runId, 'approved', 'a designer');

    // Before AC-5, `gate_mode` and `response_source` were literals in
    // buildHandoff while their siblings were read from the row — so a stored
    // `authorising` was silently downgraded to observe-only in the handoff,
    // the failure mode inverted. Now the read refuses what it cannot type.
    const db = new DatabaseSync(join(config.approvedDataDirectory, STORE_FILE_NAME));
    try {
      db.prepare("UPDATE approval SET gate_mode = 'authorising' WHERE run_id = ?").run(runId);
    } finally {
      db.close();
    }
    assert.throws(
      () => engine.buildHandoff(runId),
      (error: unknown) => error instanceof GuardRefusal && error.code === 'G-9a',
      'an authorising gate_mode must be surfaced at G-9a, never rewritten to observe-only',
    );
  });

  test('a stored qualifier outside its closed set is unreadable, not coerced', () => {
    const { engine, config, runId, candidateId } = run();
    toApproval(engine, runId, candidateId);
    engine.recordApproval(runId, 'approved', 'a designer');
    const db = new DatabaseSync(join(config.approvedDataDirectory, STORE_FILE_NAME));
    try {
      db.prepare("UPDATE approval SET response_source = 'host-verified' WHERE run_id = ?").run(runId);
    } finally {
      db.close();
    }
    assert.throws(
      () => engine.buildHandoff(runId),
      (error: unknown) => error instanceof GuardRefusal && error.code === 'G-9b',
      'RESPONSE_SOURCES is closed at model-relayed; anything else is not an ApprovalRecord',
    );
  });
});

describe('AC-6 — failRun refuses a non-terminal or unregistered failure class (§13)', () => {
  for (const failureClass of FAILURE_CLASSES.filter((name) => !FAILURE_IS_TERMINAL[name])) {
    test(`the non-terminal class "${failureClass}" is refused`, () => {
      const { engine, runId } = receivedRun();
      assert.throws(
        () => engine.failRun(runId, failureClass),
        (error: unknown) => error instanceof GuardRefusal && /non-terminal/.test(error.message),
      );
    });
  }

  for (const bogus of ['not-a-class-at-all', '', 'DROP TABLE run', 'Validation-Failure']) {
    test(`the unregistered class ${JSON.stringify(bogus)} is refused`, () => {
      const { engine, runId } = receivedRun();
      assert.throws(
        () => engine.failRun(runId, bogus),
        (error: unknown) => error instanceof GuardRefusal && /not a registered failure class/.test(error.message),
      );
    });
  }

  test('a terminal class still works — the gate refuses, it does not block everything', () => {
    const terminal = FAILURE_CLASSES.filter((name) => FAILURE_IS_TERMINAL[name]);
    assert.ok(terminal.length > 0, 'the loop above would be vacuous with no terminal classes');
    for (const failureClass of terminal) {
      const { engine, runId } = receivedRun();
      assert.equal(engine.failRun(runId, failureClass).outcome, 'failed');
    }
  });

  test('a refused failRun leaves the run where it was', () => {
    const { engine, runId } = receivedRun();
    const before = engine.resumeRun(runId).phase;
    assert.throws(() => engine.failRun(runId, 'validation-failure'));
    assert.equal(engine.resumeRun(runId).phase, before);
  });
});

describe('AC-7 — G-7 is thrown where §12.1 says it is, not only declared', () => {
  test('buildHandoff with no recorded response refuses at G-7', () => {
    const { engine, config, runId, candidateId } = run();
    toApproval(engine, runId, candidateId);
    // Reach handoff-ready, then remove the approval the phase was granted for.
    engine.recordApproval(runId, 'approved', 'a designer');
    const db = new DatabaseSync(join(config.approvedDataDirectory, STORE_FILE_NAME));
    try {
      db.prepare('DELETE FROM approval WHERE run_id = ?').run(runId);
    } finally {
      db.close();
    }
    assert.throws(
      () => engine.buildHandoff(runId),
      (error: unknown) => error instanceof GuardRefusal && error.code === 'G-7',
      'buildHandoff used to tolerate no approval at all',
    );
  });

  test('buildHandoff whose recorded response binds a different artifact refuses at G-7', () => {
    const { engine, config, runId, candidateId } = run();
    toApproval(engine, runId, candidateId);
    engine.recordApproval(runId, 'approved', 'a designer');
    const db = new DatabaseSync(join(config.approvedDataDirectory, STORE_FILE_NAME));
    try {
      db.prepare("UPDATE approval SET approved_artifact_sha256 = ? WHERE run_id = ?").run('f'.repeat(64), runId);
    } finally {
      db.close();
    }
    assert.throws(
      () => engine.buildHandoff(runId),
      (error: unknown) => error instanceof GuardRefusal && error.code === 'G-7',
    );
  });

  test('the happy path is unaffected — G-7 refuses a gap, not a gate that was passed', () => {
    const { engine, runId, candidateId } = run();
    toApproval(engine, runId, candidateId);
    engine.recordApproval(runId, 'approved', 'a designer');
    assert.equal(engine.buildHandoff(runId).next_route, 'builder');
  });
});

describe('AC-9 — the leakage assertion’s own report is recorded', () => {
  test('the preparation event says which checks ran and which could not', () => {
    const { config, runId } = run();
    const events = new RunStore(join(config.approvedDataDirectory, STORE_FILE_NAME)).getEvents(runId);
    const prepared = events.find((event) => event.kind === 'context-preparation-succeeded');
    assert.ok(prepared !== undefined);
    const leakage = prepared.payload['leakage'] as { clean: boolean; checks_run: string[]; raw_source_checked: boolean };
    assert.equal(leakage.clean, true);
    assert.ok(leakage.checks_run.length > 0);
    // §15.6: only ingestion may read raw curated JSON, so this is honestly
    // false rather than a fabricated pass — and now it is *recorded* as false,
    // where before a run that ran three checks and a run that ran five were
    // indistinguishable in the record.
    assert.equal(leakage.raw_source_checked, false);
  });
});
