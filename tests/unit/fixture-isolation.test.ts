/**
 * Gate 0 evidence: "no active test silently imports historical artifacts"
 * (P1-FINAL §18, §11.3).
 *
 * The v1 bundle contains six copies of the same warning-toast run across
 * `Runs/`, `Specs/Outputs/`, and inside `Archive.zip`, at least two of which
 * carry verified defects. A glob that reaches one of them would quietly
 * reintroduce contaminated ground truth, and the resulting metric would look
 * exactly like a real one.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const TESTS_DIR = join(ROOT, 'tests');
const ACTIVE_FIXTURES = join(TESTS_DIR, 'fixtures', 'active');
const HISTORICAL_FIXTURES = join(TESTS_DIR, 'fixtures', 'historical');

function collectTs(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...collectTs(full));
    else if (entry.endsWith('.ts')) out.push(full);
  }
  return out;
}

describe('fixture isolation', () => {
  test('active and historical fixture directories both exist', () => {
    assert.ok(existsSync(ACTIVE_FIXTURES), 'tests/fixtures/active must exist');
    assert.ok(existsSync(HISTORICAL_FIXTURES), 'tests/fixtures/historical must exist');
  });

  test('no test file reads from the historical fixture directory', () => {
    const offenders: string[] = [];
    for (const file of collectTs(TESTS_DIR)) {
      if (file.endsWith('fixture-isolation.test.ts')) continue;
      const text = readFileSync(file, 'utf8');
      if (/fixtures\/historical/.test(text)) offenders.push(relative(ROOT, file));
    }
    assert.deepEqual(offenders, [], 'historical fixtures must not be read by active tests');
  });

  /**
   * A wildcard under `fixtures/` rather than `fixtures/active/` is the exact
   * mechanism by which a historical artifact enters an active suite.
   */
  test('no test file globs fixtures/ indiscriminately', () => {
    const offenders: string[] = [];
    for (const file of collectTs(TESTS_DIR)) {
      if (file.endsWith('fixture-isolation.test.ts')) continue;
      const text = readFileSync(file, 'utf8');
      if (/fixtures\/\*|fixtures['"`]\s*\)|readdirSync\([^)]*fixtures['"`]\s*\)/.test(text)) {
        offenders.push(relative(ROOT, file));
      }
    }
    assert.deepEqual(offenders, [], 'read fixtures/active explicitly, never fixtures/ as a whole');
  });

  /**
   * `tools/` is deliberately out of scope: those are developer utilities that
   * receive the bundle directory as an argument, and the generator legitimately
   * names the bundle in the prose it emits. The rule under test is that the
   * *engine and its tests* never hard-code a read location.
   */
  test('the artifact bundle is never read from src/ or tests/ by hard-coded path', () => {
    const bundleName = ['Manage', 'DS', 'Components'].join('_');
    const offenders: string[] = [];
    for (const dir of ['src', 'tests']) {
      const full = join(ROOT, dir);
      if (!existsSync(full)) continue;
      for (const file of collectTs(full)) {
        if (file.endsWith('fixture-isolation.test.ts')) continue;
        // Strip comments: naming the bundle in an explanation is not a read.
        const code = readFileSync(file, 'utf8')
          .split('\n')
          .filter((line) => !/^\s*(?:\/\/|\*|\/\*)/.test(line))
          .join('\n');
        if (code.includes(bundleName)) offenders.push(relative(ROOT, file));
      }
    }
    assert.deepEqual(offenders, [], 'the artifact bundle location must arrive through configuration');
  });
});
