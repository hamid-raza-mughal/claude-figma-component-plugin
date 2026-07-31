/**
 * The gate that guards the evidence needs its own evidence.
 *
 * The defect these tests exist for: `npm run verify` used to pass on a machine
 * with no artifact bundle, having silently not run 84 of the 428 tests, because
 * every source-backed suite self-skips and `node --test` exits 0 with skips. A
 * check that can pass vacuously is the exact failure mode this repository was
 * built to remove, so the check itself is tested in both directions.
 *
 * Deliberately source-independent: these run in CI, where the bundle is absent by
 * design. The environment is injected rather than read, so nothing here depends on
 * how the process happens to be configured.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { preflight } from '../../tools/preflight-artifacts.ts';
import { parseTapSummary, evaluate, EXPECTATIONS } from '../../tools/run-suite.ts';
import {
  inspectBundle,
  BASELINE_SOURCE_SHA256,
  CURATED_SOURCE_RELATIVE,
  ARTIFACT_DIR_ENV,
} from '../../tools/artifact-bundle.ts';

const OPTS = { allowSourceDrift: false } as const;

/** A bundle-shaped directory holding `content` where the curated export belongs. */
function fakeBundle(content: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'adalfi-bundle-'));
  const target = join(dir, CURATED_SOURCE_RELATIVE);
  mkdirSync(join(target, '..'), { recursive: true });
  writeFileSync(target, content, 'utf8');
  return dir;
}

describe('artifact preflight', () => {
  test('fails when the bundle is not configured, and names the variable', () => {
    const result = preflight({}, OPTS);
    assert.equal(result.ok, false);
    assert.equal(result.checks[0]?.name, 'artifact-bundle-configured');
    assert.equal(result.checks[0]?.ok, false);
    // A gate that fails without saying what to set is a gate people disable.
    assert.ok(result.remedy.join('\n').includes(ARTIFACT_DIR_ENV));
  });

  test('an empty value counts as unset, not as a path', () => {
    assert.equal(preflight({ [ARTIFACT_DIR_ENV]: '   ' }, OPTS).ok, false);
    assert.equal(inspectBundle({ [ARTIFACT_DIR_ENV]: '' }).kind, 'unset');
  });

  test('fails distinguishably when the directory exists but the curated export does not', () => {
    const empty = mkdtempSync(join(tmpdir(), 'adalfi-empty-'));
    const result = preflight({ [ARTIFACT_DIR_ENV]: empty }, OPTS);
    assert.equal(result.ok, false);
    // Configured-but-incomplete must not report as unconfigured: the remedies differ.
    assert.equal(result.checks[0]?.ok, true);
    assert.equal(result.checks[1]?.name, 'curated-source-present');
    assert.equal(result.checks[1]?.ok, false);
  });

  test('fails on source drift — a re-export invalidates the measured numbers', () => {
    const bundle = fakeBundle('{"not":"the baseline export"}');
    const result = preflight({ [ARTIFACT_DIR_ENV]: bundle }, OPTS);
    assert.equal(result.ok, false);
    const drift = result.checks.find((check) => check.name === 'curated-source-matches-baseline');
    assert.equal(drift?.ok, false);
    assert.ok(result.remedy.join('\n').includes('build-baseline-manifest'));
  });

  test('drift can be accepted explicitly, and says the measured claims are void', () => {
    const bundle = fakeBundle('{"not":"the baseline export"}');
    const result = preflight({ [ARTIFACT_DIR_ENV]: bundle }, { allowSourceDrift: true });
    assert.equal(result.ok, true);
    const drift = result.checks.find((check) => check.name === 'curated-source-matches-baseline');
    assert.match(drift?.detail ?? '', /no longer describe this source/);
  });

  test('the recorded baseline hash is a real SHA-256, not a placeholder', () => {
    assert.match(BASELINE_SOURCE_SHA256, /^[0-9a-f]{64}$/);
  });
});

describe('suite gate', () => {
  /**
   * Built from the floor rather than restating a number. The first version of this
   * file hard-coded 428 and 344, and every one of these tests failed the moment the
   * floors moved — a fixture that has to be edited in lockstep with the thing it
   * checks is not checking it.
   */
  function tap(counts: {
    readonly tests: number;
    readonly skipped?: number;
    readonly fail?: number;
  }): string {
    const skipped = counts.skipped ?? 0;
    const fail = counts.fail ?? 0;
    return [
      `# tests ${counts.tests}`,
      '# suites 91',
      `# pass ${counts.tests - skipped - fail}`,
      `# fail ${fail}`,
      '# cancelled 0',
      `# skipped ${skipped}`,
      '# todo 0',
      '',
    ].join('\n');
  }

  const SUMMARY = tap({ tests: EXPECTATIONS.strictTestFloor });

  test('parses node’s TAP epilogue', () => {
    assert.deepEqual(parseTapSummary(tap({ tests: 10, skipped: 2, fail: 1 })), {
      tests: 10,
      pass: 7,
      fail: 1,
      skipped: 2,
      todo: 0,
      cancelled: 0,
    });
  });

  test('a test name containing a summary-shaped string cannot be mistaken for the summary', () => {
    const tap = `ok 1 - handles "# fail 99" in a name\n${SUMMARY}`;
    assert.equal(parseTapSummary(tap).fail, 0);
  });

  test('throws rather than guessing when the epilogue is missing', () => {
    // Silently defaulting to 0 would make a broken reporter look like a clean run.
    assert.throws(() => parseTapSummary('ok 1 - something\n'), /# tests/);
  });

  test('strict mode fails on a skipped test even when nothing failed', () => {
    // The original defect exactly: green everywhere else, evidence missing.
    const summary = parseTapSummary(
      tap({ tests: EXPECTATIONS.strictTestFloor, skipped: EXPECTATIONS.sourceOnlyExpectedSkips }),
    );
    const checks = evaluate(summary, 0, 'strict');
    assert.equal(checks.find((check) => check.name === 'no-skipped-tests')?.ok, false);
    assert.equal(checks.find((check) => check.name === 'no-failures')?.ok, true);
    assert.equal(checks.find((check) => check.name === 'test-count-floor')?.ok, true);
  });

  test('strict mode passes a full clean run', () => {
    assert.ok(evaluate(parseTapSummary(SUMMARY), 0, 'strict').every((check) => check.ok));
  });

  test('strict mode fails a zero-exit run whose test count fell below the floor', () => {
    // The failure skip-counting cannot see: a dropped suite file does not skip,
    // it stops existing.
    const summary = parseTapSummary(tap({ tests: EXPECTATIONS.strictTestFloor - 1 }));
    const checks = evaluate(summary, 0, 'strict');
    assert.equal(checks.find((check) => check.name === 'test-count-floor')?.ok, false);
    assert.equal(checks.find((check) => check.name === 'no-skipped-tests')?.ok, true);
  });

  test('source-only mode allows exactly the known bundle-gated skips', () => {
    const base = parseTapSummary(tap({ tests: EXPECTATIONS.sourceOnlyTestFloor }));
    const expected = evaluate(
      { ...base, skipped: EXPECTATIONS.sourceOnlyExpectedSkips },
      0,
      'source-only',
    );
    assert.ok(expected.every((check) => check.ok));

    // One more skip than the known placeholders is a new defect, not a variation.
    const extra = evaluate(
      { ...base, skipped: EXPECTATIONS.sourceOnlyExpectedSkips + 1 },
      0,
      'source-only',
    );
    assert.equal(extra.find((check) => check.name === 'only-known-bundle-gated-skips')?.ok, false);

    // Fewer is also wrong: it means a placeholder stopped reporting the gap.
    const fewer = evaluate(
      { ...base, skipped: EXPECTATIONS.sourceOnlyExpectedSkips - 1 },
      0,
      'source-only',
    );
    assert.equal(fewer.find((check) => check.name === 'only-known-bundle-gated-skips')?.ok, false);
  });

  test('a non-zero runner exit fails regardless of the parsed counts', () => {
    const checks = evaluate(parseTapSummary(SUMMARY), 1, 'strict');
    assert.equal(checks.find((check) => check.name === 'runner-exit-code')?.ok, false);
  });

  test('the strict floor exceeds the source-only floor by the bundle-gated tests', () => {
    // If these were ever equal, the strict gate would prove nothing the source-only
    // gate does not, and the whole distinction would be ceremony.
    assert.ok(EXPECTATIONS.strictTestFloor > EXPECTATIONS.sourceOnlyTestFloor);
  });
});
