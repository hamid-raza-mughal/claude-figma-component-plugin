/**
 * Preflight for the mandatory Phase 1 gate.
 *
 * The defect this closes: every source-backed test self-skips when the artifact
 * bundle is absent, and `node --test` exits 0 with skips. So a fresh clone could
 * run the full verification command, see green, and have silently not run 84 of
 * the 428 tests — including the entire resolver recall evidence. A gate that can
 * pass without its evidence is not a gate.
 *
 * This runs *before* the suite and refuses to let it start unless the
 * authoritative source is present and is the one the measurements were taken
 * against. Each check is named and reported separately, because a missing bundle
 * and a drifted bundle need different responses.
 *
 * Usage:
 *   node tools/preflight-artifacts.ts
 *   node tools/preflight-artifacts.ts --allow-source-drift   # accept a re-export
 */
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ARTIFACT_DIR_ENV, BASELINE_SOURCE_SHA256, CURATED_SOURCE_RELATIVE, inspectBundle } from './artifact-bundle.ts';

type Check = { readonly name: string; readonly ok: boolean; readonly detail: string };

export type PreflightResult = {
  readonly ok: boolean;
  readonly checks: readonly Check[];
  /** What to do about it. Empty when everything passed. */
  readonly remedy: readonly string[];
};

export function preflight(
  env: Readonly<Record<string, string | undefined>>,
  options: { readonly allowSourceDrift: boolean },
): PreflightResult {
  const status = inspectBundle(env);

  if (status.kind === 'unset') {
    return {
      ok: false,
      checks: [
        {
          name: 'artifact-bundle-configured',
          ok: false,
          detail: `${ARTIFACT_DIR_ENV} is not set`,
        },
      ],
      remedy: [
        `Set ${ARTIFACT_DIR_ENV} to the artifact bundle directory, e.g.`,
        `  ${ARTIFACT_DIR_ENV}=/path/to/Manage_DS_Components npm run verify`,
        '',
        'The bundle is a design artifact and deliberately lives outside this repository.',
        'To run the weaker source-only path on purpose (this is what CI runs), use:',
        '  npm run verify:source',
      ],
    };
  }

  const checks: Check[] = [
    {
      name: 'artifact-bundle-configured',
      ok: true,
      detail: `${ARTIFACT_DIR_ENV}=${status.artifactDir}`,
    },
  ];

  if (status.kind === 'missing') {
    checks.push({
      name: 'curated-source-present',
      ok: false,
      detail: `not found: ${status.curatedSourcePath}`,
    });
    return {
      ok: false,
      checks,
      remedy: [
        `${ARTIFACT_DIR_ENV} is set but does not contain ${CURATED_SOURCE_RELATIVE}.`,
        'Point it at the bundle root — the directory that holds Agentic/, Specs/, Evals/ and Runs/ —',
        'not at the curated JSON itself and not at a parent.',
      ],
    };
  }

  checks.push({
    name: 'curated-source-present',
    ok: true,
    detail: `${status.curatedSourcePath} (${status.bytes.toLocaleString('en')} bytes)`,
  });

  // Reported as its own check: a drifted source is a different problem from an
  // absent one, and it invalidates the measured numbers rather than the run.
  const driftOk = status.matchesBaseline || options.allowSourceDrift;
  checks.push({
    name: 'curated-source-matches-baseline',
    ok: driftOk,
    detail: status.matchesBaseline
      ? `sha256 ${status.sha256.slice(0, 12)}… matches the baseline manifest`
      : options.allowSourceDrift
        ? `sha256 ${status.sha256.slice(0, 12)}… differs from baseline ${BASELINE_SOURCE_SHA256.slice(0, 12)}… — accepted via --allow-source-drift, so measured numbers in docs/ no longer describe this source`
        : `sha256 ${status.sha256.slice(0, 12)}… differs from baseline ${BASELINE_SOURCE_SHA256.slice(0, 12)}…`,
  });

  if (!driftOk) {
    return {
      ok: false,
      checks,
      remedy: [
        'The curated export is not the one Phase 1 was measured against.',
        'This is byte-exact on purpose: a re-export invalidates the derived index and',
        'every measured number that cites the source (index entries, recall, payload %).',
        '',
        'If the re-export is intended:',
        '  1. node tools/build-baseline-manifest.ts <artifact-dir> --out docs/v1-baseline-manifest.md',
        '  2. update BASELINE_SOURCE_SHA256 in tools/artifact-bundle.ts',
        '  3. re-take the measured numbers in docs/ before quoting them again',
        '',
        'To run once against a drifted source without updating the baseline:',
        '  ADALFI_ALLOW_SOURCE_DRIFT=1 npm run verify    (measured claims are void for that run)',
      ],
    };
  }

  return { ok: true, checks, remedy: [] };
}

function main(): void {
  // Accepted as an env var as well as a flag: `npm run verify` chains several
  // commands, and npm appends forwarded arguments to the end of the chain rather
  // than to this step, so a flag alone could not reach here.
  const allowSourceDrift =
    process.argv.includes('--allow-source-drift') ||
    (process.env['ADALFI_ALLOW_SOURCE_DRIFT'] ?? '') !== '';
  const result = preflight(process.env, { allowSourceDrift });

  console.log('Phase 1 artifact preflight');
  for (const check of result.checks) {
    console.log(`  ${check.ok ? 'PASS' : 'FAIL'}  ${check.name} — ${check.detail}`);
  }

  if (!result.ok) {
    console.error('\nPreflight failed. The Phase 1 gate will not run without its evidence.\n');
    for (const line of result.remedy) console.error(line);
    process.exit(1);
  }
  console.log('  → source-backed suites will run; no test may skip.');
}

// Only when invoked directly, so `preflight` stays importable by tests without
// the import itself exiting the process.
if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main();
}
