/**
 * One place that knows where the authoritative artifact bundle is and what it
 * should hash to.
 *
 * The curated JSON is the authoritative source (P1-FINAL §13.2) and lives
 * **outside** this repository. It is reached through `ADALFI_ARTIFACT_DIR` and
 * never copied in. This module exists so the expected hash has exactly one
 * definition: it was previously written out in `tools/run-assertions.ts` and
 * again in `docs/v1-baseline-manifest.md`, and two copies of a baseline hash is
 * one copy too many.
 *
 * `docs/v1-baseline-manifest.md` remains the generated record. This constant is
 * the executable one, and the preflight fails if they disagree with reality.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { hashSourceBytes } from '../src/ingestion/source-hash.ts';

/** Relative location of the authoritative curated export inside the bundle. */
export const CURATED_SOURCE_RELATIVE = join('Agentic', 'adalfi-design-curated-tokens.json');

/**
 * SHA-256 of the curated export the Phase 1 measurements were taken against
 * (`docs/v1-baseline-manifest.md`, 876,098 bytes).
 *
 * Byte-exact by design: reformatting the export invalidates the index, which is
 * the correct conservative behaviour (§13.1.6). A legitimate re-export therefore
 * *should* fail this check until the manifest is regenerated and the measured
 * numbers are re-taken — that failure is the point, not an inconvenience.
 */
export const BASELINE_SOURCE_SHA256 =
  '2222a2b8eff4224f76ddad591cf6f46c6e8bb25ec7f96aebbf13941876356627';

export const ARTIFACT_DIR_ENV = 'ADALFI_ARTIFACT_DIR';

export type BundleStatus =
  | { readonly kind: 'unset' }
  | { readonly kind: 'missing'; readonly artifactDir: string; readonly curatedSourcePath: string }
  | {
      readonly kind: 'present';
      readonly artifactDir: string;
      readonly curatedSourcePath: string;
      readonly bytes: number;
      readonly sha256: string;
      readonly matchesBaseline: boolean;
    };

/**
 * Resolves the bundle from an injected env map. Injected rather than read from
 * `process.env` so this is testable without mutating global state — the same
 * discipline `src/config/phase1-config.ts` applies to the engine.
 */
export function inspectBundle(env: Readonly<Record<string, string | undefined>>): BundleStatus {
  const artifactDir = env[ARTIFACT_DIR_ENV];
  if (artifactDir === undefined || artifactDir.trim() === '') return { kind: 'unset' };

  const curatedSourcePath = join(artifactDir, CURATED_SOURCE_RELATIVE);
  if (!existsSync(curatedSourcePath)) return { kind: 'missing', artifactDir, curatedSourcePath };

  const bytes = readFileSync(curatedSourcePath);
  const sha256 = hashSourceBytes(bytes);
  return {
    kind: 'present',
    artifactDir,
    curatedSourcePath,
    bytes: bytes.byteLength,
    sha256,
    matchesBaseline: sha256 === BASELINE_SOURCE_SHA256,
  };
}
