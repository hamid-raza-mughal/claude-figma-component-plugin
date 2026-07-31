/**
 * §2.2.1, §19 D-6: `{run_type}-{Crockford base32 of run_id's first 40 bits}`.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mintDisplayId, DisplayIdError } from '../../src/guard/display-id.ts';

describe('mintDisplayId', () => {
  test('is deterministic — the same run_id always mints the same display_id', () => {
    const runId = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
    assert.equal(mintDisplayId('new', runId), mintDisplayId('new', runId));
  });

  test('has the form {run_type}-{8 Crockford base32 chars}', () => {
    const id = mintDisplayId('new', '3f2504e0-4f89-41d3-9a0c-0305e82c3301');
    assert.match(id, /^new-[0-9A-HJKMNP-TV-Z]{8}$/);
  });

  test('the run_type prefix is exact for each RunType', () => {
    const runId = 'c'.repeat(8) + '-' + 'd'.repeat(4) + '-4' + 'd'.repeat(3) + '-8' + 'd'.repeat(3) + '-' + 'd'.repeat(12);
    assert.ok(mintDisplayId('new', runId).startsWith('new-'));
    assert.ok(mintDisplayId('modify', runId).startsWith('modify-'));
    assert.ok(mintDisplayId('audit', runId).startsWith('audit-'));
  });

  test('never contains the excluded letters I, L, O, U', () => {
    // Sweep a range of synthetic run_ids so this isn't luck on one fixture.
    for (let i = 0; i < 64; i += 1) {
      const hex = i.toString(16).padStart(2, '0');
      const runId = `${hex}${hex}${hex}${hex}-0000-4000-8000-000000000000`;
      const id = mintDisplayId('new', runId);
      assert.ok(!/[ILOU]/.test(id), `display_id "${id}" contains an excluded Crockford letter`);
    }
  });

  test('different run_ids (differing in the first 40 bits) mint different ids', () => {
    const a = mintDisplayId('new', 'aaaaaaaa-0000-4000-8000-000000000000');
    const b = mintDisplayId('new', 'bbbbbbbb-0000-4000-8000-000000000000');
    assert.notEqual(a, b);
  });

  test('run_ids differing only after the first 40 bits mint the same id — derivation, not identity', () => {
    const a = mintDisplayId('new', 'aaaaaaaa-0000-4000-8000-000000000000');
    const b = mintDisplayId('new', 'aaaaaaaa-0000-4000-8000-000000000001');
    assert.equal(a, b, 'only the first 40 bits (10 hex chars) feed the derivation');
  });

  test('a run_id too short to yield 40 bits refuses rather than padding silently', () => {
    assert.throws(() => mintDisplayId('new', 'ab-cd'), DisplayIdError);
  });
});
