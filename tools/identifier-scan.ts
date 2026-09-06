/**
 * BP-5 made executable (AL-1, docs/builder-master-audit-cycle-1.md).
 *
 * BP-5 forbids any real Figma identifier — file key, node id, variable-
 * collection id, component-property id, or hash over real bytes — from
 * reaching a committed file, and the plan's §4A makes that load-bearing rather
 * than cautious: **the remote resolves without authentication, so treat it as
 * public.** Until now the rule was a sentence, and an audit found a real node
 * id already committed — inside the test that asserts no real node id is
 * committed.
 *
 * **This scan is deliberately shape-based and reads nothing from
 * `plugin_explore_phase/`.** The alternative — extracting the real identifiers
 * from the research corpus and diffing — would be a stronger check and a worse
 * design: it makes a production gate depend on an untracked directory (against
 * BP-1 and BP-2), it fails open the moment that directory is absent, and it
 * would need the real values in memory to do its job. A shape check needs
 * neither, runs anywhere, and catches the thing that actually happened.
 *
 * What it cannot catch, stated rather than implied: a real identifier that
 * looks synthetic. Nothing here proves a token is fake — only that no token
 * has the shape of a real one. The compensating control is BP-5's other half,
 * which is a human ruling about what gets written down in the first place.
 *
 * Usage:
 *   node tools/identifier-scan.ts          # print findings
 *   node tools/identifier-scan.ts --check  # exit 1 on any finding
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Never scanned. `plugin_explore_phase/` is the research corpus itself —
 *  untracked by BP-1 and full of exactly what this scan looks for; scanning it
 *  would report the corpus to itself. The rest are build output, dependencies,
 *  git internals, and the two session-local files the owner keeps untracked. */
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'plugin_explore_phase', '.claude']);
const SKIP_FILES = new Set(['CLAUDE.md', 'AGENT-CHANNEL.md', 'package-lock.json', '.DS_Store']);

/** Extensions worth reading. A binary would produce noise, not findings. */
const TEXT_EXTENSIONS = ['.ts', '.js', '.json', '.md', '.yml', '.yaml', '.sql', '.txt', ''];

export type Rule = {
  readonly id: string;
  readonly what: string;
  readonly pattern: RegExp;
  /** Why a match is a BP-5 violation rather than a coincidence. */
  readonly why: string;
};

/**
 * Every rule is narrowed so that a real identifier matches and the shapes this
 * repository legitimately contains do not. The narrowings are the interesting
 * part and each one is justified, because an over-broad rule that gets
 * allowlisted into silence is worse than no rule.
 */
export const RULES: readonly Rule[] = [
  {
    id: 'figma-url',
    what: 'a Figma file or design URL',
    pattern: /figma\.com\/(?:file|design|proto)\/[A-Za-z0-9]{6,}/gi,
    why: 'a file URL carries the file key, which is the identifier everything else is addressed from',
  },
  {
    id: 'variable-id',
    what: 'a real variable or style key',
    // Real keys are 40 hex. The synthetic fixtures use `VariableID:1:10`,
    // `VariableCollectionId:1:1`, `S:paint1` — none of which is 40 hex.
    pattern: /\b(?:VariableID|VariableCollectionId|S):[0-9a-f]{40}\b/g,
    why: 'a 40-hex key after a Figma id prefix is the real thing; synthetic fixtures use short ids',
  },
  {
    id: 'component-property-id',
    what: 'a component-property identifier',
    // Figma's shape is `PropertyName#<nodeid>`, e.g. `Label#123:456`.
    pattern: /\b[A-Za-z][A-Za-z0-9_ ]*#\d{2,}:\d{1,}\b/g,
    why: 'componentPropertyDefinitions keys embed a real node id',
  },
  {
    id: 'node-id',
    what: 'a Figma node id',
    // `\d{3,}:\d{3,}` only. Two narrowings, both load-bearing:
    //  - three digits minimum on each side, so the synthetic fixtures' `1:10`,
    //    `1:0`, `1:1` and the falsifier's `1:2` are not flagged;
    //  - ISO timestamps are removed before scanning (see `scanText`), because
    //    `11:52:45` is node-id-shaped and appears in every recorded transcript.
    pattern: /\b\d{3,}:\d{3,}\b/g,
    why: 'a real node id is the second half of a Figma address and BP-5 names it explicitly',
  },
];

/** Clock times inside recorded output are node-id-shaped and are not node ids. */
function stripTimestamps(text: string): string {
  return text
    .replace(/\d{4}-\d{2}-\d{2}[T ][\d:.]+Z?/g, '<timestamp>')
    .replace(/\b\d{2}:\d{2}:\d{2}(?:\.\d+)?\b/g, '<time>');
}

/**
 * Pre-existing tokens that carry a real identifier's *shape* and are verified
 * **not** to be real. Each entry states how that was established, because an
 * allowlist without evidence is how a scan gets silenced one line at a time.
 *
 * The evidence is the same for all of them: audit cycle 1's leakage sweep
 * extracted every identifier-shaped token from the research corpus — 1,478 node
 * ids from one export, 1,542 from the other, 181 40-hex keys, 233 64-hex
 * hashes — and intersected them with the tracked tree. These values were
 * **absent from that corpus**, which is what makes them synthetic rather than
 * merely old. They predate this scan and are load-bearing in fixtures that
 * assert identity handling, so they are exempted here rather than rewritten.
 *
 * **A new value does not get added to this list.** Write a synthetic one that
 * does not have the shape — the fixtures added since do exactly that
 * (`S:paint1`, `VariableID:1:10`, `1:2`).
 */
export const ALLOWLIST: readonly { readonly token: string; readonly why: string }[] = [
  {
    token: 'S:cfdda1d5d4bf3ab67fd2d15413224854c1b143ca',
    why: 'Coordinator Phase 1 identity fixture; absent from the research corpus (audit cycle 1 sweep)',
  },
  {
    token: 'S:890673f93188c7285bd416d52c16fd424bd70987',
    why: 'Coordinator Phase 1 rendering fixture; absent from the research corpus',
  },
  {
    token: 'S:0000000000000000000000000000000000000000',
    why: 'an all-zero key — a deliberate not-a-key, used as a negative fixture',
  },
  { token: '410:158', why: 'ingestion fixture mode id; absent from the research corpus' },
  { token: '410:159', why: 'ingestion fixture mode id; absent from the research corpus' },
  { token: 'Label#123:456', why: "this scanner's own documentation of the shape it looks for" },
  { token: '123:456', why: "this scanner's own documentation of the shape it looks for" },
];

const ALLOWED = new Set(ALLOWLIST.map((entry) => entry.token));

export type Finding = {
  readonly file: string;
  readonly line: number;
  readonly rule: string;
  readonly what: string;
  readonly match: string;
  readonly why: string;
};

export function scanText(relPath: string, text: string): readonly Finding[] {
  const found: Finding[] = [];
  const lines = stripTimestamps(text).split('\n');
  for (const rule of RULES) {
    lines.forEach((line, index) => {
      for (const match of line.matchAll(rule.pattern)) {
        if (ALLOWED.has(match[0])) continue;
        found.push({
          file: relPath,
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

export function collectFiles(dir: string = REPO_ROOT): readonly string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (SKIP_FILES.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (SKIP_DIRS.has(entry)) continue;
      out.push(...collectFiles(full));
    } else {
      const dot = entry.lastIndexOf('.');
      const extension = dot === -1 ? '' : entry.slice(dot);
      if (TEXT_EXTENSIONS.includes(extension)) out.push(full);
    }
  }
  return out;
}

/**
 * A path is as tracked as a line inside a file.
 *
 * `.gitignore` carried two rules naming raw Figma exports whose filenames embed
 * a node id, and every content rule here read straight past them because a file
 * name is not a line of any file. A node id in a path is written with a hyphen
 * rather than a colon, so the `node-id` rule cannot see it either.
 *
 * The pattern is narrow on purpose. `\d{3,6}-\d{4,6}` excludes the shapes that
 * would otherwise drown it: an ISO date (`2026-09-06`, four-two), a semantic
 * version fragment, and a two- or three-digit sequence number. A Figma node id
 * has a substantial second field, and that is what is matched.
 */
export const PATH_RULE = {
  id: 'node-id-in-path',
  what: 'a Figma node id inside a tracked file or directory name',
  pattern: /\b\d{3,6}-\d{4,6}\b/g,
  why:
    'a tracked path carries its identifier as durably as a tracked field, and BP-5 does not ' +
    'distinguish the two',
} as const;

export function scanPath(relPath: string): readonly Finding[] {
  const found: Finding[] = [];
  for (const match of relPath.matchAll(PATH_RULE.pattern)) {
    if (ALLOWED.has(match[0])) continue;
    found.push({
      file: relPath,
      line: 0,
      rule: PATH_RULE.id,
      what: PATH_RULE.what,
      match: match[0],
      why: PATH_RULE.why,
    });
  }
  return found;
}

export function scanRepository(root: string = REPO_ROOT): readonly Finding[] {
  const found: Finding[] = [];
  for (const file of collectFiles(root)) {
    const relPath = relative(root, file);
    found.push(...scanPath(relPath));
    found.push(...scanText(relPath, readFileSync(file, 'utf8')));
  }
  return found;
}

function main(argv: readonly string[]): void {
  const findings = scanRepository();
  for (const finding of findings) {
    process.stdout.write(`${finding.file}:${finding.line}  ${finding.rule}  "${finding.match}" — ${finding.why}\n`);
  }
  if (findings.length === 0) {
    process.stdout.write(`No real-identifier shapes found across ${collectFiles().length} files (${RULES.length} rules).\n`);
  }
  if (argv.includes('--check') && findings.length > 0) process.exitCode = 1;
}

if (process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2));
}
