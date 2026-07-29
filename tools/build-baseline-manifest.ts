/**
 * Generates `docs/v1-baseline-manifest.md` (P1-FINAL §8.3).
 *
 * The manifest is generated rather than typed so that hashes cannot drift
 * through transcription, and so it can be regenerated to detect changes to the
 * v1 artifact bundle. Status and defect annotations are curated here; every
 * measurement is read from disk.
 *
 * Usage:
 *   node tools/build-baseline-manifest.ts <artifact-dir> [--out <file>]
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, extname } from 'node:path';

type Status =
  | 'active-input'
  | 'active-corrected'
  | 'superseded'
  | 'historical'
  | 'reference-discussion';

type Annotation = {
  readonly status: Status;
  readonly type: string;
  readonly defect?: string;
  readonly successor?: string;
};

/**
 * Curated annotations. Every `defect` entry below was verified by querying the
 * artifact or the curated export — none is inherited from a document's own
 * description of itself.
 */
const ANNOTATIONS: Readonly<Record<string, Annotation>> = {
  'Agentic/adalfi-design-curated-tokens.json': {
    status: 'active-input',
    type: 'curated design-system export (authoritative source)',
    defect:
      'All 673 style ids carry a trailing comma inside the string; 0 of 504 variable ids do. ' +
      '`bound_variables` is polymorphic (list[0], list[1], list[4], dict-keyed). ' +
      'Path casing differs by class: variables TitleCase, styles lowercase. ' +
      'Top-level shape already changed once between exports, so ingestion must be version-tolerant.',
  },

  // ---- Contaminated: carry the fabricated `stroke/base` path ----
  'Specs/Outputs/warning-toast-run-002.md': {
    status: 'superseded',
    type: 'Coordinator output example (was canonical)',
    defect:
      'Resolution #6 "1px border" -> `stroke/base` at High confidence: that path does not exist. ' +
      'Key 75ab1461… belongs to `stroke/thin` (value 1.0). Resolution #12 claims `body/sm/regular` ' +
      'is 14px; it is 12px, and the 14px answer is `body/reg/regular`. Also carries `sha256-pending`.',
    successor: 'tests/fixtures/active/ (Phase 1 rebuilt fixture, WP3)',
  },
  'Specs/Outputs/warning-toast-coordinator-output-001.md': {
    status: 'superseded',
    type: 'Coordinator output example',
    defect: 'Carries the fabricated `stroke/base` path.',
  },
  'Specs/coordinator_system_prompt_v1_with_fewshot.md': {
    status: 'superseded',
    type: 'Coordinator system prompt (v1 + few-shot)',
    defect:
      'Inlines the fabricated `stroke/base` path directly in the few-shot, not merely by reference. ' +
      'Must never be an active prompt source. Also carries `sha256-pending`.',
    successor: 'Specs/coordinator_system_prompt_v1.2.md (itself superseded by WP4 judgment modules)',
  },
  'resolver-prototype/resolve.py': {
    status: 'active-corrected',
    type: 'resolver prototype — ranking reference for the WP2 port (decision D-C)',
    defect:
      'Ground-truth array `expected[5]` was `stroke/base`; corrected to `stroke/thin`. ' +
      'Has no ORDER BY, so equal scores resolve in arbitrary SQLite row order — the WP2 port ' +
      'adds a deterministic tiebreak, which is why the cross-check compares rank windows.',
  },
  'resolver-prototype/schema_card.txt': {
    status: 'superseded',
    type: 'hand-maintained schema card',
    defect:
      'Carries the fabricated `stroke/base` path AND is the artifact that enters model context. ' +
      'Hand-maintained, so it has exactly the staleness profile the design exists to remove (SA-15).',
    successor: 'src/ingestion/schema-card-generator.ts (WP2)',
  },
  'resolver-prototype/build.py': {
    status: 'active-input',
    type: 'index builder prototype — schema + FTS5 reference for WP2',
  },

  // ---- Stale counts ----
  'Specs/coordinator_agent_spec.md': {
    status: 'active-corrected',
    type: 'Coordinator agent spec (v1)',
    defect:
      'L313 places a variable id in a paint style `id` field (SA-11). L352/L545 claim "412 styles + ' +
      '88 variables"; actual is 673 styles / 504 variables (SA-?). L508 claims 38 eval cases; there are 37. ' +
      'Dial 3 modify/audit grounding bullets are swapped (SA-10). L493 cites "project framework Section 16" ' +
      'for an eight-state reference that does not exist and was never enumerated (closed by decision D-D).',
  },
  'Specs/coordinator_spec_schema.md': {
    status: 'active-corrected',
    type: 'Coordinator spec schema (prose)',
    defect: 'L351 repeats the stale "412 styles + 88 variables" count in an example detail string.',
  },
  'Evals/coordinator_eval_set_schema.md': {
    status: 'active-corrected',
    type: 'eval-set schema documentation',
    defect: 'Claims 38 cases at lines 4, 188 and 195. The workbook contains 37.',
  },
  'Evals/coordinator-evals.xlsx': {
    status: 'active-corrected',
    type: 'eval workbook (Cases / Fixtures / Results / Schema)',
    defect:
      'Cases sheet holds 37 data rows; the Schema tab still states 38. All 18 Results rows carry the ' +
      'same reviewer label (architect-self-review) and the same v1.2 version — not live-run evidence.',
  },
  'Specs/coordinator_output.schema.json': {
    status: 'superseded',
    type: 'Coordinator output JSON Schema (Draft 2020-12)',
    defect:
      'Zero occurrences of additionalProperties/unevaluatedProperties, so every contract object is open ' +
      '(SA-12). Blocked outputs inherit the ready-payload requirement, so a blocked `new` run fails its own ' +
      'schema. Blocking severity has no route effect. `run_id` is format:uuid but the canonical fixture uses ' +
      'a slug, which passes only because format assertion is off.',
    successor: 'schemas/coordinator/ (WP3)',
  },
  'Specs/coordinator_system_prompt_v1.2.md': {
    status: 'superseded',
    type: 'Coordinator system prompt (v1.2, most recent v1-line prompt)',
    defect:
      'Not route-complete: Step 4 always builds a layer tree, Steps 9-12 are Builder work, there is no ' +
      'Synthesizer terminus and no modify-delta procedure. References the contaminated few-shot by path at L303.',
    successor: 'src/judgment/coordinator-core.md + src/judgment/routes/*.md (WP4)',
  },
  'Specs/reviewer_agent_spec.md': {
    status: 'active-corrected',
    type: 'Reviewer agent spec (draft)',
    defect:
      'Still carries the obsolete 0-100 weighted model — "State coverage | 20" (L131) and weights ' +
      '40/30/20/10 (L159). DR-1 closed that model in favour of anchored 1-5 rubrics with no scalar score.',
  },
  'Specs/builder_agent_spec.md': {
    status: 'active-input',
    type: 'Builder agent spec (draft) — FROZEN in Phase 1',
  },
  'Specs/synthesizer_agent_spec.md': {
    status: 'active-input',
    type: 'Synthesizer agent spec (draft) — FROZEN in Phase 1',
  },

  // ---- Architecture authority ----
  'manage-ds-components-runtime-diagrams_v3.md': {
    status: 'active-corrected',
    type: 'runtime architecture diagrams v3 (LOCKED 2026-07-29)',
    defect:
      'Says WCAG 2.1 AA at L378 while P1-FINAL §5.3 mandates a machine-verifiable WCAG 2.2 AA subset. ' +
      'L437/L451 keep interaction-state coverage as a rubric line while DR-1 requires >=3 on every line, ' +
      'so a reduced line could fail a run — contradicted by the non-gating policy. Reconciled in WP0c.',
  },
  'manage-ds-components-spec-amendments_v2.md': {
    status: 'active-corrected',
    type: 'amendment register v2 (SA-1 … SA-21)',
    defect:
      'Ends at SA-21. P1-FINAL §5.6 cites a non-existent "SA-22", and §5.1-§5.7 introduce seven normative ' +
      'decisions with no IDs, so the lock is measured against a stale register.',
    successor: 'manage-ds-components-spec-amendments_v3.md (WP0c)',
  },
  'manage-ds-components-phase-1-implementation-plan_FINAL.md': {
    status: 'active-corrected',
    type: 'Phase 1 authority document (P1-FINAL)',
    defect:
      '§5.2 was conditional on verifying an "eight-state reference" that does not exist and was never ' +
      'enumerated. Condition struck 2026-07-29 per decision D-D; superseded wording retained inline.',
  },
  'manage-ds-components-phase-1-execution-plan_v1.md': {
    status: 'active-input',
    type: 'Phase 1 execution plan (refines P1-FINAL; carries decisions D-A … D-D)',
  },
  'Archive.zip': {
    status: 'historical',
    type: 'archive — 61 entries',
    defect:
      'Contains a further copy of Runs/warning-toast-run-002.md (29,429 bytes) plus macOS resource forks. ' +
      'Hashed as one entry and left closed; no active glob may reach inside it.',
  },
};

const DEFAULT_ANNOTATION: Annotation = {
  status: 'historical',
  type: 'v1 design artifact',
};

function classifyByPath(path: string): Annotation {
  const explicit = ANNOTATIONS[path];
  if (explicit !== undefined) return explicit;
  if (path.startsWith('Runs/') || path.startsWith('Specs/Outputs/')) {
    return { status: 'historical', type: 'run / output record' };
  }
  if (path.startsWith('Specs/coordinator_system_prompt')) {
    return { status: 'superseded', type: 'Coordinator system prompt (earlier version)' };
  }
  return DEFAULT_ANNOTATION;
}

function collect(dir: string, root: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === '.git' || entry === '.DS_Store' || entry === 'node_modules') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...collect(full, root));
    else out.push(relative(root, full));
  }
  return out.sort((a, b) => a.localeCompare(b));
}

function escapeCell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function main(): void {
  const [artifactDir, ...rest] = process.argv.slice(2);
  if (artifactDir === undefined) {
    throw new Error('Usage: node tools/build-baseline-manifest.ts <artifact-dir> [--out <file>]');
  }
  const outFlag = rest.indexOf('--out');
  const outPath = outFlag >= 0 ? rest[outFlag + 1] : undefined;

  const files = collect(artifactDir, artifactDir);
  const rows: string[] = [];
  const byStatus = new Map<Status, number>();
  let totalBytes = 0;

  for (const path of files) {
    const bytes = readFileSync(join(artifactDir, path));
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const annotation = classifyByPath(path);
    byStatus.set(annotation.status, (byStatus.get(annotation.status) ?? 0) + 1);
    totalBytes += bytes.byteLength;
    rows.push(
      `| \`${path}\` | ${escapeCell(annotation.type)} | \`${annotation.status}\` | ${bytes.byteLength.toLocaleString('en-US')} | \`${sha256}\` | ${
        annotation.defect === undefined ? '—' : escapeCell(annotation.defect)
      } | ${annotation.successor === undefined ? '—' : `\`${escapeCell(annotation.successor)}\``} |`,
    );
  }

  const statusLines = [...byStatus.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([status, count]) => `| \`${status}\` | ${count} |`)
    .join('\n');

  const doc = `# v1 Baseline Manifest

**Generated by** \`tools/build-baseline-manifest.ts\` — regenerate rather than hand-edit.
**Artifact bundle:** \`Agentic_Pipelines/Manage_DS_Components/\` (outside this repository; design artifacts are not copied into source control).
**Files:** ${files.length} · **Total bytes:** ${totalBytes.toLocaleString('en-US')}

Satisfies P1-FINAL §8.3. Every \`known defect\` entry was verified by querying the artifact or the curated
export directly — none is taken from a document's description of itself. Extensions present:
${[...new Set(files.map((f) => extname(f) || '(none)'))].sort().join(' · ')}

## Status counts

| Status | Files |
|---|---|
${statusLines}

Status meanings: \`active-input\` consumed as-is by Phase 1 · \`active-corrected\` corrected in WP0b/WP0c
· \`superseded\` replaced by a Phase 1 artifact, retained as history · \`historical\` preserved, not read by
active tests · \`reference-discussion\` discusses a defect rather than carrying it.

## Manifest

| Relative path | Artifact type | Status | Bytes | SHA-256 | Known defect | Successor |
|---|---|---|---|---|---|---|
${rows.join('\n')}
`;

  if (outPath === undefined) {
    process.stdout.write(doc);
  } else {
    writeFileSync(outPath, doc, 'utf8');
    process.stdout.write(`Wrote ${outPath}: ${files.length} files, ${totalBytes} bytes\n`);
  }
}

main();
