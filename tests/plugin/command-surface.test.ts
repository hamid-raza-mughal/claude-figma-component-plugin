/**
 * The plugin's command surface agrees with `src/registry/operations.ts` in
 * both directions (MB-3), and the checker that says so actually fails when it
 * should.
 *
 * The second half of this file is the point. A one-way check cannot see an
 * orphaned command file or a registry row that ships no command, and D-5
 * records both directions failing simultaneously in the research package
 * while every executable check stayed green. So each problem kind gets a
 * synthetic directory that provokes it — "a suite that never fails while
 * being built is not checking anything" (master plan §5).
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  checkCommandSurface,
  readCommandFiles,
  slashCommandNames,
  operationIdFor,
  parseFrontmatter,
  PLUGIN_MANIFEST,
  COMMANDS_DIR,
} from '../../tools/command-surface.ts';
import { OPERATIONS, resolveCommand, ResolveCommandError } from '../../src/registry/operations.ts';
import { scanText } from '../../tools/identifier-scan.ts';

function withCommandDir(files: Readonly<Record<string, string>>, body: (dir: string) => void): void {
  const root = mkdtempSync(join(tmpdir(), 'command-surface-'));
  const dir = join(root, 'commands');
  mkdirSync(dir);
  try {
    for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), content);
    body(dir);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/** A minimally valid command file, so each negative case varies exactly one thing. */
function commandFile(fields: Readonly<Record<string, string>>): string {
  const frontmatter = Object.entries(fields)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n');
  return `---\n${frontmatter}\n---\n\nbody text no logic reads\n`;
}

describe('the shipped command surface agrees with the registry (MB-3)', () => {
  test('the real surface passes its own check', () => {
    const result = checkCommandSurface();
    assert.deepEqual(result.problems, [], 'commands/ disagrees with src/registry/operations.ts');
    assert.equal(result.ok, true);
  });

  test('there is a command file to check — the scan cannot pass vacuously', () => {
    assert.ok(readCommandFiles().length > 0);
    assert.ok(slashCommandNames().length > 0);
  });

  test('every registered slash command resolves to a canonical operation ID', () => {
    for (const name of slashCommandNames()) {
      const resolved = resolveCommand(name);
      assert.ok(
        OPERATIONS.some((row) => row.operationId === resolved.operation_id),
        `${name} resolved to an operation ID no registry row defines`,
      );
      assert.equal(resolved.operation_id, operationIdFor(name));
    }
  });

  test('every shipped command file declares the operation ID the registry resolves its name to', () => {
    for (const file of readCommandFiles()) {
      assert.notEqual(file.operationId, null, `${file.publicName} declares no operation-id`);
      assert.equal(
        file.operationId,
        resolveCommand(file.publicName).operation_id,
        `${file.publicName}'s frontmatter and the registry disagree`,
      );
    }
  });

  test('the alias ships its own file and binds to its canonical operation, not a fourth one (§2.7.0)', () => {
    const files = readCommandFiles();
    const alias = files.find((file) => file.publicName === '/review-component');
    const canonical = files.find((file) => file.publicName === '/audit-component');
    assert.ok(alias !== undefined && canonical !== undefined);
    assert.equal(alias.operationId, canonical.operationId);
    assert.ok(!OPERATIONS.some((row) => row.operationId === 'component.review'));
  });

  test('every command file declares a description — an undescribed command is invisible', () => {
    for (const file of readCommandFiles()) {
      assert.ok(file.description !== null && file.description !== '', `${file.publicName} has none`);
    }
  });
});

describe('the plugin manifest', () => {
  const manifest: unknown = JSON.parse(readFileSync(PLUGIN_MANIFEST, 'utf8'));

  test('is a JSON object naming the plugin and its command directory', () => {
    assert.equal(typeof manifest, 'object');
    assert.ok(manifest !== null);
    const record = manifest as Record<string, unknown>;
    assert.equal(typeof record['name'], 'string');
    assert.equal(typeof record['description'], 'string');
    assert.equal(typeof record['version'], 'string');
    assert.equal(record['commands'], './commands');
  });

  test('its name is a kebab-case identifier a host can address', () => {
    const record = manifest as Record<string, unknown>;
    assert.match(String(record['name']), /^[a-z][a-z0-9-]*$/);
  });

  test('the declared command directory is the one the checker reads', () => {
    assert.ok(COMMANDS_DIR.endsWith('commands'));
  });

  test('the manifest names no real Figma identifier (BP-5)', () => {
    // AC-24: the comment here used to promise a file-key check ("a Figma file
    // key is a 22+ char alphanumeric token") that the code never performed —
    // injecting one into the manifest passed both assertions. The check now
    // delegates to the one scanner that implements every shape BP-5 names, so
    // the comment and the code cannot drift apart again.
    assert.deepEqual(scanText('.claude-plugin/plugin.json', readFileSync(PLUGIN_MANIFEST, 'utf8')), []);
  });
});

describe('the checker fails when it should — each problem kind provoked', () => {
  test('a registered command with no file is caught (registry → files)', () => {
    withCommandDir(
      {
        'create-component.md': commandFile({ description: 'x', 'operation-id': 'component.create' }),
      },
      (dir) => {
        const result = checkCommandSurface(dir);
        assert.equal(result.ok, false);
        const kinds = result.problems.map((problem) => problem.kind);
        assert.ok(kinds.includes('registered-command-has-no-file'));
        // Every missing one is reported, not just the first.
        const missing = result.problems.filter((p) => p.kind === 'registered-command-has-no-file');
        assert.equal(missing.length, slashCommandNames().length - 1);
      },
    );
  });

  test('a command file for an unregistered name is caught (files → registry)', () => {
    withCommandDir(
      { 'delete-component.md': commandFile({ description: 'x', 'operation-id': 'component.create' }) },
      (dir) => {
        const problems = checkCommandSurface(dir).problems;
        assert.ok(problems.some((p) => p.kind === 'command-file-is-not-registered' && p.subject === '/delete-component'));
      },
    );
  });

  test('a command file whose binding is prose rather than a field is caught', () => {
    withCommandDir(
      { 'create-component.md': commandFile({ description: 'bound to component.create' }) },
      (dir) => {
        const problems = checkCommandSurface(dir).problems;
        assert.ok(
          problems.some(
            (p) => p.kind === 'command-file-declares-no-operation-id' && p.subject === '/create-component',
          ),
          'an operation ID mentioned only in the description must not satisfy the binding',
        );
      },
    );
  });

  test('a command file declaring an operation ID no row defines is caught', () => {
    withCommandDir(
      { 'create-component.md': commandFile({ description: 'x', 'operation-id': 'component.review' }) },
      (dir) => {
        const problems = checkCommandSurface(dir).problems;
        assert.ok(problems.some((p) => p.kind === 'command-file-declares-unregistered-operation-id'));
      },
    );
  });

  test('a command file bound to a registered but wrong operation is caught', () => {
    withCommandDir(
      { 'create-component.md': commandFile({ description: 'x', 'operation-id': 'component.audit' }) },
      (dir) => {
        const problems = checkCommandSurface(dir).problems;
        assert.ok(
          problems.some((p) => p.kind === 'command-file-operation-id-disagrees-with-registry'),
          'a file may not silently rebind a registered name to another registered operation',
        );
      },
    );
  });

  test('a command file with no description is caught', () => {
    withCommandDir({ 'create-component.md': commandFile({ 'operation-id': 'component.create' }) }, (dir) => {
      const problems = checkCommandSurface(dir).problems;
      assert.ok(problems.some((p) => p.kind === 'command-file-has-no-description'));
    });
  });
});

describe('frontmatter parsing is narrow on purpose', () => {
  test('a file with no frontmatter block yields no keys rather than guessing', () => {
    assert.deepEqual(parseFrontmatter('# just a heading\n\noperation-id: component.create\n'), {});
  });

  test('parsing stops at the closing delimiter — body text cannot supply a binding', () => {
    const text = '---\ndescription: x\n---\n\noperation-id: component.audit\n';
    assert.deepEqual(parseFrontmatter(text), { description: 'x' });
  });

  test('a value containing a colon survives intact', () => {
    assert.equal(parseFrontmatter('---\ndescription: a: b\n---\n')['description'], 'a: b');
  });
});

describe('an unregistered command string is refused, never inferred (G-14)', () => {
  test('a plausible-looking neighbour of a real command is refused', () => {
    for (const attempt of ['/create-components', '/create_component', '/component-create', '/build-component']) {
      assert.throws(
        () => resolveCommand(attempt),
        (error: unknown) => error instanceof ResolveCommandError && error.code === 'COMMAND_UNKNOWN',
        `"${attempt}" must be refused, not resolved to something near it`,
      );
    }
  });

  test('a bare operation ID typed as a command is not a slash command and ships no file', () => {
    // `source.refresh` resolves (it is the row's public name) but is not a
    // typeable command, so it must not appear in the shipped surface.
    assert.equal(resolveCommand('source.refresh').operation_id, 'source.refresh');
    assert.ok(!slashCommandNames().includes('source.refresh'));
    assert.ok(!readCommandFiles().some((file) => file.publicName === 'source.refresh'));
  });
});
