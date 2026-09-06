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
    pattern: /claude\s+(?:-p\b|--print\b)/,
    why: 'the shared engine must not depend on the Claude Code CLI (§5.6)',
  },
  {
    name: 'absolute POSIX user path',
    pattern: /['"`]\/(?:Users|home|var\/folders|private\/tmp)\//,
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
    pattern: /['"`](?:node:)?(?:child_process|worker_threads)['"`]/,
    why: 'no subprocess execution in the shared engine (§5.6)',
  },
  {
    name: 'network client',
    // `\bfetch\b` was tried and rejected: FD-4's own claim text says "Per-run
    // target fetch is within auth and rate limits", and flagging an English
    // word in a documented dependency is how a scan gets switched off. The
    // call and the indirect forms are what matter.
    pattern: /['"`](?:node:)?(?:http|https|http2|net|dgram|tls)['"`]|\bfetch\s*\(|\[['"`]fetch['"`]\]|['"`]undici['"`]/,
    why: 'Phase 1 has no model adapter and makes zero model calls (§7.2, §15.5)',
  },
  {
    name: 'Anthropic SDK / model client',
    pattern: /@anthropic-ai|anthropic\.messages|\bmessages\.create\b|api\.anthropic\.com/,
    why: 'the first live model call belongs to Phase 2 (§17.4)',
  },
  {
    name: 'Figma write capability',
    // Deliberately NOT case-insensitive on the env-var half: `figma_file_key`
    // is a legitimate field of the curated export and appears in the leakage
    // detector's own pattern list, so a case-insensitive `FIGMA…KEY` flagged
    // the guard rather than a credential. Uppercase is the env-var convention;
    // the lowercase form kept below is the one real-world spelling that isn't.
    pattern: /figma\.(?:createFrame|createComponent|createInstance|appendChild)|\bFIGMA[_A-Z]*(?:TOKEN|SECRET|PAT)\b|figma_api_key/,
    why: 'Builder is the only Figma writer, and not in Phase 1 (§5.4, §7.2)',
  },
  {
    name: 'plugin surface coupling',
    pattern: /\.claude-plugin|marketplace\.json|allowed-tools:|PreToolUse/,
    why: 'no plugin hooks, frontmatter or command invocation inside the shared engine (§5.6)',
  },
];

/**
 * Removes `//` line comments and `/* … *\/` block comments while preserving
 * code on the same line. Not a tokenizer: a `//` or `/*` inside a string
 * literal would be over-removed, which errs toward scanning *less* text — the
 * safe direction is the opposite, so the one place that matters (a forbidden
 * import) cannot hide behind a quote either, because an import statement is
 * never inside a string literal in this codebase's own source.
 */
export function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((line) => {
      const marker = line.indexOf('//');
      return marker === -1 ? line : line.slice(0, marker);
    })
    .join('\n');
}

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
        // AC-22: this dropped **every line beginning with `/*`, including any
        // real code after the comment closed** — so `/* c */ import { execSync }
        // from "node:child_process";` passed the scan clean. Comments are now
        // removed as spans, leaving the code that shares their line.
        const code = stripComments(text);
        if (rule.pattern.test(code)) {
          offenders.push(relative(SRC_DIR, file));
        }
      }
      assert.deepEqual(offenders, [], `${rule.name} found — ${rule.why}`);
    });
  }

  test('every rule matches its own violation — the list is not decoration (AC-22)', () => {
    // An audit demonstrated seven working evasions of the previous patterns,
    // including `claude --print` for the "second model invocation" rule and
    // `FIGMA_ACCESS_TOKEN` for the credential rule. Each rule now carries a
    // violation it must catch, so a pattern that silently stops matching fails
    // here instead of letting the sweep above pass over a real defect.
    const violations: Readonly<Record<string, readonly string[]>> = {
      'claude CLI invocation': ['run claude -p "x"', 'run claude --print "x"'],
      'absolute POSIX user path': ["const p = '/Users/someone/x'", "const q = '/private/tmp/y'"],
      'absolute Windows path': ["const p = 'C:\\Users\\x'"],
      'OneDrive / cloud-sync path': ['const p = OneDrive', 'CloudStorage'],
      child_process: ["import { x } from 'node:child_process'", "await import('worker_threads')"],
      'network client': ["from 'node:http2'", 'fetch("https://x")', "const f = g['fetch']", "from 'undici'"],
      'Anthropic SDK / model client': ['@anthropic-ai/sdk', 'messages.create(', 'https://api.anthropic.com/v1/messages'],
      'Figma write capability': ['figma.createInstance(', 'process.env.FIGMA_ACCESS_TOKEN', 'figma_api_key'],
      'plugin surface coupling': ['.claude-plugin/plugin.json', 'allowed-tools: Bash', 'PreToolUse'],
    };
    for (const rule of FORBIDDEN) {
      const cases = violations[rule.name];
      assert.ok(cases !== undefined, `no falsifier written for the rule "${rule.name}"`);
      for (const violation of cases) {
        assert.ok(rule.pattern.test(violation), `"${rule.name}" did not match its own violation: ${violation}`);
      }
    }
  });

  test('the comment strip preserves code that shares a line with a comment (AC-22)', () => {
    // The exact evasion: a line beginning with `/*` used to be dropped whole.
    const evasion = '/* harmless */ import { execSync } from "node:child_process";';
    assert.match(stripComments(evasion), /child_process/);
    // And it still removes what it is meant to remove.
    assert.ok(!/child_process/.test(stripComments('// import from "node:child_process"')));
    assert.ok(!/child_process/.test(stripComments('/*\n * "node:child_process"\n */')));
  });
});
