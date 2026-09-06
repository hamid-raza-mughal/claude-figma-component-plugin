/**
 * The plugin's shipped command surface, checked against the command registry
 * **in both directions** (MB-3).
 *
 * Why a tool and not a module in `src/`: `tests/unit/portability.test.ts` bans
 * the literal `.claude-plugin` and `allowed-tools:` from every file under
 * `src/` — "no plugin hooks, frontmatter or command invocation inside the
 * shared engine" — so the engine cannot be the thing that reads the command
 * directory. This is the shape `tools/generate-tool-surface-table.ts` plus
 * `tests/registry/contract-table-agreement.test.ts` already established for
 * exactly this problem, after §12.2 and the transition registry drifted apart
 * silently (PD-6).
 *
 * Why both directions: BP-6's ruling, applied to a second registry. A one-way
 * check cannot see an orphaned command file whose operation was deleted, and
 * it cannot see a registry row that ships no command — and D-5 records both
 * directions failing at once in the research package, which a one-way check
 * missed.
 *
 * The binding is a **structured, resolvable field**, never prose: every
 * command file declares `operation-id` in its frontmatter, and that value is
 * resolved against `OPERATIONS` for existence. This is D-1…D-4's lesson —
 * anything logic depends on gets a typed, existence-checked target; free text
 * goes in the body, which nothing here reads.
 *
 * Usage:
 *   node tools/command-surface.ts            # print the surface
 *   node tools/command-surface.ts --check    # exit 1 on any disagreement
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OPERATIONS, type OperationRow } from '../src/registry/operations.ts';

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const COMMANDS_DIR = join(REPO_ROOT, 'commands');
export const PLUGIN_MANIFEST = join(REPO_ROOT, '.claude-plugin', 'plugin.json');

/** One shipped command file, parsed. `operationId` is `null` when the file
 *  declares no `operation-id` key at all — a distinct defect from declaring an
 *  unregistered one, and reported as such. */
export type CommandFile = {
  /** File basename without `.md`. */
  readonly name: string;
  /** The public command string a designer types: `/${name}`. */
  readonly publicName: string;
  readonly operationId: string | null;
  readonly description: string | null;
};

/**
 * A deliberately small frontmatter reader: the leading `---` block, one
 * `key: value` per line. It is not a YAML parser and must not become one —
 * the two keys this check is load-bearing on are both plain scalars, and a
 * general parser would be a dependency added to read six files.
 */
export function parseFrontmatter(text: string): Readonly<Record<string, string>> {
  const lines = text.split('\n');
  if (lines[0]?.trim() !== '---') return {};
  const out: Record<string, string> = {};
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (line === undefined || line.trim() === '---') break;
    const separator = line.indexOf(':');
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (key !== '') out[key] = value;
  }
  return out;
}

export function readCommandFiles(dir: string = COMMANDS_DIR): readonly CommandFile[] {
  return readdirSync(dir)
    .filter((entry) => entry.endsWith('.md'))
    .sort()
    .map((entry) => {
      const frontmatter = parseFrontmatter(readFileSync(join(dir, entry), 'utf8'));
      const name = entry.slice(0, -'.md'.length);
      return {
        name,
        publicName: `/${name}`,
        operationId: frontmatter['operation-id'] ?? null,
        description: frontmatter['description'] ?? null,
      };
    });
}

/** Every registered public name and alias that is a slash command — i.e. every
 *  name that must ship a command file. A bare `operationId`-shaped public name
 *  (`source.refresh`) is not typeable and is deliberately excluded. */
export function slashCommandNames(operations: readonly OperationRow[] = OPERATIONS): readonly string[] {
  return operations
    .flatMap((row) => [row.publicName, ...row.aliases])
    .filter((name) => name.startsWith('/'))
    .sort();
}

export function operationIdFor(
  publicName: string,
  operations: readonly OperationRow[] = OPERATIONS,
): string | undefined {
  return operations.find((row) => row.publicName === publicName || row.aliases.includes(publicName))
    ?.operationId;
}

export type SurfaceProblem = {
  readonly kind:
    | 'registered-command-has-no-file'
    | 'command-file-is-not-registered'
    | 'command-file-declares-no-operation-id'
    | 'command-file-declares-unregistered-operation-id'
    | 'command-file-operation-id-disagrees-with-registry'
    | 'command-file-has-no-description';
  readonly subject: string;
  readonly detail: string;
};

export type SurfaceCheck = {
  readonly ok: boolean;
  readonly files: readonly CommandFile[];
  readonly registered: readonly string[];
  readonly problems: readonly SurfaceProblem[];
};

/**
 * The bidirectional check. Every problem kind is reported, never just the
 * first: a check that stops at the first disagreement hides the second, and
 * D-5's two failure directions were simultaneous.
 */
export function checkCommandSurface(dir: string = COMMANDS_DIR): SurfaceCheck {
  const files = readCommandFiles(dir);
  const registered = slashCommandNames();
  const problems: SurfaceProblem[] = [];
  const byPublicName = new Map(files.map((file) => [file.publicName, file]));

  // Direction 1 — registry → files. A registered command that ships no file is
  // a command a designer can read about and cannot type.
  for (const name of registered) {
    if (!byPublicName.has(name)) {
      problems.push({
        kind: 'registered-command-has-no-file',
        subject: name,
        detail: `registered in src/registry/operations.ts but commands/${name.slice(1)}.md does not exist`,
      });
    }
  }

  // Direction 2 — files → registry, plus the declared binding's resolvability.
  for (const file of files) {
    const registryOperationId = operationIdFor(file.publicName);
    if (registryOperationId === undefined) {
      problems.push({
        kind: 'command-file-is-not-registered',
        subject: file.publicName,
        detail: 'a command file ships for a name no registry row claims',
      });
    }
    if (file.operationId === null) {
      problems.push({
        kind: 'command-file-declares-no-operation-id',
        subject: file.publicName,
        detail: 'frontmatter has no `operation-id` — the binding would be prose, which is D-1…D-4',
      });
    } else if (!OPERATIONS.some((row) => row.operationId === file.operationId)) {
      problems.push({
        kind: 'command-file-declares-unregistered-operation-id',
        subject: file.publicName,
        detail: `declares operation-id "${file.operationId}", which no registry row defines`,
      });
    } else if (registryOperationId !== undefined && file.operationId !== registryOperationId) {
      problems.push({
        kind: 'command-file-operation-id-disagrees-with-registry',
        subject: file.publicName,
        detail: `file declares "${file.operationId}"; the registry resolves this name to "${registryOperationId}"`,
      });
    }
    if (file.description === null || file.description === '') {
      problems.push({
        kind: 'command-file-has-no-description',
        subject: file.publicName,
        detail: 'a command with no description is invisible in the host’s command list',
      });
    }
  }

  return { ok: problems.length === 0, files, registered, problems };
}

export function formatSurface(result: SurfaceCheck): string {
  const rows = result.files.map(
    (file) => `| \`${file.publicName}\` | \`${file.operationId ?? '—'}\` | commands/${file.name}.md |`,
  );
  return ['| Command | Operation ID | File |', '|---|---|---|', ...rows].join('\n');
}

function main(argv: readonly string[]): void {
  const result = checkCommandSurface();
  process.stdout.write(`${formatSurface(result)}\n`);
  if (argv.includes('--check')) {
    if (!result.ok) {
      for (const problem of result.problems) {
        process.stderr.write(`FAIL  ${problem.kind}  ${problem.subject} — ${problem.detail}\n`);
      }
      process.exitCode = 1;
      return;
    }
    process.stdout.write(`\nOK — ${result.files.length} command files agree with the registry.\n`);
  }
}

if (process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2));
}
