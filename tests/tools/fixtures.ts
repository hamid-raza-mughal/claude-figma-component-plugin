/**
 * A minimal, valid, synthetic curated export for engine tests — real enough
 * to pass `validateExport`/`normalizeExport` and ingest into a real SQLite
 * index, without needing the external artifact bundle. Engine tests exercise
 * `beginRun`'s and `prepareContext`'s real ingestion path (§4.1's "loads or
 * reuses the index"), not a mock of it.
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolvePhase1Config, type Phase1Config } from '../../src/config/phase1-config.ts';

const MINIMAL_CURATED_EXPORT = {
  meta: { schema_version: '1.1', exported_at: '2026-07-29T00:00:00Z' },
  variables: {
    collections: [
      {
        id: 'VariableCollectionId:1:1',
        key: 'collA',
        name: 'Colors',
        modes: [{ modeId: '1:0', name: 'Light' }],
      },
    ],
    items: [
      {
        id: 'VariableID:1:10',
        key: 'abc123',
        name: 'color/primary',
        collection_id: 'VariableCollectionId:1:1',
        type: 'COLOR',
        values_by_mode: { '1:0': { r: 0.1, g: 0.2, b: 0.9, a: 1 } },
        scopes: ['ALL_FILLS'],
        description: 'Primary color',
      },
      {
        id: 'VariableID:1:11',
        key: 'abc124',
        name: 'spacing/gap-sm',
        collection_id: 'VariableCollectionId:1:1',
        type: 'FLOAT',
        values_by_mode: { '1:0': 8 },
        scopes: ['GAP'],
        description: 'Small gap',
      },
    ],
  },
  styles: {
    paint: [
      {
        id: 'S:paint1',
        key: 'paintkey1cafef00dcafef00dcafef00dcafef00d',
        name: 'surface/warning',
        description: 'warning fill',
        paints: [{ type: 'SOLID' }],
        bound_variables: [],
      },
    ],
    text: [
      {
        id: 'S:text1',
        key: 'textkey1cafef00dcafef00dcafef00dcafef00d',
        name: 'body/regular',
        description: 'body text',
        font_size: 14,
        bound_variables: {},
      },
    ],
    effect: [],
    grid: [],
  },
  diagnostics: { counts: {}, warnings: [] },
};

/** Writes the fixture and a matching, unique, fully-resolved `Phase1Config`. */
export function newPhase1Config(): Phase1Config {
  const root = mkdtempSync(join(tmpdir(), 'adalfi-p1config-'));
  const curatedSourcePath = join(root, 'curated.json');
  writeFileSync(curatedSourcePath, JSON.stringify(MINIMAL_CURATED_EXPORT));
  const derivedDir = join(root, 'derived');
  const approvedDataDirectory = join(root, 'approved-data');
  return resolvePhase1Config({ curatedSourcePath, derivedDir, approvedDataDirectory });
}
