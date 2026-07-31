/**
 * Two-process cross-process acceptance evidence — Process B.
 *
 * Invoked as a wholly separate `node` process from Process A (see
 * `tools/two-process/process-a.ts` and the orchestrator
 * `tools/verify-r1-hd2-cross-process.ts`): no shared memory, no engine
 * reference, no candidate list. This process knows exactly two things Process
 * A did not compute for it in-process: the `run_id` (argv[2]) and its own
 * env-derived `Phase1Config`, pointed at the same curated source, derived
 * index, and approved-data directory Process A used. Everything else this
 * process knows about the run's state, it reads back from the persisted
 * SQLite store — a file, not a memory reference.
 *
 * Steps: resume solely from the persisted store; verify the expected phase
 * and the persisted event sequence (both real, failing assertions — not a
 * PASS printed regardless); independently re-derive a design-system
 * candidate via the same deterministic `listByCategory` query
 * `prepareContext` itself runs (never received from Process A); complete the
 * workflow to a terminal outcome; print the full event history read back
 * from the store file.
 *
 * Usage:
 *   ADALFI_CURATED_SOURCE=<path> ADALFI_DERIVED_DIR=<dir> ADALFI_APPROVED_DATA_DIR=<dir> \
 *     node tools/two-process/process-b.ts <run_id>
 */
import { join } from 'node:path';
import { resolvePhase1Config } from '../../src/config/phase1-config.ts';
import { CoordinatorEngine } from '../../src/tools/engine.ts';
import { ingest } from '../../src/ingestion/curated-json-loader.ts';
import { IndexReader } from '../../src/resolver/index-reader.ts';
import { listByCategory, CALLER_RUN_GUARD } from '../../src/resolver/list-by-category.ts';
import { RunStore } from '../../src/store/run-store.ts';
import { STORE_FILE_NAME } from '../../src/store/schema.ts';
import type { CoordinatorJudgmentDraft } from '../../src/contracts/coordinator-draft.ts';

function fail(message: string): never {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

function main(): void {
  const config = resolvePhase1Config({}, process.env);
  const runId = process.argv[2];
  if (runId === undefined || runId.trim() === '') fail('usage: process-b.ts <run_id>');

  const startedAt = new Date().toISOString();
  const engine = new CoordinatorEngine({ phase1Config: () => config });

  // --- resume solely from the persisted store ---
  const resumed = engine.resumeRun(runId);
  if (resumed.phase !== 'drafting') {
    fail(`expected phase "drafting" after cross-process resume, got "${resumed.phase}"`);
  }

  // Process B's own RunStore handle against the same file Process A wrote —
  // not anything carried over from Process A's memory.
  const storeForRead = new RunStore(join(config.approvedDataDirectory, STORE_FILE_NAME));
  const eventsAfterResume = storeForRead.getEvents(runId);
  const actualKindsAfterResume = eventsAfterResume.map((e) => e.kind);
  const expectedKindsAfterPrepare = ['run-begun', 'context-preparation-started', 'context-preparation-succeeded'];
  if (JSON.stringify(actualKindsAfterResume) !== JSON.stringify(expectedKindsAfterPrepare)) {
    fail(
      `expected persisted event sequence ${JSON.stringify(expectedKindsAfterPrepare)} ` +
        `after cross-process resume, got ${JSON.stringify(actualKindsAfterResume)}`,
    );
  }

  // --- independently re-derive a candidate — NOT received from process A.
  //     The same deterministic query prepareContext itself runs internally,
  //     re-executed here from scratch against the shared content-addressed
  //     index (this is what "shared durable-store location" buys: the same
  //     inputs deterministically yield the same candidates, with nothing
  //     transmitted between the two processes). ---
  const ingested = ingest(config);
  const reader = new IndexReader(ingested.database_path);
  let paintCandidateId: string;
  try {
    const broadened = listByCategory(reader, {
      caller: CALLER_RUN_GUARD,
      property_category: 'color',
      broadened_from: 'process-b independently re-deriving a candidate; none was received from process A',
      cap: 5,
    });
    const paint = broadened.candidates.find((c) => c.ref_class === 'paint-style');
    if (paint === undefined) fail('no paint-style candidate independently derivable from the shared index');
    paintCandidateId = paint.candidate_id;
  } finally {
    reader.close();
  }

  // --- complete the workflow ---
  const draft: CoordinatorJudgmentDraft = {
    run_type: 'new',
    self_assessment: 'believe-complete',
    semantic_brief: {
      component_name: 'Cross-Process Acceptance Component',
      intent_summary: 'Synthetic component proving cross-process interruption/resume completes.',
      variant_properties: [{ name: 'state', options: ['default'], default_option: 'default' }],
      elements: [
        {
          semantic_id: 'root',
          role: 'container',
          bindings: [
            { property: 'fill', reference_text: 'cross-process fill', selected_candidate_id: paintCandidateId },
          ],
        },
      ],
    },
  };
  const submitted = engine.submitDraft(runId, draft);
  if (submitted.outcome !== 'accepted') fail(`submitDraft outcome was "${submitted.outcome}", expected "accepted"`);

  const presented = engine.presentForApproval(runId);
  const recorded = engine.recordApproval(runId, 'approved', 'r1-hd2-cross-process-acceptance-tool');
  const handoff = engine.buildHandoff(runId);
  const closed = engine.closeRun(runId, 'completed');
  const final = engine.resumeRun(runId);

  const finalEvents = storeForRead
    .getEvents(runId)
    .map((e) => ({ seq: e.seq, at: e.at, kind: e.kind, from_phase: e.from_phase, to_phase: e.to_phase }));

  const passed = final.phase === 'terminal' && closed.outcome === 'completed';
  const result = {
    pid: process.pid,
    started_at: startedAt,
    exited_at: new Date().toISOString(),
    run_id: runId,
    resumed_phase: resumed.phase,
    resumed_pending_action: resumed.pending_action,
    persisted_sequence_after_resume: actualKindsAfterResume,
    independently_derived_candidate_id: paintCandidateId,
    artifact_sha256: presented.artifact_sha256,
    approval_outcome: recorded.outcome,
    next_route: handoff.next_route,
    close_outcome: closed.outcome,
    final_phase: final.phase,
    final_pending_action: final.pending_action,
    final_event_history: finalEvents,
    result: passed ? 'PASS' : 'FAIL',
  };
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (!passed) process.exit(1);
}

main();
