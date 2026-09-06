/**
 * R-1's tool boundary (MB-2): the one deterministic entry point the host turn
 * reaches the Guard-mediated tool surface through.
 *
 * **This is an adapter, not an engine.** Every rule, every table and every
 * refusal belongs to `CoordinatorEngine`; this file parses `argv`, calls one
 * method, and serialises what comes back (§1.4 — one engine, two host
 * integrations). Deleting `src/runtimes/` must still leave the engine and its
 * own suite intact, which `tests/runtimes/claude-code.test.ts` asserts.
 *
 * **The contract with its caller, which the orchestration skill depends on:**
 * exactly one JSON object is written to stdout, whether the call succeeded or
 * was refused. A refusal is a *result*, not a crash — it carries the Guard's
 * own code (`G-3a`, `G-11`, `G-21`, …) so the turn can surface what happened
 * rather than guess from a stack trace. Exit status is 0 for a success and
 * non-zero otherwise, so a caller that only checks the exit code still cannot
 * mistake a refusal for a run.
 *
 * **`expireRun` is deliberately absent from `TOOLS`.** §13 makes it
 * Guard-initiated only, evaluated lazily on access and never scheduled —
 * exposing it here would hand a caller the ability to terminate its own run
 * and call the result an expiry. The absence gets a test, not a sentence
 * (`tests/plugin/cli-surface.test.ts`).
 *
 * `list_by_category`, the raw curated source and every Figma capability are
 * likewise absent from every surface (§12.2, SA-17/18/26), and tested for.
 */
import { readFileSync } from 'node:fs';
import { createClaudeCodeEngine } from './index.ts';
import type { CoordinatorEngine } from '../../tools/engine.ts';
import type { CoordinatorJudgmentDraft } from '../../contracts/coordinator-draft.ts';
import type { ObservedComponentTreeRef } from '../../contracts/invocation.ts';
import type { ClarificationAnswer, RecordApprovalDecision } from '../../tools/engine.ts';

/** How one declared parameter arrives on the command line. `json-file` exists
 *  because a draft is far too large to pass as an argument, and inlining JSON
 *  into a shell word is where quoting defects live. */
export type ParamKind = 'string' | 'integer' | 'json-file';

export type ParamSpec = {
  /** The `--flag` a caller writes, without the dashes. */
  readonly flag: string;
  readonly kind: ParamKind;
  readonly required: boolean;
  readonly describe: string;
};

export type ToolSpec = {
  /** The subcommand a caller types. */
  readonly name: string;
  /** The engine method it maps to — the stable identity, as §2.7 is for commands. */
  readonly tool: string;
  readonly params: readonly ParamSpec[];
  readonly describe: string;
  readonly run: (engine: CoordinatorEngine, args: ParsedArgs) => unknown;
};

export type ParsedArgs = {
  readonly strings: Readonly<Record<string, string>>;
  readonly integers: Readonly<Record<string, number>>;
  readonly json: Readonly<Record<string, unknown>>;
};

export class CliUsageError extends Error {
  override readonly name = 'CliUsageError';
  readonly code = 'CLI_USAGE';
}

function requireString(args: ParsedArgs, flag: string): string {
  const value = args.strings[flag];
  if (value === undefined) throw new CliUsageError(`--${flag} is required.`);
  return value;
}

function requireInteger(args: ParsedArgs, flag: string): number {
  const value = args.integers[flag];
  if (value === undefined) throw new CliUsageError(`--${flag} is required.`);
  return value;
}

function requireJson(args: ParsedArgs, flag: string): unknown {
  const value = args.json[flag];
  if (value === undefined) throw new CliUsageError(`--${flag} is required.`);
  return value;
}

function optionalJson(args: ParsedArgs, flag: string): unknown {
  return args.json[flag];
}

/** §8.3's terminal failure classes, the only values `failRun` accepts. */
function asDecision(value: string): RecordApprovalDecision {
  if (value === 'approved' || value === 'rejected' || value === 'changes-requested') return value;
  throw new CliUsageError(`--decision must be approved | rejected | changes-requested, got "${value}".`);
}

function asCloseOutcome(value: string): 'completed' | 'blocked' {
  if (value === 'completed' || value === 'blocked') return value;
  throw new CliUsageError(`--outcome must be completed | blocked, got "${value}".`);
}

function asMaintenanceOperation(value: string): 'source.refresh' | 'source.validate' {
  if (value === 'source.refresh' || value === 'source.validate') return value;
  throw new CliUsageError(`--operation-id must be source.refresh | source.validate, got "${value}".`);
}

const RUN_ID: ParamSpec = { flag: 'run-id', kind: 'string', required: true, describe: 'the run_id beginRun minted' };

/**
 * The tool table. Data, not branches — the same discipline §2.8 imposes on the
 * command registry, and for the same reason: a `switch` over tool names is a
 * second place the surface is defined, and only one of the two gets tested.
 */
export const TOOLS: readonly ToolSpec[] = [
  {
    name: 'resolve-command',
    tool: 'resolveCommand',
    describe: 'Resolve a public command string to its stable operation ID (G-14 refuses an unknown one).',
    params: [{ flag: 'public-name', kind: 'string', required: true, describe: 'the command a designer typed' }],
    run: (engine, args) => engine.resolveCommand(requireString(args, 'public-name')),
  },
  {
    name: 'begin-run',
    tool: 'beginRun',
    describe: 'Start a run. run_type, run_id, display_id and route provenance are all derived or minted here — never supplied (G-15).',
    params: [
      { flag: 'operation-id', kind: 'string', required: true, describe: 'the operation ID resolve-command returned' },
      { flag: 'user-intent', kind: 'string', required: true, describe: "the designer's request, verbatim (§2.3)" },
      { flag: 'target-file', kind: 'json-file', required: false, describe: 'an ObservedComponentTreeRef; modify/audit only, and gated' },
    ],
    run: (engine, args) => {
      const target = optionalJson(args, 'target-file') as ObservedComponentTreeRef | undefined;
      return engine.beginRun(
        target === undefined
          ? { operation_id: requireString(args, 'operation-id'), user_intent: requireString(args, 'user-intent') }
          : {
              operation_id: requireString(args, 'operation-id'),
              user_intent: requireString(args, 'user-intent'),
              target,
            },
      );
    },
  },
  {
    name: 'resume-run',
    tool: 'resumeRun',
    describe: 'Re-enter an existing run by run_id or display_id. Never mints a new id (§2.5).',
    params: [{ flag: 'run', kind: 'string', required: true, describe: 'a run_id or a display_id like new-7F3K2Q1B' }],
    run: (engine, args) => engine.resumeRun(requireString(args, 'run')),
  },
  {
    name: 'prepare-context',
    tool: 'prepareContext',
    describe: 'Wholly deterministic (§4.1). Returns bounded candidates, the schema card and the route module.',
    params: [RUN_ID],
    run: (engine, args) => engine.prepareContext(requireString(args, 'run-id')),
  },
  {
    name: 'submit-draft',
    tool: 'submitDraft',
    describe: 'The seam (§4.3): the turn submits, deterministic code judges. Composes and, on ready, persists the artifact.',
    params: [
      RUN_ID,
      { flag: 'draft-file', kind: 'json-file', required: true, describe: 'a CoordinatorJudgmentDraft, written to a file' },
    ],
    run: (engine, args) =>
      engine.submitDraft(requireString(args, 'run-id'), requireJson(args, 'draft-file') as CoordinatorJudgmentDraft),
  },
  {
    name: 'open-clarification',
    tool: 'openClarification',
    describe: 'Open the gaps the submitted draft already carries. Gaps are read from the draft, never re-supplied (§13).',
    params: [RUN_ID],
    run: (engine, args) => engine.openClarification(requireString(args, 'run-id')),
  },
  {
    name: 'answer-clarification',
    tool: 'answerClarification',
    describe: 'Supply answers for one open round. Voids every approval bound to the superseded artifact (§5.4, §7.5).',
    params: [
      RUN_ID,
      { flag: 'round', kind: 'integer', required: true, describe: 'the round openClarification returned' },
      { flag: 'answers-file', kind: 'json-file', required: true, describe: 'an array of {gap_id, answer}' },
    ],
    run: (engine, args) =>
      engine.answerClarification(
        requireString(args, 'run-id'),
        requireInteger(args, 'round'),
        requireJson(args, 'answers-file') as readonly ClarificationAnswer[],
      ),
  },
  {
    name: 'present-for-approval',
    tool: 'presentForApproval',
    describe: 'Read the stored artifact and render the approval view. Composes nothing, hashes nothing (§4.5).',
    params: [RUN_ID],
    run: (engine, args) => engine.presentForApproval(requireString(args, 'run-id')),
  },
  {
    name: 'record-approval',
    tool: 'recordApproval',
    describe: 'Record the designer’s response. Observe-only and non-authorizing (§7.1); approved_by is attribution only (§7.4.2, G-17).',
    params: [
      RUN_ID,
      { flag: 'decision', kind: 'string', required: true, describe: 'approved | rejected | changes-requested' },
      { flag: 'approved-by', kind: 'string', required: true, describe: 'who the response is attributed to — unverified' },
    ],
    run: (engine, args) =>
      engine.recordApproval(
        requireString(args, 'run-id'),
        asDecision(requireString(args, 'decision')),
        requireString(args, 'approved-by'),
      ),
  },
  {
    name: 'build-handoff',
    tool: 'buildHandoff',
    describe: 'Build the machine handoff, embedding the approval record. Records next_route without following it (§3.5).',
    params: [RUN_ID],
    run: (engine, args) => engine.buildHandoff(requireString(args, 'run-id')),
  },
  {
    name: 'close-run',
    tool: 'closeRun',
    describe: 'Terminate the run. `completed` is G-10’s four-value agreement check (§9.2.1).',
    params: [
      RUN_ID,
      { flag: 'outcome', kind: 'string', required: true, describe: 'completed | blocked' },
    ],
    run: (engine, args) => engine.closeRun(requireString(args, 'run-id'), asCloseOutcome(requireString(args, 'outcome'))),
  },
  {
    name: 'fail-run',
    tool: 'failRun',
    describe: 'Close the run failed with a terminal failure class (§8).',
    params: [
      RUN_ID,
      { flag: 'failure-class', kind: 'string', required: true, describe: 'a terminal failure class' },
    ],
    run: (engine, args) => engine.failRun(requireString(args, 'run-id'), requireString(args, 'failure-class')),
  },
  {
    name: 'cancel-run',
    tool: 'cancelRun',
    describe: 'Cancel a non-terminal run. Already-terminal is refused, not a no-op (§8).',
    params: [RUN_ID],
    run: (engine, args) => engine.cancelRun(requireString(args, 'run-id')),
  },
  {
    name: 'run-maintenance',
    tool: 'runMaintenance',
    describe: 'Run a maintenance operation. Never enters a run, a phase or a gate (§2.11).',
    params: [
      { flag: 'operation-id', kind: 'string', required: true, describe: 'source.refresh | source.validate' },
    ],
    run: (engine, args) => engine.runMaintenance(asMaintenanceOperation(requireString(args, 'operation-id'))),
  },
];

const BY_NAME = new Map(TOOLS.map((spec) => [spec.name, spec]));

export function lookupTool(name: string): ToolSpec | undefined {
  return BY_NAME.get(name);
}

/**
 * `--flag value` and `--flag=value` only. No positional arguments beyond the
 * subcommand, no short flags, no implicit booleans: every one of those is a
 * place a caller's intent can be silently reinterpreted, and this boundary's
 * whole value is that it does exactly what it was told or refuses.
 */
export function parseArgs(spec: ToolSpec, argv: readonly string[], readFile: (path: string) => string = (path) => readFileSync(path, 'utf8')): ParsedArgs {
  const raw = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === undefined) continue;
    if (!token.startsWith('--')) throw new CliUsageError(`Unexpected argument "${token}" — every parameter is a --flag.`);
    const equals = token.indexOf('=');
    let flag: string;
    let value: string | undefined;
    if (equals === -1) {
      flag = token.slice(2);
      value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) throw new CliUsageError(`--${flag} needs a value.`);
      i += 1;
    } else {
      flag = token.slice(2, equals);
      value = token.slice(equals + 1);
    }
    if (raw.has(flag)) throw new CliUsageError(`--${flag} was given twice.`);
    raw.set(flag, value);
  }

  const declared = new Set(spec.params.map((param) => param.flag));
  for (const flag of raw.keys()) {
    if (!declared.has(flag)) {
      throw new CliUsageError(`"${spec.name}" has no --${flag}. Declared: ${[...declared].map((f) => `--${f}`).join(' ')}`);
    }
  }

  const strings: Record<string, string> = {};
  const integers: Record<string, number> = {};
  const json: Record<string, unknown> = {};
  for (const param of spec.params) {
    const value = raw.get(param.flag);
    if (value === undefined) {
      if (param.required) throw new CliUsageError(`"${spec.name}" requires --${param.flag}: ${param.describe}`);
      continue;
    }
    if (param.kind === 'string') {
      strings[param.flag] = value;
    } else if (param.kind === 'integer') {
      if (!/^-?\d+$/.test(value)) throw new CliUsageError(`--${param.flag} must be an integer, got "${value}".`);
      integers[param.flag] = Number.parseInt(value, 10);
    } else {
      let text: string;
      try {
        text = readFile(value);
      } catch {
        throw new CliUsageError(`--${param.flag} names a file that cannot be read: ${value}`);
      }
      try {
        json[param.flag] = JSON.parse(text);
      } catch (error) {
        throw new CliUsageError(`--${param.flag} is not valid JSON (${value}): ${(error as Error).message}`);
      }
    }
  }
  return { strings, integers, json };
}

export type CliEnvelope =
  | { readonly ok: true; readonly tool: string; readonly result: unknown }
  | {
      readonly ok: false;
      readonly tool: string;
      readonly error: {
        readonly code: string;
        readonly enforced_by: string | null;
        readonly message: string;
      };
    };

/** Mirrors the engine's own `errorCodeOf`: prefer a declared `.code` over the
 *  generic `.name`, so a refusal arrives diagnosable rather than as `Error`. */
function envelopeError(tool: string, error: unknown): CliEnvelope {
  const code =
    typeof error === 'object' && error !== null && 'code' in error && typeof (error as { code: unknown }).code === 'string'
      ? (error as { code: string }).code
      : error instanceof Error
        ? error.name
        : 'UNKNOWN';
  const enforcedBy =
    typeof error === 'object' && error !== null && 'enforcedBy' in error && typeof (error as { enforcedBy: unknown }).enforcedBy === 'string'
      ? (error as { enforcedBy: string }).enforcedBy
      : null;
  return {
    ok: false,
    tool,
    error: { code, enforced_by: enforcedBy, message: error instanceof Error ? error.message : String(error) },
  };
}

export function usage(): string {
  const lines = ['Manage DS Components — the Coordinator tool boundary.', '', 'Tools:'];
  for (const spec of TOOLS) {
    lines.push(`  ${spec.name}`);
    lines.push(`      ${spec.describe}`);
    for (const param of spec.params) {
      lines.push(`      --${param.flag} <${param.kind}>${param.required ? '' : '   (optional)'}  ${param.describe}`);
    }
  }
  return lines.join('\n');
}

/**
 * Runs one tool and returns the envelope. Separated from `main` so the whole
 * boundary is testable in-process, and separately spawnable as a real OS
 * process — which `tests/plugin/cli-cross-process.test.ts` does, because a
 * same-process test cannot prove a second process reads the same store.
 */
export function runCli(
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
  makeEngine: (e: Readonly<Record<string, string | undefined>>) => CoordinatorEngine = createClaudeCodeEngine,
): CliEnvelope {
  const name = argv[0];
  if (name === undefined || name === '--help' || name === '-h') {
    return envelopeError('(none)', new CliUsageError(usage()));
  }
  const spec = lookupTool(name);
  if (spec === undefined) {
    return envelopeError(
      name,
      new CliUsageError(`Unknown tool "${name}". Declared: ${TOOLS.map((t) => t.name).join(', ')}`),
    );
  }
  try {
    const args = parseArgs(spec, argv.slice(1));
    const engine = makeEngine(env);
    return { ok: true, tool: spec.tool, result: spec.run(engine, args) };
  } catch (error: unknown) {
    return envelopeError(spec.tool, error);
  }
}

function main(): void {
  const envelope = runCli(process.argv.slice(2), process.env);
  process.stdout.write(`${JSON.stringify(envelope, null, 2)}\n`);
  process.exitCode = envelope.ok ? 0 : 1;
}

if (process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`) {
  main();
}
