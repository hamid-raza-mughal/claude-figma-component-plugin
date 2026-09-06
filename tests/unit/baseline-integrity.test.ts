/**
 * Gate 0 evidence: the baseline corrections stay corrected.
 *
 * Finding C6 in the execution plan: `stroke/base` — a path that does not exist
 * in the curated export — appeared in 12 files, five of which were live
 * artifacts, including the schema card that enters model context and a prompt
 * that inlined it. Correcting them once is not enough; the correction needs a
 * test, because the failure mode is silent reintroduction.
 *
 * These tests read the artifact bundle, whose location arrives through the same
 * typed config as everything else. When it is not configured they skip rather
 * than pass — a vacuous pass here would be exactly the false evidence the whole
 * phase exists to eliminate.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const ARTIFACT_DIR = process.env['ADALFI_ARTIFACT_DIR'];

/** A path that does not exist in the export. Assembled at runtime so this file
 *  does not itself become a carrier of the literal it forbids. */
const FABRICATED_PATH = ['stroke', 'base'].join('/');

/**
 * Files permitted to contain the fabricated path *because they document the
 * defect*. An allowlist rather than a blanket exclusion: the test must not be
 * satisfiable by deleting the discussion.
 */
const DISCUSSION_ALLOWLIST: readonly string[] = [
  'coordinator-analysis-review-and-roadmap_v1.md',
  'coordinator-audit-v2-assessment-and-token-plan_v1.md',
  'manage-ds-components-phase-1-execution-plan_v1.md',
  'manage-ds-components-phase-1-implementation-plan_FINAL.md',
  'manage-ds-components-runtime-architecture_v1.md',
  'manage-ds-components-runtime-diagrams_v2.md',
  'manage-ds-components-runtime-diagrams_v3.md',
  'manage-ds-components-spec-amendments_v1.md',
  'manage-ds-components-spec-amendments_v2.md',
  'manage-ds-components-spec-amendments_v3.md',
  'resolver-sqlite-architecture-and-token-model_v1.md',
];

/**
 * Superseded carriers: they still contain the fabricated path, but each must
 * declare itself superseded at the top so it cannot be picked up as ground
 * truth or as an active prompt.
 */
const MUST_DECLARE_SUPERSEDED: readonly string[] = [
  'Specs/Outputs/warning-toast-run-002.md',
  'Specs/Outputs/warning-toast-coordinator-output-001.md',
  'Specs/coordinator_system_prompt_v1_with_fewshot.md',
  'resolver-prototype/schema_card.txt',
];

const TEXT_EXTENSIONS = ['.md', '.py', '.txt', '.json'];

function collectTextFiles(dir: string, root: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === '.git' || entry === '.DS_Store' || entry === 'node_modules') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...collectTextFiles(full, root));
    else if (TEXT_EXTENSIONS.some((ext) => entry.endsWith(ext))) out.push(relative(root, full));
  }
  return out.sort((a, b) => a.localeCompare(b));
}

describe('baseline integrity (artifact bundle)', () => {
  if (ARTIFACT_DIR === undefined || !existsSync(ARTIFACT_DIR)) {
    test('artifact bundle not configured — set ADALFI_ARTIFACT_DIR', { skip: true }, () => {});
    return;
  }
  const dir = ARTIFACT_DIR;
  const files = collectTextFiles(dir, dir);

  test('bundle is present and scannable', () => {
    assert.ok(files.length > 20, `expected the v1 bundle, found ${files.length} text files`);
  });

  test('the fabricated token path survives only in documents that discuss it', () => {
    const carriers = files.filter((f) =>
      readFileSync(join(dir, f), 'utf8').includes(FABRICATED_PATH),
    );
    const unexpected = carriers.filter(
      (f) => !DISCUSSION_ALLOWLIST.includes(f) && !MUST_DECLARE_SUPERSEDED.includes(f),
    );
    assert.deepEqual(
      unexpected,
      [],
      'a live artifact reintroduced a token path that does not exist in the export (finding C6)',
    );
  });

  test('every superseded carrier declares itself superseded in its first lines', () => {
    for (const path of MUST_DECLARE_SUPERSEDED) {
      const full = join(dir, path);
      if (!existsSync(full)) continue;
      const head = readFileSync(full, 'utf8').slice(0, 900);
      assert.match(
        head,
        /SUPERSEDED/i,
        `${path} carries the fabricated path but does not declare itself superseded`,
      );
    }
  });

  test('the resolver ground truth no longer scores against a fabricated path', () => {
    const resolvePy = join(dir, 'resolver-prototype', 'resolve.py');
    if (!existsSync(resolvePy)) return;
    const text = readFileSync(resolvePy, 'utf8');
    assert.ok(
      !text.includes(FABRICATED_PATH),
      'resolve.py expected-array still contains the fabricated path',
    );
    assert.match(text, /'stroke\/thin'/, 'resolve.py should expect stroke/thin (value 1.0)');
    assert.match(text, /'body\/reg\/regular'/, "resolve.py should expect body/reg/regular for 14px");
  });

  test('no active document claims 38 eval cases; the workbook holds 37', () => {
    const evalSchema = join(dir, 'Evals', 'coordinator_eval_set_schema.md');
    if (existsSync(evalSchema)) {
      const text = readFileSync(evalSchema, 'utf8');
      assert.ok(!/38 cases?/.test(text), 'eval-set schema still claims 38 cases');
      assert.match(text, /37 cases/, 'eval-set schema should state 37 cases');
    }
    const spec = join(dir, 'Specs', 'coordinator_agent_spec.md');
    if (existsSync(spec)) {
      assert.ok(
        !/38 cases/.test(readFileSync(spec, 'utf8')),
        'coordinator_agent_spec.md still claims 38 cases',
      );
    }
  });

  test('no active document asserts the stale 412/88 entry counts', () => {
    const offenders = files.filter((f) => {
      if (DISCUSSION_ALLOWLIST.includes(f)) return false;
      return /412 styles/.test(readFileSync(join(dir, f), 'utf8'));
    });
    assert.deepEqual(
      offenders,
      [],
      'counts must be derived from the index, never asserted (actual: 676 styles / 531 variables)',
    );
  });

  /**
   * The string itself is allowed to survive as history — what must not survive is
   * the *unresolved framing*: a spec still treating the missing reference as an
   * open dependency, or as a live standard, rather than pointing at the authored
   * taxonomy. Testing the framing rather than the substring is the difference
   * between a guard and a find-and-replace.
   */
  test('no active spec treats the missing eight-state reference as unresolved', () => {
    const specs = [
      join(dir, 'Specs', 'coordinator_agent_spec.md'),
      join(dir, 'Specs', 'synthesizer_agent_spec.md'),
      join(dir, 'Specs', 'reviewer_agent_spec.md'),
    ];
    for (const spec of specs) {
      if (!existsSync(spec)) continue;
      const text = readFileSync(spec, 'utf8');
      if (!/Section 16/.test(text)) continue;
      assert.match(
        text,
        /interaction-state-taxonomy\.md/,
        `${spec} mentions the missing reference but never points at the authored taxonomy (decision D-D)`,
      );
      assert.match(
        text,
        /advisory|non-gating/i,
        `${spec} must state that interaction-state coverage is advisory / non-gating (SA-23)`,
      );
    }
  });

  test('the interaction-state policy is stated once, consistently, in the locked diagrams', () => {
    const v3 = join(dir, 'manage-ds-components-runtime-diagrams_v3.md');
    if (!existsSync(v3)) return;
    const text = readFileSync(v3, 'utf8');
    assert.ok(
      !/WCAG 2\.1 AA/.test(text),
      'diagrams v3 still claims WCAG 2.1 AA; P1-FINAL §5.3 mandates a machine-verifiable WCAG 2.2 AA subset (SA-25)',
    );
    assert.match(text, /WCAG 2\.2/, 'diagrams v3 should state the WCAG 2.2 AA subset');
    assert.match(
      text,
      /advisory and non-gating/i,
      'diagrams v3 should carry the non-gating interaction-state policy (SA-23)',
    );
  });

  test('the amendment register covers every P1-FINAL §5 decision (SA-22 … SA-28)', () => {
    const v3register = join(dir, 'manage-ds-components-spec-amendments_v3.md');
    assert.ok(existsSync(v3register), 'register v3 must exist — v2 ended at SA-21 (finding C8)');
    const text = readFileSync(v3register, 'utf8');
    for (let id = 1; id <= 28; id += 1) {
      // `(?![0-9])` rather than `\b`: SA-16 exists only as the lettered set
      // SA-16a…SA-16d (layered security controls), which `\b` would reject while
      // the register is in fact complete.
      assert.match(text, new RegExp(`SA-${id}(?![0-9])`), `register v3 is missing SA-${id}`);
    }
  });
});
