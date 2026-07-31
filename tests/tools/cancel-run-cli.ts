/**
 * Test-only CLI helper: cancels a run as a third, independent process.
 *
 * Used by `tests/adversarial/phase2-cross-process.test.ts` to simulate a
 * third actor mutating the persisted store between process A's exit and
 * process B's resume — proving process B's phase check has teeth rather
 * than trusting a belief formed before the mutation.
 *
 * Usage:
 *   ADALFI_CURATED_SOURCE=... ADALFI_DERIVED_DIR=... ADALFI_APPROVED_DATA_DIR=... \
 *     node tests/tools/cancel-run-cli.ts <run_id>
 */
import { resolvePhase1Config } from '../../src/config/phase1-config.ts';
import { CoordinatorEngine } from '../../src/tools/engine.ts';

function main(): void {
  const config = resolvePhase1Config({}, process.env);
  const runId = process.argv[2];
  if (runId === undefined || runId.trim() === '') {
    console.error('usage: cancel-run-cli.ts <run_id>');
    process.exit(1);
  }
  const engine = new CoordinatorEngine({ phase1Config: () => config });
  engine.cancelRun(runId);
}

main();
