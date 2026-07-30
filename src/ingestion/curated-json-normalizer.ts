/**
 * Normalization into the complete records the index stores (§13.1.4–13.1.7).
 *
 * Scope discipline: **only** the trailing comma on style ids is normalized.
 * Measured — all 673 style ids carry one inside the string (`"S:cfdda…,"`) and
 * 0 of 504 variable ids do. Nothing else about a value is rewritten; `raw_id` is
 * preserved beside `normalized_id` so a disagreement between the two
 * representations stays detectable rather than being lost (`SA-11`).
 *
 * One deliberate addition beyond the prototype: **1-hop alias resolution.**
 * Measured, 169 of 504 variables hold at least one `VARIABLE_ALIAS` value and the
 * maximum chain depth is 1. Without resolving them a numeric value exists for
 * only 142 variables, so the exact-value ranking rule can never fire for the
 * rest; one hop lifts that to 282. Recorded as a divergence from a pure port
 * (decision D-C) rather than slipped in — it can only improve recall, and the
 * cross-check bar is "at least the ported baseline".
 */
import {
  isColorValue,
  isScalarValue,
  isVariableAlias,
  STYLE_BUCKET_TO_REF_CLASS,
  isStyleBucket,
  type RawCuratedExport,
  type RawCollection,
  type RawModeValue,
  type RawVariable,
  type RawStyle,
} from './curated-json-types.ts';
import { readBoundVariables, boundVariableIds } from './bound-variables-reader.ts';
import type { RefClass } from '../contracts/identity.ts';

/** Max alias hops. Measured depth is 1; the limit exists so a future cyclic or
 *  deeper export degrades to "unresolved" rather than hanging. */
export const MAX_ALIAS_DEPTH = 4;

export type ResolvedValueKind = 'scalar' | 'color' | 'alias-unresolved' | 'absent';

export type NormalizedModeValue = {
  readonly mode_id: string;
  readonly mode_name: string;
  readonly kind: ResolvedValueKind;
  /** Numeric value where one exists, after alias resolution. Drives value-based
   *  ranking, so its coverage matters. */
  readonly numeric?: number | undefined;
  readonly scalar?: string | number | boolean | undefined;
  readonly color_hex?: string | undefined;
  /** Set when the value was reached through an alias, naming the terminal
   *  variable. Keeps the provenance visible instead of flattening it away. */
  readonly resolved_via?: string | undefined;
  readonly alias_depth?: number | undefined;
};

export type NormalizedRecord = {
  readonly ref_class: RefClass;
  readonly path: string;
  /** Case-folded path for cross-class matching (finding **C4**): variables are
   *  TitleCase (`Body/sm/size`), styles lowercase (`body/sm/regular`), so naive
   *  matching fails across the boundary. The original is preserved above. */
  readonly path_folded: string;
  readonly key: string;
  readonly raw_id: string;
  readonly normalized_id: string;
  readonly collection?: string | undefined;
  readonly var_type?: string | undefined;
  readonly property_category: string;
  readonly scopes: readonly string[];
  readonly description: string;
  readonly modes: readonly string[];
  readonly multi_mode: boolean;
  readonly values: readonly NormalizedModeValue[];
  /** First numeric value across modes, for value matching. */
  readonly value_num?: number | undefined;
  readonly bound_variable_ids: readonly string[];
  readonly bound_variables_shape: string;
  /** Text styles only — the literal on the style itself. Measured: present on all
   *  105, and it agrees with the bound `fontSize` variable in 104/104 cases where
   *  both exist. Both are kept so future drift is detectable. */
  readonly literal_font_size?: number | undefined;
  readonly literal_line_height?: number | undefined;
  readonly literal_letter_spacing?: number | undefined;
  readonly literal_font_family?: string | undefined;
  /** Compact JSON payload of class-specific detail. Never sent to a model. */
  readonly payload_json: string;
  readonly anomalies: readonly string[];
};

/** Property-category derivation, ported from the prototype's `CAT_HINT`.
 *  Order matters — first match wins — so the list is the contract. */
const CATEGORY_HINTS: readonly (readonly [RegExp, string])[] = [
  [/radius/, 'corner-radius'],
  [/border|stroke/, 'border-width'],
  [/spacing|gap|layout-scale|padding/, 'spacing'],
  [/opacity|alpha/, 'opacity'],
  [/type-scale|font|text/, 'typography'],
  [/cta/, 'cta-sizing'],
];

const TYPE_FALLBACK: Readonly<Record<string, string>> = {
  FLOAT: 'numeric-other',
  COLOR: 'color',
  STRING: 'string',
  BOOLEAN: 'boolean',
};

export function derivePropertyCategory(
  collection: string | undefined,
  path: string,
  varType: string | undefined,
): string {
  const haystack = `${collection ?? ''}/${path}`.toLowerCase();
  for (const [pattern, category] of CATEGORY_HINTS) {
    if (pattern.test(haystack)) return category;
  }
  return TYPE_FALLBACK[varType ?? ''] ?? 'other';
}

/** Strips trailing commas. The single sanctioned value normalization. */
export function normalizeId(raw: string | undefined): string {
  return (raw ?? '').replace(/,+$/, '');
}

function colorToHex(color: { r: number; g: number; b: number; a?: number }): string {
  const channel = (value: number): string =>
    Math.round(Math.max(0, Math.min(1, value)) * 255)
      .toString(16)
      .padStart(2, '0');
  const base = `#${channel(color.r)}${channel(color.g)}${channel(color.b)}`;
  return color.a === undefined || color.a >= 1 ? base : `${base}${channel(color.a)}`;
}

type AliasContext = {
  readonly byId: ReadonlyMap<string, RawVariable>;
};

/**
 * Resolves one mode value, following at most {@link MAX_ALIAS_DEPTH} alias hops.
 *
 * Cycle-safe via a visited set: a self-referential export degrades to
 * `alias-unresolved` instead of recursing forever.
 */
function resolveModeValue(
  raw: RawModeValue | undefined,
  context: AliasContext,
  visited: Set<string>,
  depth: number,
): Pick<NormalizedModeValue, 'kind' | 'numeric' | 'scalar' | 'color_hex' | 'resolved_via' | 'alias_depth'> {
  if (raw === undefined || raw === null) return { kind: 'absent' };

  if (isVariableAlias(raw)) {
    if (depth >= MAX_ALIAS_DEPTH || visited.has(raw.id)) {
      return { kind: 'alias-unresolved', resolved_via: raw.id, alias_depth: depth };
    }
    visited.add(raw.id);
    const target = context.byId.get(raw.id);
    if (target === undefined) {
      return { kind: 'alias-unresolved', resolved_via: raw.id, alias_depth: depth };
    }
    // Take the target's first mode value: an alias points at a variable, and a
    // mode-for-mode mapping is not expressible in the export.
    const targetValues = Object.values(target.values_by_mode ?? {});
    const first = targetValues[0];
    const resolved = resolveModeValue(first, context, visited, depth + 1);
    return {
      ...resolved,
      resolved_via: target.name ?? raw.id,
      alias_depth: depth + 1,
    };
  }

  if (isColorValue(raw)) {
    return { kind: 'color', color_hex: colorToHex(raw) };
  }

  if (isScalarValue(raw)) {
    const numeric = typeof raw === 'number' ? raw : undefined;
    return {
      kind: 'scalar',
      scalar: raw,
      ...(numeric === undefined ? {} : { numeric }),
    };
  }

  return { kind: 'alias-unresolved' };
}

function normalizeVariable(
  variable: RawVariable,
  collections: ReadonlyMap<string, RawCollection>,
  context: AliasContext,
): NormalizedRecord {
  const anomalies: string[] = [];
  const collection = variable.collection_id === undefined ? undefined : collections.get(variable.collection_id);
  const collectionName = collection?.name;
  const modeList = collection?.modes ?? [];
  const modeNames = modeList.map((mode) => mode.name ?? mode.modeId ?? 'unknown');
  const path = variable.name ?? '';
  if (path === '') anomalies.push('variable has no name');

  const values: NormalizedModeValue[] = Object.entries(variable.values_by_mode ?? {}).map(
    ([modeId, rawValue]) => {
      const modeName = modeList.find((mode) => mode.modeId === modeId)?.name ?? modeId;
      const resolved = resolveModeValue(rawValue, context, new Set([variable.id ?? '']), 0);
      return { mode_id: modeId, mode_name: modeName, ...resolved };
    },
  );

  const valueNum = values.find((value) => value.numeric !== undefined)?.numeric;

  return {
    ref_class: 'variable',
    path,
    path_folded: path.toLowerCase(),
    key: variable.key ?? '',
    raw_id: variable.id ?? '',
    normalized_id: normalizeId(variable.id),
    collection: collectionName,
    var_type: variable.type,
    property_category: derivePropertyCategory(collectionName, path, variable.type),
    scopes: variable.scopes ?? [],
    description: variable.description ?? '',
    modes: modeNames,
    multi_mode: modeList.length > 1,
    values,
    ...(valueNum === undefined ? {} : { value_num: valueNum }),
    bound_variable_ids: [],
    bound_variables_shape: 'absent',
    payload_json: JSON.stringify({ values_by_mode: variable.values_by_mode ?? {} }).slice(0, 4000),
    anomalies,
  };
}

function normalizeStyle(
  style: RawStyle,
  refClass: RefClass,
  bucket: string,
  variablesById: ReadonlyMap<string, RawVariable>,
  collections: ReadonlyMap<string, RawCollection>,
): NormalizedRecord {
  const bound = readBoundVariables(style.bound_variables);
  const anomalies = [...bound.anomalies];
  const path = style.name ?? '';
  if (path === '') anomalies.push('style has no name');

  const rawId = style.id ?? '';
  const normalizedId = normalizeId(rawId);
  if (rawId === normalizedId && rawId !== '') {
    // Measured: every one of the 673 style ids carries a trailing comma. An id
    // without one is not an error, but it is a change in the export worth seeing.
    anomalies.push('style id carried no trailing comma — export shape may have changed');
  }

  /** Modes reachable through the bound variables' collections. A paint style has
   *  no modes of its own; its mode exposure is inherited. */
  const modeNames = new Set<string>();
  let multiMode = false;
  for (const binding of bound.bindings) {
    const variable = variablesById.get(binding.variable_id);
    if (variable?.collection_id === undefined) continue;
    const collection = collections.get(variable.collection_id);
    for (const mode of collection?.modes ?? []) {
      modeNames.add(mode.name ?? mode.modeId ?? 'unknown');
    }
    if ((collection?.modes ?? []).length > 1) multiMode = true;
  }

  const payload: Record<string, unknown> = {};
  if (style.paints !== undefined) payload['paints'] = style.paints;
  if (style.effects !== undefined) payload['effects'] = style.effects;
  if (style.font_name !== undefined) payload['font_name'] = style.font_name;
  if (style.font_size !== undefined) payload['font_size'] = style.font_size;
  if (style.line_height !== undefined) payload['line_height'] = style.line_height;
  if (style.letter_spacing !== undefined) payload['letter_spacing'] = style.letter_spacing;

  const category =
    bucket === 'paint' ? 'color' : bucket === 'text' ? 'typography' : bucket === 'effect' ? 'effect' : 'grid';

  return {
    ref_class: refClass,
    path,
    path_folded: path.toLowerCase(),
    key: style.key ?? '',
    raw_id: rawId,
    normalized_id: normalizedId,
    collection: undefined,
    var_type: undefined,
    property_category: category,
    scopes: [],
    description: style.description ?? '',
    modes: [...modeNames].sort((a, b) => a.localeCompare(b, 'en')),
    multi_mode: multiMode,
    values: [],
    ...(style.font_size === undefined ? {} : { value_num: style.font_size }),
    bound_variable_ids: boundVariableIds(bound),
    bound_variables_shape: bound.shape,
    ...(style.font_size === undefined ? {} : { literal_font_size: style.font_size }),
    ...(style.line_height?.value === undefined ? {} : { literal_line_height: style.line_height.value }),
    ...(style.letter_spacing?.value === undefined
      ? {}
      : { literal_letter_spacing: style.letter_spacing.value }),
    ...(style.font_name?.family === undefined ? {} : { literal_font_family: style.font_name.family }),
    payload_json: JSON.stringify(payload).slice(0, 4000),
    anomalies,
  };
}

export type NormalizationResult = {
  readonly records: readonly NormalizedRecord[];
  readonly collections: readonly RawCollection[];
  readonly anomalies: readonly string[];
  /** Post-normalization collisions on `(ref_class, normalized_id)`. Measured: 0.
   *  A non-zero count invalidates `source_record_ref` uniqueness and must block
   *  (§13.1.7). */
  readonly normalized_id_collisions: readonly string[];
  readonly normalization_applied: boolean;
};

export function normalizeExport(raw: RawCuratedExport): NormalizationResult {
  const collections = raw.variables?.collections ?? [];
  const collectionsById = new Map(
    collections.filter((c): c is RawCollection & { id: string } => typeof c.id === 'string').map((c) => [c.id, c]),
  );
  const variables = raw.variables?.items ?? [];
  const variablesById = new Map(
    variables.filter((v): v is RawVariable & { id: string } => typeof v.id === 'string').map((v) => [v.id, v]),
  );
  const context: AliasContext = { byId: variablesById };

  const records: NormalizedRecord[] = variables.map((variable) =>
    normalizeVariable(variable, collectionsById, context),
  );

  // Deterministic bucket order so two builds of the same file are identical.
  for (const bucket of Object.keys(STYLE_BUCKET_TO_REF_CLASS).sort()) {
    if (!isStyleBucket(bucket)) continue;
    const refClass = STYLE_BUCKET_TO_REF_CLASS[bucket];
    for (const style of raw.styles?.[bucket] ?? []) {
      records.push(normalizeStyle(style, refClass, bucket, variablesById, collectionsById));
    }
  }

  const seen = new Map<string, number>();
  for (const record of records) {
    if (record.normalized_id === '') continue;
    const composite = `${record.ref_class}:${record.normalized_id}`;
    seen.set(composite, (seen.get(composite) ?? 0) + 1);
  }
  const collisions = [...seen.entries()].filter(([, count]) => count > 1).map(([ref]) => ref);

  const anomalies = records.flatMap((record) =>
    record.anomalies.map((anomaly) => `${record.ref_class}:${record.path}: ${anomaly}`),
  );

  return {
    records,
    collections,
    anomalies,
    normalized_id_collisions: collisions,
    normalization_applied: records.some((record) => record.raw_id !== record.normalized_id),
  };
}
