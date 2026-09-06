/**
 * BP-2 and BP-9 as gates rather than sentences.
 *
 * Both are **absences**: nothing imports the research corpus, and nothing
 * reaches past the representation barrel. `tests/unit/portability.test.ts:1–10`
 * states the standing rule for those — "An absence is exactly the kind of claim
 * that rots silently, so it gets a test rather than a sentence in a document."
 *
 * The scan and the ESLint patterns are two halves of one boundary, and neither
 * covers the other. Lint sees `import … from '…/plugin_explore_phase/…'` and
 * nothing else: a `readFileSync` reaching into the corpus is invisible to every
 * module resolver, and a path written into a `.json` has no linter at all. The
 * scan sees text and cannot tell you at the moment you type it. BP-2 asks for
 * both, and each costs one rule.
 *
 * Every rule here is falsified as well as asserted. A boundary rule that has
 * never been shown to fire is indistinguishable from a regex that matches
 * nothing, which is how a boundary becomes decorative.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  scanRepository,
  scanText,
  collectFiles,
  BOUNDARY_RULES,
  BOUNDARY_EXEMPTIONS,
} from '../../tools/boundary-scan.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('the boundary holds across the repository (BP-2, BP-9)', () => {
  test('the repository is clean', () => {
    const findings = scanRepository();
    assert.deepEqual(
      findings.map((finding) => `${finding.file}:${finding.line} ${finding.rule} "${finding.match}"`),
      [],
    );
  });

  test('the scan reaches all five directories BP-2 names', () => {
    const files = collectFiles();
    assert.ok(files.length > 100, `only ${files.length} files scanned`);
    for (const dir of ['src', 'schemas', 'tests', 'tools', 'docs']) {
      assert.ok(
        files.some((file) => file.includes(`/${dir}/`)),
        `nothing under ${dir}/ was scanned`,
      );
    }
  });
});

describe('every boundary rule fires on what it is named for', () => {
  /**
   * Falsifiers, written out rather than composed, because unlike an identifier
   * these strings are not secret — the directory name is in `.gitignore` and in
   * three decision logs. What matters is that each one is a *path* form rather
   * than a mention, which is the discrimination the rules make.
   */
  const violations: Readonly<Record<string, { readonly file: string; readonly text: string }>> = {
    'research-corpus-path': {
      file: 'src/probe.ts',
      text: "import { thing } from '../plugin_explore_phase/Builder_comp_rep_docs/thing.ts';",
    },
    'research-corpus-read': {
      file: 'src/probe.ts',
      text: "const raw = readFileSync(join(ROOT, 'plugin_explore_phase', 'contract.json'), 'utf8');",
    },
    'representation-deep-reach': {
      file: 'src/probe.ts',
      text: "import { resolveReferences } from '../representation/validation/reference-resolver.ts';",
    },
  };

  for (const rule of BOUNDARY_RULES) {
    test(`the "${rule.id}" rule matches ${rule.what}`, () => {
      const violation = violations[rule.id];
      assert.ok(violation !== undefined, `no falsifier written for rule "${rule.id}"`);
      const found = scanText(violation.file, violation.text);
      assert.ok(
        found.some((finding) => finding.rule === rule.id),
        `"${rule.id}" did not fire on its own falsifier`,
      );
    });
  }

  test('a mention that is not a path is not flagged', () => {
    // The narrowing that keeps this scan usable. A decision log recording BP-1
    // has to be able to name the directory BP-1 is about, and the first version
    // of this scan produced nineteen findings and zero defects for exactly that
    // reason.
    for (const benign of [
      'docs/log.md, the research corpus is untracked by ruling (BP-1).',
      'docs/log.md, `plugin_explore_phase/` stays untracked.',
    ]) {
      const [file, text] = [benign.split(', ')[0] as string, benign];
      assert.deepEqual(scanText(file, text), [], `a citation tripped the scan: ${text}`);
    }
  });

  test("a module's own internals are not a violation of its barrel", () => {
    assert.deepEqual(
      scanText(
        'src/representation/index.ts',
        "export { resolveReferences } from './validation/reference-resolver.ts';",
      ),
      [],
    );
  });

  test('the barrel rule fires from outside the module even in a data file', () => {
    const found = scanText(
      'schemas/probe.json',
      '{ "entry": "src/representation/validation/reference-resolver.ts" }',
    );
    assert.ok(found.some((finding) => finding.rule === 'representation-deep-reach'));
  });
});

describe('the exemptions are bounded and justified', () => {
  test('every exemption states why', () => {
    for (const exemption of BOUNDARY_EXEMPTIONS) {
      assert.ok(
        exemption.why.length > 20,
        `${exemption.file} is exempt from ${exemption.rule} without a reason`,
      );
    }
  });

  test('every exemption names a file that exists and a rule that exists', () => {
    const ruleIds = new Set(BOUNDARY_RULES.map((rule) => rule.id));
    for (const exemption of BOUNDARY_EXEMPTIONS) {
      assert.ok(ruleIds.has(exemption.rule), `${exemption.rule} is not a rule`);
      assert.doesNotThrow(
        () => readFileSync(join(ROOT, exemption.file), 'utf8'),
        `${exemption.file} is exempt and does not exist`,
      );
    }
  });

  test('every exemption is still needed', () => {
    // An exemption that no longer suppresses anything is an exemption nobody
    // will notice has stopped being justified. Removing it is free; leaving it
    // is how an allowlist becomes a habit.
    for (const exemption of BOUNDARY_EXEMPTIONS) {
      const text = readFileSync(join(ROOT, exemption.file), 'utf8');
      const rule = BOUNDARY_RULES.find((candidate) => candidate.id === exemption.rule);
      assert.ok(rule !== undefined);
      const wouldFire = text
        .split('\n')
        .some((line) => [...line.matchAll(rule.pattern)].length > 0);
      assert.ok(
        wouldFire,
        `${exemption.file} is exempt from ${exemption.rule} but no longer trips it`,
      );
    }
  });

  test('the exemption list has not grown past what B6 recorded', () => {
    // Ten was the state when the boundary landed, and every one is a guard
    // naming what it forbids: three for this file's falsifiers, three for the
    // scan that defines the rules, and one each for the ledger header, the
    // identifier scan's header, and the two tests asserting the corpus name is
    // absent. An eleventh is a deliberate act that edits this number and
    // explains itself in the same diff.
    assert.equal(
      BOUNDARY_EXEMPTIONS.length,
      10,
      'an exemption was added; say why here, in this test, and in the entry itself',
    );
  });

  test('an exemption covers one rule in one file, never a directory', () => {
    for (const exemption of BOUNDARY_EXEMPTIONS) {
      assert.doesNotMatch(exemption.file, /\*/, 'a glob exemption silences files nobody listed');
      assert.match(exemption.file, /\.(ts|js|json|md)$/);
    }
  });
});

describe('the gated evidence command is gated (BP-10)', () => {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
    readonly scripts: Record<string, string>;
  };

  test('test:evidence is exactly the command BP-10 fixes', () => {
    assert.equal(
      manifest.scripts['test:evidence'],
      'node --test --test-reporter=spec "tests/representation/evidence-gated/*.evidence.ts"',
    );
  });

  test('the gated suffix is not matched by the default discovery glob', () => {
    // The whole mechanism. `tests/**` + `/*.test.ts` cannot match
    // `*.evidence.ts`, so these tests are invisible to `npm test`,
    // `test:source` and `test:strict` without any skip, exclusion or flag.
    assert.equal(manifest.scripts['test'], 'node --test --test-reporter=spec "tests/**/*.test.ts"');
    for (const script of ['test', 'test:strict', 'test:source']) {
      assert.doesNotMatch(
        manifest.scripts[script] as string,
        /evidence/,
        `${script} reaches the gated suite`,
      );
    }
  });

  test('no gated file is named so the default suite would collect it', () => {
    const dir = join(ROOT, 'tests', 'representation', 'evidence-gated');
    for (const entry of readdirSync(dir)) {
      assert.match(entry, /\.evidence\.ts$/, `${entry} would be collected by the default glob`);
    }
  });

  test('the source-only skip budget is still exactly seven (BP-10)', () => {
    // The number BP-10 protects. Folding the gated tests into the default suite
    // and raising this would turn "seven known bundle-gated placeholders" into a
    // vaguer figure covering two unrelated gating mechanisms — and a suite whose
    // skip budget grows is one where a genuinely new skip stops being visible.
    const runner = readFileSync(join(ROOT, 'tools', 'run-suite.ts'), 'utf8');
    assert.match(runner, /sourceOnlyExpectedSkips:\s*7,/);
  });

  test('the gated suite refuses rather than passing empty when the pack is absent', () => {
    const gated = readFileSync(
      join(ROOT, 'tests', 'representation', 'evidence-gated', 'real-corpus.evidence.ts'),
      'utf8',
    );
    assert.match(gated, /REPRESENTATION_EVIDENCE_DIR is unset/);
  });
});

describe('lint and the scan are two halves, and the override is narrowed (BP-2)', () => {
  const config = readFileSync(join(ROOT, 'eslint.config.js'), 'utf8');

  test('the ESLint config bans the research corpus by pattern', () => {
    assert.match(config, /plugin_explore_phase/);
  });

  test('the ESLint config bans every representation internal directory', () => {
    for (const internal of ['contracts', 'validation', 'evidence', 'selection']) {
      assert.match(
        config,
        new RegExp(String.raw`representation/${internal}/\*\*`),
        `${internal}/ is not covered by the barrel pattern`,
      );
    }
  });

  test('the tools/tests override no longer switches the rule off wholesale', () => {
    // The specific defect BP-2 names: `no-restricted-imports: 'off'` for
    // `tools/**` and `tests/**` left both boundaries unenforced in the two
    // directories most likely to breach them. Three test files were importing
    // past the barrel when this was written.
    assert.doesNotMatch(
      config,
      /'no-restricted-imports':\s*'off'/,
      'the override is back to disabling the rule entirely',
    );
    assert.match(config, /files: \['tools\/\*\*\/\*\.ts', 'tests\/\*\*\/\*\.ts'\]/);
  });
});
