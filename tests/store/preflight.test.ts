/**
 * §11.0: the store preflight, run before any run-bearing tool. Proves by
 * doing (open, write, reopen, read) rather than by configuration lookup.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, closeSync, openSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { storePreflight } from '../../src/store/preflight.ts';
import { writeWitness, databasePath } from '../../src/store/witness.ts';

function freshDir(): string {
  return mkdtempSync(join(tmpdir(), 'adalfi-preflight-'));
}

const NOW = '2026-07-29T10:00:00Z';

describe('storePreflight — the four checks named in §11.0.1', () => {
  test('a fresh directory passes and writes the witness', () => {
    const result = storePreflight(freshDir(), NOW);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.classification, 'fresh');
    assert.ok(result.checks.every((check) => check.ok));
  });

  test('preflighting twice on the same directory is established the second time', () => {
    const dir = freshDir();
    storePreflight(dir, NOW);
    const second = storePreflight(dir, NOW);
    assert.equal(second.ok, true);
    if (!second.ok) return;
    assert.equal(second.classification, 'established');
  });

  test('G-20c: a lost store (witness without database) is refused, not silently reinitialized', () => {
    const dir = freshDir();
    writeWitness(dir, NOW);
    const result = storePreflight(dir, NOW);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.guardCode, 'G-20c');
    assert.equal(result.classification, 'lost');
    assert.ok(result.remedy.length > 0);
  });

  test('G-20c: a foreign store (database without witness) is refused', () => {
    const dir = freshDir();
    closeSync(openSync(databasePath(dir), 'w'));
    const result = storePreflight(dir, NOW);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.guardCode, 'G-20c');
    assert.equal(result.classification, 'foreign');
  });

  test('G-20a: a path that cannot hold a database fails the write test, not the directory test', () => {
    // A file where the "directory" should be — existsSync is true, so the
    // directory-resolves check passes, but nothing can be opened under it.
    const parent = freshDir();
    const fileNotDir = join(parent, 'not-a-directory');
    writeFileSync(fileNotDir, 'x');
    const result = storePreflight(fileNotDir, NOW);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.guardCode, 'G-20a');
    const writeCheck = result.checks.find((c) => c.name === 'write-commits-and-is-readable-after-reopen');
    assert.equal(writeCheck?.ok, false);
  });

  test('every check is named, in order, whether it passed or failed', () => {
    const result = storePreflight(freshDir(), NOW);
    const names = result.checks.map((c) => c.name);
    assert.deepEqual(names, [
      'approved-directory-resolves',
      'store-witness-classification',
      'write-commits-and-is-readable-after-reopen',
    ]);
  });

  test('this is not the HD-2 verification run — passing it proves nothing about interruption/resume', () => {
    // Documentary: §11.0.6. The preflight alone never returns any field
    // claiming a verified write/interrupt/resume cycle.
    const result = storePreflight(freshDir(), NOW);
    assert.ok(!('hd2Verified' in result));
  });
});
