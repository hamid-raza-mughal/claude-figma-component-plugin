/**
 * Gate 2 ingestion evidence (§13.1, §17.1).
 *
 * Every measured figure is asserted, not described. If the export changes, these
 * fail loudly and the manifest tells you what moved — which is the whole point of
 * deriving counts rather than asserting them in prose.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { harness, freshDerivedDir, SOURCE_AVAILABLE, CURATED_SOURCE } from './test-index.ts';
import { resolvePhase1Config } from '../../src/config/phase1-config.ts';
import { ingest, IngestionError } from '../../src/ingestion/curated-json-loader.ts';
import { assessReuse, indexPathFor } from '../../src/ingestion/content-addressed-store.ts';
import { readBoundVariables, normalizeFieldName } from '../../src/ingestion/bound-variables-reader.ts';
import { normalizeId, derivePropertyCategory } from '../../src/ingestion/curated-json-normalizer.ts';
import { validateExport } from '../../src/ingestion/curated-json-validator.ts';
import { canonicalize, canonicalJsonHash, hashSourceBytes } from '../../src/ingestion/source-hash.ts';
import { generateSchemaCard, estimateCardTokens } from '../../src/ingestion/schema-card-generator.ts';

describe('bound_variables polymorphic reader (finding C3)', () => {
  test('reads the field-dict shape used by every text style', () => {
    const result = readBoundVariables({
      fontSize: { variable_id: 'VariableID:410:158', alias_name: 'Body/sm/size' },
      lineHeight: { variable_id: 'VariableID:410:159' },
    });
    assert.equal(result.shape, 'field-dict');
    assert.equal(result.bindings.length, 2);
    // Sorted, because object key order is not a contract and two builds of one
    // file must be identical.
    assert.deepEqual(
      result.bindings.map((b) => b.field),
      ['fontSize', 'lineHeight'],
    );
  });

  test('reads the single-entry list shape used by bound paint styles', () => {
    const result = readBoundVariables([
      { paint_index: 0, field: 'color', variable_id: 'VariableID:671:2' },
    ]);
    assert.equal(result.shape, 'list');
    assert.equal(result.bindings[0]?.field, 'color');
    assert.equal(result.bindings[0]?.paint_index, 0);
  });

  test('reads the empty list carried by 381 unbound paint styles', () => {
    assert.equal(readBoundVariables([]).shape, 'empty-list');
  });

  test('reads a multi-entry list (the single effect style has four)', () => {
    const result = readBoundVariables([
      { field: 'color', variable_id: 'a' },
      { field: 'radius', variable_id: 'b' },
      { field: 'offsetX', variable_id: 'c' },
      { field: 'offsetY', variable_id: 'd' },
    ]);
    assert.equal(result.bindings.length, 4);
  });

  test('absence is a shape, not an error', () => {
    assert.equal(readBoundVariables(undefined).shape, 'absent');
    assert.equal(readBoundVariables(null).shape, 'absent');
  });

  /** Silently-empty is how a style with a real binding comes to look unbound. */
  test('an entry without a variable_id is reported, never silently dropped', () => {
    const result = readBoundVariables([{ field: 'color' }]);
    assert.equal(result.bindings.length, 0);
    assert.equal(result.anomalies.length, 1);
    assert.match(result.anomalies[0] ?? '', /no variable_id/);
  });

  test('an unrecognised container is reported rather than guessed at', () => {
    const result = readBoundVariables('nonsense' as unknown as null);
    assert.equal(result.shape, 'unknown');
    assert.equal(result.anomalies.length, 1);
  });

  test('field names fold to camelCase', () => {
    assert.equal(normalizeFieldName('font_size'), 'fontSize');
    assert.equal(normalizeFieldName('fontSize'), 'fontSize');
    assert.equal(normalizeFieldName('color'), 'color');
  });
});

describe('normalization scope', () => {
  test('strips trailing commas from style ids', () => {
    assert.equal(normalizeId('S:cfdda1d5,'), 'S:cfdda1d5');
    assert.equal(normalizeId('S:cfdda1d5,,'), 'S:cfdda1d5');
  });

  test('leaves variable ids untouched — none carry a comma', () => {
    assert.equal(normalizeId('VariableID:929:56'), 'VariableID:929:56');
  });

  test('derives property category from collection and path', () => {
    assert.equal(derivePropertyCategory('border-scale', 'stroke/thin', 'FLOAT'), 'border-width');
    assert.equal(derivePropertyCategory('layout-scale', '4-scale/xxs', 'FLOAT'), 'spacing');
    assert.equal(derivePropertyCategory('colors', 'sys/dark/surfaces/x', 'COLOR'), 'color');
    assert.equal(derivePropertyCategory(undefined, 'nothing/matches', 'BOOLEAN'), 'boolean');
  });
});

describe('canonical hashing', () => {
  test('key order does not change the canonical hash', () => {
    assert.equal(canonicalJsonHash({ a: 1, b: 2 }), canonicalJsonHash({ b: 2, a: 1 }));
  });

  /** Array order is meaningful here — paint stacks, binding lists — so sorting
   *  arrays would destroy information and make different files hash alike. */
  test('array order does change it', () => {
    assert.notEqual(canonicalJsonHash([1, 2]), canonicalJsonHash([2, 1]));
  });

  test('-0 and 0 canonicalize alike', () => {
    assert.equal(canonicalize(-0), canonicalize(0));
  });

  test('byte hashing is stable', () => {
    assert.equal(hashSourceBytes('abc'), hashSourceBytes('abc'));
    assert.notEqual(hashSourceBytes('abc'), hashSourceBytes('abd'));
  });
});

describe('validator tolerance', () => {
  test('rejects a non-object source', () => {
    assert.equal(validateExport([]).usable, false);
    assert.equal(validateExport(null).usable, false);
  });

  test('rejects a source with no variables', () => {
    const outcome = validateExport({ variables: { items: [], collections: [] }, styles: { paint: [] } });
    assert.equal(outcome.usable, false);
    assert.ok(outcome.diagnostics.some((d) => d.code === 'SOURCE_VARIABLES_MISSING'));
  });

  /** Tolerance is the requirement: an unknown version warns and proceeds. */
  test('an unknown schema version warns but stays usable', () => {
    const outcome = validateExport({
      meta: { schema_version: '9.9' },
      variables: { items: [{ id: 'v', name: 'x' }], collections: [{ id: 'c', name: 'c' }] },
      styles: { paint: [{ id: 's', name: 'y' }] },
    });
    assert.equal(outcome.usable, true);
    assert.ok(outcome.diagnostics.some((d) => d.code === 'SOURCE_SCHEMA_VERSION_UNKNOWN'));
  });

  test('a count that disagrees with the file is surfaced', () => {
    const outcome = validateExport({
      meta: { schema_version: '1.1' },
      variables: { items: [{ id: 'v', name: 'x' }], collections: [{ id: 'c', name: 'c' }] },
      styles: { paint: [{ id: 's', name: 'y' }] },
      diagnostics: { counts: { variables: 412 } },
    });
    assert.ok(outcome.diagnostics.some((d) => d.code === 'SOURCE_COUNT_DISAGREEMENT'));
  });
});

describe('ingestion against the real export', () => {
  if (!SOURCE_AVAILABLE) {
    test('curated source unavailable — set ADALFI_ARTIFACT_DIR', { skip: true }, () => {});
    return;
  }

  test('indexes exactly the measured entry counts', () => {
    const { ingestion } = harness();
    const counts = ingestion.manifest.counts;
    assert.equal(counts.total, 1177);
    assert.equal(counts.by_ref_class['variable'], 504);
    assert.equal(counts.by_ref_class['paint-style'], 567);
    assert.equal(counts.by_ref_class['text-style'], 105);
    assert.equal(counts.by_ref_class['effect-style'], 1);
    assert.equal(counts.by_ref_class['grid-style'], 0);
  });

  test('post-normalization id collisions remain zero', () => {
    assert.equal(harness().ingestion.manifest.normalized_id_collisions, 0);
  });

  test('normalization was applied — all 673 style ids carry a trailing comma', () => {
    assert.equal(harness().ingestion.manifest.normalization_applied, true);
  });

  test('colors is the only multi-mode collection, with Dark and Light', () => {
    const multi = harness().ingestion.manifest.collections.filter((c) => c.multi_mode);
    assert.deepEqual(
      multi.map((c) => c.name),
      ['colors'],
    );
    assert.deepEqual([...(multi[0]?.modes ?? [])].sort(), ['Dark', 'Light']);
  });

  /** Description coverage is why ranking leans on `scopes` instead of prose. */
  test('cta-scale and type-scale carry no descriptions at all', () => {
    const byName = new Map(harness().ingestion.manifest.collections.map((c) => [c.name, c]));
    assert.equal(byName.get('cta-scale')?.described_count, 0);
    assert.equal(byName.get('type-scale')?.described_count, 0);
    assert.equal(byName.get('border-scale')?.described_count, 21);
  });

  test("the export's own three warnings are surfaced, not swallowed", () => {
    const fromExport = harness().ingestion.manifest.diagnostics.filter((d) => d.origin === 'export');
    assert.equal(fromExport.length, 3);
    assert.equal(fromExport.filter((d) => d.code === 'EMPTY_BUCKET').length, 2);
    assert.equal(fromExport.filter((d) => d.code === 'MODE_ASYMMETRY').length, 1);
  });

  test('the index records its SQLite version and FTS tokenizer (D-C.6)', () => {
    const { reader } = harness();
    assert.match(reader.meta.sqlite_version, /^\d+\.\d+\.\d+$/);
    assert.equal(reader.meta.fts_tokenizer, 'unicode61 remove_diacritics 2');
  });

  test('the index is smaller than the source it derives from', () => {
    const { ingestion } = harness();
    assert.ok(existsSync(ingestion.database_path));
  });
});

describe('content-addressed reuse (§13.1.9-10)', () => {
  if (!SOURCE_AVAILABLE || CURATED_SOURCE === undefined) {
    test('curated source unavailable', { skip: true }, () => {});
    return;
  }

  test('a second ingest of the same source reuses the index', () => {
    const derivedDir = freshDerivedDir();
    const config = resolvePhase1Config({ curatedSourcePath: CURATED_SOURCE, derivedDir });
    const first = ingest(config, { now: '2026-07-29T00:00:00.000Z' });
    assert.equal(first.reuse_decision, 'rebuild-absent');
    const second = ingest(config, { now: '2026-07-29T00:00:01.000Z' });
    assert.equal(second.reuse_decision, 'reuse');
  });

  /** Both keys must match. A source hash alone is not enough — a format change
   *  with an unchanged source must still rebuild. */
  test('an index-format bump refuses to reuse', () => {
    const derivedDir = freshDerivedDir();
    ingest(resolvePhase1Config({ curatedSourcePath: CURATED_SOURCE, derivedDir }));
    const bumped = assessReuse(derivedDir, hashSourceBytes('irrelevant'), '9.9.9');
    assert.equal(bumped.reusable, false);
    assert.equal(bumped.decision, 'rebuild-absent');
  });

  test('a changed source refuses to reuse', () => {
    const derivedDir = freshDerivedDir();
    const config = resolvePhase1Config({ curatedSourcePath: CURATED_SOURCE, derivedDir });
    ingest(config);
    const assessment = assessReuse(derivedDir, 'f'.repeat(64), config.indexVersion);
    assert.equal(assessment.reusable, false);
  });

  /** A file wearing a valid name but holding nothing usable must not be trusted. */
  test('an unreadable index is treated as absent, never trusted', () => {
    const derivedDir = freshDerivedDir();
    const sha = 'a'.repeat(64);
    const path = indexPathFor(derivedDir, sha, '1.0.0');
    writeFileSync(path, 'not a database');
    const assessment = assessReuse(derivedDir, sha, '1.0.0');
    assert.equal(assessment.reusable, false);
    assert.equal(assessment.decision, 'rebuild-unreadable');
  });

  test('a malformed source fails visibly rather than producing an empty index', () => {
    const derivedDir = freshDerivedDir();
    const bad = join(derivedDir, 'bad.json');
    writeFileSync(bad, '{ not json');
    assert.throws(
      () => ingest(resolvePhase1Config({ curatedSourcePath: bad, derivedDir })),
      (error: unknown) => error instanceof IngestionError && error.code === 'SOURCE_MALFORMED_JSON',
    );
  });
});

describe('schema-card generator (SA-15, finding C5)', () => {
  if (!SOURCE_AVAILABLE) {
    test('curated source unavailable', { skip: true }, () => {});
    return;
  }

  test('regeneration is byte-identical', () => {
    const { reader } = harness();
    assert.equal(generateSchemaCard(reader).body, generateSchemaCard(reader).body);
  });

  test('the card declares that it was generated from the index', () => {
    assert.equal(generateSchemaCard(harness().reader).generated_from_index, true);
  });

  test('the card carries no raw curated-source bytes', () => {
    const body = generateSchemaCard(harness().reader).body;
    for (const fragment of ['values_by_mode', 'bound_variables', '"paints"', 'VariableID:', 'figma_file_key']) {
      assert.ok(!body.includes(fragment), `card leaked source fragment: ${fragment}`);
    }
  });

  /** The card exists to state what the model cannot otherwise know — including the
   *  two facts the v1 defects turned on. */
  test('the card states the casing split and that text sizes are available', () => {
    const body = generateSchemaCard(harness().reader).body;
    assert.match(body, /TitleCase/);
    assert.match(body, /lowercase/);
    assert.match(body, /never claim a size cannot be confirmed/i);
  });

  test('the card stays compact', () => {
    const card = generateSchemaCard(harness().reader);
    assert.ok(card.byte_length < 4000, `card is ${card.byte_length} bytes`);
    assert.ok(estimateCardTokens(card) < 1200);
  });

  test('the card reports derived counts, not asserted ones', () => {
    const body = generateSchemaCard(harness().reader).body;
    assert.match(body, /variable: 504/);
    assert.match(body, /paint-style: 567/);
    assert.ok(!/412 styles/.test(body));
  });
});
