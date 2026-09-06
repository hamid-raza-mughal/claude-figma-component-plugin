/**
 * Promotes a research corpus into sanitized, tracked regression fixtures (BP-5).
 *
 * Run it as:
 *
 *   node tools/promote-representation-evidence.ts \
 *     --source <research corpus root> \
 *     --out tests/representation/fixtures/empirical \
 *     --mapping "$REPRESENTATION_EVIDENCE_DIR"
 *
 * The source directory is an **argument**, never a constant. That is the same
 * arrangement the artifact-bundle tools use, and it is what keeps BP-1's "no
 * tracked file depends on the research directory" literally true: nothing here
 * knows where the corpus is, so nothing here can reach it unbidden.
 *
 * Three properties this tool exists to guarantee.
 *
 * **The mapping never lands inside the repository.** A committed real-to-
 * placeholder mapping makes every placeholder trivially reversible, which is
 * sanitization in name only — the tracked tree would then carry the design
 * system in a thin disguise. An output path resolving inside the repository is
 * refused before anything is written.
 *
 * **Hashes are recomputed over the sanitized bytes.** A promoted artifact keeps
 * a real, checkable SHA-256 of the bytes actually tracked. Where a hash referred
 * to something not promoted — a screenshot, a raw export — it becomes the
 * SHA-256 of the literal string `unpromoted:<placeholder>`, which anyone can
 * recompute from the tracked bytes alone and which therefore cannot be mistaken
 * for evidence about content. A tracked hash over real bytes is exactly what
 * BP-5 forbids, and `docs/v1-baseline-manifest.md` is what it looks like when
 * that rule is left to discipline instead of being mechanised.
 *
 * **Screenshots are not promoted at all.** The research package's own
 * `knownLimitations` says they establish visual evidence only and back no
 * structural claim, so nothing depends on them — and they are the largest
 * identifying payload in the corpus.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync, mkdirSync, statSync, rmSync } from 'node:fs';
import { join, relative, resolve, dirname, extname, basename, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Promoted, by extension. A closed list rather than a filter, so widening it
 *  is a visible edit. */
const PROMOTED_EXTENSIONS = new Set(['.json', '.md', '.xml', '.sha256', '.txt']);

export type Mapping = {
  /** What each placeholder prefix stands for. The real values live only in the
   *  file this tool writes outside the repository. */
  readonly legend: Record<string, string>;
  readonly real_to_placeholder: Record<string, string>;
};

export type Assigner = {
  /** Phase one: record that a value exists, without deciding its name yet. */
  readonly collect: (kind: string, real: string) => void;
  /** Ends phase one. Placeholders are assigned here, once, over the complete set. */
  readonly freeze: () => void;
  /** Phase two: the frozen name. Throws if the value was never collected, because
   *  a value that reaches substitution unseen is a hole in the collect pass. */
  readonly placeholderFor: (kind: string, real: string) => string;
  readonly mapping: () => Mapping;
};

const LEGEND: Record<string, string> = {
  FILEKEY: 'a Figma file key',
  NODE: 'a Figma node id',
  VC: 'a variable collection id',
  VAR: 'a variable id',
  STYLE: 'a style key',
  KEY: 'a component or component-set key',
  SHA: 'a SHA-256 recorded in the corpus',
  NAME: 'a name with no recognisable shape, named for redaction by the operator',
};

/**
 * Assigns placeholders deterministically, in two phases.
 *
 * The phases are the whole point, and the first version of this had one phase
 * and was wrong. Numbering follows the sorted order of the real values — which
 * means every number *shifts* when a new value is discovered. Assigning as you
 * substitute therefore writes a placeholder that is correct at the time and
 * stale a moment later, and two different identifiers end up sharing one
 * placeholder. That is not a leak, but it is worse than it sounds: it silently
 * merges distinct identifiers, so a corpus that distinguished two nodes stops
 * distinguishing them, and the mapping written alongside no longer describes
 * the text it claims to describe.
 *
 * It also passed every test I had written for it — determinism (the bug is
 * deterministic) and order-independence of `mapping()` (the bug is in
 * `placeholderFor`, not `mapping`). What caught it was an assertion about the
 * *output*: that every hash in the promoted corpus is accounted for. Three
 * different files had acquired one hash.
 *
 * So: collect everything, freeze, then substitute against a map that can no
 * longer move.
 */
export function createAssigner(): Assigner {
  const seen = new Map<string, Set<string>>();
  let frozen: Map<string, string> | null = null;

  const key = (kind: string, real: string): string => `${kind}\u0000${real}`;

  return {
    collect(kind, real) {
      if (frozen !== null) throw new Error('collect() after freeze()');
      const values = seen.get(kind) ?? new Set<string>();
      values.add(real);
      seen.set(kind, values);
    },
    freeze() {
      const assigned = new Map<string, string>();
      for (const [kind, values] of [...seen].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
        [...values].sort().forEach((real, index) => {
          assigned.set(key(kind, real), `${kind}-${String(index + 1).padStart(4, '0')}`);
        });
      }
      frozen = assigned;
    },
    placeholderFor(kind, real) {
      if (frozen === null) throw new Error('placeholderFor() before freeze()');
      const placeholder = frozen.get(key(kind, real));
      if (placeholder === undefined) {
        throw new Error(`${kind} value "${real}" reached substitution without being collected`);
      }
      return placeholder;
    },
    mapping() {
      if (frozen === null) throw new Error('mapping() before freeze()');
      const real_to_placeholder: Record<string, string> = {};
      for (const [composite, placeholder] of frozen) {
        real_to_placeholder[composite.split('\u0000')[1] as string] = placeholder;
      }
      return { legend: LEGEND, real_to_placeholder };
    },
  };
}

/**
 * The identifier shapes, in the order they must be applied.
 *
 * Order is load-bearing. A variable collection id *contains* a node id, so the
 * compound forms go first; applying the bare node-id rule first would corrupt
 * the compound one into something the next rule no longer matches, and the
 * residue would look sanitized while still carrying half a real identifier.
 */
const SHAPES: readonly { readonly kind: string; readonly pattern: RegExp }[] = [
  { kind: 'VC', pattern: /VariableCollectionId:[0-9a-f]{40}\/\d+:\d+/g },
  { kind: 'VAR', pattern: /VariableID:[0-9a-f]{40}\/\d+:\d+/g },
  { kind: 'STYLE', pattern: /\bS:[0-9a-f]{40}\b/g },
  { kind: 'SHA', pattern: /\b[0-9a-f]{64}\b/g },
  { kind: 'KEY', pattern: /\b[0-9a-f]{40}\b/g },
  { kind: 'NODE', pattern: /\b\d{2,6}:\d{1,6}\b/g },
];

export type SanitiseOptions = {
  readonly assigner: Assigner;
  /** Literals replaced wherever they appear — a file key and a design system's
   *  own name have no recognisable shape, so they are read out of the corpus
   *  or supplied by the operator rather than pattern-matched. */
  readonly literals: readonly { readonly kind: string; readonly value: string }[];
};

/** Case-insensitive, because a name is written more than one way. This corpus
 *  carries three casings of the same word, and a case-sensitive pass would have
 *  removed two of them and left the third looking sanitized. */
function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Phase one over one document: every value it contains, recorded, nothing
 *  replaced. */
export function collectFrom(text: string, options: SanitiseOptions): void {
  for (const shape of SHAPES) {
    let working = text;
    for (const literal of options.literals) {
      if (literal.value.length === 0) continue;
      working = working.replace(new RegExp(escapeForRegExp(literal.value), 'gi'), ' ');
    }
    for (const match of working.matchAll(shape.pattern)) {
      options.assigner.collect(shape.kind, match[0]);
    }
    // A compound shape consumes its parts, so the parts must not be collected
    // separately from the same text — see the ordering note above.
    working = working.replace(shape.pattern, ' ');
    text = working;
  }
}

export function sanitiseText(text: string, options: SanitiseOptions): string {
  let out = text;
  for (const literal of options.literals) {
    if (literal.value.length === 0) continue;
    const placeholder = options.assigner.placeholderFor(literal.kind, literal.value.toLowerCase());
    out = out.replace(new RegExp(escapeForRegExp(literal.value), 'gi'), placeholder);
  }
  for (const shape of SHAPES) {
    out = out.replace(shape.pattern, (match) => options.assigner.placeholderFor(shape.kind, match));
  }
  return out;
}

/** A file name can carry a node id all by itself. A tracked filename is as much
 *  a tracked identifier as a tracked field, which is why `.gitignore` had to
 *  lose two lines earlier in this phase. */
export function collectFromFileName(
  name: string,
  assigner: Assigner,
  literals: readonly { readonly kind: string; readonly value: string }[] = [],
): void {
  let working = name;
  for (const literal of literals) {
    if (literal.value.length === 0) continue;
    working = working.replace(new RegExp(escapeForRegExp(literal.value), 'gi'), ' ');
  }
  for (const match of working.matchAll(/\b(\d{2,6})-(\d{1,6})\b/g)) {
    assigner.collect('NODE', `${match[1]}:${match[2]}`);
  }
}

export function sanitiseFileName(
  name: string,
  assigner: Assigner,
  literals: readonly { readonly kind: string; readonly value: string }[] = [],
): string {
  let out = name;
  for (const literal of literals) {
    if (literal.value.length === 0) continue;
    out = out.replace(
      new RegExp(escapeForRegExp(literal.value), 'gi'),
      assigner.placeholderFor(literal.kind, literal.value.toLowerCase()),
    );
  }
  return out.replace(/\b(\d{2,6})-(\d{1,6})\b/g, (_match, left: string, right: string) =>
    assigner.placeholderFor('NODE', `${left}:${right}`),
  );
}

export function sha256(bytes: string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** The value substituted where a recorded hash referred to bytes that were not
 *  promoted. Recomputable from the placeholder alone. */
export function unpromotedHash(placeholder: string): string {
  return sha256(`unpromoted:${placeholder}`);
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out.sort();
}

export type PromotionResult = {
  readonly written: readonly string[];
  readonly skipped: readonly string[];
  /** Hashes that could not be resolved to a promoted file and became
   *  `unpromoted:` markers. Reported, never silent. */
  readonly unresolved_hashes: number;
  /** Files left out for exceeding the size budget, by sanitized name. Named
   *  rather than counted, because "something large was dropped" is exactly the
   *  kind of fact that stops being visible once it is only a number. */
  readonly skipped_by_size: readonly string[];
  /** Rounds the hash fixpoint needed. Reported because a corpus whose documents
   *  hash each other cyclically would not converge, and that must be visible. */
  readonly hash_rounds: number;
  /** Documents whose recorded hash could not be made to agree with their own
   *  bytes — a document recording its own hash, most obviously. Named, because
   *  the alternative is a corpus that silently carries a hash validating
   *  nothing. */
  readonly unconverged: readonly string[];
  readonly aggregate_sha256: string;
};

/** Refuses a mapping directory inside the repository. Checked on the resolved
 *  path, because `../../repo/evidence` resolves back inside. */
export function assertMappingOutsideRepository(mappingDir: string): void {
  const resolved = resolve(mappingDir);
  if (resolved === REPO_ROOT || resolved.startsWith(REPO_ROOT + sep)) {
    throw new Error(
      `refusing to write the real-to-placeholder mapping to ${resolved}: it is inside the ` +
        'repository. BP-5 keeps the mapping with the secrets it describes, because a committed ' +
        'mapping makes every placeholder reversible.',
    );
  }
}

/** Larger than any document that backs a structural claim in this corpus, and
 *  smaller than a raw capture. The raw Figma exports are deliberately on the
 *  wrong side of it: they are bulk source data, already recorded by hash in the
 *  contracts' `provenance.exportsUsed`, and nothing validates against them. */
export const DEFAULT_MAX_BYTES = 262_144;

export function promote(options: {
  readonly source: string;
  readonly out: string;
  readonly mappingDir: string;
  /** Values with no recognisable shape that must not survive — a design
   *  system's own name, most obviously. Supplied by the operator so this tool
   *  stays client-neutral, which is the same requirement BP-8 puts on the
   *  schema's `$id`. */
  readonly redact?: readonly string[] | undefined;
  readonly maxBytes?: number | undefined;
  /** Source-relative path prefixes left out entirely. B4 promotes contracts,
   *  evidence artifacts and probes; a research package's own synthetic fixture
   *  set, its validator's test suite and its lineage archives are none of
   *  those, and promoting them would make the tracked corpus larger without
   *  making any production check stronger. */
  readonly exclude?: readonly string[] | undefined;
}): PromotionResult {
  assertMappingOutsideRepository(options.mappingDir);

  const assigner = createAssigner();
  const files = walk(options.source);

  const literals = new Set<string>();
  for (const file of files) {
    if (extname(file) !== '.json') continue;
    for (const match of readFileSync(file, 'utf8').matchAll(/"fileKey"\s*:\s*"([^"]+)"/g)) {
      const value = match[1];
      if (value !== undefined && value.length > 0) literals.add(value);
    }
  }
  const literalList = [
    ...[...literals].sort().map((value) => ({ kind: 'FILEKEY', value })),
    ...(options.redact ?? []).map((value) => ({ kind: 'NAME', value })),
  ];

  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const skipped: string[] = [];
  const skippedBySize: string[] = [];

  /*
   * Phase one. Every value in every file that will be promoted, and in every
   * file name, recorded before a single substitution happens. Nothing is
   * assigned a placeholder yet.
   */
  const promotable: { readonly file: string; readonly relativePath: string }[] = [];
  for (const file of files) {
    if (!PROMOTED_EXTENSIONS.has(extname(file).toLowerCase())) {
      skipped.push(relative(options.source, file));
      continue;
    }
    const relativePath = relative(options.source, file);
    if ((options.exclude ?? []).some((prefix) => relativePath.startsWith(prefix))) {
      skipped.push(relativePath);
      continue;
    }
    promotable.push({ file, relativePath });
  }
  // Literals are known up front, so they are collected unconditionally rather
  // than on sight. Collecting on sight looked equivalent and was not: a value
  // appearing only in an excluded file is still in the literal list and is still
  // substituted, so it would reach phase two having never been named.
  for (const literal of literalList) {
    if (literal.value.length > 0) assigner.collect(literal.kind, literal.value.toLowerCase());
  }
  for (const { file, relativePath } of promotable) {
    collectFromFileName(relativePath, assigner, literalList);
    if (statSync(file).size > maxBytes) continue;
    collectFrom(readFileSync(file, 'utf8'), { assigner, literals: literalList });
  }
  assigner.freeze();
  type Entry = { readonly outPath: string; text: string; readonly originalSha: string };
  const entries: Entry[] = [];

  for (const { file, relativePath } of promotable) {
    const directory = dirname(relativePath);
    if (statSync(file).size > maxBytes) {
      skippedBySize.push(
        join(
          directory === '.' ? '' : sanitiseFileName(directory, assigner, literalList),
          sanitiseFileName(basename(relativePath), assigner, literalList),
        ),
      );
      continue;
    }
    const original = readFileSync(file, 'utf8');
    entries.push({
      outPath: join(
        options.out,
        directory === '.' ? '' : sanitiseFileName(directory, assigner, literalList),
        sanitiseFileName(basename(relativePath), assigner, literalList),
      ),
      text: sanitiseText(original, { assigner, literals: literalList }),
      originalSha: sha256(original),
    });
  }

  /*
   * Hash resolution is a fixpoint over a *value map*, not over the text.
   *
   * The obvious implementation — substitute placeholders, recompute, repeat —
   * terminates immediately and wrongly: the first substitution consumes the
   * placeholder, so the second round has nothing left to update and the
   * document keeps whatever hash the first round happened to write. It looks
   * converged. It is a document whose recorded hashes do not match the bytes
   * beside them, which is a hash that validates nothing — the exact failure
   * this promotion exists to avoid.
   *
   * So the placeholders stay in the template, and what iterates is the map from
   * placeholder to hash. A document that recorded its own hash could never
   * converge; that case is detected and reported rather than papered over.
   */
  const mapping = assigner.mapping();
  const placeholderByReal = mapping.real_to_placeholder;
  const shaPlaceholders = Object.values(placeholderByReal).filter((p) => p.startsWith('SHA-'));
  const entryForPlaceholder = new Map<string, Entry>();
  for (const entry of entries) {
    const placeholder = placeholderByReal[entry.originalSha];
    if (placeholder !== undefined) entryForPlaceholder.set(placeholder, entry);
  }

  const hashFor = new Map<string, string>();
  for (const placeholder of shaPlaceholders) hashFor.set(placeholder, unpromotedHash(placeholder));

  const render = (template: string): string => {
    let out = template;
    for (const placeholder of shaPlaceholders) {
      if (!out.includes(placeholder)) continue;
      out = out.split(placeholder).join(hashFor.get(placeholder) as string);
    }
    return out;
  };

  let rounds = 0;
  let settled = false;
  while (!settled && rounds < 50) {
    rounds += 1;
    settled = true;
    for (const [placeholder, entry] of entryForPlaceholder) {
      const next = sha256(render(entry.text));
      if (hashFor.get(placeholder) !== next) {
        hashFor.set(placeholder, next);
        settled = false;
      }
    }
  }

  const unconverged: string[] = [];
  if (!settled) {
    for (const [placeholder, entry] of entryForPlaceholder) {
      if (sha256(render(entry.text)) !== hashFor.get(placeholder)) {
        unconverged.push(relative(options.out, entry.outPath));
      }
    }
  }

  for (const entry of entries) entry.text = render(entry.text);

  const written: string[] = [];
  for (const entry of entries) {
    mkdirSync(dirname(entry.outPath), { recursive: true });
    writeFileSync(entry.outPath, entry.text);
    written.push(relative(options.out, entry.outPath));
  }

  mkdirSync(options.mappingDir, { recursive: true });
  writeFileSync(
    join(options.mappingDir, 'representation-evidence-mapping.json'),
    JSON.stringify(mapping, null, 2) + '\n',
  );

  written.sort();
  const aggregate = sha256(
    written.map((name) => `${name} ${sha256(readFileSync(join(options.out, name), 'utf8'))}`).join('\n'),
  );

  return {
    written,
    skipped: skipped.sort(),
    unresolved_hashes: shaPlaceholders.length - entryForPlaceholder.size,
    skipped_by_size: skippedBySize.sort(),
    unconverged: unconverged.sort(),
    hash_rounds: rounds,
    aggregate_sha256: aggregate,
  };
}

function argOf(argv: readonly string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

function main(argv: readonly string[]): void {
  const source = argOf(argv, '--source');
  const out = argOf(argv, '--out');
  const mappingDir = argOf(argv, '--mapping') ?? process.env['REPRESENTATION_EVIDENCE_DIR'];
  const redact = argv.flatMap((value, index) => (value === '--redact' ? [argv[index + 1] ?? ''] : []));
  const maxBytesArg = argOf(argv, '--max-bytes');
  const exclude = argv.flatMap((value, index) =>
    value === '--exclude' ? [argv[index + 1] ?? ''] : [],
  );

  if (source === undefined || out === undefined) {
    process.stderr.write(
      'usage: promote-representation-evidence --source <dir> --out <dir> ' +
        '[--mapping <dir outside the repository>]\n',
    );
    process.exitCode = 2;
    return;
  }
  if (mappingDir === undefined) {
    process.stderr.write(
      'REPRESENTATION_EVIDENCE_DIR is unset and --mapping was not given. The mapping has to go ' +
        'somewhere outside the repository, and this tool will not guess.\n',
    );
    process.exitCode = 2;
    return;
  }

  try {
    assertMappingOutsideRepository(mappingDir);
  } catch (error) {
    process.stderr.write(`${(error as Error).message}\n`);
    process.exitCode = 2;
    return;
  }

  rmSync(out, { recursive: true, force: true });
  const result = promote({
    source,
    out,
    mappingDir,
    redact,
    maxBytes: maxBytesArg === undefined ? undefined : Number(maxBytesArg),
    exclude,
  });
  process.stdout.write(
    `promoted ${result.written.length}, skipped ${result.skipped.length}, ` +
      `over budget ${result.skipped_by_size.length}, ` +
      `unconverged ${result.unconverged.length}, ` +
      `unresolved hashes ${result.unresolved_hashes}, rounds ${result.hash_rounds}\n` +
      result.skipped_by_size.map((name) => `  over budget: ${name}\n`).join('') +
      `aggregate ${result.aggregate_sha256}\n`,
  );
}

if (process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2));
}
