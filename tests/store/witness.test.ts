/**
 * §11.0.7 / §19 D-2: the four-way fresh/lost/foreign/established classification.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, closeSync, openSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { classifyStore, writeWitness, witnessPath, databasePath } from '../../src/store/witness.ts';

function freshDir(): string {
  return mkdtempSync(join(tmpdir(), 'adalfi-store-'));
}

describe('classifyStore — §11.0.7\'s four-way table', () => {
  test('absent database, absent witness -> fresh', () => {
    assert.equal(classifyStore(freshDir()).classification, 'fresh');
  });

  test('absent database, present witness -> lost', () => {
    const dir = freshDir();
    writeWitness(dir, '2026-07-29T10:00:00Z');
    assert.equal(classifyStore(dir).classification, 'lost');
  });

  test('present database, absent witness -> foreign', () => {
    const dir = freshDir();
    closeSync(openSync(databasePath(dir), 'w'));
    assert.equal(classifyStore(dir).classification, 'foreign');
  });

  test('present database, present witness -> established', () => {
    const dir = freshDir();
    closeSync(openSync(databasePath(dir), 'w'));
    writeWitness(dir, '2026-07-29T10:00:00Z');
    assert.equal(classifyStore(dir).classification, 'established');
  });

  test('a malformed witness still counts as "a witness exists here" (lost, not fresh)', () => {
    const dir = freshDir();
    writeFileSync(witnessPath(dir), 'not json');
    assert.equal(classifyStore(dir).classification, 'lost');
  });

  test('writeWitness returns a real UUID, a schema version, and the given timestamp', () => {
    const dir = freshDir();
    const witness = writeWitness(dir, '2026-07-29T10:00:00Z');
    assert.match(witness.store_uuid, /^[0-9a-f-]{36}$/);
    assert.equal(witness.created_at, '2026-07-29T10:00:00Z');
    assert.equal(typeof witness.store_schema_version, 'string');
  });

  test('the witness is never read as run state — classifyStore never opens the database', () => {
    // If it did, a database file containing garbage would throw here instead
    // of classifying cleanly.
    const dir = freshDir();
    writeFileSync(databasePath(dir), 'not a sqlite file');
    assert.doesNotThrow(() => classifyStore(dir));
  });
});
