/**
 * The tool boundary's surface (MB-2), checked against the transition registry
 * rather than against a list written twice.
 *
 * The absences are the point. `expireRun` is Guard-initiated only (§13,
 * §3.3.2) and must not be reachable from a caller; `list_by_category`, the raw
 * curated source and every Figma capability are absent from every surface
 * (§12.2, SA-17/18/26). "An absence is exactly the kind of claim that rots
 * silently, so it gets a test rather than a sentence in a document"
 * (`tests/unit/portability.test.ts`).
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  TOOLS,
  lookupTool,
  parseArgs,
  runCli,
  usage,
  CliUsageError,
  type ToolSpec,
} from '../../src/runtimes/claude-code/cli.ts';
import { TOOL_NAMES, GUARD_ONLY_TOOLS, NON_PHASE_SCOPED_TOOLS } from '../../src/registry/transitions.ts';
import { CoordinatorEngine } from '../../src/tools/engine.ts';
import { newPhase1Config } from '../tools/fixtures.ts';

const CLI_FILE = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'runtimes', 'claude-code', 'cli.ts');

function specFor(tool: string): ToolSpec {
  const found = TOOLS.find((entry) => entry.tool === tool);
  assert.ok(found !== undefined, `no CLI tool maps to ${tool}`);
  return found;
}

describe('the boundary exposes exactly the caller-reachable tools (§13)', () => {
  test('every §13 tool that is not Guard-only is exposed', () => {
    const exposed = new Set(TOOLS.map((spec) => spec.tool));
    const expected = TOOL_NAMES.filter((name) => !GUARD_ONLY_TOOLS.includes(name));
    assert.deepEqual([...expected].sort(), [...exposed].sort());
  });

  test('expireRun is NOT exposed — it is Guard-initiated only, never model-callable', () => {
    for (const guardOnly of GUARD_ONLY_TOOLS) {
      assert.ok(
        !TOOLS.some((spec) => spec.tool === guardOnly),
        `${guardOnly} must not be reachable from the tool boundary`,
      );
    }
    // And not under a different subcommand spelling either.
    assert.equal(lookupTool('expire-run'), undefined);
    assert.equal(lookupTool('expireRun'), undefined);
  });

  test('the tool table is data — no switch over tool names', () => {
    const text = readFileSync(CLI_FILE, 'utf8');
    assert.ok(!/switch\s*\(/.test(text), 'a switch over tool names is a second definition of the surface');
  });

  test('every subcommand name is unique and kebab-case', () => {
    const names = TOOLS.map((spec) => spec.name);
    assert.equal(new Set(names).size, names.length);
    for (const name of names) assert.match(name, /^[a-z][a-z-]*$/);
  });

  test('every tool declares a description and every parameter declares one too', () => {
    for (const spec of TOOLS) {
      assert.ok(spec.describe.length > 0, `${spec.name} has no description`);
      for (const param of spec.params) assert.ok(param.describe.length > 0, `${spec.name} --${param.flag} has none`);
    }
    assert.ok(usage().includes('resolve-command'));
  });
});

describe('the fields a caller may never supply have no flag to supply them through (G-15)', () => {
  const forbidden = ['run-type', 'run_type', 'display-id', 'display_id', 'route-provenance', 'route-verified', 'verified', 'authorizing', 'gate-mode'];

  test('begin-run declares only operation-id, user-intent and an optional target', () => {
    const flags = specFor('beginRun').params.map((param) => param.flag).sort();
    assert.deepEqual(flags, ['operation-id', 'target-file', 'user-intent']);
  });

  test('no tool anywhere declares a derived or minted field as a parameter', () => {
    const offenders: string[] = [];
    for (const spec of TOOLS) {
      for (const param of spec.params) {
        if (forbidden.includes(param.flag)) offenders.push(`${spec.name} --${param.flag}`);
      }
    }
    assert.deepEqual(offenders, []);
  });

  test('record-approval offers no way to claim the approval is verified or authorizing (G-9b)', () => {
    const flags = specFor('recordApproval').params.map((param) => param.flag).sort();
    assert.deepEqual(flags, ['approved-by', 'decision', 'run-id']);
  });

  test('no tool accepts a phase, a round count it did not derive, or an attempt number (§13.1)', () => {
    // `answer-clarification --round` is the one round-shaped flag, and it is an
    // *echo* the engine compares against its own derived count and refuses on
    // mismatch — not an authority. Everything else must be absent.
    const roundFlags = TOOLS.flatMap((spec) =>
      spec.params.filter((param) => /round|attempt|phase|count|budget/.test(param.flag)).map((param) => `${spec.name} --${param.flag}`),
    );
    assert.deepEqual(roundFlags, ['answer-clarification --round']);
  });
});

describe('the boundary names no capability it does not have', () => {
  const text = readFileSync(CLI_FILE, 'utf8');
  const code = text
    .split('\n')
    .filter((line) => !/^\s*(?:\/\/|\*|\/\*)/.test(line))
    .join('\n');

  // AC-23: each of these was narrower than the prohibition it names. An audit
  // appended real code to a copy of `cli.ts` and walked past five of the six:
  // `worker_threads` for the subprocess rule, a variable-held `globalThis.fetch`
  // and a third-party client for the network rule, `claude --print` for the
  // model rule, and `process.env['ADALFI_CURATED_SOURCE']` for the source rule.
  for (const [what, pattern] of [
    ['list_by_category', /list_by_category|listByCategory|CALLER_RUN_GUARD/],
    ['a Figma capability', /figma/i],
    ['a network client', /['"`](?:node:)?(?:http|https|http2|net|dgram|tls)['"`]|\bfetch\s*\(|\[['"`]fetch['"`]\]|['"`](?:undici|got|axios|node-fetch)['"`]/],
    ['a second model invocation', /@anthropic-ai|messages\.create|claude\s+(?:-p\b|--print\b)|api\.anthropic\.com/],
    ['a subprocess', /['"`](?:node:)?(?:child_process|worker_threads)['"`]/],
    ['the raw curated source', /curatedSourcePath|curated\.json|ADALFI_CURATED_SOURCE/],
  ] as const) {
    test(`no ${what} in the tool boundary`, () => {
      assert.ok(!pattern.test(code), `${what} appears in cli.ts`);
    });
  }

  test('the boundary scan covers the whole runtime adapter, not just one file (AC-23)', () => {
    // `src/runtimes/claude-code/index.ts` is the other half of the boundary and
    // was scanned by nothing but the (previously evadable) portability rules.
    const adapter = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'runtimes', 'claude-code', 'index.ts'), 'utf8');
    for (const pattern of [/['"`](?:node:)?(?:child_process|worker_threads)['"`]/, /\bfetch\s*\(/, /@anthropic-ai/]) {
      assert.ok(!pattern.test(adapter), 'the runtime adapter must obey the boundary’s prohibitions too');
    }
  });
});

describe('argument parsing refuses rather than reinterprets', () => {
  const spec = specFor('resolveCommand');

  test('--flag value and --flag=value both work', () => {
    assert.equal(parseArgs(spec, ['--public-name', '/create-component']).strings['public-name'], '/create-component');
    assert.equal(parseArgs(spec, ['--public-name=/create-component']).strings['public-name'], '/create-component');
  });

  test('a positional argument is refused, never guessed at', () => {
    assert.throws(() => parseArgs(spec, ['/create-component']), CliUsageError);
  });

  test('an undeclared flag is refused and the declared ones are named', () => {
    assert.throws(
      () => parseArgs(spec, ['--publik-name', 'x']),
      (error: unknown) => error instanceof CliUsageError && error.message.includes('--public-name'),
    );
  });

  test('a flag given twice is refused rather than last-one-wins', () => {
    assert.throws(() => parseArgs(spec, ['--public-name', 'a', '--public-name', 'b']), CliUsageError);
  });

  test('a missing required flag is refused with what it is for', () => {
    assert.throws(
      () => parseArgs(spec, []),
      (error: unknown) => error instanceof CliUsageError && error.message.includes('requires --public-name'),
    );
  });

  test('a flag with no value is refused rather than swallowing the next flag', () => {
    const draft = specFor('submitDraft');
    assert.throws(() => parseArgs(draft, ['--run-id', '--draft-file', 'x.json']), CliUsageError);
  });

  test('an integer flag refuses a non-integer', () => {
    const answer = specFor('answerClarification');
    assert.throws(
      () => parseArgs(answer, ['--run-id', 'r', '--round', 'two', '--answers-file', 'x'], () => '[]'),
      CliUsageError,
    );
  });

  test('a json-file flag refuses an unreadable path and invalid JSON, distinguishably', () => {
    const draft = specFor('submitDraft');
    assert.throws(
      () => parseArgs(draft, ['--run-id', 'r', '--draft-file', '/nope'], () => { throw new Error('ENOENT'); }),
      (error: unknown) => error instanceof CliUsageError && error.message.includes('cannot be read'),
    );
    assert.throws(
      () => parseArgs(draft, ['--run-id', 'r', '--draft-file', '/x'], () => '{not json'),
      (error: unknown) => error instanceof CliUsageError && error.message.includes('not valid JSON'),
    );
  });
});

describe('the envelope: one JSON object, refusal included', () => {
  function cli(argv: readonly string[]) {
    const config = newPhase1Config();
    return runCli(argv, {}, () => new CoordinatorEngine({ phase1Config: () => config }));
  }

  test('a success carries ok:true, the engine tool name, and the result', () => {
    const envelope = cli(['resolve-command', '--public-name', '/create-component']);
    assert.equal(envelope.ok, true);
    assert.equal(envelope.tool, 'resolveCommand');
    if (envelope.ok) assert.deepEqual(envelope.result, { operation_id: 'component.create', kind: 'route' });
  });

  test('a Guard refusal is a result, not a crash — with its code and its owner', () => {
    const config = newPhase1Config();
    const engine = new CoordinatorEngine({ phase1Config: () => config });
    const begun = engine.beginRun({ operation_id: 'component.create', user_intent: 'x' });
    const envelope = runCli(['build-handoff', '--run-id', begun.run_id], {}, () => engine);
    assert.equal(envelope.ok, false);
    if (!envelope.ok) {
      assert.equal(envelope.error.code, 'G-11');
      assert.equal(envelope.error.enforced_by, 'run-guard');
      assert.ok(envelope.error.message.includes('§12.2'));
    }
  });

  test('a capability-gated route refuses at G-3a through the boundary too', () => {
    const envelope = cli(['begin-run', '--operation-id', 'component.audit', '--user-intent', 'x']);
    assert.equal(envelope.ok, false);
    if (!envelope.ok) assert.equal(envelope.error.code, 'G-3a');
  });

  test('an unknown tool is refused and the declared ones are listed', () => {
    const envelope = cli(['frobnicate']);
    assert.equal(envelope.ok, false);
    if (!envelope.ok) {
      assert.equal(envelope.error.code, 'CLI_USAGE');
      assert.ok(envelope.error.message.includes('resolve-command'));
    }
  });

  test('no arguments at all yields usage rather than a stack trace', () => {
    const envelope = runCli([], {}, () => { throw new Error('the engine must not be built to print usage'); });
    assert.equal(envelope.ok, false);
    if (!envelope.ok) assert.ok(envelope.error.message.includes('Tools:'));
  });

  test('an unset configuration variable is named, not defaulted (SA-45 / HD-2)', () => {
    const envelope = runCli(['resolve-command', '--public-name', '/create-component'], {});
    assert.equal(envelope.ok, false);
    if (!envelope.ok) {
      assert.equal(envelope.error.code, 'ConfigError');
      assert.ok(envelope.error.message.includes('ADALFI_CURATED_SOURCE'));
    }
  });
});

describe('every exposed tool is one the registry knows, and phase-scoping is unchanged', () => {
  test('each CLI tool name is a TOOL_NAMES member', () => {
    for (const spec of TOOLS) {
      assert.ok((TOOL_NAMES as readonly string[]).includes(spec.tool), `${spec.tool} is not a registered tool`);
    }
  });

  test('the four non-phase-scoped tools are all exposed — they are how a run is entered or resumed', () => {
    for (const tool of NON_PHASE_SCOPED_TOOLS) {
      assert.ok(TOOLS.some((spec) => spec.tool === tool), `${tool} must be reachable`);
    }
  });
});
