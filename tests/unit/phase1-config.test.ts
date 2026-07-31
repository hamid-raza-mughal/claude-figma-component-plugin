/**
 * Gate 0 / portability evidence (P1-FINAL §5.6): configuration is typed and
 * injected, and nothing silently defaults to a filesystem location.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { resolvePhase1Config, ConfigError, INDEX_VERSION } from '../../src/config/phase1-config.ts';

describe('resolvePhase1Config', () => {
  test('accepts explicitly injected absolute paths', () => {
    const config = resolvePhase1Config({
      curatedSourcePath: '/somewhere/adalfi-design-curated-tokens.json',
      derivedDir: '/somewhere/derived',
      approvedDataDirectory: '/somewhere/approved-data',
    });
    assert.equal(config.curatedSourcePath, '/somewhere/adalfi-design-curated-tokens.json');
    assert.equal(config.derivedDir, '/somewhere/derived');
    assert.equal(config.approvedDataDirectory, '/somewhere/approved-data');
    assert.equal(config.indexVersion, INDEX_VERSION);
  });

  test('reads from an injected env map rather than process.env', () => {
    const config = resolvePhase1Config(
      {},
      {
        ADALFI_CURATED_SOURCE: '/e/src.json',
        ADALFI_DERIVED_DIR: '/e/derived',
        ADALFI_APPROVED_DATA_DIR: '/e/approved-data',
      },
    );
    assert.equal(config.curatedSourcePath, '/e/src.json');
    assert.equal(config.approvedDataDirectory, '/e/approved-data');
  });

  /** The core of the rule: absence is an error, never a guess. */
  test('throws rather than defaulting a missing curated source', () => {
    assert.throws(
      () => resolvePhase1Config({ derivedDir: '/d' }),
      (error: unknown) =>
        error instanceof ConfigError &&
        error.field === 'curatedSourcePath' &&
        /no default/.test(error.message),
    );
  });

  test('throws rather than defaulting a missing derived dir', () => {
    assert.throws(
      () => resolvePhase1Config({ curatedSourcePath: '/s.json' }),
      (error: unknown) => error instanceof ConfigError && error.field === 'derivedDir',
    );
  });

  test('rejects relative paths', () => {
    assert.throws(
      () => resolvePhase1Config({ curatedSourcePath: './src.json', derivedDir: '/d' }),
      (error: unknown) => error instanceof ConfigError && /absolute/.test(error.message),
    );
  });

  test('rejects a non-semver index version', () => {
    assert.throws(
      () => resolvePhase1Config({ curatedSourcePath: '/s.json', derivedDir: '/d', indexVersion: 'v1' }),
      (error: unknown) => error instanceof ConfigError && error.field === 'indexVersion',
    );
  });

  /**
   * §11.2.1 / §11.7 row 4: the durable run store is a distinct configuration
   * from the disposable, rebuildable derived-index directory. Phase 2 widening.
   */
  test('throws rather than defaulting a missing approved data directory', () => {
    assert.throws(
      () => resolvePhase1Config({ curatedSourcePath: '/s.json', derivedDir: '/d' }),
      (error: unknown) => error instanceof ConfigError && error.field === 'approvedDataDirectory',
    );
  });

  /** §11.2.1: "defaulting it to derivedDir is prohibited" — not merely discouraged. */
  test('rejects an approved data directory equal to derivedDir', () => {
    assert.throws(
      () =>
        resolvePhase1Config({
          curatedSourcePath: '/s.json',
          derivedDir: '/d',
          approvedDataDirectory: '/d',
        }),
      (error: unknown) =>
        error instanceof ConfigError &&
        error.field === 'approvedDataDirectory' &&
        /must not equal derivedDir/.test(error.message),
    );
  });
});
