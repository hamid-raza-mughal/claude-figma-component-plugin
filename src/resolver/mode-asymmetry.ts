/**
 * R14 — mode-asymmetry disclosure (§13.4.5).
 *
 * The rule exists because of a real grading contradiction: the same root cause was
 * graded FAIL in one version of a run and PASS in another. R10 governs *structural
 * variables* only, so a paint style inheriting a multi-mode collection while being
 * published in one mode is **not** an R10 violation — and silence is not right
 * either, since the asymmetry is real.
 *
 * So R14 emits a **non-blocking `Disclosure`** and does two things it must not do:
 * it does not invent a missing style, and it does not ask a dead-end clarification
 * question. If there is no light-mode style to offer, asking which one to use has
 * no answer.
 *
 * Applicability is much narrower than it first appears, measured:
 *   - `colors` is the **only** multi-mode collection (194 entries, Dark + Light);
 *   - **381 of 570** paint styles have no bound variable at all.
 * So R14 can apply to at most **189** paint styles, not 570. Absence of a binding
 * is normal and is not evidence of asymmetry.
 */
import type { IndexReader } from './index-reader.ts';
import type { Disclosure } from '../contracts/resolution.ts';

export type ModeAsymmetryFinding = {
  readonly source_record_ref: string;
  readonly path: string;
  /** Modes published by the collection the style inherits from. */
  readonly collection_modes: readonly string[];
  /** Modes this style is actually published in. */
  readonly published_modes: readonly string[];
  readonly missing_modes: readonly string[];
  /**
   * True when a sibling style exists for a missing mode, making an alternative
   * offerable. When false, asking the user is a dead end — which is exactly the
   * case R14 was written for.
   */
  readonly actionable_alternative_exists: boolean;
};

export type ModeAsymmetryResult = {
  readonly findings: readonly ModeAsymmetryFinding[];
  readonly disclosures: readonly Disclosure[];
  /** Records examined — the honest denominator for any rate quoted from this. */
  readonly examined_count: number;
  /** Multi-mode collections found. Version-tolerant: derived from the index, not
   *  from a hard-coded collection name, because the export's shape has already
   *  changed once. */
  readonly multi_mode_collections: readonly string[];
};

/**
 * Detects mode asymmetry for the given style refs, or across all styles when none
 * are given.
 *
 * Detection is deliberately schema-version-tolerant: it derives multi-mode
 * collections from the index rather than depending on any single field's presence.
 */
export function detectModeAsymmetry(
  reader: IndexReader,
  sourceRecordRefs?: readonly string[],
): ModeAsymmetryResult {
  const multiMode = reader.multiModeCollections();
  const multiModeNames = multiMode.map((entry) => entry.collection);
  const allMultiModeNames = new Set<string>();
  for (const entry of multiMode) for (const mode of entry.modes) allMultiModeNames.add(mode);

  const rows =
    sourceRecordRefs === undefined
      ? reader.selectPool({ refClasses: ['paint-style', 'text-style', 'effect-style', 'grid-style'] })
      : sourceRecordRefs
          .map((ref) => reader.findByRecordRef(ref))
          .filter((row): row is NonNullable<typeof row> => row !== undefined);

  const findings: ModeAsymmetryFinding[] = [];

  for (const row of rows) {
    // A style with no binding cannot exhibit asymmetry — it inherits nothing.
    if (row.bound_variable_ids.length === 0) continue;
    if (!row.multi_mode) continue;

    const collectionModes = [...allMultiModeNames].sort((a, b) => a.localeCompare(b, 'en'));
    const published = row.modes;
    const missing = collectionModes.filter((mode) => !published.includes(mode));
    if (missing.length === 0) continue;

    // Is there a sibling style covering a missing mode? If not, there is nothing
    // to offer and a question would be a dead end.
    const alternative = missing.some((mode) => {
      const candidatePath = row.path.replace(/\b(dark|light)\b/i, mode.toLowerCase());
      if (candidatePath === row.path) return false;
      return reader.findByPath(row.ref_class, candidatePath) !== undefined;
    });

    findings.push({
      source_record_ref: row.source_record_ref,
      path: row.path,
      collection_modes: collectionModes,
      published_modes: published,
      missing_modes: missing,
      actionable_alternative_exists: alternative,
    });
  }

  const disclosures: Disclosure[] = findings.map((finding, index) => ({
    disclosure_id: `mode-coverage-${String(index + 1).padStart(3, '0')}`,
    kind: 'mode_coverage_gap',
    owner: 'coordinator',
    evidence:
      `${finding.path} inherits a multi-mode collection (${finding.collection_modes.join(', ')}) but is ` +
      `published only in ${finding.published_modes.join(', ') || '(none)'}; missing ` +
      `${finding.missing_modes.join(', ')}. ` +
      (finding.actionable_alternative_exists
        ? 'A sibling style exists for a missing mode.'
        : 'No alternative style exists, so no clarification is answerable.'),
    actionable: false,
  }));

  return {
    findings,
    disclosures,
    examined_count: rows.length,
    multi_mode_collections: multiModeNames,
  };
}
