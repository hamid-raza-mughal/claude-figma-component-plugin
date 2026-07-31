/**
 * R-1 — Claude Code (§1.6.1). The thinnest possible host integration: reads
 * the approved configuration from the environment and hands it to the one
 * shared engine. **No engine logic lives here** — every rule, every table,
 * every Guard code is `src/guard/`, `src/store/`, `src/registry/`,
 * `src/tools/`, unchanged (§1.4). The structural test this satisfies:
 * deleting this directory must leave the engine and its own test suite
 * intact — proven in `tests/runtimes/claude-code.test.ts`.
 *
 * Local process execution, filesystem write, deterministic tool calls
 * (§1.6.1's own description of R-1) is exactly what `resolvePhase1Config` +
 * `CoordinatorEngine` already assume — there is nothing further to adapt.
 */
import { resolvePhase1Config, type Phase1Config } from '../../config/phase1-config.ts';
import { CoordinatorEngine } from '../../tools/engine.ts';

/**
 * Resolves the engine's configuration from the environment Claude Code
 * exposes to a local process — the same four variables every test in this
 * repository already injects explicitly, read here from `process.env` for
 * the one time an engine is actually run, not tested.
 */
export function resolveClaudeCodeConfig(env: Readonly<Record<string, string | undefined>>): Phase1Config {
  return resolvePhase1Config({}, env);
}

/**
 * Builds the engine for this runtime. `phase1Config` is re-resolved from the
 * environment on every call rather than captured once, so a config change
 * between calls (or a genuinely different process reading the same
 * environment, per §11.6.2's multi-host scenario) is never silently stale.
 */
export function createClaudeCodeEngine(env: Readonly<Record<string, string | undefined>> = process.env): CoordinatorEngine {
  return new CoordinatorEngine({
    phase1Config: () => resolveClaudeCodeConfig(env),
  });
}
