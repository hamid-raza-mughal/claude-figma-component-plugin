/**
 * B4 — the sanitized empirical corpus, and the proof that it is sanitized.
 *
 * `tests/representation/fixtures/empirical/` is a pseudonymized promotion of the
 * research package's contracts, evidence artifacts and probes (BP-5). These are
 * **v0.4.0-draft documents, deliberately not migrated.** They are the "before":
 * the corpus the production validator has to prove itself against in B5, so
 * correcting them here would delete the evidence.
 *
 * The load-bearing tests in this file are the negative ones. A sanitizer is
 * trusted exactly as far as it is checked, and "we replaced the identifiers" is
 * the sort of claim that is true for four of five shapes and quietly false for
 * the fifth. So the corpus is scanned for every shape, for the redacted names,
 * and — the strongest of the three — **every 64-hex string in it is accounted
 * for**: it is either the SHA-256 of a promoted file, or the recomputable
 * `unpromoted:` marker. A hash that is neither would be a hash over real bytes,
 * which is what BP-5 forbids and what `docs/v1-baseline-manifest.md` already
 * shows the cost of.
 *
 * The four verified defects the corpus carries are asserted to still be there.
 * A sanitizer that quietly repaired D-3 or D-6 would leave a green suite over a
 * corpus that no longer demonstrates anything.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createAssigner,
  collectFrom,
  collectFromFileName,
  sanitiseText,
  sanitiseFileName,
  unpromotedHash,
  sha256,
  assertMappingOutsideRepository,
} from '../../tools/promote-representation-evidence.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const CORPUS = join(HERE, 'fixtures', 'empirical');

function collect(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...collect(full));
    else out.push(full);
  }
  return out.sort();
}

const files = collect(CORPUS);
const texts = new Map(files.map((file) => [file, readFileSync(file, 'utf8')]));

describe('B4 · the corpus carries no real identifier', () => {
  const shapes: readonly { readonly name: string; readonly pattern: RegExp }[] = [
    { name: 'a Figma node id', pattern: /\b\d{2,6}:\d{1,6}\b/ },
    { name: 'a variable collection id', pattern: /VariableCollectionId:[0-9a-f]{40}/ },
    { name: 'a variable id', pattern: /VariableID:[0-9a-f]{40}/ },
    { name: 'a style key', pattern: /\bS:[0-9a-f]{40}\b/ },
    { name: 'a 40-hex component or style key', pattern: /(^|[^0-9a-f])[0-9a-f]{40}([^0-9a-f]|$)/ },
  ];

  for (const shape of shapes) {
    test(`no promoted file carries ${shape.name}`, () => {
      const offenders = [...texts]
        .filter(([, text]) => shape.pattern.test(text))
        .map(([file]) => relative(CORPUS, file));
      assert.deepEqual(offenders, []);
    });
  }

  test('no promoted file carries the redacted design system name', () => {
    const offenders = [...texts]
      .filter(([, text]) => /adalfi/i.test(text))
      .map(([file]) => relative(CORPUS, file));
    assert.deepEqual(offenders, []);
  });

  test('no promoted file names the research directory (BP-1, BP-2)', () => {
    const offenders = [...texts]
      .filter(([, text]) => text.includes('plugin_explore_phase'))
      .map(([file]) => relative(CORPUS, file));
    assert.deepEqual(offenders, [], 'two research reports named their own location; both were redacted');
  });

  test('no file name carries an identifier either', () => {
    // A file name of the form `enumeration-<node>-<id>.json` carries a real node
    // id in a tracked path,
    // which is the same defect as one in a tracked field and is exactly what
    // cost `.gitignore` two lines earlier in this phase.
    const offenders = files
      .map((file) => relative(CORPUS, file))
      .filter((name) => /\b\d{2,6}-\d{1,6}\b/.test(name) || /adalfi/i.test(name));
    assert.deepEqual(offenders, []);
  });

  test('no screenshot was promoted (BP-5)', () => {
    const images = files.filter((file) =>
      ['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(extname(file).toLowerCase()),
    );
    assert.deepEqual(
      images.map((file) => relative(CORPUS, file)),
      [],
      'screenshots back no structural claim and are the largest identifying payload',
    );
  });

  test('no research tooling was promoted (BP-7 keeps the package frozen)', () => {
    const scripts = files.filter((file) => ['.py', '.sh', '.js'].includes(extname(file)));
    assert.deepEqual(scripts.map((file) => relative(CORPUS, file)), []);
  });
});

describe('B4 · every hash in the corpus is accounted for', () => {
  /**
   * The closed check. A tracked SHA-256 is legitimate in exactly two ways: it
   * is the hash of a file that was promoted, so it validates the bytes actually
   * tracked, or it is the `unpromoted:` marker, which anyone can recompute from
   * the placeholder and which therefore asserts nothing about content. A third
   * kind — a hash over bytes that exist only in the research corpus — is what
   * BP-5 forbids.
   */
  test('no 64-hex string is a hash over bytes that were not promoted', () => {
    const promotedHashes = new Set([...texts.values()].map((text) => sha256(text)));
    const markers = new Set(
      Array.from({ length: 500 }, (_unused, index) =>
        unpromotedHash(`SHA-${String(index + 1).padStart(4, '0')}`),
      ),
    );

    const unaccounted = new Map<string, string>();
    for (const [file, text] of texts) {
      for (const match of text.matchAll(/\b[0-9a-f]{64}\b/g)) {
        const value = match[0];
        if (!promotedHashes.has(value) && !markers.has(value)) {
          unaccounted.set(value, relative(CORPUS, file));
        }
      }
    }
    assert.deepEqual(
      [...unaccounted],
      [],
      'a hash that is neither a promoted file nor a recomputable marker is a hash over real bytes',
    );
  });

  test('at least one hash really does validate a promoted file', () => {
    // Guards the check above from passing vacuously. If every hash had become a
    // marker, "hash validation stays real" would be false while the test stayed
    // green — which is the failure mode this whole phase is about.
    const promotedHashes = new Set([...texts.values()].map((text) => sha256(text)));
    const hits = [...texts.values()].flatMap((text) =>
      [...text.matchAll(/\b[0-9a-f]{64}\b/g)]
        .map((match) => match[0])
        .filter((value) => promotedHashes.has(value)),
    );
    assert.ok(hits.length > 0, 'no recorded hash resolves to a promoted file');
  });
});

describe('B4 · the corpus still demonstrates the defects it was promoted for', () => {
  const pill = join(CORPUS, 'non_button_validation', 'pill');

  test('D-6 — the shared-build-frame probe is byte-identical to its subject', () => {
    const probe = readFileSync(join(pill, 'probe-C-shared-build-frame.json'), 'utf8');
    const contract = readFileSync(join(pill, 'non-button-experimental-contract.json'), 'utf8');
    assert.equal(
      sha256(probe),
      sha256(contract),
      'sanitization must not have made the probe differ — "probe C passes" is a restatement of ' +
        '"the contract passes", and that is the finding',
    );
  });

  test('D-3 — the matrix-cell rule still targets a list representation', () => {
    const contract = JSON.parse(
      readFileSync(join(pill, 'non-button-experimental-contract.json'), 'utf8'),
    ) as {
      validationRules: { ruleId: string; detectionCondition: string }[];
      layoutRepresentations: { representationId: string; strategy: string }[];
    };
    const rule = contract.validationRules.find((r) => r.ruleId === 'VR-1');
    assert.ok(rule !== undefined);
    assert.match(rule.detectionCondition, /LR-1/);
    const byId = new Map(
      contract.layoutRepresentations.map((r) => [r.representationId, r.strategy]),
    );
    assert.equal(byId.get('LR-1'), 'list', 'the rule names LR-1');
    assert.equal(byId.get('LR-2'), 'matrix', 'and the matrix is LR-2');
  });

  test('D-1 — the Button contract still names retired v0.3 vocabulary inside a sentence', () => {
    const contract = JSON.parse(
      readFileSync(join(CORPUS, 'Builder_comp_rep_docs', 'component-representation-contract.json'), 'utf8'),
    ) as { validationRules: { ruleId: string; detectionCondition: string }[] };
    const rule = contract.validationRules.find((r) => r.ruleId === 'VR-9');
    assert.ok(rule !== undefined);
    for (const token of [
      'appliesToScopes=buttons',
      'classification=button_specific_pattern',
      'candidate_cross_component_invariant',
    ]) {
      assert.ok(
        rule.detectionCondition.includes(token),
        `${token} is the reason the rule is unactionable, and it must survive the promotion`,
      );
    }
  });

  test('D-11 — the change plan still declares two contradictory statuses', () => {
    const lines = readFileSync(join(pill, 'v0.4.0-draft-change-plan.md'), 'utf8').split('\n');
    const head = lines.slice(0, 12).join('\n');
    assert.match(head, /IMPLEMENTED and LOCKED/);
    assert.match(head, /PROPOSED\. Not implemented\./);
  });
});

describe('B4 · the promotion tool', () => {
  test('a mapping directory inside the repository is refused', () => {
    for (const inside of ['.', './evidence', 'tests/representation/fixtures', join(HERE, 'x')]) {
      assert.throws(
        () => assertMappingOutsideRepository(inside),
        /inside the repository/,
        `${inside} must be refused`,
      );
    }
  });

  test('a path that resolves back inside is refused too', () => {
    // `../../repo/evidence` is the version of this mistake that a prefix check
    // on the raw string would wave through.
    assert.throws(
      () => assertMappingOutsideRepository(join(HERE, '..', '..', '..', 'claude-figma-component-plugin', 'evidence')),
      /inside the repository/,
    );
  });

  test('a directory outside the repository is accepted', () => {
    assert.doesNotThrow(() => assertMappingOutsideRepository('/tmp/some-evidence-pack'));
  });

  test('placeholder assignment does not depend on the order values are seen', () => {
    const forward = createAssigner();
    const backward = createAssigner();
    const values = ['1:1', '2:2', '3:3'];
    for (const value of values) forward.collect('NODE', value);
    for (const value of [...values].reverse()) backward.collect('NODE', value);
    forward.freeze();
    backward.freeze();
    assert.deepEqual(forward.mapping().real_to_placeholder, backward.mapping().real_to_placeholder);
  });

  /**
   * The regression for the bug this work package actually shipped and then
   * caught. Placeholder numbers follow sorted order, so every number shifts when
   * a new value is discovered — and the first version of the assigner assigned
   * as it substituted. Values seen early were written with numbers that were
   * correct at the time and stale immediately after, and three distinct hashes
   * ended up sharing one placeholder in the promoted corpus.
   *
   * It is not a leak. It is worse in a quieter way: it merges identifiers the
   * corpus distinguished, and the mapping written beside it stops describing the
   * text. Determinism tests did not see it because the bug is deterministic, and
   * the order-independence test did not see it because it exercised `mapping()`
   * rather than `placeholderFor()`. This asserts the property that matters — an
   * injective substitution — over the substituted output.
   */
  test('distinct identifiers never collapse onto one placeholder', () => {
    const assigner = createAssigner();
    // Deliberately given in an order that makes early values sort late, which
    // is the arrangement the shifting-index bug needed.
    const reals = ['999:9', '500:5', '100:1', '10:1'].map((value) => value);
    const text = reals.join(' and ');
    collectFrom(text, { assigner, literals: [] });
    assigner.freeze();
    const out = sanitiseText(text, { assigner, literals: [] });
    const placeholders = out.split(' and ');
    assert.equal(
      new Set(placeholders).size,
      reals.length,
      `four identifiers became ${new Set(placeholders).size} placeholders: ${out}`,
    );
  });

  test('substituting a value that was never collected raises rather than guessing', () => {
    const assigner = createAssigner();
    assigner.collect('NODE', '1:1');
    assigner.freeze();
    assert.throws(() => assigner.placeholderFor('NODE', '2:2'), /without being collected/);
  });

  test('the phases cannot be run out of order', () => {
    const assigner = createAssigner();
    assert.throws(() => assigner.placeholderFor('NODE', '1:1'), /before freeze/);
    assigner.freeze();
    assert.throws(() => assigner.collect('NODE', '1:1'), /after freeze/);
  });

  test('a compound identifier is replaced whole, never half', () => {
    // A variable collection id contains a node id. Applying the bare node rule
    // first would leave `VariableCollectionId:<hex>/NODE-0001` — sanitized-
    // looking and still carrying the key.
    const assigner = createAssigner();
    // Composed, never pasted. The first version of this test lifted a real node
    // id out of the corpus and put it in a committed file — inside the work
    // package whose subject is keeping real identifiers out of committed files.
    // `tests/unit/identifier-leakage.test.ts` caught it, which is what it is for.
    const node = `${'8'.repeat(3)}:${'6'.repeat(4)}`;
    const text = `VariableCollectionId:${'a'.repeat(40)}/${node} and a bare ${node}`;
    collectFrom(text, { assigner, literals: [] });
    assigner.freeze();
    const out = sanitiseText(text, { assigner, literals: [] });
    assert.doesNotMatch(out, /[0-9a-f]{40}/);
    assert.doesNotMatch(out, /\b\d{2,6}:\d{1,6}\b/);
    assert.match(out, /VC-0001/);
  });

  test('a redacted literal is replaced whatever its casing', () => {
    // The corpus writes one name three ways. A case-sensitive pass would have
    // removed two and left the third looking sanitized.
    const assigner = createAssigner();
    const literals = [{ kind: 'NAME', value: 'Acme' }];
    assigner.collect('NAME', 'acme');
    assigner.freeze();
    const out = sanitiseText('Acme and acme and AcMe', { assigner, literals });
    assert.doesNotMatch(out, /acme/i);
  });

  test('a file name carrying a node id is renamed', () => {
    const assigner = createAssigner();
    const name = `enumeration-${'7'.repeat(3)}-${'1'.repeat(5)}.json`;
    collectFromFileName(name, assigner);
    assigner.freeze();
    assert.equal(sanitiseFileName(name, assigner), 'enumeration-NODE-0001.json');
  });

  test('the unpromoted marker is recomputable from the placeholder alone', () => {
    assert.equal(unpromotedHash('SHA-0001'), sha256('unpromoted:SHA-0001'));
    assert.notEqual(unpromotedHash('SHA-0001'), unpromotedHash('SHA-0002'));
  });
});
