/**
 * Adapts a real `IndexReader` to the composer/validators' narrow
 * `ResolutionLookupPort` (§16.2, §16.3 Gate 5) — read-only by construction, so
 * nothing composed from it can ever write back to the index.
 *
 * Existing tests build `ResolutionLookupPort` by hand from a fixture map
 * (`tests/unit/composition-and-rendering.test.ts`); this is the one place
 * production code performs the same adaptation from a real reader instead.
 */
import type { IndexReader, IndexRow } from './index-reader.ts';
import type { LookedUpRecord, ResolutionLookupPort } from '../validation/reference-validator.ts';

function toLookedUpRecord(row: IndexRow): LookedUpRecord {
  return {
    candidate_id: row.candidate_id,
    source_record_ref: row.source_record_ref,
    ref_class: row.ref_class,
    path: row.path,
    key: row.key,
    normalized_id: row.normalized_id,
    raw_id: row.raw_id,
    property_category: row.property_category,
    ...(row.value_num === undefined ? {} : { value_num: row.value_num }),
    modes: row.modes,
  };
}

export function portFromIndexReader(reader: IndexReader): ResolutionLookupPort {
  return {
    snapshot: { source_sha256: reader.meta.source_sha256, index_version: reader.meta.index_version },
    lookupByCandidateId: (candidateId) => {
      const row = reader.findByCandidateId(candidateId);
      return row === undefined ? undefined : toLookedUpRecord(row);
    },
  };
}
