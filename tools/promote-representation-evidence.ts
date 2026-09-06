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
import {
  readdirSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  statSync,
  rmSync,
  realpathSync,
} from 'node:fs';
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
  TRUNC: 'a hex identifier abbreviated with an ellipsis',
  NAME: 'a name with no recognisable shape, named for redaction by the operator',
};

/**
 * Assigns placeholders deterministically, in two phases, **numbered by order of
 * first sight rather than by sorted value.**
 *
 * The sorted numbering was mine, chosen so the mapping would not depend on
 * filesystem enumeration order, and audit cycle 2 showed what it costs. Sorted
 * numbering makes the placeholder index a *rank*: given any two anchors whose
 * real values are known, every placeholder numbered between them is bracketed
 * to the numeric band between those values. With a handful of anchors that
 * constrains hundreds of ids at once. Numbering by first sight over a
 * deterministically sorted file walk keeps reproducibility — the same corpus
 * yields the same mapping — while the index says only "seen earlier", which is
 * document order and reveals nothing about the values.
 *
 * A hash-based scheme was considered and rejected outright: node ids are small
 * integers, so `sha256(realValue)` is brute-forceable in seconds. Any
 * pseudonym derived from a low-entropy identifier is reversible by whoever
 * guesses the identifier, which is everyone.
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
        // Insertion order — a Set preserves it — over a sorted file walk.
        [...values].forEach((real, index) => {
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
 * Text that must survive untouched, matched before anything else.
 *
 * An ISO timestamp is node-id-shaped twice over — `10:00:01` is two of them —
 * and the node-id rule below had to be narrowed to `\d{2,6}` to avoid eating
 * them. That narrowing is what let a real single-digit mode id through. Pulling
 * timestamps out first lets the node rule be as wide as a real node id actually
 * is.
 */
const PROTECTED: readonly RegExp[] = [
  /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?/g,
  /\b\d{2}:\d{2}:\d{2}\b/g,
];

/**
 * The identifier shapes, in the order they must be applied.
 *
 * Order is load-bearing. A variable collection id *contains* a node id, so the
 * compound forms go first; applying the bare node-id rule first would corrupt
 * the compound one into something the next rule no longer matches, and the
 * residue would look sanitized while still carrying half a real identifier.
 *
 * **Three of these were added in audit cycle 2, after the first promotion
 * leaked.** Each is a form the corpus uses that the original list did not
 * describe, and all three passed the sanitizer, both tracked test suites and
 * the repository-wide identifier scan, which reported clean:
 *
 *   - `TRUNC` — a hex id abbreviated with an ellipsis. Prose does this
 *     constantly, and an 8-hex prefix still resolves to exactly one real value.
 *     It also produced *half-sanitized* compounds: a real key prefix followed
 *     by an already-substituted node placeholder.
 *   - `HYPHEN` — a node id written with a hyphen, which is how the corpus names
 *     files. `sanitiseFileName` handled it for paths; every filename **quoted
 *     inside a document** kept its real id, 203 occurrences of 11 distinct ids.
 *     One document pairs the hyphen form with its own placeholder on adjacent
 *     lines, which is a partial mapping, published.
 *   - the widened `NODE` field lengths — a real mode id with a single-digit
 *     first field slipped a `\d{2,6}` rule 36 times.
 */
type Shape = {
  readonly kind: string;
  readonly pattern: RegExp;
  /**
   * The canonical real value a match stands for.
   *
   * A node id written with a hyphen and the same id written with a colon are
   * one identifier in two notations, and they must receive **one** placeholder.
   * Two names for one node is a correspondence an attacker can use and a
   * distinction a reader cannot.
   */
  readonly canonical?: ((match: string) => string) | undefined;
};

/*
 * Every boundary below is a character-class lookaround, never `\b`.
 *
 * `\b` treats `_` as a word character, so it does not fire on a hyphenated id
 * embedded between underscores — `comp_build_<id>_screenshot.png` is how the
 * corpus names a screenshot, and that is not a hypothetical: it is where a real
 * node id was still sitting after the hyphen rule was added. The
 * boundary a sanitizer wants is "not more of the same kind of character".
 *
 * The trailing lookahead is `(?!\d)` and **not** `(?![\d.])`, which is the
 * mistake one revision later: excluding a following dot rejects a node id at
 * the end of a sentence, and `…modes Dark=… and Light=806:0.` is how the corpus
 * writes them in prose. The leading lookbehind still excludes a dot, because
 * there the dot means a decimal and `1.2:3` is not a node id.
 */
const SHAPES: readonly Shape[] = [
  { kind: 'TRUNC', pattern: /(?<![0-9a-fA-F])[0-9a-f]{6,}\s*(?:…|\.\.\.)\s*[0-9a-f]*/g },
  { kind: 'VC', pattern: /VariableCollectionId:[0-9a-f]{40}\/\d+:\d+/g },
  { kind: 'VAR', pattern: /VariableID:[0-9a-f]{40}\/\d+:\d+/g },
  { kind: 'STYLE', pattern: /(?<![0-9A-Za-z])S:[0-9a-f]{40}(?![0-9a-f])/g },
  { kind: 'SHA', pattern: /(?<![0-9a-fA-F])[0-9a-f]{64}(?![0-9a-fA-F])/g },
  { kind: 'KEY', pattern: /(?<![0-9a-fA-F])[0-9a-f]{40}(?![0-9a-fA-F])/g },
  { kind: 'NODE', pattern: /(?<![\d.])\d{1,7}:\d{1,7}(?!\d)/g },
  {
    kind: 'NODE',
    pattern: /(?<![\d.])\d{1,7}-\d{3,7}(?!\d)/g,
    canonical: (match) => match.replace('-', ':'),
  },
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

/**
 * Replaces every protected run with an index-keyed sentinel, and returns the
 * restore function.
 *
 * The sentinel carries no digits and no hex, so no shape rule can match inside
 * it — which is the property that lets the node rule below be as wide as a real
 * node id actually is instead of as narrow as a timestamp forces. Its delimiters
 * are private-use code points rather than NUL, because a NUL in a regular
 * expression is a lint error and, more to the point, a byte that can end a
 * string in half the tools that might later read the output.
 */
function protectText(text: string): { readonly text: string; readonly restore: (out: string) => string } {
  const kept: string[] = [];
  let out = text;
  for (const pattern of PROTECTED) {
    out = out.replace(pattern, (match) => {
      kept.push(match);
      return `\uE000KEEP${'X'.repeat(kept.length)}\uE001`;
    });
  }
  return {
    text: out,
    restore: (rendered) =>
      rendered.replace(/\uE000KEEP(X+)\uE001/g, (_match, marks: string) => kept[marks.length - 1] as string),
  };
}

/** Phase one over one document: every value it contains, recorded, nothing
 *  replaced. */
export function collectFrom(text: string, options: SanitiseOptions): void {
  let working = protectText(text).text;
  for (const shape of SHAPES) {
    for (const match of working.matchAll(shape.pattern)) {
      options.assigner.collect(shape.kind, (shape.canonical ?? ((value) => value))(match[0]));
    }
    // A compound shape consumes its parts, so the parts must not be collected
    // separately from the same text — see the ordering note above.
    working = working.replace(shape.pattern, ' ');
  }
}

export function sanitiseText(text: string, options: SanitiseOptions): string {
  const protectedText = protectText(text);
  let out = protectedText.text;
  /*
   * Shapes before literals, and audit cycle 2 is why.
   *
   * Literals used to go first, and every shape rule was `\b`-anchored. A
   * placeholder ending in a digit destroys the word boundary the next rule
   * needs, so a redacted name immediately followed by a node id produced
   * `NAME-0001` glued to the digits — and the node id, now lacking a boundary,
   * passed through intact with nothing raising. Substituting shapes first means
   * no placeholder ever sits where a shape rule is about to look.
   */
  for (const shape of SHAPES) {
    out = out.replace(shape.pattern, (match) =>
      options.assigner.placeholderFor(shape.kind, (shape.canonical ?? ((value) => value))(match)),
    );
  }
  for (const literal of options.literals) {
    if (literal.value.length === 0) continue;
    const placeholder = options.assigner.placeholderFor(literal.kind, literal.value.toLowerCase());
    out = out.replace(new RegExp(escapeForRegExp(literal.value), 'gi'), placeholder);
  }
  return protectedText.restore(out);
}

/** A file name can carry a node id all by itself. A tracked filename is as much
 *  a tracked identifier as a tracked field, which is why `.gitignore` had to
 *  lose two lines earlier in this phase. */
/** The same node id, as a file name writes it. Declared once so the collect and
 *  substitute passes cannot drift, and so it reads the same as the content
 *  rule above. */
const FILE_NAME_NODE_ID = /(?<![\d.])(\d{1,7})-(\d{3,7})(?!\d)/g;

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
  for (const match of working.matchAll(FILE_NAME_NODE_ID)) {
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
  return out.replace(FILE_NAME_NODE_ID, (_match, left: string, right: string) =>
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

/**
 * Refuses a mapping directory inside the repository.
 *
 * Three ways in, and audit cycle 2 found two of them open.
 *
 *   - `../../<repo>/evidence` — handled from the start, because the check is on
 *     the *resolved* path rather than the string.
 *   - **a symlink** into the repository. `resolve()` does not follow links, so
 *     a link pointing at a directory in the tree was accepted and the mapping
 *     landed in the working tree, one `git add -A` from full reversibility.
 *     `realpathSync` closes it, applied to the nearest existing ancestor
 *     because the target directory may not exist yet.
 *   - **case**. The comparison was byte-exact against `REPO_ROOT`, and this
 *     repository lives on a case-insensitive filesystem, so a case-varied but
 *     identical path was accepted. Compared case-folded now.
 *
 * The guard is deliberately conservative in one direction: a path it cannot
 * resolve at all is treated as outside, because refusing to write anywhere is
 * not safer than writing outside the repository — and the caller has already
 * been told, by the two other rules, where the mapping may not go.
 */
function nearestExistingReal(path: string): string {
  let current = resolve(path);
  for (;;) {
    try {
      return realpathSync(current);
    } catch {
      const parent = dirname(current);
      if (parent === current) return current;
      current = parent;
    }
  }
}

export function assertMappingOutsideRepository(mappingDir: string): void {
  const real = nearestExistingReal(mappingDir);
  const requested = resolve(mappingDir);
  // The requested path's own tail matters too: `realpathSync` of a
  // not-yet-created directory returns its parent, so the parent is what was
  // checked. Both are compared.
  const root = realpathSync(REPO_ROOT).toLowerCase();
  const inside = (candidate: string): boolean => {
    const value = candidate.toLowerCase();
    return value === root || value.startsWith(root + sep);
  };
  const resolved = requested;
  if (inside(real) || inside(requested)) {
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

  /*
   * An unconverged document carries a recorded hash that does not match the
   * bytes beside it — a hash that validates nothing. The header called that a
   * condition which "must be visible", and visible meant one line of stdout on
   * a manual run, with exit 0. It is a failure, and it exits like one.
   */
  if (result.unconverged.length > 0) {
    process.stderr.write(
      `refusing: ${result.unconverged.length} document(s) record a hash that cannot be made to ` +
        `agree with their own bytes — a document recording its own hash can never converge:\n` +
        result.unconverged.map((name) => `  ${name}\n`).join(''),
    );
    process.exitCode = 1;
  }
}

if (process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2));
}
