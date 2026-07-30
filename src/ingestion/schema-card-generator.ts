/**
 * Schema-card generator (`SA-15`, finding **C5**).
 *
 * The schema card is the one source-derived artifact that **does** enter model
 * context. The previous card was hand-maintained — and it carried a fabricated
 * token path while being the thing the model reads. A hand-maintained card has
 * exactly the staleness profile the card exists to eliminate.
 *
 * So: generated from the index, every number derived, nothing asserted. Two
 * properties are tested — regeneration is byte-identical, and the card contains
 * no raw-source bytes.
 *
 * The card's job is to tell the model what it cannot otherwise know: which
 * reference classes exist, which tiers to bind to, and which fields are
 * discriminating. It is a map, not the territory.
 */
import type { IndexReader } from './../resolver/index-reader.ts';
import type { SchemaCard } from '../contracts/source.ts';

/** Rough characters-per-token, used only to report an *estimated* size. Labelled
 *  as an estimate wherever it surfaces: a real count needs a tokenizer, which
 *  arrives with the Phase 2 model adapter. */
export const CHARS_PER_TOKEN_ESTIMATE = 3.5;

export function generateSchemaCard(reader: IndexReader): SchemaCard {
  const byClass = reader.countByRefClass();
  const byCategory = reader.countByCategory();
  const collections = reader.collectionSummary();
  const meta = reader.meta;

  const classLines = Object.entries(byClass)
    .sort(([a], [b]) => a.localeCompare(b, 'en'))
    .map(([refClass, count]) => `  ${refClass}: ${count}`)
    .join('\n');

  const categoryLines = Object.entries(byCategory)
    .sort(([a], [b]) => a.localeCompare(b, 'en'))
    .map(([category, count]) => `  ${category}: ${count}`)
    .join('\n');

  const collectionLines = collections
    .map((entry) => {
      const described = entry.entries === 0 ? 0 : Math.round((entry.described / entry.entries) * 100);
      return (
        `  ${entry.collection}: ${entry.entries} entries, ${described}% described` +
        (entry.multi_mode ? ' [MULTI-MODE]' : '')
      );
    })
    .join('\n');

  const multiMode = collections.filter((entry) => entry.multi_mode).map((entry) => entry.collection);
  const undescribed = collections.filter((entry) => entry.described === 0).map((entry) => entry.collection);

  const body = `DESIGN SYSTEM INDEX — schema card
Generated from the index. Counts are derived, never asserted.

SNAPSHOT
  source_sha256: ${meta.source_sha256}
  index_version: ${meta.index_version}
  source_schema_version: ${meta.source_schema_version}
  entries: ${meta.entry_count}

REFERENCE CLASSES (select by candidate_id only; never compose a path)
${classLines}

PROPERTY CATEGORIES
${categoryLines}

VARIABLE COLLECTIONS
${collectionLines}

WHAT DISCRIMINATES A MATCH
  scopes: populated on every variable — the strongest signal available.
  path tier: sys/* is semantic and is the binding target; ref/* is primitive and
    must not be bound to.
  description: present on a minority of entries and formulaic where present.
    ${undescribed.length > 0 ? `No descriptions at all in: ${undescribed.join(', ')}.` : ''}
    Do not treat description text as the deciding evidence.

MODES
  ${multiMode.length === 0 ? 'No multi-mode collection in this snapshot.' : `Multi-mode: ${multiMode.join(', ')}. All others are single-mode.`}
  A style published in fewer modes than its collection is a non-blocking
  disclosure, not an error, and not a question with an answer.

CASING
  Variable paths are TitleCase (Body/sm/size); style paths are lowercase
  (body/sm/regular). Never assume one casing across classes.

TEXT SIZES
  A text style carries a literal font size AND binds a type-scale variable.
  Both are available; never claim a size cannot be confirmed from tokens.

RULES
  Select references by candidate_id. Do not author paths, keys, ids or values.
  Confidence is a ranking statement, not a verification.
`;

  return {
    snapshot: {
      source_sha256: meta.source_sha256,
      index_version: meta.index_version,
      source_schema_version: meta.source_schema_version,
      ...(meta.exported_at === undefined ? {} : { exported_at: meta.exported_at }),
      source_bytes: meta.source_bytes,
    },
    body,
    byte_length: Buffer.byteLength(body, 'utf8'),
    generated_from_index: true,
  };
}

/** Estimated token count. **An estimate**, and named as one. */
export function estimateCardTokens(card: SchemaCard): number {
  return Math.ceil(card.byte_length / CHARS_PER_TOKEN_ESTIMATE);
}
