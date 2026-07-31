/**
 * R-1's host integration (§1.6.1) — thin by construction, proven structurally.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync, mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { resolveClaudeCodeConfig, createClaudeCodeEngine } from '../../src/runtimes/claude-code/index.ts';
import { ConfigError } from '../../src/config/phase1-config.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ENGINE_DIRS = ['src/guard', 'src/store', 'src/registry', 'src/tools'];

function collectTs(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...collectTs(full));
    else if (entry.endsWith('.ts')) out.push(full);
  }
  return out;
}

describe('§1.4 structural test — the engine has no dependency on this runtime', () => {
  test('nothing under src/guard, src/store, src/registry or src/tools imports src/runtimes', () => {
    const offenders: string[] = [];
    for (const dir of ENGINE_DIRS) {
      for (const file of collectTs(join(ROOT, dir))) {
        if (/from\s+['"`][^'"`]*runtimes/.test(readFileSync(file, 'utf8'))) offenders.push(file);
      }
    }
    assert.deepEqual(offenders, [], 'deleting src/runtimes/claude-code must leave the engine intact');
  });
});

describe('resolveClaudeCodeConfig — env-to-config, nothing else', () => {
  test('reads the four variables every other test in this repo already injects explicitly', () => {
    const root = mkdtempSync(join(tmpdir(), 'adalfi-r1-'));
    const config = resolveClaudeCodeConfig({
      ADALFI_CURATED_SOURCE: join(root, 'curated.json'),
      ADALFI_DERIVED_DIR: join(root, 'derived'),
      ADALFI_APPROVED_DATA_DIR: join(root, 'approved'),
    });
    assert.equal(config.curatedSourcePath, join(root, 'curated.json'));
    assert.equal(config.approvedDataDirectory, join(root, 'approved'));
  });

  test('throws rather than defaulting when the environment is incomplete', () => {
    assert.throws(() => resolveClaudeCodeConfig({}), ConfigError);
  });

  test('createClaudeCodeEngine builds a real engine from an env map', () => {
    const root = mkdtempSync(join(tmpdir(), 'adalfi-r1-'));
    const engine = createClaudeCodeEngine({
      ADALFI_CURATED_SOURCE: join(root, 'curated.json'),
      ADALFI_DERIVED_DIR: join(root, 'derived'),
      ADALFI_APPROVED_DATA_DIR: join(root, 'approved'),
    });
    // resolveCommand touches only the registry, not the curated source, so it
    // succeeds — proving this adapter adds no engine logic of its own.
    assert.deepEqual(engine.resolveCommand('/create-component'), {
      operation_id: 'component.create',
      kind: 'route',
    });
    // beginRun does need the curated source (§11.2's immutable pin) — no
    // curated file exists at this path, so the engine itself refuses; this
    // adapter does nothing special to catch or paper over that.
    assert.throws(() => engine.beginRun({ operation_id: 'component.create', user_intent: 'x' }));
  });
});
