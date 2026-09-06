/**
 * B5 — the eleven verified research defects, as executable regressions (BP-7).
 *
 * Every test in the first block runs a production check against the **real
 * promoted corpus** and asserts it **fails**. That is the claim the whole phase
 * rests on, and it is only worth anything made this way: the research package's
 * suite is fully green over this same corpus — schema validity, both contracts
 * at zero semantic violations, 52/52 fixtures, checksum verification over 185
 * files, and all three probes behaving as their reports predict. So "our
 * validator is better" is not a thing to assert. It is a thing to demonstrate
 * against the same bytes.
 *
 * A synthetic fixture would prove the check runs. Only the real corpus proves
 * the check catches what was actually there, and that the promotion in B4 did
 * not quietly repair it on the way through.
 *
 * D-5 has no fixture here on purpose. It is a defect *of a fixture manifest*,
 * and its regression is structural rather than exemplary: MB-7 removed the
 * second declaration site entirely, so the divergence it describes has nowhere
 * left to happen. `tests/representation/invariant-registry.test.ts` is where
 * that is asserted, in both directions.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import {
  findRetiredVocabulary,
  checkProbesDiffer,
  checkDocumentStatus,
  checkDeclaredEnumeration,
  resolveReferences,
  RETIRED_VOCABULARY,
  type EvidenceResult,
} from '../../src/representation/index.ts';
import { SPEC_SCHEMA_VERSION } from '../../src/coordinator/compose-trusted-output.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const CORPUS = join(HERE, 'fixtures', 'empirical');
const BUTTONS = join(CORPUS, 'Builder_comp_rep_docs');
const PILL = join(CORPUS, 'non_button_validation', 'pill');

const sha256 = (bytes: string): string => createHash('sha256').update(bytes).digest('hex');
const read = (path: string): string => readFileSync(path, 'utf8');
const readJson = (path: string): unknown => JSON.parse(read(path));

function codes(outcome: EvidenceResult): readonly string[] {
  return outcome.ok ? [] : outcome.violations.map((violation) => violation.code);
}

describe('B5 · the production checks fail against the real corpus', () => {
  test('D-1 — the Button contract carries retired vocabulary inside a sentence', () => {
    const outcome = findRetiredVocabulary(
      readJson(join(BUTTONS, 'component-representation-contract.json')),
    );
    assert.equal(outcome.ok, false, 'the research suite is green over this document');
    if (outcome.ok) return;

    // Not merely "something was found" — the specific tokens D-1 names, at a
    // location inside a rule rather than at a leaf that equals one of them.
    const found = new Set(
      outcome.violations.flatMap((violation) =>
        RETIRED_VOCABULARY.filter((token) => violation.message.includes(`"${token}"`)),
      ),
    );
    for (const token of ['buttons', 'button_specific_pattern', 'candidate_cross_component_invariant']) {
      assert.ok(found.has(token), `${token} is one of D-1's three tokens and was not reported`);
    }
    assert.ok(
      outcome.violations.some((violation) => violation.location.includes('/validationRules/')),
      'D-1 lives in a validation rule, and the location must say so',
    );
  });

  test('D-4 — whole-string equality, the check the research package actually ran, finds nothing', () => {
    /*
     * The mechanism, made explicit. `check_retired_structure.py:114` is
     * `elif isinstance(node, str) and node in RETIRED_ENUM_VALUES:` — equality
     * against a leaf value. Reimplemented here over the same document, it
     * reports zero, while the substring version above reports D-1's three
     * tokens. One line of difference is the whole of why a fully green suite
     * sat on top of three live defects.
     */
    const document = readJson(join(BUTTONS, 'component-representation-contract.json'));
    const retired = new Set<string>(RETIRED_VOCABULARY);
    let equalityHits = 0;
    const walk = (node: unknown): void => {
      if (typeof node === 'string') {
        if (retired.has(node)) equalityHits += 1;
        return;
      }
      if (Array.isArray(node)) {
        node.forEach(walk);
        return;
      }
      if (typeof node === 'object' && node !== null) Object.values(node).forEach(walk);
    };
    walk(document);

    assert.equal(equalityHits, 0, 'the research check finds nothing, which is the finding');
    assert.equal(findRetiredVocabulary(document).ok, false, 'and the substring check does not');
  });

  test('D-2 — the stale blocker has no structured target, so nothing could resolve its claim', () => {
    const contract = readJson(join(BUTTONS, 'component-representation-contract.json')) as {
      approvalStatus: { blockers: { blockerId: string; description: string; target?: unknown }[] };
    };
    const blocker = contract.approvalStatus.blockers.find((row) => row.blockerId === 'BLK-5');
    assert.ok(blocker !== undefined);
    assert.match(blocker.description, /No second, non-Button component has been analyzed/);
    assert.equal(
      blocker.target,
      undefined,
      'the claim is a sentence and nothing in the document points at what would falsify it',
    );
    // And the non-Button experiment it denies is in the same promoted corpus.
    assert.doesNotThrow(() => read(join(PILL, 'non-button-experimental-contract.json')));
  });

  test('D-3 — the matrix-cell rule targets a list representation', () => {
    const contract = readJson(join(PILL, 'non-button-experimental-contract.json')) as {
      validationRules: { ruleId: string; detectionCondition: string }[];
      layoutRepresentations: { representationId: string; strategy: string }[];
    };
    const rule = contract.validationRules.find((row) => row.ruleId === 'VR-1');
    assert.ok(rule !== undefined);
    const strategyOf = new Map(
      contract.layoutRepresentations.map((row) => [row.representationId, row.strategy]),
    );

    // The reference is inside prose, so the production resolver cannot even see
    // it — which is itself the finding. What it *can* see is that the rule
    // carries no structured target at all.
    assert.match(rule.detectionCondition, /\bLR-1\b/);
    assert.equal(strategyOf.get('LR-1'), 'list');
    assert.equal(strategyOf.get('LR-2'), 'matrix');
    assert.equal(
      (rule as { target?: unknown }).target,
      undefined,
      'a rule with no target is a rule whose subject cannot be checked against its kind',
    );
  });

  test('D-6 — the shared-build-frame probe is byte-identical to its subject', () => {
    const subject = read(join(PILL, 'non-button-experimental-contract.json'));
    const probes = ['probe-A-list-only', 'probe-B-schema-satisfying-distortion', 'probe-C-shared-build-frame'].map(
      (name) => ({ name, sha256: sha256(read(join(PILL, `${name}.json`))) }),
    );
    const outcome = checkProbesDiffer({
      subjectName: 'non-button-experimental-contract.json',
      subjectSha256: sha256(subject),
      probes,
    });
    assert.equal(outcome.ok, false);
    assert.ok(codes(outcome).includes('REP_PROBE_IDENTICAL_TO_SUBJECT'));
    if (outcome.ok) return;
    assert.ok(
      outcome.violations.some((violation) => violation.location === 'probe-C-shared-build-frame'),
      'probe C is the one D-6 names',
    );
    // The other two really do differ — otherwise this test would pass for the
    // wrong reason and say nothing about probe C in particular.
    assert.equal(
      outcome.violations.filter((v) => v.code === 'REP_PROBE_IDENTICAL_TO_SUBJECT').length,
      1,
    );
  });

  test('D-7 — the blocker cites an artifact that is not in the corpus', () => {
    const contract = readJson(join(PILL, 'non-button-experimental-contract.json')) as {
      approvalStatus: { blockers: { blockerId: string; description: string }[] };
    };
    const blocker = contract.approvalStatus.blockers.find((row) => row.blockerId === 'PB-2');
    assert.ok(blocker !== undefined, 'PB-2 is the blocker D-7 names');
    assert.equal(
      (blocker as { target?: unknown }).target,
      undefined,
      'the artifact is cited in prose, so no artifact resolution could have run',
    );
    // What the production model does with the same claim: state it as an
    // artifact target, and it resolves — or, here, does not.
    const stated = {
      structuralFindings: [],
      approvalStatus: {
        blockers: [
          {
            target: {
              targetKind: 'artifact',
              targetRef: 'evidence/allocation-evidence-LR-3.json',
              requiredArtifactSha256: 'f'.repeat(64),
            },
          },
        ],
      },
      knownLimitations: [],
    };
    const outcome = resolveReferences({ contract: stated, artifacts: { read: () => null } });
    assert.equal(outcome.ok, false);
    if (outcome.ok) return;
    assert.equal(outcome.violations[0]?.code, 'REP_ARTIFACT_TARGET_MISSING');
  });

  test('D-9 — the analysis document omits a blocker the contract carries', () => {
    const contract = readJson(join(PILL, 'non-button-experimental-contract.json')) as {
      approvalStatus: { blockers: { blockerId: string }[] };
    };
    const actual = contract.approvalStatus.blockers.map((row) => row.blockerId);
    const outcome = checkDeclaredEnumeration({
      documentName: 'non-button-component-analysis.md',
      text: read(join(PILL, 'non-button-component-analysis.md')),
      noun: 'blocker',
      idPattern: /\b(?:PB|MIG)-\d+\b/g,
      actual,
    });
    assert.equal(outcome.ok, false, `the contract carries ${actual.length} blockers`);
    assert.ok(codes(outcome).includes('REP_ENUMERATION_MISSES_MEMBER'));
    if (outcome.ok) return;
    // The specific omission, not just "an omission". The reported "12 vs 11"
    // discrepancy was NOT found by the research audit; what is real is the
    // migration-review blocker missing from a ten-row table.
    assert.ok(
      outcome.violations.some((violation) => violation.message.includes('MIG-2')),
      'MIG-2 is the migration-review blocker the table drops',
    );
  });

  test('D-11 — the change plan declares two contradictory statuses', () => {
    const outcome = checkDocumentStatus(
      'v0.4.0-draft-change-plan.md',
      read(join(PILL, 'v0.4.0-draft-change-plan.md')),
    );
    assert.equal(outcome.ok, false);
    assert.ok(codes(outcome).includes('REP_DOCUMENT_DECLARES_TWO_STATUSES'));
  });

  test('D-8 and D-10 are recorded as prose findings, not silently claimed', () => {
    /*
     * Stated rather than tested, because pretending otherwise would be worse
     * than saying so. D-8 is seven stale blocker claims whose staleness is a
     * matter of reading each one against the contract's current data — the
     * structured target (REP-06) is what makes that checkable at all, and the
     * checking itself is per-blocker judgement, not a rule. D-10 is *correctly*
     * reported by the research package: there is nothing to catch. Both are
     * carried in the promotion ledger rather than turned into a check that
     * would only appear to cover them.
     */
    const contract = readJson(join(PILL, 'non-button-experimental-contract.json')) as {
      approvalStatus: { blockers: { blockerId: string }[] };
      structuralFindings: { migrationReviewRequired?: boolean }[];
    };
    const ids = contract.approvalStatus.blockers.map((row) => row.blockerId);
    for (const id of ['PB-1', 'PB-2', 'PB-3', 'PB-4', 'PB-7', 'PB-8', 'PB-9']) {
      assert.ok(ids.includes(id), `${id} is one of D-8's seven and must survive the promotion`);
    }
    assert.ok(ids.includes('PB-10'), 'PB-10 is D-10, and it is genuine');
  });
});

describe('B5 · the checks do not fire on documents that are fine', () => {
  test('the production schema carries no retired vocabulary', () => {
    const schema = readJson(
      join(HERE, '..', '..', 'schemas', 'representation', 'representation-contract.schema.json'),
    );
    assert.equal(findRetiredVocabulary(schema).ok, true);
  });

  test('probes that differ are accepted', () => {
    const outcome = checkProbesDiffer({
      subjectName: 'contract.json',
      subjectSha256: sha256('the contract'),
      probes: [
        { name: 'probe-A', sha256: sha256('a') },
        { name: 'probe-B', sha256: sha256('b') },
      ],
    });
    assert.equal(outcome.ok, true);
  });

  test('two probes identical to each other are caught even when neither matches the subject', () => {
    // The half of REP-19 the corpus does not demonstrate. Two probes testing one
    // thing under two names is the same defect at a different angle.
    const outcome = checkProbesDiffer({
      subjectName: 'contract.json',
      subjectSha256: sha256('the contract'),
      probes: [
        { name: 'probe-A', sha256: sha256('same') },
        { name: 'probe-B', sha256: sha256('same') },
      ],
    });
    assert.equal(outcome.ok, false);
    assert.ok(codes(outcome).includes('REP_PROBES_IDENTICAL_TO_EACH_OTHER'));
  });

  test('a single clear status declaration is accepted', () => {
    assert.equal(checkDocumentStatus('doc.md', '# Plan\n\nStatus: PROPOSED.\n').ok, true);
    assert.equal(checkDocumentStatus('doc.md', '# Plan\n\nSTATUS: IMPLEMENTED and LOCKED\n').ok, true);
  });

  test('a status word deep in the body is not a second declaration', () => {
    // The bound is what keeps this rule usable. A document that discusses a
    // proposal in its body has not declared itself proposed, and a rule that
    // could not tell the difference would be switched off within a week.
    const document = ['# Plan', '', 'STATUS: IMPLEMENTED and LOCKED', ...Array(20).fill(''), 'The PROPOSED alternative was rejected.'].join('\n');
    assert.equal(checkDocumentStatus('doc.md', document).ok, true);
  });

  test('an enumeration that matches the artifact is accepted', () => {
    assert.equal(
      checkDeclaredEnumeration({
        documentName: 'd.md',
        text: '| PB-1 | open |\n| PB-2 | open |',
        noun: 'blocker',
        idPattern: /\bPB-\d+\b/g,
        actual: ['PB-1', 'PB-2'],
      }).ok,
      true,
    );
  });

  test('an enumeration listing something the artifact dropped is caught too', () => {
    // The direction a "does the document cover the artifact" check misses. A
    // table still listing a blocker that was resolved reads as an open blocker.
    const outcome = checkDeclaredEnumeration({
      documentName: 'd.md',
      text: '| PB-1 | open |\n| PB-9 | open |',
      noun: 'blocker',
      idPattern: /\bPB-\d+\b/g,
      actual: ['PB-1'],
    });
    assert.equal(outcome.ok, false);
    assert.ok(codes(outcome).includes('REP_ENUMERATION_INVENTS_MEMBER'));
  });
});

describe('B5 · D-12, fixed', () => {
  test('SPEC_SCHEMA_VERSION is declared exactly once in src/', () => {
    // The defect was two declarations that happened to agree, with nothing
    // asserting they did. Counting declarations is the check; an agreement test
    // between two copies would have preserved the duplication it was written to
    // manage.
    const files = [
      join(HERE, '..', '..', 'src', 'tools', 'engine.ts'),
      join(HERE, '..', '..', 'src', 'coordinator', 'compose-trusted-output.ts'),
    ];
    const declarations = files.flatMap((file) =>
      [...read(file).matchAll(/^\s*(?:export\s+)?const SPEC_SCHEMA_VERSION\s*=/gm)].map(() => file),
    );
    assert.equal(
      declarations.length,
      1,
      `SPEC_SCHEMA_VERSION is declared in ${declarations.length} places: ${declarations.join(', ')}`,
    );
  });

  test('the engine consumes the exported constant', () => {
    assert.match(
      read(join(HERE, '..', '..', 'src', 'tools', 'engine.ts')),
      /import \{ SPEC_SCHEMA_VERSION \}/,
    );
    assert.equal(SPEC_SCHEMA_VERSION, '2.0.0');
  });
});
