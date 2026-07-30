/**
 * `materializeSelection` — the acceptance boundary (§13.4.2).
 *
 * This is the executable form of the never-hallucinate rule, and the single most
 * important function in the resolver. A model selects a `candidate_id`; nothing it
 * says about the record is trusted. Every field is read from the index, and every
 * assertion the model made about it is checked against what was read.
 *
 * Confidence does not authorize acceptance. **This does.**
 *
 * It rejects: a fabricated id, an altered field, a missing record, a duplicated
 * selection, and a stale source or index format.
 */
import {
  assertIdentityConsistent,
  assertIdentityFresh,
  IdentityError,
  isWellFormedCandidateId,
} from '../contracts/identity.ts';
import { expandStyle } from './expand-style.ts';
import type { IndexReader, IndexRow } from './index-reader.ts';
import type { CandidateIdentity } from '../contracts/identity.ts';
import type { TypedResolution } from '../contracts/resolution.ts';

export const MATERIALIZATION_ERROR_CODES = [
  'MATERIALIZE_MALFORMED_ID',
  'MATERIALIZE_UNKNOWN_ID',
  'MATERIALIZE_DUPLICATE_SELECTION',
  'MATERIALIZE_STALE_SOURCE',
  'MATERIALIZE_STALE_INDEX',
  'MATERIALIZE_FIELD_ALTERED',
  'MATERIALIZE_IDENTITY_INCONSISTENT',
] as const;

export type MaterializationErrorCode = (typeof MATERIALIZATION_ERROR_CODES)[number];

export type MaterializationFailure = {
  readonly candidate_id: string;
  readonly code: MaterializationErrorCode;
  readonly message: string;
  /** Which field disagreed, when the failure is an alteration. */
  readonly field?: string | undefined;
  readonly claimed?: string | undefined;
  readonly actual?: string | undefined;
};

/**
 * What the model asserted about its selection, if anything.
 *
 * Every field is optional and every supplied field is **checked**. Supplying a
 * path here is not how a resolution is made — it is an opportunity to be caught
 * fabricating one, which is precisely how defect #1 (`stroke/base` attached to a
 * real key) would have been stopped.
 */
export type ClaimedFields = {
  readonly path?: string | undefined;
  readonly key?: string | undefined;
  readonly normalized_id?: string | undefined;
  readonly ref_class?: string | undefined;
  readonly value?: string | number | boolean | undefined;
  readonly mode?: string | undefined;
};

export type SelectionInput = {
  readonly candidate_id: string;
  readonly claimed?: ClaimedFields | undefined;
};

export type MaterializationResult = {
  readonly resolutions: readonly TypedResolution[];
  readonly failures: readonly MaterializationFailure[];
};

function identityFrom(row: IndexRow, reader: IndexReader): CandidateIdentity {
  return {
    candidate_id: row.candidate_id,
    source_record_ref: row.source_record_ref,
    source_sha256: reader.meta.source_sha256,
    index_version: reader.meta.index_version,
  };
}

function buildResolution(row: IndexRow, reader: IndexReader): TypedResolution {
  const identity = identityFrom(row, reader);
  const base = {
    ...identity,
    property_category: row.property_category,
    path: row.path,
    key: row.key,
    normalized_id: row.normalized_id,
    raw_id: row.raw_id,
    scopes: row.scopes,
    verified_against_source_sha256: reader.meta.source_sha256,
  };

  switch (row.ref_class) {
    case 'variable': {
      const numeric = row.value_num;
      const first = row.values[0];
      const value: string | number | boolean =
        numeric ?? first?.scalar ?? first?.color_hex ?? '';
      return {
        ...base,
        ref_class: 'variable',
        collection: row.collection ?? '',
        ...(row.modes.length === 1 && row.modes[0] !== undefined ? { mode: row.modes[0] } : {}),
        value,
      };
    }
    case 'paint-style':
      return {
        ...base,
        ref_class: 'paint-style',
        ...(row.bound_variable_ids[0] === undefined
          ? {}
          : { bound_variable_id: row.bound_variable_ids[0] }),
        modes: row.modes,
      };
    case 'text-style': {
      // Resolved through the join rather than read off the style, so the size is
      // established with provenance rather than asserted (finding C1).
      const expanded = expandStyle(reader, row.source_record_ref);
      const boundIds: Record<string, string> = {};
      if (expanded.found) {
        for (const field of expanded.fields) {
          if (!field.dangling) boundIds[field.field] = field.bound_variable_raw_id;
        }
      }
      return {
        ...base,
        ref_class: 'text-style',
        ...(row.literal_font_size === undefined ? {} : { font_size: row.literal_font_size }),
        ...(row.literal_line_height === undefined ? {} : { line_height: row.literal_line_height }),
        ...(row.literal_letter_spacing === undefined
          ? {}
          : { letter_spacing: row.literal_letter_spacing }),
        ...(row.literal_font_family === undefined ? {} : { font_family: row.literal_font_family }),
        ...(Object.keys(boundIds).length === 0 ? {} : { bound_variable_ids: boundIds }),
      };
    }
    case 'effect-style':
      return {
        ...base,
        ref_class: 'effect-style',
        ...(row.bound_variable_ids.length === 0 ? {} : { bound_variable_ids: row.bound_variable_ids }),
      };
    case 'grid-style':
      return { ...base, ref_class: 'grid-style' };
  }
}

function compareClaim(
  candidateId: string,
  field: string,
  claimed: string | number | boolean | undefined,
  actual: string | number | boolean | undefined,
): MaterializationFailure | undefined {
  if (claimed === undefined) return undefined;
  if (String(claimed) === String(actual)) return undefined;
  return {
    candidate_id: candidateId,
    code: 'MATERIALIZE_FIELD_ALTERED',
    message: `claimed ${field} does not match the indexed record`,
    field,
    claimed: String(claimed),
    actual: actual === undefined ? '(absent)' : String(actual),
  };
}

export function materializeSelection(
  reader: IndexReader,
  selections: readonly SelectionInput[],
): MaterializationResult {
  const resolutions: TypedResolution[] = [];
  const failures: MaterializationFailure[] = [];
  const seen = new Set<string>();
  const current = {
    source_sha256: reader.meta.source_sha256,
    index_version: reader.meta.index_version,
  };

  for (const selection of selections) {
    const { candidate_id: candidateId } = selection;

    if (!isWellFormedCandidateId(candidateId)) {
      failures.push({
        candidate_id: candidateId,
        code: 'MATERIALIZE_MALFORMED_ID',
        message: 'candidate_id is not a well-formed derived identifier',
      });
      continue;
    }

    // A duplicated selection is not harmless: it usually means two semantic
    // elements were collapsed, and silently deduplicating would hide that.
    if (seen.has(candidateId)) {
      failures.push({
        candidate_id: candidateId,
        code: 'MATERIALIZE_DUPLICATE_SELECTION',
        message: 'the same candidate was selected more than once in one batch',
      });
      continue;
    }
    seen.add(candidateId);

    const row = reader.findByCandidateId(candidateId);
    if (row === undefined) {
      failures.push({
        candidate_id: candidateId,
        code: 'MATERIALIZE_UNKNOWN_ID',
        message:
          'no indexed record carries this candidate_id — fabricated, or resolved against a different snapshot',
      });
      continue;
    }

    const identity = identityFrom(row, reader);
    try {
      assertIdentityFresh(identity, current);
      assertIdentityConsistent(identity);
    } catch (error: unknown) {
      if (error instanceof IdentityError) {
        const code: MaterializationErrorCode =
          error.code === 'IDENTITY_STALE_SOURCE'
            ? 'MATERIALIZE_STALE_SOURCE'
            : error.code === 'IDENTITY_STALE_INDEX'
              ? 'MATERIALIZE_STALE_INDEX'
              : 'MATERIALIZE_IDENTITY_INCONSISTENT';
        failures.push({ candidate_id: candidateId, code, message: error.message });
        continue;
      }
      throw error;
    }

    const claimed = selection.claimed;
    if (claimed !== undefined) {
      const checks = [
        compareClaim(candidateId, 'path', claimed.path, row.path),
        compareClaim(candidateId, 'key', claimed.key, row.key),
        compareClaim(candidateId, 'normalized_id', claimed.normalized_id, row.normalized_id),
        compareClaim(candidateId, 'ref_class', claimed.ref_class, row.ref_class),
        compareClaim(candidateId, 'value', claimed.value, row.value_num),
      ].filter((failure): failure is MaterializationFailure => failure !== undefined);

      if (claimed.mode !== undefined && !row.modes.includes(claimed.mode)) {
        checks.push({
          candidate_id: candidateId,
          code: 'MATERIALIZE_FIELD_ALTERED',
          message: 'claimed mode is not published for this record',
          field: 'mode',
          claimed: claimed.mode,
          actual: row.modes.join(',') || '(none)',
        });
      }

      if (checks.length > 0) {
        failures.push(...checks);
        continue;
      }
    }

    resolutions.push(buildResolution(row, reader));
  }

  return { resolutions, failures };
}
