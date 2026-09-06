/**
 * The static half of BP-2 and BP-9.
 *
 * ESLint catches the import forms. It does not catch the two shapes that
 * actually matter here, because neither is an import:
 *
 *   - `readFileSync(join(ROOT, 'plugin_explore_phase', …))` — a tracked file
 *     reaching into the research corpus at runtime, which BP-1 forbids and
 *     which no module resolver ever sees;
 *   - the same path written into a `schemas/`, `docs/` or `.json` file, where
 *     there is no linter at all.
 *
 * So this scans **text**, over `src/`, `schemas/`, `tests/`, `tools/` and
 * `docs/`, shaped like `tests/registry/command-string-scan.test.ts`. Lint alone
 * would not catch a filesystem read; a scan alone would not catch an import at
 * the moment it is written. Both cost one rule each, which is what BP-2 says.
 *
 * **What is scanned where** is the part that took two attempts. The first
 * version flagged every backticked path in every decision log, which is 19
 * findings and no defects: a log recording BP-1 has to be able to name the
 * directory BP-1 is about, and a scan that cannot tell a citation from a
 * dependency gets switched off. So the path rules apply to code — `.ts`, `.js`,
 * `.json`, where a quoted path *is* a dependency — while markdown is scanned
 * only for the filesystem-call form, because a document that names a directory
 * is documentation and a document carrying a command that reads it is not.
 *
 * The allowlist is for the guards themselves: a test asserting the corpus is
 * never named has to name it. It is bounded by a test, because an allowlist
 * that can grow quietly is how a scan dies.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const SCANNED_DIRS = ['src', 'schemas', 'tests', 'tools', 'docs'] as const;
const SCANNED_EXTENSIONS = ['.ts', '.js', '.json', '.md'] as const;
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git']);

/** The promoted corpus is a fixture *of* the research package and legitimately
 *  carries its shape; its own contents are covered by
 *  `tests/representation/empirical-corpus.test.ts`, which asserts the research
 *  path was redacted out of every promoted byte. */
const SKIP_PATHS = ['tests/representation/fixtures/empirical'];

export type BoundaryRule = {
  readonly id: string;
  readonly what: string;
  readonly pattern: RegExp;
  readonly why: string;
  /** Which file kinds the rule means anything for. */
  readonly appliesToExtensions: readonly string[];
};

export const BOUNDARY_RULES: readonly BoundaryRule[] = [
  {
    id: 'research-corpus-path',
    what: 'a constructed path into the research corpus',
    // A path, not a mention: the directory name adjacent to a separator, or
    // quoted as a whole segment.
    pattern: /(?:['"`/]|\.\.\/)plugin_explore_phase(?:['"`/]|\b\/)/g,
    why:
      'BP-1: the research corpus contributes zero runtime dependencies. A tool that needs it ' +
      'takes its path as an argument, exactly as the artifact-bundle tools do.',
    appliesToExtensions: ['.ts', '.js', '.json'],
  },
  {
    id: 'research-corpus-read',
    what: 'a filesystem call naming the research corpus',
    pattern: /(?:readFileSync|readdirSync|createReadStream|glob|import)\([^)]*plugin_explore_phase/g,
    why: 'BP-1, and the form no module resolver and therefore no linter can see.',
    appliesToExtensions: ['.ts', '.js', '.json', '.md'],
  },
  {
    id: 'representation-deep-reach',
    what: 'a path past the representation barrel',
    pattern:
      /(?:['"`]|\.\.?\/)(?:[\w./-]*\/)?representation\/(?:contracts|validation|evidence|selection)\//g,
    why:
      'BP-9: src/representation/index.ts is the only entry point. `package.json` declares no ' +
      '`exports` map and TypeScript imposes no encapsulation, so without this the barrel is a ' +
      'naming convention the first deep reference defeats.',
    appliesToExtensions: ['.ts', '.js', '.json'],
  },
];

export type BoundaryExemption = {
  readonly file: string;
  readonly rule: string;
  readonly why: string;
};

/**
 * Files that must name what they forbid.
 *
 * Every entry is a guard: a test asserting the corpus is never referenced has to
 * write the reference down, and the ledger's header has to say what it does not
 * open in order to be worth reading. Bounded by a test — an allowlist that grows
 * without anyone editing a number is how a scan stops meaning anything.
 */
export const BOUNDARY_EXEMPTIONS: readonly BoundaryExemption[] = [
  {
    file: 'src/representation/validation/promotion-ledger.ts',
    rule: 'research-corpus-path',
    why:
      "the ledger's header states that its ids are transcribed and that nothing here opens the " +
      'corpus. Saying so requires naming it, and the claim is worth more than the mention costs.',
  },
  {
    file: 'tests/representation/invariant-registry.test.ts',
    rule: 'research-corpus-path',
    why:
      'asserts the ledger names no path into the corpus. A test for an absence has to write the ' +
      'thing that must be absent.',
  },
  {
    file: 'tests/representation/empirical-corpus.test.ts',
    rule: 'research-corpus-path',
    why: 'asserts no promoted byte carries the corpus name — the same shape of guard.',
  },
  {
    file: 'tests/unit/boundary-scan.test.ts',
    rule: 'research-corpus-path',
    why: 'the falsifiers for this scan. A rule with no proof it fires is not a rule.',
  },
  {
    file: 'tests/unit/boundary-scan.test.ts',
    rule: 'research-corpus-read',
    why: 'the same, for the filesystem-call rule.',
  },
  {
    file: 'tests/unit/boundary-scan.test.ts',
    rule: 'representation-deep-reach',
    why: 'the same, for the barrel rule.',
  },
  {
    file: 'tools/boundary-scan.ts',
    rule: 'research-corpus-path',
    why: 'this file. A rule definition necessarily contains the pattern it matches.',
  },
  {
    file: 'tools/boundary-scan.ts',
    rule: 'research-corpus-read',
    why: 'this file, same reason — the header example is what the rule is for.',
  },
  {
    file: 'tools/boundary-scan.ts',
    rule: 'representation-deep-reach',
    why: 'this file, same reason.',
  },
  {
    file: 'tools/identifier-scan.ts',
    rule: 'research-corpus-path',
    why:
      "the identifier scan's header records that the corpus is where real values live and the " +
      'tracked tree is where they must not. Naming it is the point of the sentence.',
  },
];

export type BoundaryFinding = {
  readonly file: string;
  readonly line: number;
  readonly rule: string;
  readonly what: string;
  readonly match: string;
  readonly why: string;
};

export function collectFiles(root: string = REPO_ROOT): readonly string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      if (entry.startsWith('.') || SKIP_DIRS.has(entry)) continue;
      const full = join(dir, entry);
      const relativePath = relative(root, full);
      if (SKIP_PATHS.some((prefix) => relativePath.startsWith(prefix))) continue;
      if (statSync(full).isDirectory()) walk(full);
      else if (SCANNED_EXTENSIONS.some((extension) => entry.endsWith(extension))) out.push(full);
    }
  };
  for (const dir of SCANNED_DIRS) {
    const full = join(root, dir);
    try {
      if (statSync(full).isDirectory()) walk(full);
    } catch {
      // A scanned directory that does not exist is not a violation; the test
      // asserting the scan reaches all five is what would catch its absence.
    }
  }
  return out.sort();
}

/**
 * `src/representation/**` is exempt from the barrel rule, and only from that
 * one: a module's own internals reaching each other is the arrangement, not a
 * violation of it.
 */
function appliesTo(rule: BoundaryRule, relativePath: string): boolean {
  if (!rule.appliesToExtensions.some((extension) => relativePath.endsWith(extension))) return false;
  if (
    BOUNDARY_EXEMPTIONS.some(
      (exemption) => exemption.file === relativePath && exemption.rule === rule.id,
    )
  ) {
    return false;
  }
  if (rule.id !== 'representation-deep-reach') return true;
  // A module's own internals reaching each other is the arrangement, not a
  // violation of it.
  return !relativePath.startsWith(join('src', 'representation'));
}

export function scanText(relativePath: string, text: string): readonly BoundaryFinding[] {
  const found: BoundaryFinding[] = [];
  const lines = text.split('\n');
  for (const rule of BOUNDARY_RULES) {
    if (!appliesTo(rule, relativePath)) continue;
    lines.forEach((line, index) => {
      for (const match of line.matchAll(rule.pattern)) {
        found.push({
          file: relativePath,
          line: index + 1,
          rule: rule.id,
          what: rule.what,
          match: match[0],
          why: rule.why,
        });
      }
    });
  }
  return found;
}

export function scanRepository(root: string = REPO_ROOT): readonly BoundaryFinding[] {
  const found: BoundaryFinding[] = [];
  for (const file of collectFiles(root)) {
    const relativePath = relative(root, file);
    found.push(...scanText(relativePath, readFileSync(file, 'utf8')));
  }
  return found;
}

function main(): void {
  const findings = scanRepository();
  for (const finding of findings) {
    process.stdout.write(`${finding.file}:${finding.line}  ${finding.rule}  "${finding.match}" — ${finding.why}\n`);
  }
  if (findings.length === 0) {
    process.stdout.write(
      `No boundary violations across ${collectFiles().length} files (${BOUNDARY_RULES.length} rules).\n`,
    );
  }
  process.exitCode = findings.length === 0 ? 0 : 1;
}

if (process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`) {
  main();
}
