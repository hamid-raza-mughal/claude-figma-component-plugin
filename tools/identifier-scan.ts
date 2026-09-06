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
/**
 * Extensions whose *contents* are read.
 *
 * `.sha256` and `.xml` were added in audit cycle 2: a checksums manifest in the
 * promoted corpus carried real ids on twenty-one lines and was never opened,
 * because its extension was not on this list.
 *
 * A leading-dot filename — `.gitignore`, `.npmrc` — has `lastIndexOf('.') === 0`,
 * so its whole name reads as the extension and it matched nothing here. That is
 * the file the path rule was written from, and its contents were still
 * unscanned; `isScannable` handles it explicitly rather than by adding names to
 * this list one at a time.
 */
const TEXT_EXTENSIONS = ['.ts', '.js', '.json', '.md', '.yml', '.yaml', '.sql', '.txt', '.sha256', '.xml', ''];

/** A dotfile with no second dot is a text config file, and is read. */
function isScannable(entry: string): boolean {
  const dot = entry.lastIndexOf('.');
  if (dot === 0) return true;
  return TEXT_EXTENSIONS.includes(dot === -1 ? '' : entry.slice(dot));
}

export type Rule = {
  readonly id: string;
  readonly what: string;
  readonly pattern: RegExp;
  /** Why a match is a BP-5 violation rather than a coincidence. */
  readonly why: string;
  /**
   * Occurrences falling inside a match of this pattern are not findings.
   *
   * Needed because a UUID's `8-4-4-4-12` grouping produces all-digit runs that
   * are node-id-shaped — `…-0000-4000-…` — and this repository is full of
   * UUIDs by design (INV-02 requires them). A lookaround cannot express it: the
   * hyphen before the run is exactly what a real node id in a filename also has.
   */
  readonly excludeWithin?: RegExp | undefined;
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
    id: 'node-id-hyphenated',
    what: 'a Figma node id written with a hyphen, in file content',
    /*
     * Audit cycle 2. `node-id-in-path` caught the hyphen form in a *path*; every
     * content rule was colon-only, so a filename quoted inside a document kept
     * its real id — 203 occurrences of eleven distinct real ids, in a corpus
     * this scan reported clean.
     *
     * The second field needs four digits or more, which is what separates a
     * node id from an ISO date (`2026-09-06`), a version fragment and a
     * sequence number.
     */
    /*
     * The first field may not start with `0`. That single narrowing is what
     * separates a Figma node id — an integer, never zero-padded — from a UUID's
     * middle groups, which this repository is full of because INV-02 requires
     * UUIDs. A UUID's version and variant groups are node-id-shaped and are not
     * node ids, and a lookaround on the surrounding hyphens cannot tell the two
     * apart: a real id inside a filename has hyphens on both sides too.
     *
     * The two alternatives require **seven digits across the pair**, which is
     * the shortest a real id in this corpus is. Without it the rule eats line
     * ranges — `265-278`, `80-100` — and a rule that fires on every prose range
     * is a rule that gets allowlisted into silence.
     */
    pattern: /(?<![\d.])(?:[1-9]\d{2,6}-\d{4,7}|[1-9]\d{3,6}-\d{3,7})(?!\d)/g,
    /*
     * Three or more hyphen-separated hex-only groups is a UUID, whether or not
     * the line spells the whole thing out. The display-id tests build one by
     * interpolating its first half, so a fixed UUID pattern never matches the
     * literal text and the version and variant groups read as a node id.
     * A real node id in a filename sits between non-hex words, so it never forms
     * a run this long.
     */
    excludeWithin: /(?<![0-9a-fA-F])[0-9a-f]+(?:-[0-9a-f]+){2,}(?![0-9a-fA-F-])/g,
    why: 'a node id in prose or in a quoted filename is as real as one in a field',
  },
  {
    id: 'truncated-hex',
    what: 'a hex identifier abbreviated with an ellipsis',
    /*
     * Audit cycle 2. Prose abbreviates keys and hashes constantly, and an
     * eight-hex prefix still resolves to exactly one real value. Every rule
     * here required a full 40 or 64 hex, so the abbreviated form passed through
     * every one of them — including, in one document, a real SHA-256 prefix
     * over bytes that were never promoted.
     */
    pattern: /(?<![0-9a-fA-F])[0-9a-f]{8,}\s*(?:…|\.\.\.)/g,
    why: 'an eight-hex prefix of a real key or hash identifies it uniquely; abbreviation is not redaction',
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
  {
    token: '1cafef00d…',
    why:
      'a synthetic paint key in the owner testing guide, spelled 1cafef00d to be unmistakably ' +
      'invented; absent from the research corpus (audit cycle 2 sweep)',
  },
  {
    token: '2ec60fd0cac62453…',
    why:
      'an artifact hash from a Phase 2 verification transcript, computed over a synthetic ' +
      'Coordinator output; absent from the research corpus (audit cycle 2 sweep)',
  },
  {
    token: '700-1200',
    why:
      'a token-count range in a test title, not a node id. The seven-digit rule keeps ranges out ' +
      'in general; this one is seven digits by coincidence',
  },
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

/** The spans a rule's `excludeWithin` covers on one line. */
function excludedSpans(line: string, pattern: RegExp | undefined): readonly [number, number][] {
  if (pattern === undefined) return [];
  return [...line.matchAll(pattern)].map(
    (match) => [match.index, match.index + match[0].length] as [number, number],
  );
}

export function scanText(relPath: string, text: string): readonly Finding[] {
  const found: Finding[] = [];
  const lines = stripTimestamps(text).split('\n');
  for (const rule of RULES) {
    lines.forEach((line, index) => {
      const excluded = excludedSpans(line, rule.excludeWithin);
      for (const match of line.matchAll(rule.pattern)) {
        if (ALLOWED.has(match[0])) continue;
        if (excluded.some(([from, to]) => match.index >= from && match.index < to)) continue;
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
      if (isScannable(entry)) out.push(full);
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

/**
 * Every path, whatever the file is.
 *
 * `collectFiles` filters to text extensions because it exists to read contents.
 * The path rule reads no contents, and a screenshot named for the node it shows
 * is exactly the case it was added for — so filtering by extension here would
 * have left the largest class of offender invisible. Found while auditing the
 * rule I had just written.
 */
export function collectPaths(dir: string = REPO_ROOT, root: string = REPO_ROOT): readonly string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (SKIP_FILES.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (SKIP_DIRS.has(entry)) continue;
      out.push(...collectPaths(full, root));
    } else {
      out.push(relative(root, full));
    }
  }
  return out.sort();
}

/**
 * An abbreviation of a value the repository already carries in full is not a
 * disclosure.
 *
 * `ae40356ad5c7…` in a testing guide is the same hash printed in full eight
 * lines earlier in the same document, over a *tracked synthetic fixture*.
 * Whether the full value should be there is the full-length rules' question,
 * and they answer it; flagging the abbreviation as well reports one fact twice
 * and trains the reader to skim. What stays a finding is an abbreviation of
 * something the repository does **not** carry in full — which is precisely the
 * case audit cycle 2 found, a real key prefix whose full value exists only in
 * the untracked corpus.
 */
function isAbbreviationOfATrackedValue(match: string, fullValues: ReadonlySet<string>): boolean {
  const prefix = match.replace(/[^0-9a-f]/g, '');
  for (const value of fullValues) {
    if (value.startsWith(prefix)) return true;
  }
  return false;
}

/**
 * Scans a set of documents *together*.
 *
 * Together matters: the abbreviation suppression is a cross-document fact, so a
 * caller that scanned one file at a time would report an abbreviation as a
 * finding while the full value sat eight lines above it. Every caller goes
 * through here, which is what keeps the two entry points from disagreeing —
 * and they did disagree when the suppression lived only in `scanRepository`.
 */
export function scanDocuments(
  documents: readonly (readonly [string, string])[],
): readonly Finding[] {
  const fullValues = new Set<string>();
  for (const [, text] of documents) {
    for (const match of text.matchAll(/(?<![0-9a-fA-F])[0-9a-f]{40}(?:[0-9a-f]{24})?(?![0-9a-fA-F])/g)) {
      fullValues.add(match[0]);
    }
  }
  const found: Finding[] = [];
  for (const [relPath, text] of documents) {
    for (const finding of scanText(relPath, text)) {
      if (
        finding.rule === 'truncated-hex' &&
        isAbbreviationOfATrackedValue(finding.match, fullValues)
      ) {
        continue;
      }
      found.push(finding);
    }
  }
  return found;
}

export function scanRepository(root: string = REPO_ROOT): readonly Finding[] {
  const found: Finding[] = [];
  for (const relPath of collectPaths(root, root)) {
    found.push(...scanPath(relPath));
  }
  const documents = collectFiles(root).map(
    (file) => [relative(root, file), readFileSync(file, 'utf8')] as const,
  );
  found.push(...scanDocuments(documents));
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
