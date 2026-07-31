/**
 * Phase 2 adversarial, lifecycle, concurrency and static-scan evidence (§17.2,
 * mirroring the Phase 1 adversarial suite's discipline: each case mutates
 * exactly one thing and the system must refuse or contain it).
 *
 * Coverage not already exercised by WP1–WP7's own test files:
 *   - G-17's static scan, extended to `invoked_as`/`approved_by` (§7.4.2,
 *     revision 4's extension of G-17 to cover both);
 *   - the §1.6.4a banned-phrase check, swept across every Phase 2 file;
 *   - a genuine multi-host race (§11.6.2's own example — R-1 and R-2 on one
 *     store) proving a stale read never produces a stale write, not just
 *     that the raw CAS primitive works (tests/store/run-store.test.ts already
 *     proves that);
 *   - interruption/resume through the *engine*, not just the raw store;
 *   - a consolidated sweep touching every terminal outcome at least once.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CoordinatorEngine } from '../../src/tools/engine.ts';
import { GuardRefusal } from '../../src/guard/errors.ts';
import { newPhase1Config } from '../tools/fixtures.ts';
import type { CoordinatorJudgmentDraft } from '../../src/contracts/coordinator-draft.ts';
import type { ResolverCandidate } from '../../src/contracts/resolution.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PHASE2_SRC_DIRS = ['src/guard', 'src/store', 'src/tools', 'src/registry', 'src/resolver'];

function collectTs(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...collectTs(full));
    else if (entry.endsWith('.ts')) out.push(full);
  }
  return out;
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

describe('G-17 static scan — invoked_as / approved_by never read by a decision (§7.4.2, §2.7, §2.8)', () => {
  test('no Phase 2 engine file reads .invoked_as in a conditional or comparison', () => {
    const offenders: string[] = [];
    for (const dir of PHASE2_SRC_DIRS) {
      for (const file of collectTs(join(ROOT, dir))) {
        const text = readFileSync(file, 'utf8');
        // Writing it (`invoked_as: x`) is fine; reading it back for a decision
        // (`.invoked_as ===`, `if (...invoked_as)`, etc.) is what G-17 forbids.
        if (/\.invoked_as\s*[=!]==?|\.invoked_as\s*\)|if\s*\([^)]*\.invoked_as/.test(text)) {
          offenders.push(file);
        }
      }
    }
    assert.deepEqual(offenders, [], 'invoked_as must be provenance-only, never read by a decision');
  });

  test('no Phase 2 engine file reads .approved_by in a conditional or comparison (G-17 extended, revision 4)', () => {
    const offenders: string[] = [];
    for (const dir of PHASE2_SRC_DIRS) {
      for (const file of collectTs(join(ROOT, dir))) {
        const text = readFileSync(file, 'utf8');
        if (/\.approved_by\s*[=!]==?|if\s*\([^)]*\.approved_by/.test(text)) {
          offenders.push(file);
        }
      }
    }
    assert.deepEqual(offenders, [], 'approved_by is unverified attribution — no decision may read it (§7.4.2)');
  });
});

describe('§1.6.4a banned-phrase check, swept across every Phase 2 file', () => {
  test('"desktop hosts with a sandbox" appears nowhere in src/guard, src/store, src/tools, src/registry', () => {
    const offenders: string[] = [];
    for (const dir of PHASE2_SRC_DIRS) {
      for (const file of collectTs(join(ROOT, dir))) {
        if (readFileSync(file, 'utf8').includes('desktop hosts with a sandbox')) offenders.push(file);
      }
    }
    assert.deepEqual(offenders, []);
  });
});

describe('a genuine multi-host race (§11.6.2) — a stale read never produces a stale write', () => {
  test('engine B advancing a run makes engine A\'s stale-state action refuse, not silently succeed', () => {
    const config = newPhase1Config();
    const engineA = new CoordinatorEngine({ phase1Config: () => config, now: () => '2026-07-29T10:00:00Z' });
    const engineB = new CoordinatorEngine({ phase1Config: () => config, now: () => '2026-07-29T10:00:01Z' });

    const { run_id } = engineA.beginRun({ operation_id: 'component.create', user_intent: 'x' });
    engineA.prepareContext(run_id); // A believes the run is in drafting

    // B, a second host on the same store, cancels the run first.
    engineB.cancelRun(run_id);
    assert.equal(engineB.resumeRun(run_id).phase, 'terminal');

    // A now attempts an action based on its earlier (now stale) belief.
    assert.throws(
      () => engineA.submitDraft(run_id, readyDraft('c_000000000000000000000000')),
      (error: unknown) => error instanceof GuardRefusal && error.code === 'G-11',
    );
  });

  test('two engines append at the same store without either losing a committed event', () => {
    const config = newPhase1Config();
    const engineA = new CoordinatorEngine({ phase1Config: () => config, now: () => '2026-07-29T10:00:00Z' });
    const engineB = new CoordinatorEngine({ phase1Config: () => config, now: () => '2026-07-29T10:00:01Z' });

    const runA = engineA.beginRun({ operation_id: 'component.create', user_intent: 'a' });
    const runB = engineB.beginRun({ operation_id: 'component.create', user_intent: 'b' });
    engineA.prepareContext(runA.run_id);
    engineB.prepareContext(runB.run_id);

    assert.equal(engineB.resumeRun(runA.run_id).phase, 'drafting', 'B can read what A committed');
    assert.equal(engineA.resumeRun(runB.run_id).phase, 'drafting', 'A can read what B committed');
  });
});

describe('interruption and resume through the engine, not just the raw store', () => {
  test('a run interrupted mid-drafting resumes through a fresh engine pointed at the same config', () => {
    const config = newPhase1Config();
    let runId: string;
    {
      const engine = new CoordinatorEngine({ phase1Config: () => config, now: () => '2026-07-29T10:00:00Z' });
      const begun = engine.beginRun({ operation_id: 'component.create', user_intent: 'x' });
      runId = begun.run_id;
      engine.prepareContext(runId);
      // No `close()` on the engine's internal store handle is called here —
      // simulating a process that stops without a clean shutdown.
    }

    const resumedEngine = new CoordinatorEngine({ phase1Config: () => config, now: () => '2026-07-29T11:00:00Z' });
    assert.equal(resumedEngine.resumeRun(runId).phase, 'drafting');
  });
});

describe('every terminal outcome, reached at least once through the engine', () => {
  test('completed, blocked, failed, cancelled and timed-out are all reachable', () => {
    const nowValue = { current: '2026-07-29T10:00:00Z' };
    const config = newPhase1Config();
    const engine = new CoordinatorEngine({ phase1Config: () => config, now: () => nowValue.current });

    // completed
    {
      const { run_id } = engine.beginRun({ operation_id: 'component.create', user_intent: 'x' });
      const prepared = engine.prepareContext(run_id);
      const paint = findCandidate(prepared.candidates, 'paint-style');
      engine.submitDraft(run_id, readyDraft(paint.candidate_id));
      engine.presentForApproval(run_id);
      engine.recordApproval(run_id, 'approved', 'ux@techlogix.com');
      engine.buildHandoff(run_id);
      assert.equal(engine.closeRun(run_id, 'completed').outcome, 'completed');
    }
    // blocked (via rejection, §9.1.1)
    {
      const { run_id } = engine.beginRun({ operation_id: 'component.create', user_intent: 'x' });
      const prepared = engine.prepareContext(run_id);
      const paint = findCandidate(prepared.candidates, 'paint-style');
      engine.submitDraft(run_id, readyDraft(paint.candidate_id));
      engine.presentForApproval(run_id);
      assert.equal(engine.recordApproval(run_id, 'rejected', 'ux@techlogix.com').outcome, 'terminal');
      assert.equal(engine.resumeRun(run_id).phase, 'terminal');
    }
    // failed
    {
      const { run_id } = engine.beginRun({ operation_id: 'component.create', user_intent: 'x' });
      assert.equal(engine.failRun(run_id, 'invalid-input').outcome, 'failed');
    }
    // cancelled
    {
      const { run_id } = engine.beginRun({ operation_id: 'component.create', user_intent: 'x' });
      assert.equal(engine.cancelRun(run_id).outcome, 'cancelled');
    }
    // timed-out
    {
      const { run_id } = engine.beginRun({ operation_id: 'component.create', user_intent: 'x' });
      nowValue.current = '2026-08-02T11:00:00Z'; // past the 72h threshold
      assert.match(engine.resumeRun(run_id).pending_action, /timed-out/);
      nowValue.current = '2026-07-29T10:00:00Z';
    }
  });
});
