/**
 * AC-12 — the files that actually instruct the model were scanned by nothing.
 *
 * `tests/unit/portability.test.ts` enforces this repository's hard
 * prohibitions — no `claude -p`, no network client, no Anthropic SDK, no Figma
 * write, no hard-coded user path — over `src/` only. But since WP A2 the thing
 * that tells the turn what to execute is `commands/*.md` and
 * `skills/**\/SKILL.md`, and a line added to either telling the turn to shell
 * out to a second Claude, or naming an absolute path instead of
 * `${CLAUDE_PLUGIN_ROOT}`, passed every gate in the repository.
 *
 * CLAUDE.md lists "never a second Claude invocation" as a hard prohibition. It
 * was enforced only where it was never at risk.
 *
 * The patterns here are deliberately wider than `portability.test.ts`'s, because
 * an audit demonstrated that several of those are evadable: `claude --print` is
 * the same invocation as `claude -p` and was not matched, and
 * `FIGMA_ACCESS_TOKEN` is the same secret as `FIGMA_TOKEN`.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readCommandFiles, checkCommandSurface, PLUGIN_MANIFEST } from '../../tools/command-surface.ts';
import { GUARD_CODES } from '../../src/guard/errors.ts';
import { REPAIR_BUDGET, CLARIFICATION_ROUND_SOFT_BUDGET } from '../../src/guard/budgets.ts';
import { STALENESS_THRESHOLD_HOURS } from '../../src/tools/engine.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function collect(dir: string, extension: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...collect(full, extension));
    else if (entry.endsWith(extension)) out.push(full);
  }
  return out;
}

/** Every file that instructs the model, as (path, text). */
const PROMPT_FILES: readonly (readonly [string, string])[] = [
  ...collect(join(ROOT, 'commands'), '.md'),
  ...collect(join(ROOT, 'skills'), '.md'),
].map((file) => [relative(ROOT, file), readFileSync(file, 'utf8')] as const);

/**
 * A prohibition and the shapes that violate it. Each pattern is wider than the
 * literal it is named for, because the narrow version is what an audit walked
 * straight past.
 */
const FORBIDDEN: readonly { readonly name: string; readonly pattern: RegExp; readonly why: string }[] = [
  {
    name: 'a second Claude invocation',
    pattern: /\bclaude\s+(?:-p\b|--print\b)|@anthropic-ai|api\.anthropic\.com|messages\.create/i,
    why: 'the active host turn is the only model invocation — a standing user ruling, and CLAUDE.md a hard prohibition',
  },
  {
    name: 'an API key or credential',
    pattern: /ANTHROPIC_API_KEY|FIGMA[_A-Z]*TOKEN|FIGMA[_A-Z]*KEY|api[_-]?key\s*[:=]/i,
    why: 'no API-key requirement exists anywhere in this system',
  },
  {
    name: 'a Figma write',
    pattern: /figma\.(?:createFrame|createComponent|appendChild|createInstance)/i,
    why: 'the Builder is the only writer and does not exist; no route here touches Figma',
  },
  {
    name: 'an absolute user path',
    pattern: /['"`(]\/(?:Users|home|var\/folders)\//,
    why: 'every path must be ${CLAUDE_PLUGIN_ROOT}-relative (P1-FINAL §5.6)',
  },
  {
    name: 'a network fetch',
    pattern: /\bcurl\s+http|\bwget\s+http|fetch\(['"`]https?:/i,
    why: 'the engine reaches no network; a prompt surface must not either',
  },
];

describe('the model-instruction surface obeys the prohibitions src/ obeys (AC-12)', () => {
  test('there are prompt files to scan — the sweep cannot pass vacuously', () => {
    assert.ok(PROMPT_FILES.length >= 7, `found ${PROMPT_FILES.length} prompt files`);
  });

  for (const rule of FORBIDDEN) {
    test(`no ${rule.name} in commands/ or skills/`, () => {
      const offenders = PROMPT_FILES.filter(([, text]) => rule.pattern.test(text)).map(([path]) => path);
      assert.deepEqual(offenders, [], `${rule.name} — ${rule.why}`);
    });
  }

  test('every path a prompt file names is plugin-root-relative', () => {
    const offenders: string[] = [];
    for (const [path, text] of PROMPT_FILES) {
      for (const match of text.matchAll(/(?:node|cat|bash)\s+"?([^\s"']+\/[^\s"']+)/g)) {
        const named = match[1] ?? '';
        if (named.startsWith('${CLAUDE_PLUGIN_ROOT}') || named.startsWith('<')) continue;
        offenders.push(`${path}: ${named}`);
      }
    }
    assert.deepEqual(offenders, []);
  });

  test('the scan would catch a violation — each rule is provoked', () => {
    // A pattern list that never matches anything is indistinguishable from a
    // correct one. Every rule is fired against a synthetic violation here, so
    // a regex that silently stopped matching fails this test rather than the
    // one above passing for the wrong reason.
    const violations = [
      'run `claude --print "do the thing"` to check',
      'set ANTHROPIC_API_KEY before running',
      'call figma.createFrame() to build it',
      'run `node "/Users/someone/thing.ts"`',
      'fetch("https://example.com/x")',
    ];
    violations.forEach((violation, index) => {
      const rule = FORBIDDEN[index];
      assert.ok(rule !== undefined);
      assert.ok(rule.pattern.test(violation), `${rule.name} did not match its own violation: ${violation}`);
    });
  });
});

describe('the surface the checker reads is the whole surface (AC-10)', () => {
  test('readCommandFiles recurses — a namespaced command cannot hide', () => {
    // Before AC-10 this was a single readdirSync, so `commands/anything/x.md`
    // shipped a command with an unregistered operation id and any body at all
    // while `--check` printed "6 command files agree" and exited 0.
    const onDisk = collect(join(ROOT, 'commands'), '.md').length;
    assert.equal(readCommandFiles().length, onDisk, 'the checker sees fewer files than exist');
  });

  test('a command in a subdirectory is reported, not skipped', () => {
    // Proven against a synthetic tree rather than asserted about the real one.
    const root = mkdtempSync(join(tmpdir(), 'nested-commands-'));
    try {
      const commands = join(root, 'commands');
      mkdirSync(join(commands, 'danger'), { recursive: true });
      writeFileSync(
        join(commands, 'danger', 'rogue.md'),
        '---\ndescription: x\noperation-id: component.nonexistent\nallowed-tools: Bash\n---\n\nbody\n',
      );
      const result = checkCommandSurface(commands);
      assert.equal(result.ok, false);
      assert.ok(
        result.problems.some((problem) => problem.subject === '/danger/rogue'),
        `the nested file was not seen: ${result.problems.map((p) => p.subject).join(', ')}`,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('the manifest declares only what this plugin actually is (AC-16)', () => {
  const manifest = JSON.parse(readFileSync(PLUGIN_MANIFEST, 'utf8')) as Record<string, unknown>;

  test('the declared skills directory exists and holds the skill the commands point at', () => {
    // MB-3 made the command half of the surface bidirectional and left the
    // skill half unchecked in both directions: misspell this key and the host
    // loads no skill, every command points at a document that never loads, and
    // the suite stays green.
    assert.equal(manifest['skills'], './skills');
    assert.ok(existsSync(join(ROOT, 'skills', 'coordinator-run', 'SKILL.md')));
  });

  test('every directory under skills/ is a real skill', () => {
    for (const entry of readdirSync(join(ROOT, 'skills'))) {
      const skill = join(ROOT, 'skills', entry, 'SKILL.md');
      assert.ok(existsSync(skill), `skills/${entry} has no SKILL.md`);
      assert.match(readFileSync(skill, 'utf8'), new RegExp(`^---[\\s\\S]*?name:\\s*${entry}\\b`), `skills/${entry} declares a different name`);
    }
  });

  test('MB-2 held: no MCP server, no hook, no agent is declared', () => {
    // MB-2's cost/risk argument was that the CLI adds no protocol surface and
    // no dependency. That was confirmed once, by pasting a CLI transcript into
    // a document — which is the sentence-in-a-document this repository replaced
    // with tests.
    for (const key of ['mcpServers', 'hooks', 'agents']) {
      assert.ok(!(key in manifest), `the manifest declares ${key}, which MB-2 says it does not`);
    }
    for (const dir of ['hooks', 'agents']) {
      assert.ok(!existsSync(join(ROOT, dir)), `${dir}/ exists — the default-path surface MB-2 excludes`);
    }
    assert.ok(!existsSync(join(ROOT, '.mcp.json')));
  });

  test('MB-2 held: the runtime dependency set is unchanged', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { dependencies: Record<string, string> };
    assert.deepEqual(Object.keys(pkg.dependencies).sort(), ['ajv', 'ajv-formats']);
  });
});

describe('numbers the turn obeys are bound to the constants that define them (AC-17)', () => {
  const skill = readFileSync(join(ROOT, 'skills', 'coordinator-run', 'SKILL.md'), 'utf8');
  const guide = readFileSync(join(ROOT, 'docs', 'builder-master-owner-testing-guide.md'), 'utf8');

  test('the repair budget the skill states equals REPAIR_BUDGET', () => {
    // These are instructions to an executor, not decoration: if REPAIR_BUDGET
    // rose to 2 the skill would still say "do not submit again" and the turn
    // would abandon a run the engine would have accepted. D-1's shape, applied
    // to the one field type the skill check had skipped.
    assert.equal(REPAIR_BUDGET, 1);
    assert.match(skill.replace(/[`*]/g, ''), /You get one repair for the whole run/);
  });

  test('the clarification round budget the skill states equals the constant', () => {
    assert.equal(CLARIFICATION_ROUND_SOFT_BUDGET, 2);
    assert.match(skill.replace(/[`*]/g, ''), new RegExp(`The round budget is ${CLARIFICATION_ROUND_SOFT_BUDGET}\\.`));
  });

  test('the staleness threshold the skill and the guide state equals the engine constant', () => {
    assert.equal(STALENESS_THRESHOLD_HOURS, 72);
    for (const [name, text] of [['skill', skill], ['guide', guide]] as const) {
      assert.match(text, new RegExp(`${STALENESS_THRESHOLD_HOURS} hours`), `the ${name} does not state the threshold`);
    }
  });

  test('the plugin version the guide tells the owner to expect is the manifest’s', () => {
    const manifest = JSON.parse(readFileSync(PLUGIN_MANIFEST, 'utf8')) as { name: string; version: string };
    assert.ok(guide.includes(`version \`${manifest.version}\``), 'the guide names a version the manifest does not declare');
    assert.ok(guide.includes(`/${manifest.name}/${manifest.version}/`), 'the cache path in the guide is not composed from the manifest');
  });

  test('the component count the guide states equals what ships', () => {
    const shipped = readCommandFiles().length + readdirSync(join(ROOT, 'skills')).length;
    const words: Record<number, string> = { 6: 'six', 7: 'seven', 8: 'eight', 9: 'nine' };
    const word = words[shipped];
    assert.ok(word !== undefined, `no word for ${shipped} — extend the map deliberately`);
    assert.ok(guide.includes(`${word} items`), `the guide does not say "${word} items" for ${shipped} shipped components`);
  });
});

describe('every declared Guard code is accounted for (AC-14)', () => {
  test('a code is either thrown by some path or listed as structurally enforced', () => {
    // D-5's lesson applied to the one registry that still had a one-way check.
    // Codes that are enforced by a type or a static scan legitimately have no
    // throw site — but which ones those are must be *written down*, not left
    // as the residue of a grep.
    const STRUCTURAL: Readonly<Record<string, string>> = {
      'G-5': 'the repair budget returns a terminal verdict rather than refusing; a third submit is refused at G-11',
      'G-9c': 'Builder activation does not exist to refuse — there is no Builder stage',
      'G-12': 'RunStore exposes no UPDATE or DELETE path for run_event; the absence is the enforcement',
      'G-13': 'the CAS is SQLite’s own PRIMARY KEY constraint; its failure surfaces as G-20b',
      'G-14': 'resolveCommand refuses before a run exists, as ResolveCommandError — a plain error, not a Guard-recorded event',
      'G-15': 'BeginRunInput has no field to supply; enforced by the type, not a check',
      'G-16': 'runMaintenance never enters the phase model; there is no transition to refuse',
      'G-17': 'invoked_as and approved_by are read by no decision; enforced by a static source scan',
      'G-18': 'an alias resolves to the same OperationRow, so no divergent path exists to refuse',
    };
    const thrown = new Set<string>();
    for (const file of collect(join(ROOT, 'src'), '.ts')) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(/GuardRefusal\(\s*'(G-\d+[a-c]?)'/g)) thrown.add(match[1] ?? '');
      for (const match of source.matchAll(/guardCode:\s*'(G-\d+[a-c]?)'/g)) thrown.add(match[1] ?? '');
    }
    assert.ok(thrown.size >= 12, `only ${thrown.size} codes found thrown — the scan is broken`);
    const unaccounted = GUARD_CODES.filter((code) => !thrown.has(code) && !(code in STRUCTURAL));
    assert.deepEqual(unaccounted, [], 'a declared Guard code is neither thrown nor recorded as structurally enforced');
    // And the reverse: a code recorded as structural must not also be thrown,
    // or the note is stale and the reader is misled about where it lives.
    const contradictory = Object.keys(STRUCTURAL).filter((code) => thrown.has(code));
    assert.deepEqual(contradictory, [], 'a code is listed as structurally enforced and is also thrown');
  });
});
