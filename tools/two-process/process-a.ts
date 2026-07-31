/**
 * Two-process cross-process acceptance evidence — Process A.
 *
 * Corrects a gap the earlier `tools/verify-r1-hd2.ts` run left open: that run
 * built two `CoordinatorEngine` instances inside one Node process (one
 * `main()`), so it demonstrates fresh-engine/fresh-store-handle recovery, not
 * recovery across an independent OS process. This script is one half of the
 * genuine article: it is meant to be launched as its own `node` process (see
 * `tools/verify-r1-hd2-cross-process.ts`, the orchestrator that spawns both
 * halves for real), creates a run, prepares context — committing real events
 * to the durable store — prints the run identifier and process metadata to
 * stdout, and then this OS process exits. No `close()`, no `submitDraft`, no
 * completion: the run is left mid-draft on purpose.
 *
 * Configuration arrives only through the four `ADALFI_*` env vars
 * (`src/config/phase1-config.ts`) that the parent sets for this child's own
 * `process.env` — nothing is shared by reference. The only thing Process B
 * ever learns about this run is the `run_id` printed below and the shared
 * filesystem paths both processes were independently pointed at — never a
 * candidate list, an engine reference, or anything else held in this
 * process's memory.
 *
 * Usage:
 *   ADALFI_CURATED_SOURCE=<path> ADALFI_DERIVED_DIR=<dir> ADALFI_APPROVED_DATA_DIR=<dir> \
 *     node tools/two-process/process-a.ts
 */
import { resolvePhase1Config } from '../../src/config/phase1-config.ts';
import { CoordinatorEngine } from '../../src/tools/engine.ts';

function main(): void {
  const config = resolvePhase1Config({}, process.env);
  const startedAt = new Date().toISOString();

  const engine = new CoordinatorEngine({ phase1Config: () => config });
  const begun = engine.beginRun({
    operation_id: 'component.create',
    user_intent: 'Cross-process HD-2 acceptance run — process A half',
  });
  const prepared = engine.prepareContext(begun.run_id);
  const afterPrepare = engine.resumeRun(begun.run_id);

  const result = {
    pid: process.pid,
    started_at: startedAt,
    exited_at: new Date().toISOString(),
    run_id: begun.run_id,
    display_id: begun.display_id,
    phase_after_prepare: afterPrepare.phase,
    candidate_category_count: Object.keys(prepared.candidates).length,
  };

  // Deliberately the only channel out of this process: no candidate content,
  // no engine state, no draft — just enough for a caller to hand run_id to a
  // second, independent process.
  process.stdout.write(`${JSON.stringify(result)}\n`);

  // No close(), no submitDraft, no completion. This process now exits — a
  // real OS process termination, not a dropped in-process reference.
}

main();
