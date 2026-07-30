/**
 * Raw shapes of the curated export, **as measured** from the 2026-07-28 file —
 * not as documented anywhere.
 *
 * Everything is optional and widely typed on purpose. The export's top-level
 * shape has already changed once between two exports of the same library (a
 * `mode_coverage` summary present in one, absent in the other), so ingestion
 * must be version-tolerant and must never key on a single field's presence
 * (§13.1.2).
 *
 * Measured structure:
 *   meta        — schema_version, exported_at, figma_file_name/key, plugin_version
 *   variables   — { collections[], items[] }
 *   styles      — { paint[], text[], effect[], grid[] }
 *   diagnostics — { counts{}, warnings[] }
 */

/** A value inside `values_by_mode`. Five shapes were measured. */
export type RawModeValue =
  | number
  | string
  | boolean
  | RawColorValue
  | RawVariableAlias
  | Record<string, unknown>;

/** COLOR variables carry `{r,g,b}` plus optional `a`. Measured: 380 mode-values. */
export type RawColorValue = {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a?: number;
};

/**
 * An alias to another variable. Measured: 173 mode-values across 169 of 504
 * variables, with a **maximum chain depth of 1**.
 *
 * These matter more than their count suggests: without resolving them, a numeric
 * value exists for only 142 variables, so a value-based ranking rule can never
 * fire for the rest. One hop lifts that to 282.
 */
export type RawVariableAlias = {
  readonly type: 'VARIABLE_ALIAS';
  readonly id: string;
  readonly alias_name?: string;
};

export function isVariableAlias(value: unknown): value is RawVariableAlias {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { type?: unknown }).type === 'VARIABLE_ALIAS' &&
    typeof (value as { id?: unknown }).id === 'string'
  );
}

export function isColorValue(value: unknown): value is RawColorValue {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate['r'] === 'number' &&
    typeof candidate['g'] === 'number' &&
    typeof candidate['b'] === 'number'
  );
}

export function isScalarValue(value: unknown): value is number | string | boolean {
  return typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean';
}

export type RawMode = {
  readonly modeId?: string;
  readonly name?: string;
};

export type RawCollection = {
  readonly id?: string;
  readonly key?: string;
  readonly name?: string;
  readonly modes?: readonly RawMode[];
  readonly default_mode_id?: string;
  readonly remote?: boolean;
};

export type RawVariable = {
  readonly id?: string;
  readonly key?: string;
  readonly name?: string;
  readonly collection_id?: string;
  readonly type?: string;
  readonly values_by_mode?: Readonly<Record<string, RawModeValue>>;
  readonly scopes?: readonly string[];
  readonly code_syntax?: Readonly<Record<string, unknown>>;
  readonly description?: string;
  readonly remote?: boolean;
};

/**
 * A bound-variable entry as it appears on a **paint** or **effect** style: a list
 * of records naming the field they bind.
 */
export type RawBoundVariableListEntry = {
  readonly paint_index?: number;
  readonly field?: string;
  readonly variable_id?: string;
  readonly alias_name?: string;
};

/**
 * On **text** styles, `bound_variables` is a **dict keyed by camelCase field
 * name** — `fontSize`, `lineHeight`, `letterSpacing`, `fontFamily`, `fontWeight`
 * — not a list.
 *
 * This is the shape that makes `bound_variables[0]` throw on all 105 text styles.
 */
export type RawBoundVariableDictEntry = {
  readonly variable_id?: string;
  readonly alias_name?: string;
};

export type RawBoundVariables =
  | readonly RawBoundVariableListEntry[]
  | Readonly<Record<string, RawBoundVariableDictEntry>>
  | null
  | undefined;

export type RawStyle = {
  readonly id?: string;
  readonly key?: string;
  readonly name?: string;
  readonly description?: string;
  readonly bound_variables?: RawBoundVariables;
  /** paint styles */
  readonly paints?: readonly Record<string, unknown>[];
  /** effect styles */
  readonly effects?: readonly Record<string, unknown>[];
  /** text styles — the literal values, which sit alongside the bound variables */
  readonly font_name?: { readonly family?: string; readonly style?: string };
  readonly font_size?: number;
  readonly line_height?: { readonly unit?: string; readonly value?: number };
  readonly letter_spacing?: { readonly unit?: string; readonly value?: number };
};

export type RawDiagnosticWarning = {
  readonly type?: string;
  readonly message?: string;
};

export type RawDiagnostics = {
  readonly counts?: Readonly<Record<string, number>>;
  readonly warnings?: readonly RawDiagnosticWarning[];
};

export type RawMeta = {
  readonly schema_version?: string;
  readonly exported_at?: string;
  readonly figma_file_name?: string;
  readonly figma_file_key?: string | null;
  readonly plugin_version?: string;
};

export type RawCuratedExport = {
  readonly meta?: RawMeta;
  readonly variables?: {
    readonly collections?: readonly RawCollection[];
    readonly items?: readonly RawVariable[];
  };
  readonly styles?: Readonly<Record<string, readonly RawStyle[]>>;
  readonly diagnostics?: RawDiagnostics;
};

/** Style bucket name → reference class. The buckets are `paint`, `text`,
 *  `effect`, `grid`; `grid` is present but empty (0 entries). */
export const STYLE_BUCKET_TO_REF_CLASS = {
  paint: 'paint-style',
  text: 'text-style',
  effect: 'effect-style',
  grid: 'grid-style',
} as const;

export type StyleBucket = keyof typeof STYLE_BUCKET_TO_REF_CLASS;

export function isStyleBucket(value: string): value is StyleBucket {
  return Object.hasOwn(STYLE_BUCKET_TO_REF_CLASS, value);
}
