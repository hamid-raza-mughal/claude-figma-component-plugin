/**
 * Source and snapshot identity (P1-FINAL §13.1, §14.1).
 *
 * Curated JSON is authoritative; the SQLite index is derived and rebuildable.
 * These types carry the identity that makes that relationship checkable: a run
 * pins a snapshot, and every later assertion is made against the pinned
 * snapshot rather than against whatever is on disk at the time.
 *
 * Grading against a live re-fetch instead of the pinned snapshot produces
 * false "drift" findings whenever the design system legitimately evolves after
 * a component was built, which is why pinning is a contract and not an option.
 */
import type { RefClass } from './identity.ts';

/**
 * What a run pins. Passed by reference and hash, never as content (§14.3.21).
 *
 * `CuratedSnapshotRef` is the object Synthesizer receives — it never receives
 * the raw pinned JSON (§5.4).
 */
export type CuratedSnapshotRef = {
  readonly source_sha256: string;
  readonly index_version: string;
  /** `meta.schema_version` from the export. Version-tolerance is mandatory: the
   *  export's top-level shape already changed once between two exports of the
   *  same library, so nothing may key on a single field's presence. */
  readonly source_schema_version: string;
  readonly exported_at?: string | undefined;
  readonly source_bytes: number;
};

/** Per-reference-class entry counts, **derived from the index**. */
export type EntryCounts = {
  readonly total: number;
  readonly by_ref_class: Readonly<Record<RefClass, number>>;
};

/**
 * A diagnostic emitted by ingestion or by the export itself.
 *
 * Never swallowed (§13.1.3). The 2026-07-28 export carries two `EMPTY_BUCKET`
 * warnings and one `MODE_ASYMMETRY` warning of its own, and those must surface
 * into the run log rather than being discarded as noise.
 */
export type SourceDiagnostic = {
  readonly code: string;
  readonly severity: 'info' | 'warning' | 'error';
  readonly message: string;
  /** Where in the source it arose, when locatable. */
  readonly locator?: string | undefined;
  readonly origin: 'export' | 'ingestion';
};

/**
 * The full manifest produced by ingestion.
 *
 * Counts live here, derived from the index, and are **never copied into a prompt
 * or a code constant** (§13.1.11). The v1 spec asserted "412 styles + 88
 * variables" in two places; the real figures are 673 and 504. An asserted count
 * is a claim that silently rots — a derived one cannot.
 */
export type SourceManifest = {
  readonly snapshot: CuratedSnapshotRef;
  readonly counts: EntryCounts;
  readonly collections: readonly CollectionSummary[];
  readonly diagnostics: readonly SourceDiagnostic[];
  /** True when normalization changed at least one id. Measured: all 673 style
   *  ids carry a trailing comma, 0 of 504 variable ids do. */
  readonly normalization_applied: boolean;
  readonly normalized_id_collisions: number;
};

export type CollectionSummary = {
  readonly name: string;
  readonly entry_count: number;
  readonly modes: readonly string[];
  /** True when the collection publishes more than one mode. Measured: `colors`
   *  is the only multi-mode collection (Dark + Light), so mode logic must not
   *  assume multi-mode is the general case. */
  readonly multi_mode: boolean;
  /** Entries carrying a description. Measured overall: 212/1,177 (18%), and
   *  `cta-scale` and `type-scale` have none at all — which is why ranking leans
   *  on `scopes` (populated 504/504) rather than on prose. */
  readonly described_count: number;
};

/**
 * The compact card that *does* enter model context — generated from the index,
 * never hand-maintained (`SA-15`).
 *
 * A hand-maintained card carries exactly the staleness profile it was introduced
 * to eliminate, and the previous one additionally carried a fabricated token
 * path while being the artifact the model reads.
 */
export type SchemaCard = {
  readonly snapshot: CuratedSnapshotRef;
  readonly body: string;
  readonly byte_length: number;
  /** Set by the generator. A card that cannot state its own provenance should
   *  not be trusted to describe the source. */
  readonly generated_from_index: true;
};
