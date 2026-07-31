/**
 * §12.2's printed table and the transition registry must never drift apart
 * again the way they already had once (docs/phase2-decision-log.md PD-6).
 * `tools/generate-tool-surface-table.ts` is the one generator; this test is
 * what makes disagreement a test failure instead of something a reader has
 * to notice.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { check } from '../../tools/generate-tool-surface-table.ts';

const CONTRACT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'docs', 'host-turn-workflow-contract.md');

describe('docs/host-turn-workflow-contract.md §12.2 agrees with src/registry/transitions.ts', () => {
  test('the printed table between the sentinel comments matches the generated one', () => {
    const result = check(CONTRACT);
    assert.equal(result.ok, true, `§12.2 disagrees with the registry:\n${result.generated}\n---\n${result.found}`);
  });
});
