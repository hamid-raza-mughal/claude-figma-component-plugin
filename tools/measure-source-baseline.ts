/**
 * Re-measures every number in this repository that describes the curated source.
 *
 * The reason this exists as a tool rather than a one-off script: on 2026-09-06 the
 * curated export was replaced and the preflight's byte-exact check fired, exactly
 * as designed. The correct response to that failure is to re-take every measured
 * figure — index entry count, build timing, post-normalization collisions,
 * resolver recall, the assembled-input percentage, the text-style font-size
 * two-ways agreement — and the wrong response is to pass `--allow-source-drift`
 * and keep quoting the old ones. Doing the right thing has to be cheaper than
 * doing the wrong thing, or it will not happen next time.
 *
 * Nothing here asserts. It measures and prints. The assertions live in the
 * suites; this is what you read *before* editing a number in `docs/`.
 *
 * Usage:
 *   ADALFI_ARTIFACT_DIR=<bundle> node tools/measure-source-baseline.ts [--json] [--historical]
 */
import { mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolvePhase1Config } from '../src/config/phase1-config.ts';
import { ingest, parseSource } from '../src/ingestion/curated-json-loader.ts';
import { normalizeExport } from '../src/ingestion/curated-json-normalizer.ts';
import { generateSchemaCard } from '../src/ingestion/schema-card-generator.ts';
import { IndexReader } from '../src/resolver/index-reader.ts';
import { planQueries } from '../src/resolver/query-planner.ts';
import { listByCategory, CALLER_RUN_GUARD } from '../src/resolver/list-by-category.ts';
import { assembleModelInput } from '../src/coordinator/assemble-model-input.ts';
import { GENERIC_CANDIDATE_CATEGORIES, GENERIC_CANDIDATE_CAP } from '../src/tools/engine.ts';
import { RUN_TYPES } from '../src/contracts/invocation.ts';
import { resolveBatch } from '../src/resolver/resolve-batch.ts';
import { hashSourceBytes } from '../src/ingestion/source-hash.ts';
import { ARTIFACT_DIR_ENV, CURATED_SOURCE_RELATIVE, HISTORICAL_SOURCE_RELATIVE } from './artifact-bundle.ts';
import { readBoundVariables } from '../src/ingestion/bound-variables-reader.ts';
import type { RawCuratedExport, RawStyle, RawVariable } from '../src/ingestion/curated-json-types.ts';
import type { ResolverCandidate } from '../src/contracts/resolution.ts';

type GroundTruthCase = {
  readonly case_id: string;
  readonly property: string;
  readonly reference_text: string;
  readonly expected_path: string;
  readonly allowed_rank: number;
  readonly prototype_rank: number | null;
};

export type SourceMeasurements = {
  readonly source_path: string;
  readonly source_bytes: number;
  readonly source_sha256: string;
  readonly schema_version: string;
  readonly exported_at: string;
  readonly entry_count: number;
  readonly by_ref_class: Readonly<Record<string, number>>;
  readonly normalized_id_collisions: number;
  readonly normalization_applied: boolean;
  readonly style_ids_with_trailing_comma: string;
  readonly variable_ids_with_trailing_comma: string;
  readonly build_ms: number;
  readonly described_entries: string;
  readonly scopes_populated: string;
  readonly variables_with_alias: number;
  readonly max_alias_depth: number;
  readonly numeric_coverage_without_alias: number;
  readonly numeric_coverage_with_alias: number;
  readonly paint_styles_without_binding: string;
  readonly mode_asymmetry_ceiling: number;
  readonly text_styles_with_literal_font_size: string;
  readonly text_style_font_size_agreement: string;
  readonly text_style_font_size_disagreements: readonly string[];
  readonly export_warnings: number;
  readonly schema_card_bytes: number;
  readonly recall_at_1: string;
  readonly recall_at_3: string;
  readonly recall_at_5: string;
  readonly ground_truth_paths_present: string;
  /** Per-route assembled model input, built by the same recipe `prepareContext`
   *  uses. `share_of_source` is a ratio, never a saving — the curated JSON was
   *  never in the payload to begin with. */
  readonly assembled_bytes_by_route: Readonly<Record<string, number>>;
  readonly assembled_share_of_source: Readonly<Record<string, string>>;
  readonly raw_source_bytes_in_payload: number;
  /** Where the `new` payload's bytes actually are. Printed because a total that
   *  drifts is uninformative on its own — the section that grew is the finding. */
  readonly assembled_sections_new: Readonly<Record<string, number>>;
  /** Per-collection entry and description counts. `described_count` is what the
   *  "ranking leans on scopes, not prose" claim rests on, so it is measured
   *  rather than remembered. */
  readonly collections: readonly {
    readonly name: string;
    readonly entry_count: number;
    readonly described_count: number;
    readonly modes: readonly string[];
    readonly multi_mode: boolean;
  }[];
};

function trailingCommaCount(ids: readonly (string | undefined)[]): string {
  const present = ids.filter((id): id is string => typeof id === 'string');
  return `${present.filter((id) => id.endsWith(',')).length}/${present.length}`;
}

/**
 * `which: 'historical'` measures the superseded 2026-07-28 export. That is not
 * nostalgia: running this tool against the file the old numbers were taken from
 * is the only way to know the tool reproduces them, and therefore that the new
 * numbers it prints are a real re-measurement rather than a differently-shaped
 * mistake.
 */
export function measure(artifactDir: string, which: 'current' | 'historical' = 'current'): SourceMeasurements {
  const sourcePath = join(
    artifactDir,
    which === 'current' ? CURATED_SOURCE_RELATIVE : HISTORICAL_SOURCE_RELATIVE,
  );
  const bytes = readFileSync(sourcePath);
  const raw = parseSource(bytes) as RawCuratedExport;
  const normalization = normalizeExport(raw);

  const derivedDir = mkdtempSync(join(tmpdir(), 'adalfi-measure-'));
  const approvedDataDirectory = mkdtempSync(join(tmpdir(), 'adalfi-measure-approved-'));
  const config = resolvePhase1Config({
    curatedSourcePath: sourcePath,
    derivedDir,
    approvedDataDirectory,
  });
  const started = performance.now();
  const ingestion = ingest(config, { now: '2026-09-06T00:00:00.000Z', forceRebuild: true });
  const buildMs = performance.now() - started;
  const reader = new IndexReader(ingestion.database_path);

  const variables: readonly RawVariable[] = raw.variables?.items ?? [];
  const styles: readonly RawStyle[] = [
    ...(raw.styles?.paint ?? []),
    ...(raw.styles?.text ?? []),
    ...(raw.styles?.effect ?? []),
    ...(raw.styles?.grid ?? []),
  ];

  // Alias reach: how many variables hold at least one alias, and how much numeric
  // coverage one hop buys. Both halves matter — the "before" number is what makes
  // the "after" number mean anything.
  const variableRecords = normalization.records.filter((r) => r.ref_class === 'variable');
  const withAlias = variables.filter((v) =>
    Object.values(v.values_by_mode ?? {}).some(
      (value) => typeof value === 'object' && value !== null && (value as { type?: string }).type === 'VARIABLE_ALIAS',
    ),
  ).length;
  const numericWithAlias = variableRecords.filter((r) => r.value_num !== undefined).length;
  const numericWithoutAlias = variableRecords.filter((r) =>
    r.values.some((v) => v.kind === 'scalar' && v.resolved_via === undefined && typeof v.numeric === 'number'),
  ).length;
  const maxAliasDepth = Math.max(
    0,
    ...normalization.records.flatMap((r) => r.values.map((v) => v.alias_depth ?? 0)),
  );

  const paintRecords = normalization.records.filter((r) => r.ref_class === 'paint-style');
  const paintWithoutBinding = paintRecords.filter((r) => r.bound_variable_ids.length === 0).length;

  const textRecords = normalization.records.filter((r) => r.ref_class === 'text-style');
  const withLiteral = textRecords.filter((r) => r.literal_font_size !== undefined);
  // The two-ways check: the literal `font_size` on the style, against the value of
  // the variable bound to `fontSize`. Both are kept in the index precisely so a
  // future export that disagrees is detectable rather than silently averaged.
  const byId = new Map(
    variables.filter((v): v is RawVariable & { id: string } => typeof v.id === 'string').map((v) => [v.id, v]),
  );
  let bothPresent = 0;
  let agree = 0;
  const disagreements: string[] = [];
  for (const style of raw.styles?.text ?? []) {
    // Read through the repo's own polymorphic reader rather than indexing the
    // field directly: `bound_variables` has four shapes in one file, and a
    // hand-rolled accessor here is how a real binding comes to look absent.
    const binding = readBoundVariables(style.bound_variables).bindings.find((b) => b.field === 'fontSize');
    if (binding === undefined || style.font_size === undefined) continue;
    const variable = byId.get(binding.variable_id);
    if (variable === undefined) continue;
    const numeric = Object.values(variable.values_by_mode ?? {}).find((v) => typeof v === 'number');
    if (typeof numeric !== 'number') continue;
    bothPresent += 1;
    if (numeric === style.font_size) agree += 1;
    else disagreements.push(`${String(style.name)}: literal ${String(style.font_size)} vs bound ${String(numeric)}`);
  }

  const described = normalization.records.filter((r) => r.description.trim() !== '').length;
  const scoped = variableRecords.filter((r) => r.scopes.length > 0).length;

  // Resolver recall against the committed, immutable ground truth.
  const groundTruth = JSON.parse(
    readFileSync(join(import.meta.dirname, '..', 'tests', 'fixtures', 'active', 'resolver-ground-truth.json'), 'utf8'),
  ) as { readonly cases: readonly GroundTruthCase[] };
  const plan = planQueries({
    route: 'new',
    items: groundTruth.cases.map((c) => ({
      semantic_id: c.case_id,
      property: c.property,
      reference_text: c.reference_text,
    })),
  });
  const results = resolveBatch(reader, plan.queries);
  const ranks = groundTruth.cases.map((c, i) => {
    const paths = (results[i]?.candidates ?? []).map((cand) => cand.path);
    const at = paths.indexOf(c.expected_path);
    return at < 0 ? null : at + 1;
  });
  const n = ranks.length;
  const within = (k: number): number => ranks.filter((r) => r !== null && r <= k).length;
  const allPaths = new Set(normalization.records.map((r) => r.path));
  const gtPresent = groundTruth.cases.filter((c) => allPaths.has(c.expected_path)).length;

  const card = generateSchemaCard(reader);

  // The real payload recipe: the Guard's own capped per-category broadening
  // (PD-7), the generated card, and exactly one route module.
  const candidatesByQuery: Record<string, readonly ResolverCandidate[]> = {};
  for (const category of GENERIC_CANDIDATE_CATEGORIES) {
    candidatesByQuery[`category:${category}`] = listByCategory(reader, {
      caller: CALLER_RUN_GUARD,
      property_category: category,
      broadened_from: 'measurement harness — no semantic elements exist for a `new` run (PD-7)',
      cap: GENERIC_CANDIDATE_CAP,
    }).candidates;
  }
  const assembledBytes: Record<string, number> = {};
  const sectionsNew: Record<string, number> = {};
  const assembledShare: Record<string, string> = {};
  const sourceBytes = statSync(sourcePath).size;
  for (const runType of RUN_TYPES) {
    const assembled = assembleModelInput({
      run_type: runType,
      user_intent: 'a primary call-to-action button for the payments screen',
      schema_card: card,
      candidates_by_query: candidatesByQuery,
    });
    assembledBytes[runType] = assembled.total_bytes;
    if (runType === 'new') for (const s of assembled.section_contribution) sectionsNew[s.name] = s.bytes;
    assembledShare[runType] = `${((assembled.total_bytes / sourceBytes) * 100).toFixed(2)}%`;
  }

  return {
    source_path: sourcePath,
    source_bytes: statSync(sourcePath).size,
    source_sha256: hashSourceBytes(bytes),
    schema_version: String(raw.meta?.schema_version ?? '(absent)'),
    exported_at: String(raw.meta?.exported_at ?? '(absent)'),
    entry_count: ingestion.manifest.counts.total,
    by_ref_class: ingestion.manifest.counts.by_ref_class,
    normalized_id_collisions: ingestion.manifest.normalized_id_collisions,
    normalization_applied: ingestion.manifest.normalization_applied,
    style_ids_with_trailing_comma: trailingCommaCount(styles.map((s) => s.id)),
    variable_ids_with_trailing_comma: trailingCommaCount(variables.map((v) => v.id)),
    build_ms: Math.round(buildMs),
    described_entries: `${described}/${normalization.records.length}`,
    scopes_populated: `${scoped}/${variableRecords.length}`,
    variables_with_alias: withAlias,
    max_alias_depth: maxAliasDepth,
    numeric_coverage_without_alias: numericWithoutAlias,
    numeric_coverage_with_alias: numericWithAlias,
    paint_styles_without_binding: `${paintWithoutBinding}/${paintRecords.length}`,
    mode_asymmetry_ceiling: paintRecords.length - paintWithoutBinding,
    text_styles_with_literal_font_size: `${withLiteral.length}/${textRecords.length}`,
    text_style_font_size_agreement: `${agree}/${bothPresent}`,
    text_style_font_size_disagreements: disagreements,
    export_warnings: ingestion.manifest.diagnostics.filter((d) => d.origin === 'export').length,
    schema_card_bytes: card.byte_length,
    recall_at_1: `${within(1)}/${n}`,
    recall_at_3: `${within(3)}/${n}`,
    recall_at_5: `${within(5)}/${n}`,
    ground_truth_paths_present: `${gtPresent}/${groundTruth.cases.length}`,
    assembled_bytes_by_route: assembledBytes,
    assembled_share_of_source: assembledShare,
    raw_source_bytes_in_payload: 0,
    assembled_sections_new: sectionsNew,
    collections: ingestion.manifest.collections.map((c) => ({
      name: c.name,
      entry_count: c.entry_count,
      described_count: c.described_count,
      modes: c.modes,
      multi_mode: c.multi_mode,
    })),
  };
}

function main(): void {
  const artifactDir = process.env[ARTIFACT_DIR_ENV];
  if (artifactDir === undefined || artifactDir.trim() === '') {
    console.error(`${ARTIFACT_DIR_ENV} is not set. This tool measures the real bundle or nothing.`);
    process.exit(1);
  }
  const m = measure(artifactDir, process.argv.includes('--historical') ? 'historical' : 'current');
  if (process.argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify(m, null, 2)}\n`);
    return;
  }
  const width = Math.max(...Object.keys(m).map((k) => k.length));
  for (const [key, value] of Object.entries(m)) {
    process.stdout.write(`${key.padEnd(width)}  ${typeof value === 'object' ? JSON.stringify(value) : String(value)}\n`);
  }
}

if (process.argv[1] !== undefined && import.meta.filename === process.argv[1]) {
  main();
}
