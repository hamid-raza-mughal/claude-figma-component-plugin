/**
 * Gated evidence tests (BP-10).
 *
 * These run **only** via `npm run test:evidence`, never in `npm test`,
 * `test:source` or `test:strict`. The `.evidence.ts` suffix is not matched by
 * the default discovery glob (`tests/**` + `/*.test.ts`, `package.json`), so
 * `sourceOnlyExpectedSkips` stays exactly `7` — the alternative, folding these
 * into the default suite and raising the skip budget, turns "seven known
 * bundle-gated placeholders" into a vaguer number covering two unrelated gating
 * mechanisms, and a suite whose skip budget grows is one where a genuinely new
 * skip stops being visible.
 *
 * **Nothing in Builder Phase 1's acceptance depends on this file.** Every
 * acceptance item is satisfiable from the sanitized tracked fixtures alone; this
 * is additional assurance and never the basis of a gate. What it adds is the one
 * check the tracked corpus cannot make about itself: that the sanitized fixtures
 * still correspond to the real evidence they were promoted from, and that no
 * real identifier survives a fresh promotion.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CORPUS = join(HERE, '..', 'fixtures', 'empirical');

/**
 * Resolved once, loudly.
 *
 * `npm run test:evidence` already refuses to start without this, so reaching
 * here with it unset means someone ran the file directly — and the failure has
 * to say what is missing rather than pass over an empty directory. A gated suite
 * that silently passes when its gate is absent is worse than no suite: it
 * reports a check that never ran.
 */
function evidenceDir(): string {
  const dir = process.env['REPRESENTATION_EVIDENCE_DIR'];
  assert.ok(
    dir !== undefined && dir.length > 0,
    'REPRESENTATION_EVIDENCE_DIR is unset. These tests read the real evidence pack, which lives ' +
      'outside the repository by BP-5; without it there is nothing to check and passing would be ' +
      'a lie.',
  );
  assert.ok(existsSync(dir), `REPRESENTATION_EVIDENCE_DIR points at ${dir}, which does not exist`);
  return dir;
}

function collect(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...collect(full));
    else out.push(full);
  }
  return out.sort();
}

describe('gated · the evidence pack is where BP-5 says it is', () => {
  test('the pack resolves and carries a mapping', () => {
    const dir = evidenceDir();
    assert.ok(
      existsSync(join(dir, 'representation-evidence-mapping.json')),
      'the pack has no mapping file, so nothing here can be checked against the real values',
    );
  });

  test('the mapping is outside the repository tree', () => {
    // The property BP-5 actually depends on, asserted rather than assumed. A
    // mapping that had drifted inside the repository would make every
    // placeholder reversible, and the promotion tool refusing to *write* one
    // there says nothing about where one already is.
    const repoRoot = join(HERE, '..', '..', '..');
    assert.ok(
      relative(repoRoot, evidenceDir()).startsWith('..'),
      'the evidence pack resolves inside the repository',
    );
  });
});

describe('gated · the tracked corpus still corresponds to the real evidence', () => {
  test('every placeholder in the tracked corpus is one the mapping knows', () => {
    const mapping = JSON.parse(
      readFileSync(join(evidenceDir(), 'representation-evidence-mapping.json'), 'utf8'),
    ) as { readonly real_to_placeholder: Record<string, string> };
    const known = new Set(Object.values(mapping.real_to_placeholder));

    const unknown = new Set<string>();
    for (const file of collect(CORPUS)) {
      for (const match of readFileSync(file, 'utf8').matchAll(
        /\b(?:NODE|VC|VAR|STYLE|KEY|FILEKEY|NAME)-\d{4}\b/g,
      )) {
        if (!known.has(match[0])) unknown.add(match[0]);
      }
    }
    assert.deepEqual(
      [...unknown].sort(),
      [],
      'a placeholder in the tracked corpus corresponds to no real value, which means the corpus ' +
        'and the mapping came from different promotions',
    );
  });

  test('no real value from the mapping appears in the tracked corpus', () => {
    // The direction that matters. The tracked scan in
    // `empirical-corpus.test.ts` checks identifier *shapes*; this checks the
    // actual values, which is the only version of the claim that is exhaustive.
    const mapping = JSON.parse(
      readFileSync(join(evidenceDir(), 'representation-evidence-mapping.json'), 'utf8'),
    ) as { readonly real_to_placeholder: Record<string, string> };

    const offenders: string[] = [];
    const files = collect(CORPUS).map((file) => [file, readFileSync(file, 'utf8')] as const);
    for (const real of Object.keys(mapping.real_to_placeholder)) {
      if (real.length < 6) continue; // too short to be evidence of anything
      for (const [file, text] of files) {
        if (text.includes(real)) offenders.push(`${relative(CORPUS, file)} carries a real value`);
      }
    }
    // Offenders are reported by file only. Printing the value would put it in a
    // CI log, which is the same disclosure by another route.
    assert.deepEqual([...new Set(offenders)].sort(), []);
  });
});
