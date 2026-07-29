/**
 * Structural portability guard (P1-FINAL §5.6, §18 "Portability").
 *
 * These are static source scans, not behavioural tests, because the rules they
 * enforce are absences: no shelling out to `claude -p`, no hard-coded user or
 * project path, no plugin-surface coupling, no model/network client, no Figma
 * write capability anywhere in the shared engine.
 *
 * An absence is exactly the kind of claim that rots silently, so it gets a test
 * rather than a sentence in a document.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src');

function collectSourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      found.push(...collectSourceFiles(full));
    } else if (entry.endsWith('.ts')) {
      found.push(full);
    }
  }
  return found;
}

type Rule = {
  readonly name: string;
  readonly pattern: RegExp;
  readonly why: string;
};

const FORBIDDEN: readonly Rule[] = [
  {
    name: 'claude CLI invocation',
    pattern: /claude\s+-p\b/,
    why: 'the shared engine must not depend on the Claude Code CLI (§5.6)',
  },
  {
    name: 'absolute POSIX user path',
    pattern: /['"`]\/(?:Users|home|var\/folders)\//,
    why: 'file locations must enter through typed config or injected ports (§5.6)',
  },
  {
    name: 'absolute Windows path',
    pattern: /['"`][A-Za-z]:[\\/]/,
    why: 'file locations must enter through typed config or injected ports (§5.6)',
  },
  {
    name: 'OneDrive / cloud-sync path',
    pattern: /OneDrive|CloudStorage/,
    why: 'the engine is location-neutral; sync paths are caller configuration (decision D-A)',
  },
  {
    name: 'child_process',
    pattern: /from\s+['"`](?:node:)?child_process['"`]|require\(['"`](?:node:)?child_process['"`]\)/,
    why: 'no subprocess execution in the shared engine (§5.6)',
  },
  {
    name: 'network client',
    pattern: /from\s+['"`](?:node:)?(?:http|https|net)['"`]|\bfetch\s*\(/,
    why: 'Phase 1 has no model adapter and makes zero model calls (§7.2, §15.5)',
  },
  {
    name: 'Anthropic SDK / model client',
    pattern: /@anthropic-ai|anthropic\.messages|\bmessages\.create\b/,
    why: 'the first live model call belongs to Phase 2 (§17.4)',
  },
  {
    name: 'Figma write capability',
    pattern: /figma\.(?:createFrame|createComponent|appendChild)|FIGMA_TOKEN|figma_api_key/i,
    why: 'Builder is the only Figma writer, and not in Phase 1 (§5.4, §7.2)',
  },
  {
    name: 'plugin surface coupling',
    pattern: /\.claude-plugin|marketplace\.json|allowed-tools:|PreToolUse/,
    why: 'no plugin hooks, frontmatter or command invocation inside the shared engine (§5.6)',
  },
];

describe('shared engine portability', () => {
  const files = collectSourceFiles(SRC_DIR);

  test('src/ contains at least one source file to scan', () => {
    assert.ok(files.length > 0, 'portability scan found no files — the guard would vacuously pass');
  });

  for (const rule of FORBIDDEN) {
    test(`no ${rule.name} in src/`, () => {
      const offenders: string[] = [];
      for (const file of files) {
        const text = readFileSync(file, 'utf8');
        // Strip line comments so an explanatory comment naming a forbidden
        // pattern does not fail the scan; block comments are handled by the
        // narrowness of the patterns themselves.
        const code = text
          .split('\n')
          .filter((line) => !/^\s*(?:\/\/|\*|\/\*)/.test(line))
          .join('\n');
        if (rule.pattern.test(code)) {
          offenders.push(relative(SRC_DIR, file));
        }
      }
      assert.deepEqual(offenders, [], `${rule.name} found — ${rule.why}`);
    });
  }
});
