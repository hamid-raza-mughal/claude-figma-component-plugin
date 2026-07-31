/**
 * The R-1 HD-2 verification run (§1.6.6, §11.0.6): "a write, an interruption
 * and a resume from durable state" — recorded as a run, not inferred from a
 * passing preflight. This is the evidence §1.6.5's matrix cell needs before
 * it can read anything but "not demonstrated."
 *
 * Deliberately a real process, real filesystem, real SQLite file — this tool
 * is meant to be *run*, once, by Claude Code (R-1) itself, with its output
 * captured verbatim into a dated evidence file. It is not a `node --test`
 * case: a unit test proves the mechanism works in general
 * (`tests/adversarial/phase2-adversarial.test.ts`'s interruption/resume
 * case); this tool proves one specific execution actually happened, here,
 * now, on this host.
 *
 * Usage:
 *   ADALFI_ARTIFACT_DIR=<bundle> node tools/verify-r1-hd2.ts <approved-data-dir>
 */
import { resolvePhase1Config } from '../src/config/phase1-config.ts';
import { CoordinatorEngine } from '../src/tools/engine.ts';
import { CURATED_SOURCE_RELATIVE } from './artifact-bundle.ts';
import { join } from 'node:path';

function log(line: string): void {
  process.stdout.write(`${line}\n`);
}

function main(): void {
  const artifactDir = process.env['ADALFI_ARTIFACT_DIR'];
  const approvedDataDir = process.argv[2];
  if (artifactDir === undefined || artifactDir.trim() === '') {
    console.error('ADALFI_ARTIFACT_DIR must be set (the same bundle `npm run verify` uses).');
    process.exit(1);
  }
  if (approvedDataDir === undefined || approvedDataDir.trim() === '') {
    console.error('Usage: node tools/verify-r1-hd2.ts <approved-data-dir>');
    process.exit(1);
  }

  const config = resolvePhase1Config({
    curatedSourcePath: join(artifactDir, CURATED_SOURCE_RELATIVE),
    derivedDir: join(approvedDataDir, 'derived-index'),
    approvedDataDirectory: join(approvedDataDir, 'run-store'),
  });

  log('R-1 HD-2 verification run — §1.6.6');
  log(`started_at: ${new Date().toISOString()}`);
  log(`approved_data_directory: ${config.approvedDataDirectory}`);
  log('');

  // --- Step 1: a write. A fresh engine, a real beginRun, a real prepareContext. ---
  log('--- step 1: write (fresh process) ---');
  const engineA = new CoordinatorEngine({ phase1Config: () => config });
  const begun = engineA.beginRun({ operation_id: 'component.create', user_intent: 'R-1 HD-2 verification run' });
  log(`beginRun -> run_id=${begun.run_id} display_id=${begun.display_id} phase=${begun.phase}`);
  const prepared = engineA.prepareContext(begun.run_id);
  const afterPrepare = engineA.resumeRun(begun.run_id);
  log(`prepareContext -> phase=${afterPrepare.phase}, ${Object.keys(prepared.candidates).length} candidate categories`);
  log('(engineA reference now dropped — no explicit close() — simulating a process that stops)');
  log('');

  // --- Step 2: interruption. Nothing holds engineA; a fresh instance is built. ---
  log('--- step 2: interruption + resume (fresh engine instance, same config) ---');
  const engineB = new CoordinatorEngine({ phase1Config: () => config });
  const resumed = engineB.resumeRun(begun.run_id);
  log(`resumeRun (fresh engine) -> phase=${resumed.phase}, pending_action="${resumed.pending_action}"`);
  if (resumed.phase !== 'drafting') {
    console.error(`FAILED: expected phase "drafting" after resume, got "${resumed.phase}"`);
    process.exit(1);
  }
  log('');

  // --- Step 3: continue the resumed run to a terminal outcome, proving the
  //     resumed state is not just readable but actionable. ---
  log('--- step 3: continue the resumed run to completion ---');
  const paintCandidate = Object.values(prepared.candidates)
    .flat()
    .find((c) => c.ref_class === 'paint-style');
  if (paintCandidate === undefined) {
    console.error('FAILED: no paint-style candidate was returned by prepareContext.');
    process.exit(1);
  }
  const submitted = engineB.submitDraft(begun.run_id, {
    run_type: 'new',
    self_assessment: 'believe-complete',
    semantic_brief: {
      component_name: 'R-1 Verification Component',
      intent_summary: 'Synthetic component for the R-1 HD-2 verification run.',
      variant_properties: [{ name: 'state', options: ['default'], default_option: 'default' }],
      elements: [
        {
          semantic_id: 'root',
          role: 'container',
          bindings: [{ property: 'fill', reference_text: 'verification fill', selected_candidate_id: paintCandidate.candidate_id }],
        },
      ],
    },
  });
  log(`submitDraft -> outcome=${submitted.outcome}`);
  const presentedView = engineB.presentForApproval(begun.run_id);
  log(`presentForApproval -> artifact_sha256=${presentedView.artifact_sha256.slice(0, 16)}…`);
  const recorded = engineB.recordApproval(begun.run_id, 'approved', 'r1-hd2-verification-tool');
  log(`recordApproval -> outcome=${recorded.outcome}`);
  const handoff = engineB.buildHandoff(begun.run_id);
  log(`buildHandoff -> next_route=${String(handoff.next_route)}`);
  const closed = engineB.closeRun(begun.run_id, 'completed');
  log(`closeRun -> outcome=${closed.outcome}`);
  const final = engineB.resumeRun(begun.run_id);
  log(`final resumeRun -> phase=${final.phase}, pending_action="${final.pending_action}"`);
  log('');
  log(`finished_at: ${new Date().toISOString()}`);
  log(`RESULT: ${final.phase === 'terminal' && closed.outcome === 'completed' ? 'PASS' : 'FAIL'}`);
}

main();
