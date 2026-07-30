/**
 * Version-tolerant validation of the curated export (§13.1.2–13.1.3).
 *
 * Two rules govern this module:
 *
 * 1. **Tolerate shape, require substance.** The export's top-level shape already
 *    changed once between two exports of the same library, so validation checks
 *    that the sections it *needs* are present and usable — never that the file
 *    matches a fixed schema. Anything keyed to one field's presence would fail on
 *    the next export.
 *
 * 2. **Never swallow a diagnostic.** The export carries its own warnings — two
 *    `EMPTY_BUCKET` and one `MODE_ASYMMETRY` in the 2026-07-28 file — and those
 *    surface into the run log rather than being discarded as noise. A silently
 *    dropped warning is how "grid_styles is 0" becomes a mystery later.
 */
import type { RawCuratedExport } from './curated-json-types.ts';
import type { SourceDiagnostic } from '../contracts/source.ts';

export type ValidationOutcome = {
  readonly usable: boolean;
  readonly diagnostics: readonly SourceDiagnostic[];
  readonly source_schema_version: string;
};

/** Schema versions this ingestion has been exercised against. An unknown version
 *  is a *warning*, not a rejection — the tolerance is the point. */
export const KNOWN_SCHEMA_VERSIONS = ['1.0', '1.1'] as const;

function diagnostic(
  code: string,
  severity: SourceDiagnostic['severity'],
  message: string,
  origin: SourceDiagnostic['origin'],
  locator?: string,
): SourceDiagnostic {
  return { code, severity, message, origin, ...(locator === undefined ? {} : { locator }) };
}

export function validateExport(raw: unknown): ValidationOutcome {
  const diagnostics: SourceDiagnostic[] = [];

  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return {
      usable: false,
      diagnostics: [
        diagnostic('SOURCE_NOT_AN_OBJECT', 'error', 'curated source is not a JSON object', 'ingestion'),
      ],
      source_schema_version: 'unknown',
    };
  }

  const exported = raw as RawCuratedExport;
  const schemaVersion = exported.meta?.schema_version ?? 'unknown';

  if (schemaVersion === 'unknown') {
    diagnostics.push(
      diagnostic(
        'SOURCE_SCHEMA_VERSION_MISSING',
        'warning',
        'meta.schema_version is absent; proceeding, but the export cannot be version-pinned',
        'ingestion',
        'meta.schema_version',
      ),
    );
  } else if (!(KNOWN_SCHEMA_VERSIONS as readonly string[]).includes(schemaVersion)) {
    diagnostics.push(
      diagnostic(
        'SOURCE_SCHEMA_VERSION_UNKNOWN',
        'warning',
        `meta.schema_version "${schemaVersion}" has not been exercised by this ingestion ` +
          `(known: ${KNOWN_SCHEMA_VERSIONS.join(', ')}). Proceeding tolerantly.`,
        'ingestion',
        'meta.schema_version',
      ),
    );
  }

  // The two sections resolution genuinely cannot proceed without.
  const variableItems = exported.variables?.items;
  const hasVariables = Array.isArray(variableItems) && variableItems.length > 0;
  if (!hasVariables) {
    diagnostics.push(
      diagnostic(
        'SOURCE_VARIABLES_MISSING',
        'error',
        'variables.items is absent or empty — no variable can be resolved',
        'ingestion',
        'variables.items',
      ),
    );
  }

  const collections = exported.variables?.collections;
  if (!Array.isArray(collections) || collections.length === 0) {
    diagnostics.push(
      diagnostic(
        'SOURCE_COLLECTIONS_MISSING',
        'error',
        'variables.collections is absent or empty — mode and collection context is unavailable',
        'ingestion',
        'variables.collections',
      ),
    );
  }

  const styles = exported.styles;
  const styleBuckets = typeof styles === 'object' && styles !== null ? Object.keys(styles) : [];
  const populatedBuckets = styleBuckets.filter((bucket) => (styles?.[bucket] ?? []).length > 0);
  if (styleBuckets.length === 0) {
    diagnostics.push(
      diagnostic(
        'SOURCE_STYLES_MISSING',
        'error',
        'styles is absent — no style can be resolved',
        'ingestion',
        'styles',
      ),
    );
  } else if (populatedBuckets.length === 0) {
    diagnostics.push(
      diagnostic(
        'SOURCE_STYLES_ALL_EMPTY',
        'error',
        `styles has buckets (${styleBuckets.join(', ')}) but every one is empty`,
        'ingestion',
        'styles',
      ),
    );
  }

  // An empty bucket is normal — grid_styles is 0 in the current export — but it is
  // recorded so a later "grid style not found" is explainable rather than odd.
  for (const bucket of styleBuckets) {
    if ((styles?.[bucket] ?? []).length === 0) {
      diagnostics.push(
        diagnostic(
          'SOURCE_STYLE_BUCKET_EMPTY',
          'info',
          `styles.${bucket} is empty; resolution for this class cannot be exercised against real data`,
          'ingestion',
          `styles.${bucket}`,
        ),
      );
    }
  }

  // Carry the export's own warnings forward verbatim.
  for (const warning of exported.diagnostics?.warnings ?? []) {
    diagnostics.push(
      diagnostic(
        warning.type ?? 'EXPORT_WARNING',
        'warning',
        warning.message ?? '(no message)',
        'export',
        'diagnostics.warnings',
      ),
    );
  }

  /**
   * Compare the export's self-reported counts against what is actually there.
   *
   * This exists because the v1 spec asserted "412 styles + 88 variables" while the
   * file holds 673 and 504. A count that disagrees with its own file is the
   * cheapest possible early warning that something upstream changed.
   */
  const reported = exported.diagnostics?.counts ?? {};
  const actual: Readonly<Record<string, number>> = {
    variables: variableItems?.length ?? 0,
    variable_collections: collections?.length ?? 0,
    paint_styles: styles?.['paint']?.length ?? 0,
    text_styles: styles?.['text']?.length ?? 0,
    effect_styles: styles?.['effect']?.length ?? 0,
    grid_styles: styles?.['grid']?.length ?? 0,
  };
  for (const [name, actualCount] of Object.entries(actual)) {
    const reportedCount = reported[name];
    if (reportedCount !== undefined && reportedCount !== actualCount) {
      diagnostics.push(
        diagnostic(
          'SOURCE_COUNT_DISAGREEMENT',
          'warning',
          `diagnostics.counts.${name} reports ${reportedCount} but the file contains ${actualCount}`,
          'ingestion',
          `diagnostics.counts.${name}`,
        ),
      );
    }
  }

  return {
    usable: !diagnostics.some((entry) => entry.severity === 'error'),
    diagnostics,
    source_schema_version: schemaVersion,
  };
}
