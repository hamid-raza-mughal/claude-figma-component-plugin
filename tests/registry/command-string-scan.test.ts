/**
 * §2.8 / §17.3: "the registry is data, not branches." A static source-scan,
 * matching the discipline of `tests/unit/fixture-isolation.test.ts` and
 * `docs/host-turn-workflow-contract.md`'s "SA-28 absence-test pattern" — the
 * public command strings must appear **only** in the registry's own data
 * table. If enforcement code anywhere else names one, the command layer has
 * leaked into the engine (§17.3's own stated failure mode).
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OPERATIONS } from '../../src/registry/operations.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const REGISTRY_DATA_FILE = join(ROOT, 'src', 'registry', 'operations.ts');
const ENGINE_DIRS = ['guard', 'store', 'registry'];

function collectTs(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...collectTs(full));
    else if (entry.endsWith('.ts')) out.push(full);
  }
  return out;
}

/** Every public name/alias registered — the strings a caller actually types. */
const PUBLIC_COMMAND_STRINGS: readonly string[] = OPERATIONS.flatMap((row) => [
  row.publicName,
  ...row.aliases,
]).filter((name) => name.startsWith('/'));

describe('the command layer is data, not branches (§2.8, §17.3)', () => {
  test('at least one public command string exists to scan for', () => {
    assert.ok(PUBLIC_COMMAND_STRINGS.length > 0);
  });

  test('no engine file outside the registry\'s own data table names a public command string', () => {
    const offenders: string[] = [];
    for (const dirName of ENGINE_DIRS) {
      const full = join(ROOT, 'src', dirName);
      for (const file of collectTs(full)) {
        if (file === REGISTRY_DATA_FILE) continue; // the data table itself
        if (file.endsWith('operations.test.ts')) continue;
        const text = readFileSync(file, 'utf8');
        for (const command of PUBLIC_COMMAND_STRINGS) {
          if (text.includes(command)) {
            offenders.push(`${relative(ROOT, file)} names "${command}"`);
          }
        }
      }
    }
    assert.deepEqual(offenders, [], 'a public command string leaked outside the registry data table');
  });

  test('operations.ts itself resolves every command through one lookup path, never a switch on the string', () => {
    const text = readFileSync(REGISTRY_DATA_FILE, 'utf8');
    // A `switch` or an `if (x === '/create-component')`-shaped branch would be
    // exactly the leak this file exists to prevent — resolution must go
    // through the BY_PUBLIC_NAME map, not a per-command conditional.
    assert.ok(!/switch\s*\(/.test(text), 'no switch statement over a command string');
    for (const command of PUBLIC_COMMAND_STRINGS) {
      assert.ok(
        !new RegExp(`===\\s*['"\`]${command.replace('/', '\\/')}['"\`]`).test(text),
        `"${command}" must not be compared with === outside the table it's defined in`,
      );
    }
  });
});
