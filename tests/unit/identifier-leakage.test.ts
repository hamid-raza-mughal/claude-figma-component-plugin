/**
 * BP-5 as a gate rather than a sentence (AL-1,
 * `docs/builder-master-audit-cycle-1.md`).
 *
 * BP-5 forbids a real Figma identifier from reaching a committed file, and the
 * plan's §4A makes it load-bearing rather than cautious because the remote
 * resolves without authentication. Audit cycle 1 found a real node id already
 * committed — inside the test asserting that no real node id was committed —
 * and found that the only identifier checks in the repository covered three
 * files between them. Nothing scanned `docs/`, `skills/`, `commands/` or
 * `src/`.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { scanRepository, scanText, collectFiles, RULES, ALLOWLIST } from '../../tools/identifier-scan.ts';

describe('no real-identifier shape reaches a committed file (BP-5)', () => {
  test('the whole repository is clean', () => {
    const findings = scanRepository();
    assert.deepEqual(
      findings.map((finding) => `${finding.file}:${finding.line} ${finding.rule} "${finding.match}"`),
      [],
    );
  });

  test('the scan reads a real corpus — it cannot pass vacuously', () => {
    const files = collectFiles();
    assert.ok(files.length > 100, `only ${files.length} files scanned`);
    // And it must reach the surfaces that had no coverage before.
    for (const dir of ['docs/', 'skills/', 'commands/', 'src/', 'tests/', 'tools/']) {
      assert.ok(files.some((file) => file.includes(`/${dir}`)), `nothing under ${dir} was scanned`);
    }
  });
});

describe('every rule catches what it is named for', () => {
  /**
   * **Composed at runtime, never written as literals.** The first draft of this
   * block pasted four real-looking identifiers into the file — and one of them
   * was a real variable key lifted from the research corpus, in the test whose
   * entire job is to keep real keys out of committed files. That is the same
   * mistake, in the same shape, as the one AL-1 was raised for.
   *
   * Building each falsifier from repeated characters keeps the *shape* the
   * rules match while making the value obviously belong to nothing.
   */
  const violations: Readonly<Record<string, string>> = {
    'figma-url': `see https://www.figma.com/design/${'A'.repeat(22)}/Design-System`,
    'variable-id': `bound to VariableID:${'a'.repeat(40)}`,
    'component-property-id': `the property Label#${'1'.repeat(3)}:${'2'.repeat(3)} on the set`,
    'node-id': `the component set at ${'7'.repeat(3)}:${'4'.repeat(4)} in the file`,
  };

  for (const rule of RULES) {
    test(`the "${rule.id}" rule matches a real ${rule.what}`, () => {
      const violation = violations[rule.id];
      assert.ok(violation !== undefined, `no falsifier written for rule "${rule.id}"`);
      const found = scanText('probe.md', violation);
      assert.ok(
        found.some((finding) => finding.rule === rule.id),
        `"${violation}" did not trip ${rule.id} — the rule is decoration`,
      );
    });
  }

  test('the synthetic values the fixtures use are NOT flagged', () => {
    // The narrowings are what make this scan usable. If they were wrong in the
    // other direction the scan would be allowlisted into silence within a week.
    const synthetic = [
      'VariableID:1:10 and VariableCollectionId:1:1 and S:paint1',
      'the node 1:2 is a falsifier',
      'composed at 2026-09-06T11:52:45.961Z',
      'Friday 17:00 to Monday 09:00 is 64 hours',
      'src/coordinator/compose-trusted-output.ts:246',
    ];
    for (const text of synthetic) {
      assert.deepEqual(scanText('probe.md', text), [], `a synthetic value tripped the scan: ${text}`);
    }
  });
});

describe('the allowlist is bounded and justified', () => {
  test('every entry states why it is not real', () => {
    for (const entry of ALLOWLIST) {
      assert.ok(entry.why.length > 20, `"${entry.token}" is allowlisted without a reason`);
    }
  });

  test('an allowlisted token is exempt only for its exact value', () => {
    // A near-miss must still be caught, so the allowlist cannot become a
    // prefix that silences a family of identifiers.
    const allowed = ALLOWLIST.find((entry) => entry.token === '410:158');
    assert.ok(allowed !== undefined);
    assert.deepEqual(scanText('probe.md', `mode ${allowed.token}`), []);
    assert.ok(
      scanText('probe.md', `mode ${allowed.token}0`).length > 0,
      'a different id must not inherit the exemption',
    );
  });

  test('the allowlist has not grown past what audit cycle 1 recorded', () => {
    // A growing allowlist is how a scan dies. Seven entries were the state at
    // the end of cycle 1; an eighth is a deliberate act that edits this number
    // and says why in the cycle document, not a quiet addition.
    assert.equal(ALLOWLIST.length, 7);
  });
});
