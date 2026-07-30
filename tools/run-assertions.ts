/**
 * Registers the migrated workbook assertions and runs them (§17.3).
 *
 * What is migrated: contract-neutral checks that exercise something Phase 1 actually
 * built. What is preserved as historical: everything depending on the old open schema,
 * the retired 0-100 scoring model, the contaminated fixture, a live model, or a stage
 * that does not exist yet.
 *
 * Usage:
 *   node tools/run-assertions.ts [--out <file>]
 *   ADALFI_ARTIFACT_DIR=... node tools/run-assertions.ts     # enables source-backed cases
 */
import { existsSync, readFileSync, appendFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AssertionRunner, renderReport } from '../src/observability/assertion-registry.ts';
import { SchemaRegistry } from '../src/validation/schema-validator.ts';
import { makeCandidateIdentity, makeCandidateId, IdentityError } from '../src/contracts/identity.ts';
import { aggregateConfidence } from '../src/contracts/coordinator-output.ts';
import { forwardRouteFor, resolveInvocation, InvocationError } from '../src/contracts/invocation.ts';
import { hasBlockingGap } from '../src/contracts/resolution.ts';
import { findAuthoredTreeLeaks } from '../src/contracts/coordinator-draft.ts';
import { findOperationalLeaks } from '../src/contracts/run-envelope.ts';
import { loadCoreModule, countPromptWords } from '../src/coordinator/select-route-module.ts';
import { assembleModelInput } from '../src/coordinator/assemble-model-input.ts';
import { assertNoLeakage } from '../src/coordinator/leakage-assertion.ts';
import { INVARIANTS } from '../src/validation/invariant-registry.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCHEMA_DIR = join(ROOT, 'schemas', 'coordinator');
const FIXTURES = join(ROOT, 'tests', 'fixtures', 'active');
const SHA = '2222a2b8eff4224f76ddad591cf6f46c6e8bb25ec7f96aebbf13941876356627';

function registry(): SchemaRegistry {
  const reg = new SchemaRegistry();
  for (const file of [
    'semantic.schema.json',
    'coordinator-output.schema.json',
    'coordinator-judgment-draft.schema.json',
  ]) {
    reg.register(JSON.parse(readFileSync(join(SCHEMA_DIR, file), 'utf8')) as object);
  }
  return reg;
}

const OUTPUT_SCHEMA_ID = 'https://adalfi.dev/schemas/coordinator/coordinator-output.schema.json';

const runner = new AssertionRunner();

// ---- Migrated: contract-neutral, and each exercises built code ----

runner.register({
  case_id: 'WB-PATH-01',
  statement: 'A required run_type is enforced before anything else; there is no model route classifier.',
  covers: 'src/contracts/invocation.ts',
  check: () => {
    try {
      resolveInvocation({ run_id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301', user_intent: 'x' });
      return false;
    } catch (error: unknown) {
      return error instanceof InvocationError && error.code === 'INVOCATION_ROUTE_MISSING';
    }
  },
});

runner.register({
  case_id: 'WB-PATH-02',
  statement: 'audit routes to synthesizer; new and modify route to builder.',
  covers: 'src/contracts/invocation.ts',
  check: () =>
    forwardRouteFor('audit') === 'synthesizer' &&
    forwardRouteFor('new') === 'builder' &&
    forwardRouteFor('modify') === 'builder',
});

runner.register({
  case_id: 'WB-GUARD-R3-01',
  statement:
    'A fabricated candidate_id does not verify: ids derive from the source hash and cannot be constructed.',
  covers: 'src/contracts/identity.ts',
  check: () => {
    const identity = makeCandidateIdentity({
      refClass: 'paint-style',
      normalizedId: 'S:cfdda1d5',
      sourceSha256: SHA,
      indexVersion: '1.0.0',
    });
    const forged = makeCandidateId({
      refClass: 'paint-style',
      normalizedId: 'S:deadbeef',
      sourceSha256: SHA,
      indexVersion: '1.0.0',
    });
    return identity.candidate_id !== forged;
  },
});

runner.register({
  case_id: 'WB-GUARD-R3-02',
  statement: 'A placeholder source hash is refused at identity construction.',
  covers: 'src/contracts/identity.ts',
  check: () => {
    try {
      makeCandidateId({
        refClass: 'variable',
        normalizedId: 'Body/sm/size',
        sourceSha256: 'sha256-pending',
        indexVersion: '1.0.0',
      });
      return false;
    } catch (error: unknown) {
      return error instanceof IdentityError;
    }
  },
});

runner.register({
  case_id: 'WB-GUARD-R11-01',
  statement: 'Identity changes when the source hash or the index format changes.',
  covers: 'src/contracts/identity.ts',
  check: () => {
    const seed = { refClass: 'variable' as const, normalizedId: 'Body/sm/size', indexVersion: '1.0.0' };
    const a = makeCandidateId({ ...seed, sourceSha256: SHA });
    const b = makeCandidateId({ ...seed, sourceSha256: 'a'.repeat(64) });
    const c = makeCandidateId({ ...seed, sourceSha256: SHA, indexVersion: '2.0.0' });
    return a !== b && a !== c;
  },
});

runner.register({
  case_id: 'WB-CONF-01',
  statement: 'Aggregate confidence takes the weakest child, never an average.',
  covers: 'src/contracts/coordinator-output.ts',
  check: () =>
    aggregateConfidence(['high', 'high', 'low']) === 'low' && aggregateConfidence([]) === 'low',
});

runner.register({
  case_id: 'WB-BLOCK-01',
  statement: 'An active blocking gap is detected; a resolved one is not.',
  covers: 'src/contracts/resolution.ts',
  check: () => {
    const gap = {
      gap_id: 'g',
      severity: 'blocking' as const,
      owner: 'user' as const,
      question: 'q',
      evidence: 'e',
      required_answer: 'a',
      opened_in_round: 1,
    };
    return (
      hasBlockingGap([{ ...gap, state: 'active' }]) && !hasBlockingGap([{ ...gap, state: 'resolved' }])
    );
  },
});

runner.register({
  case_id: 'WB-TREE-01',
  statement: 'An authored implementation tree is detected, including a bare Figma node-type literal.',
  covers: 'src/contracts/coordinator-draft.ts',
  check: () =>
    findAuthoredTreeLeaks({ elements: [{ children: [] }] }).length === 1 &&
    findAuthoredTreeLeaks({ role: 'FRAME' }).length === 1,
});

runner.register({
  case_id: 'WB-OPS-01',
  statement: 'An operational field in a model draft is detected at any depth.',
  covers: 'src/contracts/run-envelope.ts',
  check: () => findOperationalLeaks({ a: { b: { run_id: 'x' } } }).length === 1,
});

runner.register({
  case_id: 'WB-OPS-02',
  statement:
    "A clarification gap's own lifecycle state is not an operational field — the exemption is path-scoped.",
  covers: 'src/contracts/run-envelope.ts',
  check: () =>
    findOperationalLeaks({ clarification_gaps: [{ state: 'active' }] }).length === 0 &&
    findOperationalLeaks({ state: 'handoff-ready' }).length === 1,
});

runner.register({
  case_id: 'WB-SCHEMA-01',
  statement: 'Every canonical valid output fixture validates with format assertion on.',
  covers: 'schemas/coordinator/',
  check: () => {
    const reg = registry();
    return ['new-ready', 'modify-ready', 'audit-ready', 'blocked', 'failed'].every((name) => {
      const path = join(FIXTURES, 'outputs', `${name}.json`);
      if (!existsSync(path)) return false;
      return reg.validate(OUTPUT_SCHEMA_ID, JSON.parse(readFileSync(path, 'utf8'))).ok;
    });
  },
});

runner.register({
  case_id: 'WB-SCHEMA-02',
  statement: 'Every canonical invalid output fixture is rejected.',
  covers: 'schemas/coordinator/',
  check: () => {
    const reg = registry();
    return [
      'invalid-unknown-field',
      'invalid-ready-with-blocking-gap',
      'invalid-audit-to-builder',
      'invalid-authored-tree',
      'invalid-model-authored-operational',
    ].every((name) => {
      const path = join(FIXTURES, 'outputs', `${name}.json`);
      if (!existsSync(path)) return false;
      return !reg.validate(OUTPUT_SCHEMA_ID, JSON.parse(readFileSync(path, 'utf8'))).ok;
    });
  },
});

runner.register({
  case_id: 'WB-PROMPT-01',
  statement: 'The always-loaded core stays within its stated word ceiling.',
  covers: 'src/judgment/coordinator-core.md',
  check: () => {
    const core = loadCoreModule();
    return core.word_count <= 1500 && core.word_count >= 700;
  },
});

runner.register({
  case_id: 'WB-PROMPT-02',
  statement: 'The word-counting rule excludes frontmatter and fenced code.',
  covers: 'src/coordinator/select-route-module.ts',
  check: () => countPromptWords('---\nk: one two three\n---\nalpha beta\n```\nx y z\n```\ngamma') === 3,
});

runner.register({
  case_id: 'WB-CTX-01',
  statement: 'Exactly one route module is assembled, and the assembled input is leak-free.',
  covers: 'src/coordinator/assemble-model-input.ts',
  check: () => {
    const assembled = assembleModelInput({
      run_type: 'new',
      user_intent: 'x',
      schema_card: {
        snapshot: {
          source_sha256: SHA,
          index_version: '1.0.0',
          source_schema_version: '1.1',
          source_bytes: 876098,
        },
        body: 'card',
        byte_length: 4,
        generated_from_index: true,
      },
      candidates_by_query: {},
    });
    const report = assertNoLeakage({ assembled, inactiveRouteModuleIds: ['route-modify', 'route-audit'] });
    return assembled.route_modules_loaded === 1 && report.clean;
  },
});

runner.register({
  case_id: 'WB-INV-01',
  statement: 'Every registered invariant names exactly one enforcement owner and a unique error code.',
  covers: 'src/validation/invariant-registry.ts',
  check: () =>
    INVARIANTS.every((invariant) => invariant.owner.length > 0) &&
    new Set(INVARIANTS.map((i) => i.error_code)).size === INVARIANTS.length,
});

// ---- Preserved as historical: NOT migrated, with the reason ----

runner.preserveHistorical({
  case_id: 'V1-RESULTS-18',
  statement: 'The 18 first-pass Results rows (89% batch pass rate).',
  reason: 'depends-on-live-model',
  note:
    'All 18 carry the same reviewer label (architect-self-review) and the same v1.2 prompt version. ' +
    'Architect self-simulation, not live evidence. Cannot be re-derived without a model adapter.',
});

runner.preserveHistorical({
  case_id: 'V1-FIXTURE-WARNING-TOAST',
  statement: 'warning-toast-run-002 graded PASS as the canonical output example.',
  reason: 'depends-on-contaminated-fixture',
  note:
    'Contains a fabricated border-width path at High confidence and a text style claimed at the wrong ' +
    'size. Its PASS verdict is not evidence. Superseded by tests/fixtures/active/.',
});

runner.preserveHistorical({
  case_id: 'V1-SCHEMA-OPEN',
  statement: 'Cases asserting the v1 output schema accepted a given payload.',
  reason: 'depends-on-open-schema',
  note:
    'The v1 schema had zero occurrences of additionalProperties/unevaluatedProperties, so every object ' +
    'accepted arbitrary fields. A pass against it says nothing about the closed contract.',
});

runner.preserveHistorical({
  case_id: 'V1-SCORE-80-100',
  statement: 'Reviewer cases asserting an 80/100 pass threshold.',
  reason: 'depends-on-scalar-scoring',
  note:
    'DR-1 retired the 0-100 weighted model; no scalar score is emitted. The weighted sum ran on ' +
    'LLM-assigned severities, so its determinism was always partial.',
});

runner.preserveHistorical({
  case_id: 'V1-BUILDER-SYNTH',
  statement: 'Cases asserting Builder or Synthesizer behaviour.',
  reason: 'depends-on-unbuilt-stage',
  note: 'Neither stage exists in Phase 1 (§7.2). Their contracts are recorded in the ripple document.',
});

// ---- Run ----

const args = process.argv.slice(2);
const outFlag = args.indexOf('--out');
const outPath = outFlag >= 0 ? args[outFlag + 1] : undefined;

const report = runner.run(new Date().toISOString());
const rendered = renderReport(report);

if (outPath === undefined) {
  process.stdout.write(`${rendered}\n`);
} else {
  // Append, never overwrite: a historical result is evidence of what was believed at
  // the time, and overwriting it destroys the ability to see a metric move (§17.3).
  if (existsSync(outPath)) appendFileSync(outPath, `\n\n${rendered}\n`, 'utf8');
  else writeFileSync(outPath, `${rendered}\n`, 'utf8');
  process.stdout.write(
    `Appended to ${outPath}: ${report.passed}/${report.total_registered} passed, ` +
      `${report.failed} failed, ${report.not_executed} not-executed, ${report.historical} historical\n`,
  );
}

process.exitCode = report.clean ? 0 : 1;
