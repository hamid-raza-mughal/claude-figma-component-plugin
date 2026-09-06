/**
 * A2's acceptance, both halves.
 *
 * One: the documented happy path is walked **through the real tool boundary**,
 * a fresh engine per call so each step is as independent as a separate CLI
 * process, and the observed phase sequence is asserted to equal §4's table
 * exactly — not merely to end somewhere reasonable.
 *
 * Two: skipping `presentForApproval` and calling `buildHandoff` is refused by
 * the Guard with its named error. The instructions must never work around a
 * refusal, so the refusal has to be real; this is the test that says it is.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli, type CliEnvelope } from '../../src/runtimes/claude-code/cli.ts';
import { CoordinatorEngine } from '../../src/tools/engine.ts';
import { newPhase1Config } from '../tools/fixtures.ts';
import type { Phase1Config } from '../../src/config/phase1-config.ts';
import type { ResolverCandidate } from '../../src/contracts/resolution.ts';
import type { StagePhase } from '../../src/contracts/run-envelope.ts';

/** One CLI invocation. A **new** engine every time: a real run is a sequence of
 *  separate processes, and an engine reused across steps would let an
 *  in-memory belief stand in for what the store actually holds. */
function cli(config: Phase1Config, argv: readonly string[]): CliEnvelope {
  return runCli(argv, {}, () => new CoordinatorEngine({ phase1Config: () => config }));
}

function ok(envelope: CliEnvelope): Record<string, unknown> {
  assert.equal(envelope.ok, true, envelope.ok ? '' : `${envelope.error.code}: ${envelope.error.message}`);
  if (!envelope.ok) throw new Error('unreachable');
  return envelope.result as Record<string, unknown>;
}

function refusal(envelope: CliEnvelope): { code: string; message: string } {
  assert.equal(envelope.ok, false, 'expected a refusal, got a success');
  if (envelope.ok) throw new Error('unreachable');
  return { code: envelope.error.code, message: envelope.error.message };
}

function phaseOf(config: Phase1Config, run: string): StagePhase {
  return ok(cli(config, ['resume-run', '--run', run]))['phase'] as StagePhase;
}

function writeJson(value: unknown): string {
  const path = join(mkdtempSync(join(tmpdir(), 'coordinator-run-')), 'payload.json');
  writeFileSync(path, JSON.stringify(value));
  return path;
}

/** Candidate ids are taken from prepare-context's own output, never composed —
 *  the rule the skill states, applied by the test that checks the skill. */
function paintCandidateId(prepared: Record<string, unknown>): string {
  const candidates = prepared['candidates'] as Record<string, readonly ResolverCandidate[]>;
  for (const list of Object.values(candidates)) {
    const found = list.find((candidate) => candidate.ref_class === 'paint-style');
    if (found !== undefined) return found.candidate_id;
  }
  throw new Error('no paint-style candidate — the fixture or PD-7 categories changed');
}

function draftFile(candidateId: string): string {
  return writeJson({
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
  });
}

describe('the documented happy path, walked through the tool boundary (§4)', () => {
  test('the phase sequence equals §4’s table exactly', () => {
    const config = newPhase1Config();
    const observed: StagePhase[] = [];

    // 1 — resolve the command a designer typed. No run exists yet.
    const resolved = ok(cli(config, ['resolve-command', '--public-name', '/create-component']));
    assert.equal(resolved['operation_id'], 'component.create');

    // 2 — received
    const begun = ok(
      cli(config, ['begin-run', '--operation-id', 'component.create', '--user-intent', 'A dismissible warning toast']),
    );
    const runId = begun['run_id'] as string;
    assert.equal(begun['phase'], 'received');
    assert.equal(begun['run_type'], 'new', 'run_type is derived from the operation ID, never supplied');
    observed.push(phaseOf(config, runId));

    // 3 — preparing, exited by its own return: the caller observes `drafting`.
    const prepared = ok(cli(config, ['prepare-context', '--run-id', runId]));
    assert.equal(prepared['route_module'], 'route-new');
    observed.push(phaseOf(config, runId));

    // 4 — the one authoring act, then the seam. `validating` is entered and
    //     exited inside submitDraft, so the caller observes it on return.
    const submitted = ok(cli(config, ['submit-draft', '--run-id', runId, '--draft-file', draftFile(paintCandidateId(prepared))]));
    assert.equal(submitted['outcome'], 'accepted');
    observed.push(phaseOf(config, runId));

    // 5 — awaiting-approval, a pause point.
    const presented = ok(cli(config, ['present-for-approval', '--run-id', runId]));
    assert.match(presented['artifact_sha256'] as string, /^[0-9a-f]{64}$/);
    observed.push(phaseOf(config, runId));

    // 6 — handoff-ready
    const approved = ok(
      cli(config, ['record-approval', '--run-id', runId, '--decision', 'approved', '--approved-by', 'a designer']),
    );
    assert.equal(approved['outcome'], 'advance');
    observed.push(phaseOf(config, runId));

    // 7 — the handoff. next_route is recorded, not followed (§3.5).
    const handoff = ok(cli(config, ['build-handoff', '--run-id', runId]));
    assert.equal(handoff['next_route'], 'builder');
    observed.push(phaseOf(config, runId));

    // 8 — terminal
    assert.equal(ok(cli(config, ['close-run', '--run-id', runId, '--outcome', 'completed']))['outcome'], 'completed');
    observed.push(phaseOf(config, runId));

    assert.deepEqual(observed, [
      'received',
      'drafting',
      'validating',
      'awaiting-approval',
      'handoff-ready',
      'handoff-ready',
      'terminal',
    ]);
  });

  test('the approval view carries the three things §16.4 refuses to hide', () => {
    const config = newPhase1Config();
    const runId = ok(
      cli(config, ['begin-run', '--operation-id', 'component.create', '--user-intent', 'x']),
    )['run_id'] as string;
    const prepared = ok(cli(config, ['prepare-context', '--run-id', runId]));
    ok(cli(config, ['submit-draft', '--run-id', runId, '--draft-file', draftFile(paintCandidateId(prepared))]));
    const view = ok(cli(config, ['present-for-approval', '--run-id', runId]));
    const body = (view['approval_view'] as { body: string }).body;
    assert.ok(body.includes('NOTHING HAS BEEN BUILT'), 'the designer must be told nothing was built');
    assert.ok(body.includes(view['artifact_sha256'] as string), 'the bound hash must be shown');
    assert.ok(/weakest/i.test(body), 'aggregate confidence must be shown as the weakest child, not an average');
  });

  test('a fabricated candidate id is refused as unresolved, not accepted', () => {
    const config = newPhase1Config();
    const runId = ok(cli(config, ['begin-run', '--operation-id', 'component.create', '--user-intent', 'x']))['run_id'] as string;
    ok(cli(config, ['prepare-context', '--run-id', runId]));
    const submitted = ok(cli(config, ['submit-draft', '--run-id', runId, '--draft-file', draftFile('c_000000000000000000000000')]));
    assert.notEqual(submitted['outcome'], 'accepted');
  });
});

describe('the Guard refuses the shortcuts the instructions must never take', () => {
  function preparedRun(): { config: Phase1Config; runId: string; candidate: string } {
    const config = newPhase1Config();
    const runId = ok(cli(config, ['begin-run', '--operation-id', 'component.create', '--user-intent', 'x']))['run_id'] as string;
    const prepared = ok(cli(config, ['prepare-context', '--run-id', runId]));
    return { config, runId, candidate: paintCandidateId(prepared) };
  }

  test('skipping present-for-approval and calling build-handoff is refused at G-11', () => {
    const { config, runId, candidate } = preparedRun();
    ok(cli(config, ['submit-draft', '--run-id', runId, '--draft-file', draftFile(candidate)]));
    assert.equal(phaseOf(config, runId), 'validating');
    const refused = refusal(cli(config, ['build-handoff', '--run-id', runId]));
    assert.equal(refused.code, 'G-11');
    assert.ok(refused.message.includes('validating'), 'the refusal names the phase it was called from');
    // The refusal changed nothing: the run is still where it was.
    assert.equal(phaseOf(config, runId), 'validating');
  });

  test('skipping present-for-approval and calling record-approval is refused too', () => {
    const { config, runId, candidate } = preparedRun();
    ok(cli(config, ['submit-draft', '--run-id', runId, '--draft-file', draftFile(candidate)]));
    assert.equal(refusal(cli(config, ['record-approval', '--run-id', runId, '--decision', 'approved', '--approved-by', 'x'])).code, 'G-11');
  });

  test('drafting before preparing context is refused — the candidates would have no source', () => {
    const config = newPhase1Config();
    const runId = ok(cli(config, ['begin-run', '--operation-id', 'component.create', '--user-intent', 'x']))['run_id'] as string;
    assert.equal(refusal(cli(config, ['submit-draft', '--run-id', runId, '--draft-file', draftFile('c_000000000000000000000000')])).code, 'G-11');
  });

  test('closing completed before build-handoff is refused at G-10, not silently accepted', () => {
    const { config, runId, candidate } = preparedRun();
    ok(cli(config, ['submit-draft', '--run-id', runId, '--draft-file', draftFile(candidate)]));
    ok(cli(config, ['present-for-approval', '--run-id', runId]));
    ok(cli(config, ['record-approval', '--run-id', runId, '--decision', 'approved', '--approved-by', 'x']));
    assert.equal(phaseOf(config, runId), 'handoff-ready');
    assert.equal(refusal(cli(config, ['close-run', '--run-id', runId, '--outcome', 'completed'])).code, 'G-10');
  });

  test('a refusal is never a phase change — the run is exactly where it was', () => {
    const { config, runId } = preparedRun();
    const before = phaseOf(config, runId);
    refusal(cli(config, ['build-handoff', '--run-id', runId]));
    refusal(cli(config, ['present-for-approval', '--run-id', runId]));
    refusal(cli(config, ['open-clarification', '--run-id', runId]));
    assert.equal(phaseOf(config, runId), before);
  });

  test('every refusal above is still recorded as a tool invocation (§13.2)', () => {
    const config = newPhase1Config();
    const engine = new CoordinatorEngine({ phase1Config: () => config });
    const runId = engine.beginRun({ operation_id: 'component.create', user_intent: 'x' }).run_id;
    runCli(['build-handoff', '--run-id', runId], {}, () => engine);
    const invocations = engine.getToolInvocations(runId);
    const buildHandoff = invocations.filter((row) => row.tool === 'buildHandoff');
    assert.equal(buildHandoff.length, 1, 'a refusal that leaves no trace is indistinguishable from a call never made');
    assert.equal(buildHandoff[0]?.ok, false);
    assert.equal(buildHandoff[0]?.error_code, 'G-11');
  });
});
