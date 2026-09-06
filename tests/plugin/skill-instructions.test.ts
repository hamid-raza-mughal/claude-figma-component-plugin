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
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TOOLS } from '../../src/runtimes/claude-code/cli.ts';
import { GUARD_CODES } from '../../src/guard/errors.ts';
import { isToolReachableFromPhase, type ToolName } from '../../src/registry/transitions.ts';
import { STAGE_PHASES } from '../../src/contracts/run-envelope.ts';
import { readCommandFiles, COMMANDS_DIR, parseFrontmatter } from '../../tools/command-surface.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SKILL_DIR = join(ROOT, 'skills', 'coordinator-run');
const SKILL = join(SKILL_DIR, 'SKILL.md');
const TEXT = readFileSync(SKILL, 'utf8');

/** The subcommand names the skill instructs the turn to type. */
const SUBCOMMANDS = new Set(TOOLS.map((spec) => spec.name));

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
    // Any `cli.ts <word>` occurrence must be a declared subcommand.
    const typed = [...TEXT.matchAll(/cli\.ts"?\s+([a-z][a-z-]*)/g)].map((match) => match[1] ?? '');
    const offenders = typed.filter((name) => name !== '--help' && !SUBCOMMANDS.has(name));
    assert.deepEqual(offenders, [], 'the skill tells the turn to type a tool the boundary does not declare');
  });

  test('every backticked `x-y` token that looks like a subcommand is one', () => {
    const candidates = [...TEXT.matchAll(/`([a-z]+(?:-[a-z]+)+)(?:\s|`)/g)].map((match) => match[1] ?? '');
    const knownNonTools = new Set([
      'awaiting-approval', 'awaiting-clarification', 'handoff-ready', 'changes-requested',
      'observe-only-validation', 'source-invalidated', 'model-relayed', 'read-plane',
    ]);
    const offenders = candidates.filter((token) => !SUBCOMMANDS.has(token) && !knownNonTools.has(token));
    assert.deepEqual(offenders, [], 'an unrecognised hyphenated token — either a typo’d tool or a new phase to declare');
  });

  test('every Guard code the skill names is a declared GUARD_CODES member', () => {
    const named = [...new Set([...TEXT.matchAll(/\bG-\d+[a-c]?\b/g)].map((match) => match[0]))];
    assert.ok(named.length >= 5, 'the refusal table is the reason this skill can be followed safely');
    const offenders = named.filter((code) => !(GUARD_CODES as readonly string[]).includes(code));
    assert.deepEqual(offenders, [], 'the skill names a Guard code the engine does not define — the D-1 defect');
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

describe('the sequence the skill documents is one the Guard actually permits', () => {
  /** Each step of the documented happy path, as (phase, tool) — the claim the
   *  skill's step list makes, resolved against the transition registry rather
   *  than believed. */
  const DOCUMENTED: readonly (readonly [string, ToolName])[] = [
    ['received', 'prepareContext'],
    ['drafting', 'submitDraft'],
    ['validating', 'presentForApproval'],
    ['awaiting-approval', 'recordApproval'],
    ['handoff-ready', 'buildHandoff'],
    ['handoff-ready', 'closeRun'],
    ['validating', 'openClarification'],
    ['awaiting-clarification', 'answerClarification'],
  ];

  for (const [phase, tool] of DOCUMENTED) {
    test(`${tool} is reachable from ${phase}, as the skill instructs`, () => {
      assert.ok(
        isToolReachableFromPhase(tool, phase as (typeof STAGE_PHASES)[number]),
        `the skill tells the turn to call ${tool} from ${phase}, which G-11 refuses`,
      );
    });
  }

  test('the skill instructs no call the Guard would refuse from that phase', () => {
    // The inverse direction: a pairing the skill documents that is NOT in the
    // registry would be an instruction to walk into a refusal.
    const unreachable = DOCUMENTED.filter(
      ([phase, tool]) => !isToolReachableFromPhase(tool, phase as (typeof STAGE_PHASES)[number]),
    );
    assert.deepEqual(unreachable, []);
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

  test('every subcommand the command file names is also named by the skill', () => {
    const inCommand = subcommandsNamedIn(create);
    const inSkill = new Set(subcommandsNamedIn(TEXT));
    const orphans = inCommand.filter((name) => !inSkill.has(name));
    assert.deepEqual(orphans, [], 'the command file documents a step the skill does not');
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
