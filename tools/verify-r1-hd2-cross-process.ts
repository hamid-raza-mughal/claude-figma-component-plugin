/**
 * The genuine R-1 HD-2 cross-process acceptance run (§1.6.6, §11.0.6).
 *
 * `tools/verify-r1-hd2.ts` demonstrated fresh-engine/fresh-SQLite-handle
 * recovery — real, but both `CoordinatorEngine` instances it builds live
 * inside one Node process, one `main()`. That is not recovery across an
 * independent OS process, and `docs/phase2-r1-verification.md` now says so
 * explicitly. This tool is the corrected, stronger claim: it spawns two
 * *actual* `node` child processes — `tools/two-process/process-a.ts` and
 * `tools/two-process/process-b.ts` — via `node:child_process`, and nothing
 * passes between them except Process A's printed `run_id` and the shared
 * filesystem paths (curated source, derived index, approved-data directory)
 * both are independently configured with through env vars. Process B never
 * receives a candidate list, an engine reference, or anything else Process A
 * held in memory.
 *
 * Usage:
 *   ADALFI_ARTIFACT_DIR=<bundle> node tools/verify-r1-hd2-cross-process.ts <approved-data-dir>
 *   node tools/verify-r1-hd2-cross-process.ts <approved-data-dir> --curated-source <path>
 *
 * **Why the second form exists (WP A3).** The bundle form is the stronger
 * evidence and stays the default — it runs against the real curated export.
 * But it can only be run where `ADALFI_ARTIFACT_DIR` is available, so in every
 * other environment this tool could not be run at all, and an evidence tool
 * that cannot be executed is a document. `--curated-source` points the two
 * children at any valid curated export, so the cross-process claim can be
 * re-established against a synthetic fixture. The two forms differ **only** in
 * where the curated JSON comes from: the same two child processes, the same
 * assertions, the same PASS condition. The printed header names which form ran
 * so no reader can mistake one for the other.
 */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CURATED_SOURCE_RELATIVE } from './artifact-bundle.ts';

const TOOLS_DIR = dirname(fileURLToPath(import.meta.url));

function log(line = ''): void {
  process.stdout.write(`${line}\n`);
}

type ProcessAOutput = {
  readonly pid: number;
  readonly started_at: string;
  readonly exited_at: string;
  readonly run_id: string;
  readonly display_id: string;
  readonly phase_after_prepare: string;
  readonly candidate_category_count: number;
};

type ProcessBOutput = {
  readonly pid: number;
  readonly started_at: string;
  readonly exited_at: string;
  readonly run_id: string;
  readonly resumed_phase: string;
  readonly resumed_pending_action: string;
  readonly persisted_sequence_after_resume: readonly string[];
  readonly independently_derived_candidate_id: string;
  readonly artifact_sha256: string;
  readonly approval_outcome: string;
  readonly next_route: string;
  readonly close_outcome: string;
  readonly final_phase: string;
  readonly final_pending_action: string;
  readonly final_event_history: readonly {
    readonly seq: number;
    readonly at: string;
    readonly kind: string;
    readonly from_phase: string | null;
    readonly to_phase: string | null;
  }[];
  readonly result: 'PASS' | 'FAIL';
};

/** Which curated export the two children are pointed at, and how that was
 *  decided — printed, never left for a reader to infer from an absent flag. */
type CuratedSource = { readonly path: string; readonly form: 'artifact-bundle' | 'supplied-curated-source' };

export function resolveCuratedSource(
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
): CuratedSource | { readonly error: string } {
  const flagIndex = argv.indexOf('--curated-source');
  if (flagIndex !== -1) {
    const supplied = argv[flagIndex + 1];
    if (supplied === undefined || supplied.trim() === '' || supplied.startsWith('--')) {
      return { error: '--curated-source needs a path to a curated design-system JSON export.' };
    }
    return { path: supplied, form: 'supplied-curated-source' };
  }
  const artifactDir = env['ADALFI_ARTIFACT_DIR'];
  if (artifactDir === undefined || artifactDir.trim() === '') {
    return {
      error:
        'Set ADALFI_ARTIFACT_DIR (the same bundle `npm run verify` uses), or pass ' +
        '--curated-source <path> to run against a supplied curated export instead.',
    };
  }
  return { path: join(artifactDir, CURATED_SOURCE_RELATIVE), form: 'artifact-bundle' };
}

function main(): void {
  const approvedDataDir = process.argv[2];
  if (approvedDataDir === undefined || approvedDataDir.trim() === '' || approvedDataDir.startsWith('--')) {
    console.error('Usage: node tools/verify-r1-hd2-cross-process.ts <approved-data-dir> [--curated-source <path>]');
    process.exit(1);
  }
  const curated = resolveCuratedSource(process.argv.slice(3), process.env);
  if ('error' in curated) {
    console.error(curated.error);
    process.exit(1);
  }

  const childEnv = {
    ...process.env,
    ADALFI_CURATED_SOURCE: curated.path,
    ADALFI_DERIVED_DIR: join(approvedDataDir, 'derived-index'),
    ADALFI_APPROVED_DATA_DIR: join(approvedDataDir, 'run-store'),
  };

  log('R-1 HD-2 genuine cross-process acceptance run — §1.6.6 (corrected evidence boundary)');
  log(`curated_source_form: ${curated.form}`);
  log(`orchestrator_pid: ${process.pid}`);
  log(`started_at: ${new Date().toISOString()}`);
  log(`approved_data_directory: ${childEnv.ADALFI_APPROVED_DATA_DIR}`);
  log('');

  log('--- process A: separate `node` child process, creates + prepares, exits without completing ---');
  const procAWallStart = new Date().toISOString();
  const a = spawnSync(process.execPath, [join(TOOLS_DIR, 'two-process', 'process-a.ts')], {
    env: childEnv,
    encoding: 'utf8',
  });
  const procAWallEnd = new Date().toISOString();
  if (a.status !== 0) {
    console.error(`Process A failed (exit ${String(a.status)}):`);
    console.error(a.stderr);
    process.exit(1);
  }
  log(a.stdout.trim());
  const aResult = JSON.parse(a.stdout.trim()) as ProcessAOutput;
  log(`orchestrator observed: process A os_pid=${aResult.pid}, wall-clock ${procAWallStart} .. ${procAWallEnd}`);
  log('');

  log('--- process B: separate `node` child process, ONLY run_id + shared store paths passed in ---');
  log(`(handed to process B: run_id="${aResult.run_id}" and the same three ADALFI_* env vars — nothing else)`);
  const procBWallStart = new Date().toISOString();
  const b = spawnSync(process.execPath, [join(TOOLS_DIR, 'two-process', 'process-b.ts'), aResult.run_id], {
    env: childEnv,
    encoding: 'utf8',
  });
  const procBWallEnd = new Date().toISOString();
  log(b.stdout.trim());
  if (b.status !== 0) {
    console.error(`Process B failed (exit ${String(b.status)}):`);
    console.error(b.stderr);
    process.exit(1);
  }
  const bResult = JSON.parse(b.stdout.trim()) as ProcessBOutput;
  log(`orchestrator observed: process B os_pid=${bResult.pid}, wall-clock ${procBWallStart} .. ${procBWallEnd}`);
  log('');

  log('--- cross-process identity check ---');
  log(`process A OS pid: ${aResult.pid}`);
  log(`process B OS pid: ${bResult.pid}`);
  const distinctProcesses = aResult.pid !== bResult.pid;
  log(`distinct OS processes: ${distinctProcesses}`);
  log(`process B resumed phase: ${bResult.resumed_phase} (expected "drafting")`);
  log(`persisted sequence process B read on resume: ${bResult.persisted_sequence_after_resume.join(' -> ')}`);
  log('');

  log('--- final event history (read back from the store file by process B) ---');
  for (const e of bResult.final_event_history) {
    log(`${e.seq} | ${e.at} | ${e.kind} | ${e.from_phase ?? '—'} -> ${e.to_phase ?? '—'}`);
  }
  log('');

  const overallPass = distinctProcesses && bResult.resumed_phase === 'drafting' && bResult.result === 'PASS';
  log(`finished_at: ${new Date().toISOString()}`);
  log(`RESULT: ${overallPass ? 'PASS' : 'FAIL'}`);
  if (!overallPass) process.exit(1);
}

// Guarded so `resolveCuratedSource` can be imported and tested without this
// module spawning two child processes and calling `process.exit` on import.
if (process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`) {
  main();
}
