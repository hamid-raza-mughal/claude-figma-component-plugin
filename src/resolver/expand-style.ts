/**
 * `expandStyle` — the style → bound-variable join (finding **C1**).
 *
 * This operation was specified in the resolver architecture and then **omitted
 * from the Phase 1 plan's operation list**, which would have shipped a resolver
 * structurally incapable of detecting the second of the two verified defects.
 *
 * The defect: `body/sm/regular` was resolved as "14px regular" at Medium
 * confidence, justified by the claim that *"font sizes not present in curated JSON
 * export so size cannot be confirmed from tokens alone."*
 *
 * Both halves were false, and measurement shows it is worse than recorded — the
 * size is available **two independent ways**:
 *   1. `font_size` sits **literally on the text style** (105/105 have it);
 *   2. the style binds `fontSize` to a `type-scale` variable
 *      (`body/sm/regular` → `Body/sm/size` = 12).
 *
 * Measured: across 104 text styles carrying both, the literal and the bound value
 * **agree in every case**. So this operation reports both and flags disagreement —
 * today that finds nothing, which is exactly what a drift detector should report
 * until something drifts.
 */
import type { IndexReader, IndexRow } from './index-reader.ts';
import type { RefClass } from '../contracts/identity.ts';

export type ExpandedField = {
  /** camelCase field name: `fontSize`, `lineHeight`, `letterSpacing`, … */
  readonly field: string;
  readonly bound_variable_raw_id: string;
  readonly bound_variable_path?: string | undefined;
  readonly bound_variable_ref?: string | undefined;
  /** Numeric value from the bound variable, after alias resolution. */
  readonly bound_numeric?: number | undefined;
  readonly bound_scalar?: string | number | boolean | undefined;
  /** True when the bound variable could not be found in the index — a dangling
   *  binding, which is a real data defect rather than a lookup failure. */
  readonly dangling: boolean;
};

export type LiteralComparison = {
  readonly field: string;
  readonly literal: number;
  readonly bound?: number | undefined;
  /** `agree` · `disagree` · `unbound` (no variable) · `unresolved` (bound but no
   *  numeric value reachable). */
  readonly verdict: 'agree' | 'disagree' | 'unbound' | 'unresolved';
};

export type ExpandStyleResult = {
  readonly found: true;
  readonly source_record_ref: string;
  readonly ref_class: RefClass;
  readonly path: string;
  readonly bound_variables_shape: string;
  readonly fields: readonly ExpandedField[];
  /** Literal-vs-bound comparison for every numeric literal on the style. */
  readonly comparisons: readonly LiteralComparison[];
  /** True when any comparison disagrees — the drift signal. */
  readonly has_disagreement: boolean;
  readonly literal_font_size?: number | undefined;
  readonly literal_line_height?: number | undefined;
  readonly literal_letter_spacing?: number | undefined;
  readonly literal_font_family?: string | undefined;
};

export type ExpandStyleMiss = {
  readonly found: false;
  readonly reason: 'not-found' | 'not-a-style';
  readonly detail: string;
};

const LITERAL_FIELD_MAP: readonly (readonly [keyof IndexRow, string])[] = [
  ['literal_font_size', 'fontSize'],
  ['literal_line_height', 'lineHeight'],
  ['literal_letter_spacing', 'letterSpacing'],
];

function firstNumeric(row: IndexRow): number | undefined {
  if (row.value_num !== undefined) return row.value_num;
  return row.values.find((value) => value.numeric !== undefined)?.numeric;
}

function firstScalar(row: IndexRow): string | number | boolean | undefined {
  const value = row.values.find((entry) => entry.scalar !== undefined);
  return value?.scalar;
}

/**
 * Expands a style by `source_record_ref`.
 *
 * Read-only, zero model calls. Returns evidence, never a semantic decision — the
 * caller decides what a disagreement means.
 */
export function expandStyle(reader: IndexReader, sourceRecordRef: string): ExpandStyleResult | ExpandStyleMiss {
  const row = reader.findByRecordRef(sourceRecordRef);
  if (row === undefined) {
    return { found: false, reason: 'not-found', detail: `no record for ref ${sourceRecordRef}` };
  }
  if (row.ref_class === 'variable') {
    return {
      found: false,
      reason: 'not-a-style',
      detail: `${sourceRecordRef} is a variable; expandStyle joins a style to its bound variables`,
    };
  }

  const fields: ExpandedField[] = [];
  for (const rawId of row.bound_variable_ids) {
    const variable = reader.findVariableByRawId(rawId);
    if (variable === undefined) {
      fields.push({ field: 'unknown', bound_variable_raw_id: rawId, dangling: true });
      continue;
    }
    const numeric = firstNumeric(variable);
    const scalar = firstScalar(variable);
    fields.push({
      field: inferFieldName(variable.path),
      bound_variable_raw_id: rawId,
      bound_variable_path: variable.path,
      bound_variable_ref: variable.source_record_ref,
      ...(numeric === undefined ? {} : { bound_numeric: numeric }),
      ...(scalar === undefined ? {} : { bound_scalar: scalar }),
      dangling: false,
    });
  }

  const comparisons: LiteralComparison[] = [];
  for (const [rowKey, fieldName] of LITERAL_FIELD_MAP) {
    const literal = row[rowKey];
    if (typeof literal !== 'number') continue;
    const match = fields.find((field) => field.field === fieldName);
    if (match === undefined) {
      comparisons.push({ field: fieldName, literal, verdict: 'unbound' });
      continue;
    }
    if (match.bound_numeric === undefined) {
      comparisons.push({ field: fieldName, literal, verdict: 'unresolved' });
      continue;
    }
    comparisons.push({
      field: fieldName,
      literal,
      bound: match.bound_numeric,
      verdict: match.bound_numeric === literal ? 'agree' : 'disagree',
    });
  }

  return {
    found: true,
    source_record_ref: row.source_record_ref,
    ref_class: row.ref_class,
    path: row.path,
    bound_variables_shape: row.bound_variables_shape,
    fields,
    comparisons,
    has_disagreement: comparisons.some((comparison) => comparison.verdict === 'disagree'),
    ...(row.literal_font_size === undefined ? {} : { literal_font_size: row.literal_font_size }),
    ...(row.literal_line_height === undefined ? {} : { literal_line_height: row.literal_line_height }),
    ...(row.literal_letter_spacing === undefined
      ? {}
      : { literal_letter_spacing: row.literal_letter_spacing }),
    ...(row.literal_font_family === undefined ? {} : { literal_font_family: row.literal_font_family }),
  };
}

/**
 * Infers which text attribute a bound variable supplies, from its path.
 *
 * The export's type-scale naming is regular — `Body/reg/size`, `Body/reg/leading`,
 * `Body/reg/tracking`, `Body/reg/face` — so the trailing segment is a reliable
 * discriminator. Unrecognised segments return the segment itself rather than a
 * guess, so an unexpected naming change shows up as an unmatched field instead of
 * a wrong comparison.
 */
export function inferFieldName(variablePath: string): string {
  const trailing = variablePath.split('/').pop()?.toLowerCase() ?? '';
  switch (trailing) {
    case 'size':
      return 'fontSize';
    case 'leading':
      return 'lineHeight';
    case 'tracking':
      return 'letterSpacing';
    case 'face':
      return 'fontFamily';
    default:
      return trailing;
  }
}

/**
 * Convenience for the exact question the v1 defect got wrong.
 *
 * Returns the authoritative size and how it was established, so a caller can
 * quote provenance rather than assert a number.
 */
export function resolveTextStyleFontSize(
  reader: IndexReader,
  sourceRecordRef: string,
): { readonly font_size?: number; readonly established_by: string; readonly agrees: boolean } {
  const expanded = expandStyle(reader, sourceRecordRef);
  if (!expanded.found) return { established_by: expanded.reason, agrees: false };

  const comparison = expanded.comparisons.find((entry) => entry.field === 'fontSize');
  const bound = expanded.fields.find((field) => field.field === 'fontSize')?.bound_numeric;
  const literal = expanded.literal_font_size;

  if (literal !== undefined && bound !== undefined) {
    return {
      ...(literal === undefined ? {} : { font_size: literal }),
      established_by:
        comparison?.verdict === 'agree'
          ? 'literal font_size on the style, confirmed by the bound type-scale variable'
          : `DISAGREEMENT: literal ${literal} vs bound ${bound}`,
      agrees: comparison?.verdict === 'agree',
    };
  }
  if (literal !== undefined) {
    return { font_size: literal, established_by: 'literal font_size on the style (no bound variable)', agrees: true };
  }
  if (bound !== undefined) {
    return { font_size: bound, established_by: 'bound type-scale variable (no literal on the style)', agrees: true };
  }
  return { established_by: 'no font size available from either source', agrees: false };
}
