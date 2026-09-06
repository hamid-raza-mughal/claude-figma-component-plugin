/**
 * A3 — run continuity across turns, proven the only way it can honestly be
 * proven: **every tool call is a separate OS process.**
 *
 * Gate 1 is a human approval, which ends a turn; the Builder needs a different
 * tool set. A run therefore legitimately spans turns, and the durable store is
 * the *only* continuity — §3.1 is explicit that deterministic code inside a
 * host turn cannot observe that a turn started or ended, so "the run survives"
 * cannot be tested by keeping an object alive.
 *
 * `tools/verify-r1-hd2-cross-process.ts` established this pattern with two
 * real child processes, correcting an earlier same-process version that had
 * proven only fresh-handle recovery. This file applies the same standard to
 * the surface a host turn actually uses: it spawns `node cli.ts` once per
 * step — eight processes for one run — passing nothing between them but the
 * run's short reference and the three configuration variables. Every process
 * asserts its own distinct pid, so a regression that quietly collapsed the
 * calls into one process would fail here rather than pass more cheaply.
 */
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { newPhase1Config } from '../tools/fixtures.ts';
import { writeWitness, databasePath } from '../../src/store/witness.ts';
import { resolveCuratedSource } from '../../tools/verify-r1-hd2-cross-process.ts';
import type { Phase1Config } from '../../src/config/phase1-config.ts';
import type { ResolverCandidate } from '../../src/contracts/resolution.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CLI = join(ROOT, 'src', 'runtimes', 'claude-code', 'cli.ts');

type Envelope =
  | { readonly ok: true; readonly tool: string; readonly result: Record<string, unknown> }
  | { readonly ok: false; readonly tool: string; readonly error: { code: string; message: string } };

type Call = { readonly envelope: Envelope; readonly pid: number; readonly status: number | null };

/**
 * One tool call as its own `node` process, exactly as the orchestration skill
 * instructs a host turn to make it. The child's pid is read back from
 * `/proc`-free portable means: the CLI does not print one, so the pid is
 * captured from the spawned child object itself.
 */
function call(config: Phase1Config, argv: readonly string[]): Call {
  const spawned = spawnSync(process.execPath, [CLI, ...argv], {
    encoding: 'utf8',
    env: {
      PATH: process.env['PATH'] ?? '',
      HOME: process.env['HOME'] ?? '',
      ADALFI_CURATED_SOURCE: config.curatedSourcePath,
      ADALFI_DERIVED_DIR: config.derivedDir,
      ADALFI_APPROVED_DATA_DIR: config.approvedDataDirectory,
    },
  });
  assert.ok(spawned.stdout !== null && spawned.stdout.trim() !== '', `no stdout from ${argv[0]}: ${spawned.stderr}`);
  return {
    envelope: JSON.parse(spawned.stdout.trim()) as Envelope,
    pid: spawned.pid ?? -1,
    status: spawned.status,
  };
}

function ok(made: Call): Record<string, unknown> {
  assert.equal(made.envelope.ok, true, made.envelope.ok ? '' : `${made.envelope.error.code}: ${made.envelope.error.message}`);
  assert.equal(made.status, 0, 'a successful call must exit 0');
  if (!made.envelope.ok) throw new Error('unreachable');
  return made.envelope.result;
}

function refused(made: Call): { code: string; message: string } {
  assert.equal(made.envelope.ok, false, 'expected a refusal');
  assert.notEqual(made.status, 0, 'a refusal must exit non-zero');
  if (made.envelope.ok) throw new Error('unreachable');
  return made.envelope.error;
}

function draftPath(candidateId: string): string {
  const path = join(mkdtempSync(join(tmpdir(), 'cross-turn-')), 'draft.json');
  writeFileSync(
    path,
    JSON.stringify({
      run_type: 'new',
      self_assessment: 'believe-complete',
      semantic_brief: {
        component_name: 'Cross-Turn Toast',
        intent_summary: 'A component authored across many processes.',
        variant_properties: [{ name: 'state', options: ['default'], default_option: 'default' }],
        elements: [
          {
            semantic_id: 'root',
            role: 'container',
            bindings: [{ property: 'fill', reference_text: 'warning fill', selected_candidate_id: candidateId }],
          },
        ],
      },
    }),
  );
  return path;
}

function paintCandidateId(prepared: Record<string, unknown>): string {
  const candidates = prepared['candidates'] as Record<string, readonly ResolverCandidate[]>;
  for (const list of Object.values(candidates)) {
    const found = list.find((candidate) => candidate.ref_class === 'paint-style');
    if (found !== undefined) return found.candidate_id;
  }
  throw new Error('no paint-style candidate — the fixture or PD-7 categories changed');
}

describe('a run completes across eight separate OS processes, resumed only by its short reference', () => {
  // One run, built once and asserted many times: spawning a node process per
  // step is real work, and re-running the whole path per assertion would buy
  // nothing the pid record does not already prove.
  const config = newPhase1Config();
  const pids: number[] = [];
  let displayId = '';
  let runId = '';
  let finalOutcome = '';
  const observedPhases: string[] = [];

  before(() => {
    const begun = call(config, ['begin-run', '--operation-id', 'component.create', '--user-intent', 'A cross-turn toast']);
    pids.push(begun.pid);
    const begunResult = ok(begun);
    displayId = begunResult['display_id'] as string;
    runId = begunResult['run_id'] as string;

    // From here on, ONLY the display_id crosses a process boundary — the short
    // reference §2.2.1 exists so a designer can read it back aloud.
    const resumed = call(config, ['resume-run', '--run', displayId]);
    pids.push(resumed.pid);
    observedPhases.push(ok(resumed)['phase'] as string);

    const prepared = call(config, ['prepare-context', '--run-id', runId]);
    pids.push(prepared.pid);
    const preparedResult = ok(prepared);

    const submitted = call(config, ['submit-draft', '--run-id', runId, '--draft-file', draftPath(paintCandidateId(preparedResult))]);
    pids.push(submitted.pid);
    assert.equal(ok(submitted)['outcome'], 'accepted');

    const presented = call(config, ['present-for-approval', '--run-id', runId]);
    pids.push(presented.pid);
    ok(presented);

    const approved = call(config, ['record-approval', '--run-id', runId, '--decision', 'approved', '--approved-by', 'a designer']);
    pids.push(approved.pid);
    assert.equal(ok(approved)['outcome'], 'advance');

    const handoff = call(config, ['build-handoff', '--run-id', runId]);
    pids.push(handoff.pid);
    ok(handoff);

    const closed = call(config, ['close-run', '--run-id', runId, '--outcome', 'completed']);
    pids.push(closed.pid);
    finalOutcome = ok(closed)['outcome'] as string;

    const final = call(config, ['resume-run', '--run', displayId]);
    observedPhases.push(ok(final)['phase'] as string);
  });

  test('every step ran in its own OS process — no two share a pid', () => {
    assert.equal(new Set(pids).size, pids.length, `pids repeated: ${pids.join(', ')}`);
    assert.ok(pids.length >= 8, 'the whole path must be spawned, not shortcut');
    assert.ok(!pids.includes(process.pid), 'no step may have run inside the test process');
  });

  test('the run reached a terminal completed record', () => {
    assert.equal(finalOutcome, 'completed');
    assert.deepEqual(observedPhases, ['received', 'terminal']);
  });

  test('the display_id is the short reference §2.2.1 describes, and resumes the same run', () => {
    assert.match(displayId, /^new-[0-9A-HJKMNP-TV-Z]{8}$/);
    assert.notEqual(displayId, runId, 'the readable reference is not the UUID');
    // Both keys reach the same run, from yet another fresh process.
    const byDisplay = ok(call(config, ['resume-run', '--run', displayId]));
    const byUuid = ok(call(config, ['resume-run', '--run', runId]));
    assert.deepEqual(byDisplay, byUuid);
  });

  test('nothing but the store carried the run — a fresh process reads the full history back', () => {
    const events = ok(call(config, ['resume-run', '--run', displayId]));
    assert.equal(events['phase'], 'terminal');
    assert.match(events['pending_action'] as string, /completed/);
  });
});

describe('resumeRun’s refusal paths, through the boundary', () => {
  test('an unknown run_id is refused, never invented', () => {
    const config = newPhase1Config();
    assert.equal(refused(call(config, ['resume-run', '--run', 'no-such-run'])).code, 'G-1');
  });

  test('a display-id-shaped string that was never minted is refused too', () => {
    const config = newPhase1Config();
    assert.equal(refused(call(config, ['resume-run', '--run', 'new-AAAAAAAA'])).code, 'G-1');
  });

  test('a terminal run resumes to terminal rather than reviving', () => {
    const config = newPhase1Config();
    const runId = ok(call(config, ['begin-run', '--operation-id', 'component.create', '--user-intent', 'x']))['run_id'] as string;
    ok(call(config, ['cancel-run', '--run-id', runId]));
    const resumed = ok(call(config, ['resume-run', '--run', runId]));
    assert.equal(resumed['phase'], 'terminal');
    assert.match(resumed['pending_action'] as string, /cancelled/);
    // And a forward tool against it is refused, not silently ignored.
    assert.equal(refused(call(config, ['prepare-context', '--run-id', runId])).code, 'G-11');
  });
});

describe('the witness file decides fresh from lost, before any run-bearing tool (§11.0.7, G-20c)', () => {
  test('a witness with no database is `lost` and every tool refuses at G-20c', () => {
    const root = mkdtempSync(join(tmpdir(), 'lost-store-'));
    const approved = join(root, 'approved');
    mkdirSync(approved, { recursive: true });
    writeWitness(approved, '2026-09-06T00:00:00.000Z');
    assert.ok(!existsSync(databasePath(approved)), 'the database must be absent for this to be `lost`');

    const config = { ...newPhase1Config(), approvedDataDirectory: approved } as Phase1Config;
    const error = refused(call(config, ['resolve-command', '--public-name', '/create-component']));
    assert.equal(error.code, 'G-20c');
    assert.ok(/HD-2/.test(error.message), 'the refusal must name the unmet dependency');
  });

  test('a database with no witness is `foreign` and refuses too — this store is not ours', () => {
    const config = newPhase1Config();
    // Establish the store, then remove only its witness.
    ok(call(config, ['begin-run', '--operation-id', 'component.create', '--user-intent', 'x']));
    const witness = join(config.approvedDataDirectory, 'store-identity.json');
    assert.ok(existsSync(witness));
    rmSync(witness);
    assert.equal(refused(call(config, ['resume-run', '--run', 'anything'])).code, 'G-20c');
  });

  test('the pre-run tools are gated by the preflight too — G-20 refuses before a run exists (§12.1.1)', () => {
    const root = mkdtempSync(join(tmpdir(), 'lost-store-'));
    const approved = join(root, 'approved');
    mkdirSync(approved, { recursive: true });
    writeWitness(approved, '2026-09-06T00:00:00.000Z');
    const config = { ...newPhase1Config(), approvedDataDirectory: approved } as Phase1Config;
    for (const argv of [
      ['resolve-command', '--public-name', '/create-component'],
      ['begin-run', '--operation-id', 'component.create', '--user-intent', 'x'],
      ['resume-run', '--run', 'anything'],
    ]) {
      assert.equal(refused(call(config, argv)).code, 'G-20c', `${argv[0]} was not gated by the preflight`);
    }
  });

  test('the witness records a store identity and is never read as run state', () => {
    const config = newPhase1Config();
    ok(call(config, ['begin-run', '--operation-id', 'component.create', '--user-intent', 'x']));
    const witness = JSON.parse(readFileSync(join(config.approvedDataDirectory, 'store-identity.json'), 'utf8')) as Record<string, unknown>;
    assert.match(String(witness['store_uuid']), /^[0-9a-f-]{36}$/);
    // Asserted as an exact key set, not as a list of things it must not have:
    // a witness that grew a field carrying run state would be a second account
    // of it, and a deny-list only catches the fields someone thought of.
    assert.deepEqual(Object.keys(witness).sort(), ['created_at', 'store_schema_version', 'store_uuid']);
  });
});

describe('the two-process acceptance harness can be run, not only described (WP A3)', () => {
  // `tools/verify-r1-hd2-cross-process.ts` is the tool this file's standard
  // comes from. It required ADALFI_ARTIFACT_DIR, so in any environment without
  // the bundle it could not be executed at all — and an evidence tool that
  // cannot be executed is a document. A3 widened it with `--curated-source`.
  // The bundle form stays the default and the stronger evidence; this asserts
  // the widening did not quietly become the default.

  test('with no flag and no bundle, it refuses and names both ways to supply a source', () => {
    const resolved = resolveCuratedSource([], {});
    assert.ok('error' in resolved);
    if ('error' in resolved) {
      assert.match(resolved.error, /ADALFI_ARTIFACT_DIR/);
      assert.match(resolved.error, /--curated-source/);
    }
  });

  test('the artifact bundle remains the default when it is available', () => {
    const resolved = resolveCuratedSource([], { ADALFI_ARTIFACT_DIR: '/bundle' });
    assert.ok(!('error' in resolved));
    if (!('error' in resolved)) assert.equal(resolved.form, 'artifact-bundle');
  });

  test('an explicit --curated-source is used, and is labelled as the weaker form', () => {
    const resolved = resolveCuratedSource(['--curated-source', '/x/curated.json'], { ADALFI_ARTIFACT_DIR: '/bundle' });
    assert.ok(!('error' in resolved));
    if (!('error' in resolved)) {
      assert.equal(resolved.path, '/x/curated.json');
      assert.equal(resolved.form, 'supplied-curated-source');
    }
  });

  test('--curated-source with no value is refused rather than swallowing the next flag', () => {
    for (const argv of [['--curated-source'], ['--curated-source', '--something-else']]) {
      assert.ok('error' in resolveCuratedSource(argv, {}), `${argv.join(' ')} must be refused`);
    }
  });

  test('importing the harness does not run it', () => {
    // The assertion is that this file's other tests ran at all: an unguarded
    // `main()` would have spawned two children and called process.exit on
    // import, before any test executed.
    assert.equal(typeof resolveCuratedSource, 'function');
  });
});
