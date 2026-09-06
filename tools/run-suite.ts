/**
 * The suite runner both gates go through (§17, P1-FINAL §19).
 *
 * `node --test` exits 0 when tests skip. Every source-backed suite in this
 * repository self-skips when the artifact bundle is absent — deliberately, so a
 * partial run is visible rather than silently green — but nothing was *checking*
 * that visibility, so the exit code said the same thing either way. This runner
 * reads the TAP summary and turns skip counts into an exit code.
 *
 * Two modes, and the mode is always explicit:
 *
 *   strict (default)  the mandatory Phase 1 gate. Every test must run.
 *                     `skipped` must be 0. Requires the preflight to have passed.
 *   --source-only     the CI path. Requires the bundle to be ABSENT, and requires
 *                     the skip count to equal exactly the known bundle-gated
 *                     placeholders — so a *new* unintended skip still fails.
 *
 * Both modes assert a test-count floor. Skip counting alone cannot catch a whole
 * suite file dropping out of the `tests/**` glob: those tests do not skip, they
 * cease to exist. The floor is the only hard-coded expectation here and is
 * declared once, below.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ARTIFACT_DIR_ENV, inspectBundle } from './artifact-bundle.ts';

/**
 * Expected counts, updated deliberately when the suite grows.
 *
 * These are floors, not equalities: adding tests must never require editing this
 * file to keep the gate green, but *losing* a suite must fail. The skip figure is
 * an equality, because "how many tests are allowed not to run" is exactly the
 * thing a floor would let drift.
 */
export const EXPECTATIONS = {
  /**
   * Full suite with the artifact bundle present. Measured 2026-07-30: 447.
   * (Phase 1 shipped at 428; this gate and the §16.1 binding added 19.)
   *
   * **Raised to 725 at Builder-master WP A1, by derivation and not by
   * measurement** — `ADALFI_ARTIFACT_DIR` is not available in the executing
   * environment, so the strict suite cannot be run to count it, and inventing
   * a measured-looking number would be the self-asserted-trust defect this
   * repository hunts. The derivation: both modes collect the same test files,
   * and strict additionally un-skips the bundle-gated suites, so the strict
   * count exceeds the source-only count by a non-negative constant. At the
   * 2026-07-30 measurement that constant was `447 - 363 = 84`. Adding it to
   * today's measured source-only count gives `641 + 84 = 725`, which is a
   * **lower bound** on the real strict count and therefore a valid floor: a
   * bundle-gated suite that has grown since only moves the real count further
   * above it. Re-derived the same way at WP A2 (`709 + 84 = 793`) WP A3 (`725 + 84 = 809`), WP A4 (`748 + 84 = 832`), audit cycle 1 (`809 + 84 = 893`) Builder Phase 1 WP B1 (`836 + 84 = 920`) WP B2 (`863 + 84 = 947`) WP B3 (`905 + 84 = 989`) WP B4 (`935 + 84 = 1019`) WP B5 (`954 + 84 = 1038`) WP B6 (`975 + 84 = 1059`) audit cycle 2 part 1 (`1007 + 84 = 1091`) and part 2 (`1020 + 84 = 1104`).
   *
   * Recorded while raising it: this figure had drifted **278 tests behind**
   * the source-only suite (447 against 605) because the floors were last
   * touched on 2026-07-30 and the suite kept growing. A floor below the
   * source-only count cannot fail for the reason it exists — a whole suite
   * file dropping out of the glob — so the strict gate had quietly stopped
   * checking that. Re-measure and replace this value the first time the
   * bundle is present.
   */
  strictTestFloor: 1104,
  /** Source-only suite. Measured 2026-07-30: 363 tests, 7 skipped.
   *  Re-measured 2026-09-06 at Builder-master WP A1: 641 tests, 7 skipped;
   *  at WP A2: 709 tests, 7 skipped; at WP A3: 725 tests, 7 skipped;
   *  at WP A4: 748 tests, 7 skipped; after audit cycle 1: 809 tests, 7 skipped;
   *  at Builder Phase 1 WP B1: 836 tests, 7 skipped; at WP B2: 863 tests, 7 skipped;
   *  at WP B3: 905 tests, 7 skipped;
   *  at WP B4: 935 tests, 7 skipped;
   *  at WP B5: 954 tests, 7 skipped;
   *  at WP B6: 975 tests, 7 skipped;
   *  after audit cycle 2 part 1: 1007 tests, 7 skipped;
   *  after part 2: 1020 tests, 7 skipped. */
  sourceOnlyTestFloor: 1020,
  /**
   * The bundle-gated placeholder tests — one per source-backed suite, each
   * declared `{ skip: true }` so an absent bundle is legible in the report
   * rather than invisible. Any other skip is a defect.
   */
  sourceOnlyExpectedSkips: 7,
} as const;

export type TapSummary = {
  readonly tests: number;
  readonly pass: number;
  readonly fail: number;
  readonly skipped: number;
  readonly todo: number;
  readonly cancelled: number;
};

/** Parses node's TAP epilogue. Exported so the parser is testable without a run. */
export function parseTapSummary(tap: string): TapSummary {
  const read = (key: string): number => {
    // Anchored to line start so a test *name* containing "# fail 3" cannot be
    // mistaken for the summary.
    const match = new RegExp(`^# ${key} (\\d+)$`, 'm').exec(tap);
    if (match?.[1] === undefined) {
      throw new Error(`TAP summary has no "# ${key}" line — the reporter output is not what this parser expects`);
    }
    return Number(match[1]);
  };
  return {
    tests: read('tests'),
    pass: read('pass'),
    fail: read('fail'),
    skipped: read('skipped'),
    todo: read('todo'),
    cancelled: read('cancelled'),
  };
}

type Check = { readonly name: string; readonly ok: boolean; readonly detail: string };

export function evaluate(
  summary: TapSummary,
  exitCode: number,
  mode: 'strict' | 'source-only',
): readonly Check[] {
  const floor = mode === 'strict' ? EXPECTATIONS.strictTestFloor : EXPECTATIONS.sourceOnlyTestFloor;
  const allowedSkips = mode === 'strict' ? 0 : EXPECTATIONS.sourceOnlyExpectedSkips;

  return [
    {
      name: 'runner-exit-code',
      ok: exitCode === 0,
      detail: `node --test exited ${exitCode}`,
    },
    { name: 'no-failures', ok: summary.fail === 0, detail: `fail ${summary.fail}` },
    {
      name: mode === 'strict' ? 'no-skipped-tests' : 'only-known-bundle-gated-skips',
      ok: summary.skipped === allowedSkips,
      detail:
        mode === 'strict'
          ? `skipped ${summary.skipped} (must be 0 — a skipped source-backed test is missing evidence, not a pass)`
          : `skipped ${summary.skipped}, expected exactly ${allowedSkips} bundle-gated placeholders`,
    },
    { name: 'no-todo-tests', ok: summary.todo === 0, detail: `todo ${summary.todo}` },
    { name: 'no-cancelled-tests', ok: summary.cancelled === 0, detail: `cancelled ${summary.cancelled}` },
    {
      name: 'test-count-floor',
      ok: summary.tests >= floor,
      detail: `tests ${summary.tests}, floor ${floor}${summary.tests < floor ? ' — a suite file stopped being collected' : ''}`,
    },
  ];
}

function main(): void {
  const mode: 'strict' | 'source-only' = process.argv.includes('--source-only') ? 'source-only' : 'strict';
  const bundle = inspectBundle(process.env);

  // The mode and the environment must agree. A "source-only" run with the bundle
  // present would report a skip count that means nothing, and a strict run
  // without it is what the preflight already refuses.
  if (mode === 'source-only' && bundle.kind !== 'unset') {
    console.error(
      `source-only mode requires ${ARTIFACT_DIR_ENV} to be unset, but it is set to ${bundle.artifactDir}.\n` +
        'Unset it, or run the mandatory gate instead: npm run verify',
    );
    process.exit(1);
  }
  if (mode === 'strict' && bundle.kind !== 'present') {
    console.error(
      'strict mode requires the artifact bundle. Run `node tools/preflight-artifacts.ts` for the specific reason.',
    );
    process.exit(1);
  }

  const reportDir = mkdtempSync(join(tmpdir(), 'adalfi-suite-'));
  const tapPath = join(reportDir, 'run.tap');
  try {
    // Two reporters: spec to the terminal so a human can read the run, TAP to a
    // file so the exit condition is computed from a machine format rather than
    // scraped from prose.
    const run = spawnSync(
      process.execPath,
      [
        '--test',
        '--test-reporter=spec',
        '--test-reporter-destination=stdout',
        '--test-reporter=tap',
        `--test-reporter-destination=${tapPath}`,
        'tests/**/*.test.ts',
      ],
      { stdio: ['ignore', 'inherit', 'inherit'] },
    );

    if (run.error !== undefined) throw run.error;

    const summary = parseTapSummary(readFileSync(tapPath, 'utf8'));
    const checks = evaluate(summary, run.status ?? 1, mode);

    console.log(`\nSuite gate — ${mode}`);
    for (const check of checks) {
      console.log(`  ${check.ok ? 'PASS' : 'FAIL'}  ${check.name} — ${check.detail}`);
    }

    const failed = checks.filter((check) => !check.ok);
    if (failed.length > 0) {
      console.error(
        `\nGate failed on: ${failed.map((check) => check.name).join(', ')}.\n` +
          (mode === 'strict' && summary.skipped > 0
            ? `A skipped test in the mandatory gate means the run did not produce the evidence it claims.\n` +
              `Check that ${ARTIFACT_DIR_ENV} points at a complete bundle.\n`
            : ''),
      );
      process.exit(1);
    }
    console.log(
      mode === 'strict'
        ? `  → ${summary.tests} tests ran, none skipped, against the baseline curated source.`
        : `  → ${summary.tests} tests ran; ${summary.skipped} bundle-gated suites did not. This run does NOT satisfy the Phase 1 gate.`,
    );
  } finally {
    rmSync(reportDir, { recursive: true, force: true });
  }
}

// Only when invoked directly, so `parseTapSummary` and `evaluate` stay importable
// by tests without the import spawning a nested suite run.
if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main();
}
