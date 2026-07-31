/**
 * Gate 2 resolver evidence (§13.4, §17.1, §17.2).
 *
 * The adversarial cases here are the ones that matter: a fabricated id, an altered
 * field, a duplicated selection, a broadening that must be visible, and a tool
 * called by the wrong owner. Each corresponds to a way a wrong resolution could
 * otherwise be accepted.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { harness, SOURCE_AVAILABLE } from './test-index.ts';
import { planQueries, extractRequestedValue, extractMode } from '../../src/resolver/query-planner.ts';
import { resolveBatch } from '../../src/resolver/resolve-batch.ts';
import { materializeSelection } from '../../src/resolver/materialize-selection.ts';
import { verifyBatch } from '../../src/resolver/verify-batch.ts';
import { expandStyle, resolveTextStyleFontSize, inferFieldName } from '../../src/resolver/expand-style.ts';
import {
  listByCategory,
  ListByCategoryOwnershipError,
  LIST_BY_CATEGORY_CAP,
} from '../../src/resolver/list-by-category.ts';
import { detectModeAsymmetry } from '../../src/resolver/mode-asymmetry.ts';
import {
  MAX_CANDIDATE_COUNT,
  MAX_RANKING_REASONS,
  DEFAULT_CANDIDATE_COUNT,
} from '../../src/contracts/resolution.ts';

describe('query planner — deterministic, no SQL, no model', () => {
  /**
   * `extractRequestedValue` handles **unit-bearing** expressions only. A bare
   * number in prose ("just 8") is deliberately not a requested value — it is a
   * numeric *token*, handled by `extractNumericTokens`, because the two behave
   * differently: a unit-bearing value is compared against `value_num`, while a
   * bare token is matched against numeric path segments.
   */
  test('normalizes unit-bearing expressions only', () => {
    assert.equal(extractRequestedValue('4px all around'), 4);
    assert.equal(extractRequestedValue('12 px gap'), 12);
    assert.equal(extractRequestedValue('opacity 60%'), 60);
    assert.equal(extractRequestedValue('8'), 8, 'a bare number on its own is a value');
    assert.equal(extractRequestedValue('just 8'), undefined, 'a number in prose is a token, not a value');
    assert.equal(extractRequestedValue('warning fill'), undefined);
  });

  /** Word-boundary matched, so "highlight" does not read as "light". */
  test('extracts mode without false positives', () => {
    assert.equal(extractMode('dark surface fill'), 'Dark');
    assert.equal(extractMode('light surface'), 'Light');
    assert.equal(extractMode('highlight colour'), undefined);
  });

  test('plans one query per resolvable item, defaulting to three candidates', () => {
    const plan = planQueries({
      route: 'new',
      items: [{ semantic_id: 'root', property: 'padding', reference_text: '4px all around' }],
    });
    assert.equal(plan.queries.length, 1);
    assert.equal(plan.gaps.length, 0);
    assert.equal(plan.queries[0]?.limit, DEFAULT_CANDIDATE_COUNT);
    assert.deepEqual(plan.queries[0]?.permitted_ref_classes, ['variable']);
  });

  test('a fill may only resolve to a paint style', () => {
    const plan = planQueries({
      route: 'new',
      items: [{ semantic_id: 'bg', property: 'fill', reference_text: 'warning surface' }],
    });
    assert.deepEqual(plan.queries[0]?.permitted_ref_classes, ['paint-style']);
  });

  /** Too vague is a structured gap, never a guess — guessing here is what produces
   *  a confident wrong resolution. */
  test('an unusable reference yields a clarification gap, not a query', () => {
    const plan = planQueries({
      route: 'new',
      items: [{ semantic_id: 'x', property: 'fill', reference_text: '!!' }],
    });
    assert.equal(plan.queries.length, 0);
    assert.equal(plan.gaps[0]?.reason, 'no-term-or-value-signal');
  });

  test('an unknown property yields a gap naming the known properties', () => {
    const plan = planQueries({
      route: 'new',
      items: [{ semantic_id: 'x', property: 'elevation', reference_text: 'medium' }],
    });
    assert.equal(plan.gaps[0]?.reason, 'query-too-vague');
    assert.match(plan.gaps[0]?.evidence ?? '', /corner-radius/);
  });
});

if (!SOURCE_AVAILABLE) {
  describe('resolver operations', () => {
    test('curated source unavailable — set ADALFI_ARTIFACT_DIR', { skip: true }, () => {});
  });
} else {
  describe('resolveBatch (§13.4.1)', () => {
    test('returns three candidates by default', () => {
      const { reader } = harness();
      const plan = planQueries({
        route: 'new',
        items: [{ semantic_id: 'a', property: 'padding', reference_text: '4px all around' }],
      });
      const [result] = resolveBatch(reader, plan.queries);
      assert.ok(result !== undefined);
      assert.equal(result.candidates.length, DEFAULT_CANDIDATE_COUNT);
    });

    test('never exceeds the hard ceiling of five', () => {
      const { reader } = harness();
      const plan = planQueries({
        route: 'new',
        items: [
          { semantic_id: 'a', property: 'fill', reference_text: 'warning opacity' },
          { semantic_id: 'b', property: 'padding', reference_text: 'spacing' },
        ],
      });
      for (const result of resolveBatch(reader, plan.queries)) {
        assert.ok(result.candidates.length <= MAX_CANDIDATE_COUNT);
      }
    });

    test('carries at most three reason codes per candidate', () => {
      const { reader } = harness();
      const plan = planQueries({
        route: 'new',
        items: [{ semantic_id: 'a', property: 'fill', reference_text: 'warning 6 opacity fill' }],
      });
      for (const result of resolveBatch(reader, plan.queries)) {
        for (const candidate of result.candidates) {
          assert.ok(candidate.ranking_reasons.length <= MAX_RANKING_REASONS);
          assert.ok(candidate.ranking_reasons.length > 0);
        }
      }
    });

    test('ordering is identical across repeated runs', () => {
      const { reader } = harness();
      const plan = planQueries({
        route: 'new',
        items: [{ semantic_id: 'a', property: 'fill', reference_text: 'warning opacity fill' }],
      });
      const first = resolveBatch(reader, plan.queries)[0]?.candidates.map((c) => c.candidate_id);
      const second = resolveBatch(reader, plan.queries)[0]?.candidates.map((c) => c.candidate_id);
      assert.deepEqual(first, second);
    });

    /** Full descriptions and complete records stay out of model context (§13.5). */
    test('candidates carry no full description and no complete record', () => {
      const { reader } = harness();
      const plan = planQueries({
        route: 'new',
        items: [{ semantic_id: 'a', property: 'stroke-weight', reference_text: '1px border' }],
      });
      const [result] = resolveBatch(reader, plan.queries);
      for (const candidate of result?.candidates ?? []) {
        assert.ok(!Object.hasOwn(candidate, 'description'));
        assert.ok(!Object.hasOwn(candidate, 'payload_json'));
        assert.ok(!Object.hasOwn(candidate, 'values'));
        assert.ok(!Object.hasOwn(candidate, 'uid'));
      }
    });

    test('every candidate carries the snapshot it was resolved against', () => {
      const { reader } = harness();
      const plan = planQueries({
        route: 'new',
        items: [{ semantic_id: 'a', property: 'gap', reference_text: '12px gap' }],
      });
      const [result] = resolveBatch(reader, plan.queries);
      for (const candidate of result?.candidates ?? []) {
        assert.equal(candidate.source_sha256, reader.meta.source_sha256);
        assert.equal(candidate.index_version, reader.meta.index_version);
      }
    });

    /** An empty set without a reason is indistinguishable from a broken query. */
    test('an empty result always carries a machine-readable reason', () => {
      const { reader } = harness();
      const [result] = resolveBatch(reader, [
        {
          query_id: 'q-empty',
          route: 'new',
          property_category: 'nonexistent-category',
          reference_text: 'grid template area',
          permitted_ref_classes: ['grid-style'],
          limit: 3,
        },
      ]);
      assert.equal(result?.candidates.length, 0);
      assert.ok(result?.no_match_reason !== undefined);
    });
  });

  describe('expandStyle (finding C1) — the operation the plan had dropped', () => {
    /**
     * The v1 defect: `body/sm/regular` reported as 14px, "justified" by the claim
     * that sizes were absent from the export. Both halves were false.
     */
    test('body/sm/regular is 12px, body/reg/regular is 14px', () => {
      const { reader } = harness();
      for (const [path, expected] of [
        ['body/sm/regular', 12],
        ['body/reg/regular', 14],
      ] as const) {
        const row = reader.findByPath('text-style', path);
        assert.ok(row !== undefined, `${path} must exist`);
        const resolved = resolveTextStyleFontSize(reader, row.source_record_ref);
        assert.equal(resolved.font_size, expected, `${path} should be ${expected}px`);
        assert.equal(resolved.agrees, true);
      }
    });

    test('the size is established two independent ways, and they agree', () => {
      const { reader } = harness();
      const row = reader.findByPath('text-style', 'body/sm/regular');
      const expanded = expandStyle(reader, row?.source_record_ref ?? '');
      assert.ok(expanded.found);
      if (!expanded.found) return;
      assert.equal(expanded.literal_font_size, 12);
      const bound = expanded.fields.find((f) => f.field === 'fontSize');
      assert.equal(bound?.bound_numeric, 12);
      assert.equal(bound?.bound_variable_path, 'Body/sm/size');
      assert.equal(expanded.has_disagreement, false);
    });

    /** 0 disagreements today across 104 bound text styles. A drift detector should
     *  report nothing until something drifts. */
    test('no text style in the export disagrees with its bound size', () => {
      const { reader } = harness();
      const styles = reader.selectPool({ refClasses: ['text-style'] });
      const disagreeing = styles
        .map((row) => expandStyle(reader, row.source_record_ref))
        .filter((result) => result.found && result.has_disagreement);
      assert.deepEqual(disagreeing, []);
    });

    test('the join follows the field-dict shape, not an index', () => {
      const { reader } = harness();
      const row = reader.findByPath('text-style', 'body/reg/regular');
      const expanded = expandStyle(reader, row?.source_record_ref ?? '');
      assert.ok(expanded.found && expanded.bound_variables_shape === 'field-dict');
    });

    test('refuses a variable — expandStyle joins styles', () => {
      const { reader } = harness();
      const variable = reader.selectPool({ refClasses: ['variable'] })[0];
      const result = expandStyle(reader, variable?.source_record_ref ?? '');
      assert.equal(result.found, false);
      if (!result.found) assert.equal(result.reason, 'not-a-style');
    });

    test('infers text attributes from the type-scale naming convention', () => {
      assert.equal(inferFieldName('Body/reg/size'), 'fontSize');
      assert.equal(inferFieldName('Body/reg/leading'), 'lineHeight');
      assert.equal(inferFieldName('Body/reg/tracking'), 'letterSpacing');
      assert.equal(inferFieldName('Body/reg/face'), 'fontFamily');
      // Unrecognised returns the segment rather than guessing.
      assert.equal(inferFieldName('Body/reg/wobble'), 'wobble');
    });
  });

  describe('materializeSelection (§13.4.2) — the acceptance boundary', () => {
    function firstCandidate(): { candidateId: string; path: string; key: string } {
      const { reader } = harness();
      const plan = planQueries({
        route: 'new',
        items: [{ semantic_id: 'a', property: 'stroke-weight', reference_text: '1px border' }],
      });
      const candidate = resolveBatch(reader, plan.queries)[0]?.candidates[0];
      assert.ok(candidate !== undefined);
      return { candidateId: candidate.candidate_id, path: candidate.path, key: candidate.key };
    }

    test('materializes a genuine selection to the exact indexed record', () => {
      const { reader } = harness();
      const { candidateId, path } = firstCandidate();
      const result = materializeSelection(reader, [{ candidate_id: candidateId }]);
      assert.equal(result.failures.length, 0);
      assert.equal(result.resolutions.length, 1);
      assert.equal(result.resolutions[0]?.path, path);
      assert.equal(result.resolutions[0]?.verified_against_source_sha256, reader.meta.source_sha256);
    });

    test('rejects a fabricated candidate_id', () => {
      const { reader } = harness();
      const result = materializeSelection(reader, [{ candidate_id: `c_${'0'.repeat(24)}` }]);
      assert.equal(result.resolutions.length, 0);
      assert.equal(result.failures[0]?.code, 'MATERIALIZE_UNKNOWN_ID');
    });

    test('rejects a malformed candidate_id without a database lookup', () => {
      const { reader } = harness();
      const result = materializeSelection(reader, [{ candidate_id: 'stroke/base' }]);
      assert.equal(result.failures[0]?.code, 'MATERIALIZE_MALFORMED_ID');
    });

    /**
     * Defect #1 exactly: a real key with a fabricated path. The claim is checked
     * against the record, so the fabrication is caught rather than accepted.
     */
    test('rejects a real selection carrying a fabricated path', () => {
      const { reader } = harness();
      const { candidateId } = firstCandidate();
      const result = materializeSelection(reader, [
        { candidate_id: candidateId, claimed: { path: 'stroke/base' } },
      ]);
      assert.equal(result.resolutions.length, 0);
      assert.equal(result.failures[0]?.code, 'MATERIALIZE_FIELD_ALTERED');
      assert.equal(result.failures[0]?.field, 'path');
      assert.equal(result.failures[0]?.claimed, 'stroke/base');
      assert.equal(result.failures[0]?.actual, 'stroke/thin');
    });

    test('accepts a selection whose claims match', () => {
      const { reader } = harness();
      const { candidateId, path, key } = firstCandidate();
      const result = materializeSelection(reader, [
        { candidate_id: candidateId, claimed: { path, key } },
      ]);
      assert.equal(result.failures.length, 0);
    });

    test('rejects an altered key and an altered value', () => {
      const { reader } = harness();
      const { candidateId } = firstCandidate();
      assert.equal(
        materializeSelection(reader, [{ candidate_id: candidateId, claimed: { key: 'deadbeef' } }])
          .failures[0]?.field,
        'key',
      );
      assert.equal(
        materializeSelection(reader, [{ candidate_id: candidateId, claimed: { value: 99 } }]).failures[0]
          ?.field,
        'value',
      );
    });

    /** Usually means two semantic elements were collapsed; deduplicating silently
     *  would hide that. */
    test('rejects a duplicated selection in one batch', () => {
      const { reader } = harness();
      const { candidateId } = firstCandidate();
      const result = materializeSelection(reader, [
        { candidate_id: candidateId },
        { candidate_id: candidateId },
      ]);
      assert.equal(result.resolutions.length, 1);
      assert.equal(result.failures[0]?.code, 'MATERIALIZE_DUPLICATE_SELECTION');
    });

    test('rejects a mode the record does not publish', () => {
      const { reader } = harness();
      const { candidateId } = firstCandidate();
      const result = materializeSelection(reader, [
        { candidate_id: candidateId, claimed: { mode: 'Sepia' } },
      ]);
      assert.equal(result.failures[0]?.field, 'mode');
    });

    test('a text-style resolution carries the joined size, not an asserted one', () => {
      const { reader } = harness();
      const row = reader.findByPath('text-style', 'body/sm/regular');
      const result = materializeSelection(reader, [{ candidate_id: row?.candidate_id ?? '' }]);
      const resolution = result.resolutions[0];
      assert.ok(resolution?.ref_class === 'text-style');
      if (resolution?.ref_class !== 'text-style') return;
      assert.equal(resolution.font_size, 12);
      assert.equal(resolution.bound_variable_ids?.['fontSize'] !== undefined, true);
    });

    /** No output may carry a Figma API instruction (§14.3.6). */
    test('no resolution contains binding_call or a Figma API instruction', () => {
      const { reader } = harness();
      const { candidateId } = firstCandidate();
      const result = materializeSelection(reader, [{ candidate_id: candidateId }]);
      const text = JSON.stringify(result.resolutions);
      assert.ok(!text.includes('binding_call'));
      assert.ok(!/setBoundVariable|applyStyleId|createFrame/.test(text));
    });
  });

  describe('verifyBatch (§13.4.3) — evidence, not decisions', () => {
    test('confirms a true claim', () => {
      const { reader } = harness();
      const row = reader.findByPath('variable', 'stroke/thin');
      const [evidence] = verifyBatch(reader, [
        { request_id: 'v1', candidate_id: row?.candidate_id, expect: { value: 1 } },
      ]);
      assert.equal(evidence?.verdict, 'confirmed');
      assert.equal(evidence?.fields[0]?.verdict, 'confirmed');
    });

    test('contradicts a false claim and shows both values', () => {
      const { reader } = harness();
      const row = reader.findByPath('variable', 'stroke/thin');
      const [evidence] = verifyBatch(reader, [
        { request_id: 'v2', candidate_id: row?.candidate_id, expect: { value: 5 } },
      ]);
      assert.equal(evidence?.verdict, 'contradicted');
      assert.equal(evidence?.fields[0]?.expected, '5');
      assert.equal(evidence?.fields[0]?.actual, '1');
    });

    /** The path that would have caught defect #1: a path that does not exist. */
    test('reports not-found for a path that does not exist', () => {
      const { reader } = harness();
      const [evidence] = verifyBatch(reader, [
        { request_id: 'v3', ref_class: 'variable', path: 'stroke/base' },
      ]);
      assert.equal(evidence?.verdict, 'not-found');
    });

    test('every result carries the snapshot it was verified against', () => {
      const { reader } = harness();
      const [evidence] = verifyBatch(reader, [
        { request_id: 'v4', ref_class: 'variable', path: 'stroke/thin' },
      ]);
      assert.equal(evidence?.source_sha256, reader.meta.source_sha256);
    });

    /** A partly-confirmed claim is a contradicted claim. */
    test('one contradiction dominates a set of confirmations', () => {
      const { reader } = harness();
      const row = reader.findByPath('variable', 'stroke/thin');
      const [evidence] = verifyBatch(reader, [
        { request_id: 'v5', candidate_id: row?.candidate_id, expect: { value: 1, normalized_id: 'wrong' } },
      ]);
      assert.equal(evidence?.verdict, 'contradicted');
    });

    test('returns no alternative suggestion — evidence only', () => {
      const { reader } = harness();
      const [evidence] = verifyBatch(reader, [
        { request_id: 'v6', ref_class: 'variable', path: 'stroke/base' },
      ]);
      const keys = Object.keys(evidence ?? {});
      for (const forbidden of ['suggestion', 'alternative', 'did_you_mean', 'replacement']) {
        assert.ok(!keys.includes(forbidden));
      }
    });
  });

  describe('listByCategory (§13.4.4) — Run-Guard-owned, capped, logged', () => {
    test('refuses a Coordinator caller', () => {
      const { reader } = harness();
      assert.throws(
        () =>
          listByCategory(reader, {
            caller: 'coordinator',
            property_category: 'spacing',
            broadened_from: 'q1',
          }),
        (error: unknown) => error instanceof ListByCategoryOwnershipError,
      );
    });

    test('serves the run-guard caller, capped, and always reports broadened_from', () => {
      const { reader } = harness();
      const result = listByCategory(reader, {
        caller: 'run-guard',
        property_category: 'spacing',
        broadened_from: 'q1 narrow query failed',
      });
      assert.ok(result.candidates.length <= LIST_BY_CATEGORY_CAP);
      assert.equal(result.broadened_from, 'q1 narrow query failed');
      assert.match(result.log_entry, /listByCategory/);
    });

    /** Nothing here was ranked against intent, so nothing may look confident. */
    test('every broadened candidate is low confidence and says why', () => {
      const { reader } = harness();
      const result = listByCategory(reader, {
        caller: 'run-guard',
        property_category: 'spacing',
        broadened_from: 'q1',
      });
      for (const candidate of result.candidates) {
        assert.equal(candidate.confidence, 'low');
        assert.deepEqual(candidate.ranking_reasons, ['broadened-retrieval']);
      }
    });

    test('an over-cap request is clamped and reports truncation', () => {
      const { reader } = harness();
      const result = listByCategory(reader, {
        caller: 'run-guard',
        property_category: 'color',
        broadened_from: 'q1',
        cap: 9999,
      });
      assert.equal(result.cap_applied, LIST_BY_CATEGORY_CAP);
      assert.equal(result.truncated, true);
    });
  });

  describe('R14 mode asymmetry (§13.4.5)', () => {
    test('derives multi-mode collections from the index, not a hard-coded name', () => {
      const result = detectModeAsymmetry(harness().reader, []);
      assert.deepEqual(result.multi_mode_collections, ['colors']);
    });

    /** 381 of 567 paint styles have no binding; absence is normal, not asymmetry. */
    test('an unbound style is never reported as asymmetric', () => {
      const { reader } = harness();
      const unbound = reader
        .selectPool({ refClasses: ['paint-style'] })
        .filter((row) => row.bound_variable_ids.length === 0);
      assert.ok(unbound.length > 300, 'expected many unbound paint styles');
      const result = detectModeAsymmetry(
        reader,
        unbound.slice(0, 50).map((row) => row.source_record_ref),
      );
      assert.deepEqual(result.findings, []);
    });

    test('disclosures are non-blocking by construction', () => {
      const result = detectModeAsymmetry(harness().reader);
      for (const disclosure of result.disclosures) {
        assert.equal(disclosure.actionable, false);
        assert.equal(disclosure.kind, 'mode_coverage_gap');
      }
    });

    /** R14 exists because asking is a dead end when no alternative exists. */
    test('a finding records whether an alternative is even offerable', () => {
      const result = detectModeAsymmetry(harness().reader);
      for (const finding of result.findings) {
        assert.equal(typeof finding.actionable_alternative_exists, 'boolean');
        assert.ok(finding.missing_modes.length > 0);
      }
    });

    test('reports its own denominator', () => {
      const result = detectModeAsymmetry(harness().reader);
      assert.ok(result.examined_count > 0);
    });
  });
}
