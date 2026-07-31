/**
 * Phase 1 typed configuration.
 *
 * Portability contract (P1-FINAL §5.6, plan decision D-A):
 *   - no hard-coded project, user, plugin-install, cache or persistence path;
 *   - every file location enters through this object or an injected port;
 *   - the shared engine never reads `process.env` directly outside this module,
 *     and never assumes a working directory.
 *
 * The curated JSON lives outside this repository (it is a design artifact, not
 * source). The derived SQLite index is written to a caller-supplied directory
 * and is git-ignored, because it is rebuildable and never authoritative
 * (P1-FINAL §13.2).
 */

/** Semantic version of the derived-index *format*. Bumping this invalidates
 *  every cached index even when the source hash is unchanged (§13.1.9). */
export const INDEX_VERSION = '1.0.0';

export type Phase1Config = {
  /** Absolute path to the authoritative curated design-system JSON. */
  readonly curatedSourcePath: string;
  /** Directory for derived artifacts (SQLite index, generated schema card).
   *  Disposable and rebuildable — never the durable store's home. */
  readonly derivedDir: string;
  /** Format version of the derived index. */
  readonly indexVersion: string;
  /**
   * Phase 2 widening (§11.2.1, §11.7 row 4, v4 §F): the directory holding the
   * durable run/event store. Distinct configuration because it is a distinct
   * durability class — the run store is authoritative and must not be
   * rebuildable, unlike `derivedDir`. On R-2 this **is** the directory a human
   * explicitly approved (§1.6). Defaulting it to `derivedDir` is prohibited: it
   * would place the sole authority inside the one directory the system is
   * entitled to delete and rebuild.
   */
  readonly approvedDataDirectory: string;
};

export type Phase1ConfigInput = {
  readonly curatedSourcePath?: string | undefined;
  readonly derivedDir?: string | undefined;
  readonly indexVersion?: string | undefined;
  readonly approvedDataDirectory?: string | undefined;
};

export class ConfigError extends Error {
  override readonly name = 'ConfigError';
  /** Which config field failed. Declared explicitly rather than as a parameter
   *  property: `erasableSyntaxOnly` keeps the source runnable by Node's native
   *  type stripping, which cannot erase parameter properties. */
  readonly field: string;

  constructor(message: string, field: string) {
    super(message);
    this.field = field;
  }
}

function requireAbsolute(value: string | undefined, field: string, envHint: string): string {
  if (value === undefined || value.trim() === '') {
    throw new ConfigError(
      `${field} is required and has no default. Supply it explicitly or set ${envHint}. ` +
        'Phase 1 forbids hard-coded paths (P1-FINAL §5.6).',
      field,
    );
  }
  // Deliberately a plain check rather than `path.isAbsolute`: the rule is about
  // the contract (callers pass resolved locations), not about platform parsing.
  if (!value.startsWith('/') && !/^[A-Za-z]:[\\/]/.test(value)) {
    throw new ConfigError(`${field} must be an absolute path, received: ${value}`, field);
  }
  return value;
}

/**
 * Build a validated config. Nothing is defaulted to a filesystem location:
 * an unset value is an error, not a guess.
 */
export function resolvePhase1Config(
  input: Phase1ConfigInput = {},
  env: Readonly<Record<string, string | undefined>> = {},
): Phase1Config {
  const curatedSourcePath = requireAbsolute(
    input.curatedSourcePath ?? env['ADALFI_CURATED_SOURCE'],
    'curatedSourcePath',
    'ADALFI_CURATED_SOURCE',
  );
  const derivedDir = requireAbsolute(
    input.derivedDir ?? env['ADALFI_DERIVED_DIR'],
    'derivedDir',
    'ADALFI_DERIVED_DIR',
  );
  const indexVersion = input.indexVersion ?? env['ADALFI_INDEX_VERSION'] ?? INDEX_VERSION;
  if (!/^\d+\.\d+\.\d+$/.test(indexVersion)) {
    throw new ConfigError(`indexVersion must be semver, received: ${indexVersion}`, 'indexVersion');
  }
  const approvedDataDirectory = requireAbsolute(
    input.approvedDataDirectory ?? env['ADALFI_APPROVED_DATA_DIR'],
    'approvedDataDirectory',
    'ADALFI_APPROVED_DATA_DIR',
  );
  if (approvedDataDirectory === derivedDir) {
    throw new ConfigError(
      'approvedDataDirectory must not equal derivedDir: the durable run store is ' +
        'authoritative and must not live inside the disposable, rebuildable index ' +
        'directory (§11.2.1). Defaulting it to derivedDir is prohibited, not merely discouraged.',
      'approvedDataDirectory',
    );
  }
  return { curatedSourcePath, derivedDir, indexVersion, approvedDataDirectory };
}
