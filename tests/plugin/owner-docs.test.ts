/**
 * The two documents A4 produces are the only artifacts in this repository
 * whose reader is not a developer, which makes them the ones least likely to
 * be re-read when something changes underneath them. So they are checked the
 * same way the orchestration skill is: every command, variable, error code and
 * install command they name is resolved against what defines it.
 *
 * This is D-1…D-4's remedy applied where it matters most. A stale sentence in
 * the owner's testing guide costs a wasted testing session and a defect report
 * filed against behaviour that no longer exists — which is worse than a stale
 * sentence in a design note, not better.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OPERATIONS } from '../../src/registry/operations.ts';
import { resolvePhase1Config, ConfigError } from '../../src/config/phase1-config.ts';
import { scanDocuments } from '../../tools/identifier-scan.ts';
import { GUARD_CODES } from '../../src/guard/errors.ts';
import { readCommandFiles, slashCommandNames, PLUGIN_MANIFEST } from '../../tools/command-surface.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MARKETPLACE = join(ROOT, '.claude-plugin', 'marketplace.json');
const GUIDE = join(ROOT, 'docs', 'builder-master-owner-testing-guide.md');
const VERIFICATION = join(ROOT, 'docs', 'builder-master-m1-verification.md');
const PLAN = join(ROOT, 'docs', 'builder-agent-master-implementation-plan.md');

const guide = readFileSync(GUIDE, 'utf8');
const verification = readFileSync(VERIFICATION, 'utf8');
const manifest = JSON.parse(readFileSync(PLUGIN_MANIFEST, 'utf8')) as Record<string, unknown>;
const marketplace = JSON.parse(readFileSync(MARKETPLACE, 'utf8')) as {
  name: string;
  owner: Record<string, unknown>;
  plugins: { name: string; source: string; description?: string }[];
};

describe('the marketplace manifest makes this repository installable by path', () => {
  test('it declares exactly one plugin, and that plugin is this one', () => {
    assert.equal(marketplace.plugins.length, 1);
    assert.equal(marketplace.plugins[0]?.name, manifest['name']);
  });

  test('the plugin source resolves to a directory containing the plugin manifest', () => {
    const source = marketplace.plugins[0]?.source ?? '';
    assert.ok(existsSync(join(ROOT, source, '.claude-plugin', 'plugin.json')), `source "${source}" holds no plugin.json`);
  });

  test('the marketplace name is a kebab-case identifier and differs from the plugin name', () => {
    assert.match(marketplace.name, /^[a-z][a-z0-9-]*$/);
    // If they were equal, `plugin@marketplace` would read as a tautology and
    // the guide's install command would be ambiguous to a reader.
    assert.notEqual(marketplace.name, manifest['name']);
  });

  test('it names no real Figma identifier (BP-5)', () => {
    const text = readFileSync(MARKETPLACE, 'utf8');
    assert.ok(!/\b\d+:\d+\b/.test(text));
    assert.ok(!/figma\.com\/(?:file|design)\//i.test(text));
  });
});

describe('the owner testing guide names only things that exist', () => {
  test('every slash command it tells the owner to type is registered (AC-18)', () => {
    // The old narrowing was `/^\/[a-z]+-[a-z]+$/` — exactly two hyphen-separated
    // segments — so `/build`, `/publish-to-figma-now` and `/build_component`
    // all sailed through a test named "every slash command … is registered".
    // A command is now anything backticked that starts with a slash, which is
    // how the guide actually writes one, with no shape narrowing at all.
    const registered = new Set(slashCommandNames());
    const named = [...new Set([...guide.matchAll(/`(\/[A-Za-z][\w-]*)`?/g)].map((match) => match[1] ?? ''))];
    assert.ok(named.length >= registered.size, `extracted ${named.length} command-shaped tokens — the check would be weak`);
    const offenders = named.filter((name) => !registered.has(name));
    assert.deepEqual(offenders, [], 'the guide tells the owner to type a command that is not registered');
  });

  test('the extraction above catches every shape an unregistered command could take', () => {
    // The narrowing is the thing that failed last time, so it gets a falsifier.
    const probe = 'Type `/build` then `/publish-to-figma-now` and `/build_component`.';
    const found = [...probe.matchAll(/`(\/[A-Za-z][\w-]*)`?/g)].map((match) => match[1] ?? '');
    assert.deepEqual(found, ['/build', '/publish-to-figma-now', '/build_component']);
  });

  test('every registered command appears in the guide — none is left undocumented', () => {
    for (const name of slashCommandNames()) {
      assert.ok(guide.includes(name), `the guide never mentions ${name}`);
    }
  });

  test('every environment variable it names is one the config module reads', () => {
    const config = readFileSync(join(ROOT, 'src', 'config', 'phase1-config.ts'), 'utf8');
    const bundle = readFileSync(join(ROOT, 'tools', 'artifact-bundle.ts'), 'utf8');
    for (const variable of [...new Set([...guide.matchAll(/\bADALFI_[A-Z_]+\b/g)].map((m) => m[0]))]) {
      assert.ok(
        config.includes(variable) || bundle.includes(variable),
        `the guide names ${variable}, which nothing reads`,
      );
    }
  });

  test('every Guard code it names is declared', () => {
    for (const code of [...new Set([...guide.matchAll(/\bG-\d+[a-c]?\b/g)].map((m) => m[0]))]) {
      assert.ok((GUARD_CODES as readonly string[]).includes(code), `the guide names ${code}, which does not exist`);
    }
  });

  test('the code the guide attributes to equal data directories is the one that actually fires (AC-19)', () => {
    // The §6 table used to key that remedy to G-20a/G-20c. The real refusal is
    // `ConfigError` from `resolvePhase1Config` — so an owner who set both
    // variables to one directory saw a code the table's *first* row explains as
    // "a variable is unset", and was sent to change the wrong thing.
    let observed = '';
    try {
      resolvePhase1Config({
        curatedSourcePath: '/tmp/curated.json',
        derivedDir: '/tmp/same',
        approvedDataDirectory: '/tmp/same',
      });
    } catch (error) {
      observed = error instanceof ConfigError ? 'ConfigError' : 'other';
    }
    assert.equal(observed, 'ConfigError');
    assert.ok(
      /ConfigError[^|]*\|[^|]*same directory|same directory[^|]*\|[^|]*ConfigError/.test(guide.replace(/\n/g, ' ')) ||
        guide.includes('both point at the same directory'),
      'the guide must attribute the equal-directories failure to ConfigError',
    );
  });

  test('the install command names the marketplace and the plugin as the manifests declare them', () => {
    assert.ok(guide.includes(`claude plugin marketplace add`));
    assert.ok(
      guide.includes(`claude plugin install ${manifest['name']}@${marketplace.name}`),
      'the documented install command does not match the two manifests',
    );
    assert.ok(guide.includes(`claude plugin marketplace update ${marketplace.name}`), 'the update path must be documented');
    assert.ok(guide.includes(`claude plugin marketplace remove ${marketplace.name}`), 'the removal path must be documented');
  });

  test('the defect-capture template is the plan’s, field for field', () => {
    const plan = readFileSync(PLAN, 'utf8');
    const template = ['DEFECT n', 'Command typed:', 'What I expected:', 'What happened:', 'Screenshot / output:', 'Severity (blocks the run / wrong result / cosmetic):'];
    for (const line of template) {
      assert.ok(plan.includes(line), `the plan's template no longer contains "${line}" — this test is stale, not the guide`);
      assert.ok(guide.includes(line), `the guide's template omits "${line}"`);
    }
  });

  test('it tells the owner the plugin runs from a copy, and how to refresh it', () => {
    // The single most expensive misunderstanding available: testing a stale
    // installed copy and filing defects against code that no longer exists.
    assert.match(guide, /copy/i);
    assert.ok(guide.includes('.claude/plugins/cache'));
  });

  test('it states the three things §16.4 refuses to hide', () => {
    const unwrapped = guide.replace(/\s+/g, ' ');
    assert.match(unwrapped, /NOTHING HAS BEEN BUILT/);
    assert.match(unwrapped, /recorded, not verified|unverified/i);
    assert.match(unwrapped, /recorded and not followed|not followed/i);
  });

  test('it does not promise a capability that does not exist', () => {
    const unwrapped = guide.replace(/\s+/g, ' ').toLowerCase();
    for (const forbidden of ['builds the component in figma', 'writes to figma', 'creates the component in figma']) {
      assert.ok(!unwrapped.includes(forbidden), `the guide promises "${forbidden}"`);
    }
  });
});

describe('the M1 verification record claims nothing it did not run', () => {
  test('every Guard code it names is declared', () => {
    for (const code of [...new Set([...verification.matchAll(/\bG-\d+[a-c]?\b/g)].map((m) => m[0]))]) {
      assert.ok((GUARD_CODES as readonly string[]).includes(code), `it names ${code}, which does not exist`);
    }
  });

  test('every operation ID it names is registered', () => {
    for (const id of [...new Set([...verification.matchAll(/\b(?:component|source)\.[a-z]+\b/g)].map((m) => m[0]))]) {
      assert.ok(OPERATIONS.some((row) => row.operationId === id), `it names operation ${id}, which is not registered`);
    }
  });

  test('it names the §9 open items only to disclaim them', () => {
    // Each of these must appear in a sentence that denies it, never in one
    // that claims it. The plan's §9 list is not optional reading for this doc.
    const unwrapped = verification.replace(/\s+/g, ' ');
    assert.match(unwrapped, /HD-1[^.]*untouched|untouched[^.]*HD-1/);
    assert.match(unwrapped, /verified: false/);
    assert.match(unwrapped, /authorizing: false/);
    assert.match(unwrapped, /response_source: model-relayed|"response_source": "model-relayed"/);
  });

  test('it states plainly that the strict gate did not run', () => {
    // Markdown emphasis and code spans are formatting, not content: strip them
    // so a claim is matched on what it says, not on how it was typeset.
    // Underscore is deliberately NOT stripped — it is part of every
    // identifier this document names, and removing it turned
    // `ADALFI_ARTIFACT_DIR` into `ADALFIARTIFACTDIR` and failed the check.
    const plain = verification.replace(/[`*]/g, '').replace(/\s+/g, ' ');
    assert.match(plain, /strict gate was not run/i);
    assert.match(plain, /ADALFI_ARTIFACT_DIR is not available/i);
  });

  test('it separates what was established from what was not', () => {
    assert.ok(verification.includes('Not established, and not claimed'));
    assert.ok(verification.includes('Established, by execution'));
  });

  test('it records the confirmed aggregate-confidence defect with its cause, not just its symptom', () => {
    const unwrapped = verification.replace(/\s+/g, ' ');
    assert.match(unwrapped, /perResolutionConfidence/);
    assert.match(unwrapped, /compose-trusted-output\.ts/);
    assert.match(unwrapped, /AC-1/, 'the finding must carry an id the audit cycle can close');
  });

  test('the commit it says it ran at is a real commit shape', () => {
    assert.match(verification, /commit `[0-9a-f]{7,40}`/);
  });

  test('neither document names a real Figma identifier (BP-5)', () => {
    // AC-24: this hand-rolled a node-id check over the verification record and
    // never ran it over the owner guide at all — an audit put a real node id
    // into the guide and all 23 tests passed. Both now go through the one
    // scanner that implements every shape BP-5 names, timestamp handling and
    // allowlist included, and `tests/unit/identifier-leakage.test.ts` runs it
    // over the whole repository so no file is covered only by accident.
    // Both documents go in together. Audit cycle 2 added a rule for hex
    // abbreviated with an ellipsis, and whether an abbreviation discloses
    // anything depends on whether the full value is already tracked — which is
    // a fact about the *set* of documents, not about one of them. Scanning them
    // one at a time reported the guide's own hash as a leak against itself.
    assert.deepEqual(
      scanDocuments([
        ['docs/builder-master-m1-verification.md', verification],
        ['docs/builder-master-owner-testing-guide.md', guide],
      ]),
      [],
    );
  });
});

describe('the command files a designer would read stay in the surface the guide describes', () => {
  test('the guide’s command table covers every shipped command file', () => {
    for (const file of readCommandFiles()) {
      assert.ok(guide.includes(file.publicName), `${file.publicName} ships but the guide never names it`);
    }
  });
});
