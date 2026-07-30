/**
 * Gate 1 evidence for the identity seam (P1-FINAL §12).
 *
 * One test per required property, plus the adversarial cases that matter: a
 * fabricated id, an altered ref, a re-exported source, a rebuilt index format.
 * These are the mechanisms by which a wrong resolution would otherwise pass.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  makeCandidateId,
  makeCandidateIdentity,
  makeSourceRecordRef,
  parseSourceRecordRef,
  assertIdentityFresh,
  assertIdentityConsistent,
  isWellFormedCandidateId,
  compareRanked,
  rankStably,
  IdentityError,
  REF_CLASSES,
  CANDIDATE_ID_PREFIX,
  type IdentitySeed,
} from '../../src/contracts/identity.ts';

const SHA_A = '2222a2b8eff4224f76ddad591cf6f46c6e8bb25ec7f96aebbf13941876356627';
const SHA_B = 'a'.repeat(64);

const SEED: IdentitySeed = {
  refClass: 'paint-style',
  normalizedId: 'S:cfdda1d5d4bf3ab67fd2d15413224854c1b143ca',
  sourceSha256: SHA_A,
  indexVersion: '1.0.0',
};

describe('property 1 — candidate_id is deterministic and opaque', () => {
  test('identical seeds produce identical ids', () => {
    assert.equal(makeCandidateId(SEED), makeCandidateId({ ...SEED }));
  });

  test('ids are well formed and carry no parseable payload', () => {
    const id = makeCandidateId(SEED);
    assert.ok(isWellFormedCandidateId(id));
    assert.ok(id.startsWith(CANDIDATE_ID_PREFIX));
    // Opacity is the point: nothing about the record leaks into the id, so the
    // model cannot infer a path from it or edit one into a different record.
    assert.ok(!id.includes('cfdda1d5'), 'id must not embed the record key');
    assert.ok(!id.includes('paint'), 'id must not embed the ref class');
  });

  test('a different record yields a different id', () => {
    const other = makeCandidateId({ ...SEED, normalizedId: 'S:0000000000000000000000000000000000000000' });
    assert.notEqual(makeCandidateId(SEED), other);
  });

  test('mode-scoped candidates are distinct from unscoped ones', () => {
    assert.notEqual(makeCandidateId(SEED), makeCandidateId({ ...SEED, mode: 'Dark' }));
    assert.notEqual(
      makeCandidateId({ ...SEED, mode: 'Dark' }),
      makeCandidateId({ ...SEED, mode: 'Light' }),
    );
  });

  test('every ref class produces a distinct id for the same record id', () => {
    const ids = new Set(REF_CLASSES.map((refClass) => makeCandidateId({ ...SEED, refClass })));
    assert.equal(ids.size, REF_CLASSES.length, 'ref_class must participate in identity');
  });

  test('rejects a malformed source hash or index version rather than hashing it', () => {
    assert.throws(
      () => makeCandidateId({ ...SEED, sourceSha256: 'not-a-hash' }),
      (e: unknown) => e instanceof IdentityError && e.code === 'IDENTITY_INVALID_SEED',
    );
    assert.throws(
      () => makeCandidateId({ ...SEED, indexVersion: 'v1' }),
      (e: unknown) => e instanceof IdentityError && e.code === 'IDENTITY_INVALID_SEED',
    );
  });
});

describe('property 2 — source_record_ref resolves to exactly one record', () => {
  test('round-trips without mode', () => {
    const ref = makeSourceRecordRef(SEED);
    const parsed = parseSourceRecordRef(ref);
    assert.equal(parsed.refClass, SEED.refClass);
    assert.equal(parsed.normalizedId, SEED.normalizedId);
    assert.equal(parsed.mode, undefined);
  });

  test('round-trips with mode', () => {
    const ref = makeSourceRecordRef({ ...SEED, mode: 'Dark' });
    const parsed = parseSourceRecordRef(ref);
    assert.equal(parsed.normalizedId, SEED.normalizedId);
    assert.equal(parsed.mode, 'Dark');
  });

  /** Variable paths are TitleCase and style paths lowercase in the source, so a
   *  ref must survive both without folding. */
  test('round-trips a TitleCase variable path', () => {
    const ref = makeSourceRecordRef({ refClass: 'variable', normalizedId: 'Body/sm/size' });
    const parsed = parseSourceRecordRef(ref);
    assert.equal(parsed.refClass, 'variable');
    assert.equal(parsed.normalizedId, 'Body/sm/size');
  });

  test('rejects an ambiguous record id containing the mode separator', () => {
    assert.throws(
      () => makeSourceRecordRef({ ...SEED, normalizedId: 'has@at' }),
      (e: unknown) => e instanceof IdentityError && e.code === 'IDENTITY_INVALID_SEED',
    );
  });

  test('rejects malformed refs', () => {
    for (const bad of ['', 'nocolon', 'unknown-class:x', 'variable:', ':x', 'variable:x@']) {
      assert.throws(
        () => parseSourceRecordRef(bad),
        (e: unknown) => e instanceof IdentityError && e.code === 'IDENTITY_MALFORMED_REF',
        `expected rejection for ${JSON.stringify(bad)}`,
      );
    }
  });
});

describe('property 3 — identity changes when source or index format changes', () => {
  test('a re-exported source changes every id', () => {
    assert.notEqual(makeCandidateId(SEED), makeCandidateId({ ...SEED, sourceSha256: SHA_B }));
  });

  test('an index format change changes every id', () => {
    assert.notEqual(makeCandidateId(SEED), makeCandidateId({ ...SEED, indexVersion: '2.0.0' }));
  });

  test('a stale source is rejected, and named as such', () => {
    const identity = makeCandidateIdentity(SEED);
    assert.throws(
      () => assertIdentityFresh(identity, { source_sha256: SHA_B, index_version: '1.0.0' }),
      (e: unknown) => e instanceof IdentityError && e.code === 'IDENTITY_STALE_SOURCE',
    );
  });

  /** A changed source and a changed index format need different remedies —
   *  re-resolve versus rebuild — so they must not collapse into one error. */
  test('a stale index format is rejected distinctly from a stale source', () => {
    const identity = makeCandidateIdentity(SEED);
    assert.throws(
      () => assertIdentityFresh(identity, { source_sha256: SHA_A, index_version: '2.0.0' }),
      (e: unknown) => e instanceof IdentityError && e.code === 'IDENTITY_STALE_INDEX',
    );
  });

  test('a fresh identity passes', () => {
    const identity = makeCandidateIdentity(SEED);
    assert.doesNotThrow(() =>
      assertIdentityFresh(identity, { source_sha256: SHA_A, index_version: '1.0.0' }),
    );
  });
});

describe('property 4 — no row number in a public contract', () => {
  test('the identity tuple has exactly the four frozen fields', () => {
    const identity = makeCandidateIdentity(SEED);
    assert.deepEqual(Object.keys(identity).sort(), [
      'candidate_id',
      'index_version',
      'source_record_ref',
      'source_sha256',
    ]);
  });

  test('no field name suggests a row identifier', () => {
    const identity = makeCandidateIdentity(SEED);
    for (const key of Object.keys(identity)) {
      assert.ok(
        !/rowid|row_id|rownum|_row\b/i.test(key),
        `${key} looks like a row identifier; row ids are not stable across index rebuilds`,
      );
    }
  });
});

describe('property 5 — stable ordering', () => {
  const rows = [
    { score: 10, path: 'sys/dark/surfaces/on_surface', source_record_ref: 'paint-style:S:b' },
    { score: 10, path: 'sys/dark/surfaces/on_surface', source_record_ref: 'paint-style:S:a' },
    { score: 12, path: 'ref/grey/100', source_record_ref: 'variable:V:1' },
    { score: 10, path: 'alphas/dark/warning/opacity_6', source_record_ref: 'paint-style:S:c' },
  ];

  test('score descends first', () => {
    const ranked = rankStably(rows);
    assert.equal(ranked[0]?.score, 12);
  });

  /** The prototype sorts by score with no ORDER BY, so equal scores fall out in
   *  arbitrary SQLite row order. This is decision D-C.5's addition. */
  test('ties break on normalized path, then on the immutable record ref', () => {
    const ranked = rankStably(rows).filter((r) => r.score === 10);
    assert.deepEqual(
      ranked.map((r) => r.source_record_ref),
      ['paint-style:S:c', 'paint-style:S:a', 'paint-style:S:b'],
    );
  });

  test('ordering is identical across repeated runs and input permutations', () => {
    const a = rankStably(rows).map((r) => r.source_record_ref);
    const b = rankStably([...rows].reverse()).map((r) => r.source_record_ref);
    assert.deepEqual(a, b, 'ordering must not depend on input order');
  });

  test('rankStably does not mutate its input', () => {
    const input = [...rows];
    rankStably(input);
    assert.deepEqual(input, rows);
  });

  test('comparator is antisymmetric on distinct rows', () => {
    const [x, y] = [rows[0]!, rows[2]!];
    assert.equal(Math.sign(compareRanked(x, y)), -Math.sign(compareRanked(y, x)));
  });
});

describe('forgery resistance — a model may select an id but cannot mint one', () => {
  test('a consistent identity verifies', () => {
    assert.doesNotThrow(() => assertIdentityConsistent(makeCandidateIdentity(SEED)));
  });

  /**
   * The exact v1 defect shape: a real key paired with a fabricated path. Here the
   * ref is altered while the id is kept, and the recomputation catches it.
   */
  test('an altered source_record_ref no longer derives its candidate_id', () => {
    const identity = makeCandidateIdentity(SEED);
    const tampered = { ...identity, source_record_ref: 'paint-style:S:deadbeef' };
    assert.throws(
      () => assertIdentityConsistent(tampered),
      (e: unknown) => e instanceof IdentityError && e.code === 'IDENTITY_MISMATCH',
    );
  });

  test('a hand-written candidate_id is rejected as malformed', () => {
    const identity = makeCandidateIdentity(SEED);
    assert.throws(
      () => assertIdentityConsistent({ ...identity, candidate_id: 'stroke/base' }),
      (e: unknown) => e instanceof IdentityError && e.code === 'IDENTITY_MALFORMED_CANDIDATE_ID',
    );
  });

  test('a well-formed but invented candidate_id is rejected as inconsistent', () => {
    const identity = makeCandidateIdentity(SEED);
    assert.throws(
      () => assertIdentityConsistent({ ...identity, candidate_id: `${CANDIDATE_ID_PREFIX}${'0'.repeat(24)}` }),
      (e: unknown) => e instanceof IdentityError && e.code === 'IDENTITY_MISMATCH',
    );
  });

  test('swapping the source hash while keeping the id is caught', () => {
    const identity = makeCandidateIdentity(SEED);
    assert.throws(
      () => assertIdentityConsistent({ ...identity, source_sha256: SHA_B }),
      (e: unknown) => e instanceof IdentityError && e.code === 'IDENTITY_MISMATCH',
    );
  });
});
