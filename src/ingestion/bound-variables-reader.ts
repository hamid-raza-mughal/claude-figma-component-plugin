/**
 * Reads the polymorphic `bound_variables` field (finding **C3**).
 *
 * Four shapes coexist in one export file, measured:
 *   - `list` with 1 entry  — 186 paint styles
 *   - `list` with 0 entries — 381 paint styles
 *   - `list` with 4 entries — the single effect style
 *   - **`dict` keyed by camelCase field name** — all 105 text styles
 *
 * So `bound_variables[0]` throws on every text style. P1-FINAL §13.1.4 permits
 * only trailing-comma normalization, which is correct for *values* — but reading
 * a polymorphic union is not normalization, it is a discriminated parse, and it
 * has to happen somewhere. It happens here, and nowhere else.
 *
 * The reader is deliberately total: an unrecognised shape is reported, never
 * guessed at and never silently treated as empty. Silently-empty is how a style
 * with a real binding comes to look like one without.
 */
import type {
  RawBoundVariables,
  RawBoundVariableDictEntry,
  RawBoundVariableListEntry,
} from './curated-json-types.ts';

/** The shape actually encountered, retained for diagnostics. */
export const BOUND_VARIABLE_SHAPES = ['absent', 'empty-list', 'list', 'field-dict', 'unknown'] as const;
export type BoundVariableShape = (typeof BOUND_VARIABLE_SHAPES)[number];

/** One binding, normalized to a single shape regardless of how it was written. */
export type BoundVariableBinding = {
  /**
   * The bound field, normalized to camelCase.
   *
   * List entries name it `field` (`"color"`); dict entries use the key
   * (`"fontSize"`). Both are folded to camelCase so downstream code has one
   * vocabulary.
   */
  readonly field: string;
  readonly variable_id: string;
  /** The exporter's human-readable alias, when present. Informational only —
   *  never a resolution target, since it is a label rather than an identity. */
  readonly alias_name?: string | undefined;
  /** Present only on paint-style list entries. */
  readonly paint_index?: number | undefined;
};

export type BoundVariablesReadResult = {
  readonly shape: BoundVariableShape;
  readonly bindings: readonly BoundVariableBinding[];
  /**
   * Non-fatal problems: an entry without a `variable_id`, or an unrecognised
   * container. Surfaced rather than swallowed (§13.1.3).
   */
  readonly anomalies: readonly string[];
};

const SNAKE_TO_CAMEL = /_([a-z])/g;

/** `font_size` → `fontSize`. Text-style dict keys are already camelCase; paint
 *  list entries use lowercase single words. Folding both is cheap and removes a
 *  whole class of key-mismatch bug. */
export function normalizeFieldName(field: string): string {
  return field.replace(SNAKE_TO_CAMEL, (_match, letter: string) => letter.toUpperCase());
}

function readListEntry(
  entry: RawBoundVariableListEntry,
  index: number,
  anomalies: string[],
): BoundVariableBinding | undefined {
  if (typeof entry !== 'object' || entry === null) {
    anomalies.push(`bound_variables[${index}] is not an object`);
    return undefined;
  }
  const variableId = entry.variable_id;
  if (typeof variableId !== 'string' || variableId === '') {
    anomalies.push(`bound_variables[${index}] has no variable_id`);
    return undefined;
  }
  return {
    field: normalizeFieldName(entry.field ?? 'unknown'),
    variable_id: variableId,
    ...(entry.alias_name === undefined ? {} : { alias_name: entry.alias_name }),
    ...(entry.paint_index === undefined ? {} : { paint_index: entry.paint_index }),
  };
}

function readDictEntry(
  field: string,
  entry: RawBoundVariableDictEntry,
  anomalies: string[],
): BoundVariableBinding | undefined {
  if (typeof entry !== 'object' || entry === null) {
    anomalies.push(`bound_variables.${field} is not an object`);
    return undefined;
  }
  const variableId = entry.variable_id;
  if (typeof variableId !== 'string' || variableId === '') {
    anomalies.push(`bound_variables.${field} has no variable_id`);
    return undefined;
  }
  return {
    field: normalizeFieldName(field),
    variable_id: variableId,
    ...(entry.alias_name === undefined ? {} : { alias_name: entry.alias_name }),
  };
}

/**
 * Reads any of the four measured shapes, plus absence, into one normalized form.
 *
 * Ordering is deterministic: list order is preserved, and dict keys are sorted,
 * because object key order is not a contract and an index built twice from the
 * same file must be identical.
 */
export function readBoundVariables(raw: RawBoundVariables): BoundVariablesReadResult {
  const anomalies: string[] = [];

  if (raw === null || raw === undefined) {
    return { shape: 'absent', bindings: [], anomalies };
  }

  if (Array.isArray(raw)) {
    if (raw.length === 0) {
      return { shape: 'empty-list', bindings: [], anomalies };
    }
    const bindings = raw
      .map((entry, index) => readListEntry(entry, index, anomalies))
      .filter((binding): binding is BoundVariableBinding => binding !== undefined);
    return { shape: 'list', bindings, anomalies };
  }

  if (typeof raw === 'object') {
    const entries = Object.entries(raw as Record<string, RawBoundVariableDictEntry>).sort(
      ([a], [b]) => a.localeCompare(b, 'en'),
    );
    const bindings = entries
      .map(([field, entry]) => readDictEntry(field, entry, anomalies))
      .filter((binding): binding is BoundVariableBinding => binding !== undefined);
    return { shape: 'field-dict', bindings, anomalies };
  }

  anomalies.push(`bound_variables has unsupported type "${typeof raw}"`);
  return { shape: 'unknown', bindings: [], anomalies };
}

/** Convenience: the variable bound to a named field, if any. */
export function findBinding(
  result: BoundVariablesReadResult,
  field: string,
): BoundVariableBinding | undefined {
  const wanted = normalizeFieldName(field);
  return result.bindings.find((binding) => binding.field === wanted);
}

/** All distinct bound variable ids, sorted for deterministic storage. */
export function boundVariableIds(result: BoundVariablesReadResult): readonly string[] {
  return [...new Set(result.bindings.map((binding) => binding.variable_id))].sort((a, b) =>
    a.localeCompare(b, 'en'),
  );
}
