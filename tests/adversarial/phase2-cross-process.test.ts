/**
 * Genuine cross-process interruption/resume — regression coverage (§1.6.6,
 * §11.0.6, corrected evidence boundary).
 *
 * `tests/adversarial/phase2-adversarial.test.ts`'s "interruption and resume
 * through the engine" case (and the earlier `tools/verify-r1-hd2.ts` run it
 * mirrors) constructs two `CoordinatorEngine` instances inside one test
 * process. That proves fresh-engine/fresh-SQLite-handle recovery, not
 * recovery across an independent OS process — a materially weaker claim than
 * "interruption and resume" implies. This file is the article itself: it
 * spawns `tools/two-process/process-a.ts` and `tools/two-process/process-b.ts`
 * as two real `node` child processes via `node:child_process`, passing
 * nothing between them but a `run_id` and three `ADALFI_*` env vars pointing
 * at the same synthetic fixture both must independently resolve into a
 * `Phase1Config` — never a shared in-memory object.
 *
 * Uses `newPhase1Config()`'s synthetic curated export (not the external
 * artifact bundle), so this suite runs unconditionally, like every other
 * engine test — it is not gated behind `ADALFI_ARTIFACT_DIR`.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { newPhase1Config } from '../tools/fixtures.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PROCESS_A = join(ROOT, 'tools', 'two-process', 'process-a.ts');
const PROCESS_B = join(ROOT, 'tools', 'two-process', 'process-b.ts');
const CANCEL_RUN_CLI = join(ROOT, 'tests', 'tools', 'cancel-run-cli.ts');

type ProcessAOutput = {
  readonly pid: number;
  readonly run_id: string;
  readonly display_id: string;
  readonly phase_after_prepare: string;
  readonly candidate_category_count: number;
};

type ProcessBOutput = {
  readonly pid: number;
  readonly run_id: string;
  readonly resumed_phase: string;
  readonly resumed_pending_action: string;
  readonly persisted_sequence_after_resume: readonly string[];
  readonly final_event_history: readonly {
    readonly seq: number;
    readonly kind: string;
    readonly from_phase: string | null;
    readonly to_phase: string | null;
  }[];
  readonly result: 'PASS' | 'FAIL';
};

function envFor(config: ReturnType<typeof newPhase1Config>): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ADALFI_CURATED_SOURCE: config.curatedSourcePath,
    ADALFI_DERIVED_DIR: config.derivedDir,
    ADALFI_APPROVED_DATA_DIR: config.approvedDataDirectory,
  };
}

function runProcessA(env: NodeJS.ProcessEnv): { readonly status: number | null; readonly output: ProcessAOutput } {
  const result = spawnSync(process.execPath, [PROCESS_A], { env, encoding: 'utf8' });
  assert.equal(result.status, 0, `process A must exit 0; stderr: ${result.stderr}`);
  return { status: result.status, output: JSON.parse(result.stdout.trim()) as ProcessAOutput };
}

function runProcessB(
  env: NodeJS.ProcessEnv,
  runId: string,
): { readonly status: number | null; readonly stderr: string; readonly stdout: string } {
  const result = spawnSync(process.execPath, [PROCESS_B, runId], { env, encoding: 'utf8' });
  return { status: result.status, stderr: result.stderr, stdout: result.stdout };
}

describe('genuine cross-process interruption/resume — two real node processes, not two in-process engines', () => {
  test('process A writes committed events and exits; process B (a separate node process) resumes solely from the persisted store, verifies phase and sequence, and completes the run', () => {
    const config = newPhase1Config();
    const env = envFor(config);

    const a = runProcessA(env);
    assert.equal(a.output.phase_after_prepare, 'drafting');
    assert.equal(a.output.candidate_category_count, 5);
    assert.ok(Number.isInteger(a.output.pid) && a.output.pid > 0);

    const b = runProcessB(env, a.output.run_id);
    assert.equal(b.status, 0, `process B must exit 0; stderr: ${b.stderr}`);
    const bOutput = JSON.parse(b.stdout.trim()) as ProcessBOutput;

    // The regression this test exists to catch: a wrong resume phase must
    // fail this assertion, not print PASS regardless.
    assert.equal(bOutput.resumed_phase, 'drafting');
    assert.equal(bOutput.resumed_pending_action, 'awaiting a submitted draft');

    // The regression this test exists to catch: a wrong (missing, reordered,
    // duplicated) persisted event sequence must fail this assertion.
    assert.deepEqual(bOutput.persisted_sequence_after_resume, [
      'run-begun',
      'context-preparation-started',
      'context-preparation-succeeded',
    ]);

    assert.deepEqual(
      bOutput.final_event_history.map((e) => e.kind),
      [
        'run-begun',
        'context-preparation-started',
        'context-preparation-succeeded',
        'draft-submitted',
        'approval-presented',
        'approval-recorded-approved',
        'handoff-built',
        'run-completed',
      ],
    );
    assert.deepEqual(
      bOutput.final_event_history.map((e) => e.seq),
      [1, 2, 3, 4, 5, 6, 7, 8],
    );
    assert.equal(bOutput.result, 'PASS');

    // Genuine cross-process proof: two distinct OS process IDs, not two
    // objects in one process's heap.
    assert.ok(Number.isInteger(bOutput.pid) && bOutput.pid > 0);
    assert.notEqual(a.output.pid, bOutput.pid, 'process A and process B must be distinct OS processes');
  });

  test('process B refuses (non-zero exit) rather than fabricating a resume for a run_id it was never given', () => {
    const config = newPhase1Config();
    const env = envFor(config);

    // No process A run precedes this — process B is handed a run_id nothing
    // ever wrote to the shared store. If process B's resume/sequence checks
    // were vacuous, this would still print PASS; it must not.
    const b = runProcessB(env, '00000000-0000-0000-0000-000000000000');
    assert.notEqual(b.status, 0, 'process B must fail, not fabricate a resume, for an unknown run_id');
    assert.match(b.stderr, /FAIL|No run found/);
  });

  test('process B refuses when the persisted phase is not the one it expects (a cancelled run, not a drafting one)', () => {
    const config = newPhase1Config();
    const env = envFor(config);

    const a = runProcessA(env);

    // Simulate a third actor cancelling the run between process A's exit and
    // process B's resume — process B must still detect and refuse the wrong
    // phase, not blindly proceed to submitDraft.
    const cancelResult = spawnSync(process.execPath, [CANCEL_RUN_CLI, a.output.run_id], { env, encoding: 'utf8' });
    assert.equal(cancelResult.status, 0, `cancel helper must succeed; stderr: ${cancelResult.stderr}`);

    const b = runProcessB(env, a.output.run_id);
    assert.notEqual(b.status, 0, 'process B must fail when the persisted phase is not "drafting"');
    assert.match(b.stderr, /expected phase "drafting"/);
  });
});
