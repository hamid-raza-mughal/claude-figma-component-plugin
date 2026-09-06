/**
 * The orchestration skill is a **load-bearing document**, and this repository
 * has already paid for what happens when a load-bearing reference lives only
 * in prose: D-1, D-2, D-3 and D-7 all survived a fully green suite because
 * their targets sat inside sentences, and D-4 is the root cause — a checker
 * comparing whole strings never matches a token inside one.
 *
 * So every identifier the skill names is resolved against the thing that
 * defines it: tool names against the CLI's declared table, Guard codes against
 * `GUARD_CODES`, phase names against `STAGE_PHASES`, and each tool the skill
 * tells the turn to call from a phase against `isToolReachableFromPhase`. A
 * sentence in `SKILL.md` that names something no longer real fails here.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TOOLS, lookupTool } from '../../src/runtimes/claude-code/cli.ts';
import { GUARD_CODES } from '../../src/guard/errors.ts';
import { isToolReachableFromPhase, type ToolName } from '../../src/registry/transitions.ts';
import { STAGE_PHASES } from '../../src/contracts/run-envelope.ts';
import { readCommandFiles, COMMANDS_DIR, parseFrontmatter } from '../../tools/command-surface.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SKILL_DIR = join(ROOT, 'skills', 'coordinator-run');
const SKILL = join(SKILL_DIR, 'SKILL.md');
const TEXT = readFileSync(SKILL, 'utf8');

function collectTs(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...collectTs(full));
    else if (entry.endsWith('.ts')) out.push(full);
  }
  return out;
}

/** The subcommand names the skill instructs the turn to type. */
const SUBCOMMANDS = new Set(TOOLS.map((spec) => spec.name));

/** Hyphenated terms the skill legitimately names that are not subcommands.
 *  Kept as one list so a new phase or vocabulary item is added deliberately,
 *  in one place, rather than by widening a regex until nothing fails. */
const KNOWN_NON_TOOLS = new Set([
  'awaiting-approval', 'awaiting-clarification', 'handoff-ready', 'changes-requested',
  'observe-only-validation', 'source-invalidated', 'model-relayed', 'read-plane',
  'run-guard', 'gate-1-semantic', 'broadened-retrieval',
]);

function subcommandsNamedIn(text: string): readonly string[] {
  const found = new Set<string>();
  for (const name of SUBCOMMANDS) {
    if (new RegExp(`(?<![a-z-])${name}(?![a-z-])`).test(text)) found.add(name);
  }
  return [...found].sort();
}

describe('the skill exists and is loadable', () => {
  test('SKILL.md declares a name and a description', () => {
    const frontmatter = parseFrontmatter(TEXT);
    assert.equal(frontmatter['name'], 'coordinator-run');
    assert.ok((frontmatter['description'] ?? '').length > 40, 'the description is how a host decides to load it');
  });

  test('the skill directory name matches the declared name', () => {
    assert.ok(readdirSync(join(ROOT, 'skills')).includes('coordinator-run'));
  });
});

describe('every identifier the skill names resolves to something real', () => {
  test('every subcommand the skill instructs a caller to type is declared by the boundary', () => {
    // AC-15: this used to match `cli.ts\s+([a-z][a-z-]*)`, which extracted
    // **zero** tokens from the real document — both `cli.ts` occurrences are
    // followed by `<tool>` and `--help`, neither of which starts with `[a-z]`.
    // `assert.deepEqual([], [])` then passed while checking nothing, and the
    // dead `name !== '--help'` guard was the tell: it can never fire.
    // The skill names its subcommands in backticks and in the step list, so
    // that is what is read.
    const named = [
      ...[...TEXT.matchAll(/`([a-z][a-z-]+)(?:\s+--|`)/g)].map((match) => match[1] ?? ''),
      ...[...TEXT.matchAll(/\*\*`([a-z][a-z-]+)/g)].map((match) => match[1] ?? ''),
    ];
    const subcommandShaped = named.filter((name) => name.includes('-'));
    assert.ok(subcommandShaped.length >= 10, `extracted ${subcommandShaped.length} tokens — the check would be vacuous`);
    const offenders = [...new Set(subcommandShaped)].filter(
      (name) => !SUBCOMMANDS.has(name) && !KNOWN_NON_TOOLS.has(name),
    );
    assert.deepEqual(offenders, [], 'the skill names a hyphenated token that is neither a subcommand nor a known term');
  });

  test('every backticked `x-y` token that looks like a subcommand is one', () => {
    const candidates = [...TEXT.matchAll(/`([a-z]+(?:-[a-z]+)+)(?:\s|`)/g)].map((match) => match[1] ?? '');
    const offenders = candidates.filter((token) => !SUBCOMMANDS.has(token) && !KNOWN_NON_TOOLS.has(token));
    assert.deepEqual(offenders, [], 'an unrecognised hyphenated token — either a typo’d tool or a new phase to declare');
  });

  test('every Guard code the skill names is a declared GUARD_CODES member', () => {
    const named = [...new Set([...TEXT.matchAll(/\bG-\d+[a-c]?\b/g)].map((match) => match[0]))];
    assert.ok(named.length >= 5, 'the refusal table is the reason this skill can be followed safely');
    const offenders = named.filter((code) => !(GUARD_CODES as readonly string[]).includes(code));
    assert.deepEqual(offenders, [], 'the skill names a Guard code the engine does not define — the D-1 defect');
  });

  test('every Guard code the skill tells the turn it will SEE is one some code path throws (AC-14)', () => {
    // Declaration is not emission, and the difference is the whole D-1 shape.
    // The skill's refusal table is the turn's dispatch table: a row keyed on a
    // code nothing constructs is dead instruction, and the check above passed
    // on `G-7` while no `GuardRefusal('G-7', …)` existed anywhere.
    const thrown = new Set<string>();
    for (const file of collectTs(join(ROOT, 'src'))) {
      const source = readFileSync(file, 'utf8');
      // Two forms, because two exist. Most codes are thrown directly; the
      // store preflight instead *returns* `guardCode: 'G-20a' | 'G-20c'` and
      // the engine wraps that into a GuardRefusal, so a scan for the
      // constructor alone would call two live codes dead. The first version of
      // this check did exactly that.
      for (const match of source.matchAll(/GuardRefusal\(\s*'(G-\d+[a-c]?)'/g)) thrown.add(match[1] ?? '');
      for (const match of source.matchAll(/guardCode:\s*'(G-\d+[a-c]?)'/g)) thrown.add(match[1] ?? '');
    }
    assert.ok(thrown.size >= 10, `only ${thrown.size} codes found thrown — the scan is broken, not the skill`);
    const named = [...new Set([...TEXT.matchAll(/\bG-\d+[a-c]?\b/g)].map((match) => match[0]))];
    const dead = named.filter((code) => !thrown.has(code));
    assert.deepEqual(dead, [], 'the skill documents a refusal no code path can produce');
  });

  test('every phase name the skill names is a declared StagePhase', () => {
    const named = [...new Set([...TEXT.matchAll(/`(received|preparing|drafting|validating|terminal|awaiting-[a-z]+|handoff-ready)`/g)].map((m) => m[1] ?? ''))];
    const offenders = named.filter((phase) => !(STAGE_PHASES as readonly string[]).includes(phase));
    assert.deepEqual(offenders, []);
    // And the skill's table must cover every phase, not a convenient subset.
    for (const phase of STAGE_PHASES) {
      assert.ok(TEXT.includes(`\`${phase}\``), `the skill's phase table omits "${phase}"`);
    }
  });

  test('every environment variable the skill names is one the config module reads', () => {
    const configText = readFileSync(join(ROOT, 'src', 'config', 'phase1-config.ts'), 'utf8');
    const named = [...new Set([...TEXT.matchAll(/\bADALFI_[A-Z_]+\b/g)].map((match) => match[0]))];
    assert.ok(named.length === 3, `expected the three configuration variables, found ${named.join(', ')}`);
    for (const variable of named) {
      assert.ok(configText.includes(variable), `the skill names ${variable}, which the config module never reads`);
    }
  });

  test('the boundary path the skill tells a caller to run actually exists', () => {
    const match = TEXT.match(/\$\{CLAUDE_PLUGIN_ROOT\}\/([^"'\s]+cli\.ts)/);
    assert.ok(match !== null, 'the skill must name the boundary path');
    assert.ok(readFileSync(join(ROOT, match[1] ?? ''), 'utf8').length > 0);
  });
});

/**
 * AC-13. This block used to iterate a hand-written `DOCUMENTED` literal that
 * never read `TEXT` — so an audit could rewrite the skill's phase table to send
 * the turn into four G-11 refusals and all 28 tests still passed, under the
 * heading "the sequence the skill documents is one the Guard actually permits".
 * The table is now **parsed out of the document** and each cell resolved
 * through the registry, so the assertion is about what the skill says rather
 * than about what someone once transcribed from it.
 */
describe('the sequence the skill documents is one the Guard actually permits (AC-13)', () => {
  /** `| \`phase\` | entered by | model's job | exits via |` — the exits column
   *  is the load-bearing one: it names what the turn calls next from there. */
  function parsePhaseTable(): readonly { readonly phase: string; readonly exits: readonly string[] }[] {
    const rows: { phase: string; exits: readonly string[] }[] = [];
    for (const line of TEXT.split('\n')) {
      const cells = line.split('|').map((cell) => cell.trim());
      if (cells.length < 6) continue;
      const phase = (cells[1] ?? '').replace(/`/g, '');
      if (!(STAGE_PHASES as readonly string[]).includes(phase)) continue;
      const exits = [...(cells[4] ?? '').matchAll(/`([a-z][a-z-]*)`/g)]
        .map((match) => match[1] ?? '')
        .filter((name) => SUBCOMMANDS.has(name));
      rows.push({ phase, exits });
    }
    return rows;
  }

  const TABLE = parsePhaseTable();

  test('the table was actually parsed — every phase, and exits on the ones that have them', () => {
    assert.equal(TABLE.length, STAGE_PHASES.length, `parsed ${TABLE.length} rows for ${STAGE_PHASES.length} phases`);
    // Not a magic count: the union of every exits cell must cover the tools
    // that actually move a run forward. A parser that silently matched nothing
    // would fail this, and so would a table that stopped naming a step.
    const exits = new Set(TABLE.flatMap((row) => row.exits));
    for (const required of ['prepare-context', 'submit-draft', 'record-approval', 'build-handoff', 'close-run', 'answer-clarification']) {
      assert.ok(exits.has(required), `no table row names "${required}" as an exit — parser broken, or the table lost a step`);
    }
  });

  test('every tool the table says exits a phase is reachable from that phase', () => {
    const unreachable: string[] = [];
    for (const row of TABLE) {
      for (const subcommand of row.exits) {
        const spec = lookupTool(subcommand);
        assert.ok(spec !== undefined, `${subcommand} is not a declared subcommand`);
        if (!isToolReachableFromPhase(spec.tool as ToolName, row.phase as (typeof STAGE_PHASES)[number])) {
          unreachable.push(`${row.phase} -> ${subcommand}`);
        }
      }
    }
    assert.deepEqual(unreachable, [], 'the skill instructs a call G-11 refuses from that phase');
  });

  test('the numbered happy path is reachable step by step, read from the document', () => {
    // The step list, not the table: `1. **\`resolve-command …\`**` etc. Each
    // phase-scoped step must be reachable from the phase the previous one left.
    const steps = [...TEXT.matchAll(/^\d+\.\s+\*\*`([a-z][a-z-]*)/gm)].map((match) => match[1] ?? '');
    assert.ok(steps.length >= 6, `parsed ${steps.length} numbered steps — the check would be vacuous`);
    for (const step of steps) assert.ok(SUBCOMMANDS.has(step), `step names "${step}", which is not a subcommand`);
    // And the sequence must be the §4 order, not merely a set of valid tools.
    assert.deepEqual(steps.slice(0, 3), ['resolve-command', 'begin-run', 'prepare-context']);
  });
});

describe('the skill states the absences the system depends on', () => {
  // The document is hard-wrapped, so a claim can straddle a line break.
  // Matching the raw text would make every reflow a test failure for no
  // reason — the claim is the subject here, not the column it ends in.
  const UNWRAPPED = TEXT.replace(/\s+/g, ' ');

  for (const [what, pattern] of [
    ['that this turn is the only model invocation', /only model invocation/i],
    ['that nothing is built and no Figma file is touched', /Never touch Figma/i],
    ['that a refusal is surfaced, never routed around', /never route around|Surface it/i],
    ['that run state comes from the store, not memory', /Never claim a run's state from memory/i],
    ['that the request is passed verbatim', /verbatim|unedited/i],
    ['that an approval is not verified authorization', /not verified human authorization/i],
  ] as const) {
    test(`the skill states ${what}`, () => {
      assert.match(UNWRAPPED, pattern);
    });
  }

  test('the skill never tells the turn to supply a derived field', () => {
    // Each of these is minted or derived; the boundary has no flag for them.
    for (const field of ['--run-type', '--display-id', '--route-provenance', '--route-verified']) {
      assert.ok(!TEXT.includes(field), `the skill names ${field}, which no tool accepts`);
    }
  });
});

describe('the route command and the skill agree on how to run one', () => {
  const create = readFileSync(join(COMMANDS_DIR, 'create-component.md'), 'utf8');

  test('/create-component points at the skill rather than restating it', () => {
    assert.ok(create.includes('skills/coordinator-run/SKILL.md'));
  });

  test('every subcommand ANY command file names is also named by the skill (AC-21)', () => {
    // This read `create-component.md` only, so the two maintenance commands
    // instructed `run-maintenance` while the skill — which their own frontmatter
    // tells the turn to load "for any route" — never mentioned maintenance at
    // all. One hard-coded filename hid a whole missing section.
    const inSkill = new Set(subcommandsNamedIn(TEXT));
    const orphans: string[] = [];
    for (const file of readCommandFiles()) {
      const body = readFileSync(join(COMMANDS_DIR, `${file.name}.md`), 'utf8');
      for (const name of subcommandsNamedIn(body)) {
        if (!inSkill.has(name)) orphans.push(`${file.publicName}: ${name}`);
      }
    }
    assert.deepEqual(orphans, [], 'a command file documents a step the skill does not');
  });

  test('the gated routes name no run sequence at all — they refuse before one exists', () => {
    for (const name of ['modify-component', 'audit-component', 'review-component']) {
      const body = readFileSync(join(COMMANDS_DIR, `${name}.md`), 'utf8');
      assert.deepEqual(
        subcommandsNamedIn(body),
        [],
        `${name}.md documents a run sequence it cannot reach — G-3a refuses it at beginRun`,
      );
    }
  });

  test('every command file that names the boundary uses the plugin-root variable, never a fixed path', () => {
    for (const file of readCommandFiles()) {
      const body = readFileSync(join(COMMANDS_DIR, `${file.name}.md`), 'utf8');
      if (!body.includes('cli.ts')) continue;
      assert.ok(
        body.includes('${CLAUDE_PLUGIN_ROOT}'),
        `${file.name}.md names the boundary without the plugin-root variable — a hard-coded path (P1-FINAL §5.6)`,
      );
    }
  });
});
