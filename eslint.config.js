// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * Two boundaries this repository enforces at authoring time, kept here so a
 * violation is a red squiggle rather than a review comment.
 *
 * BP-2: nothing imports the research corpus. BP-9: nothing outside
 * `src/representation/` reaches past its barrel. Both are *absences*, and this
 * repository has already learned that absences rot silently
 * (`tests/unit/portability.test.ts:1–10`), so each is also covered by a static
 * scan in `tests/`. Lint alone would not catch a `readFileSync` reaching into
 * the corpus; a scan alone would not catch it while it was being written.
 */
const boundaryPatterns = [
  {
    group: ['**/plugin_explore_phase/**'],
    message:
      'BP-1: the research corpus is evidence, not a dependency. It contributes zero runtime ' +
      'imports, and a tool that needs it takes its path as an argument.',
  },
  {
    group: [
      '**/representation/contracts/**',
      '**/representation/validation/**',
      '**/representation/evidence/**',
      '**/representation/selection/**',
    ],
    message:
      'BP-9: src/representation/index.ts is the module\'s only entry point. Its internals are what ' +
      'Builder Phase 2 must not couple to; export what you need from the barrel instead.',
  },
];

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    rules: {
      // Phase 1 portability rule (P1-FINAL §5.6): the shared engine must not
      // shell out or reach a network. Enforced structurally by the portability
      // test in tests/unit; these rules catch the common accidental cases.
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'child_process', message: 'Shared engine must not shell out (P1-FINAL §5.6).' },
            { name: 'node:child_process', message: 'Shared engine must not shell out (P1-FINAL §5.6).' },
            { name: 'http', message: 'No network in the Phase 1 core; no model adapter (P1-FINAL §7.2).' },
            { name: 'node:http', message: 'No network in the Phase 1 core; no model adapter (P1-FINAL §7.2).' },
            { name: 'https', message: 'No network in the Phase 1 core; no model adapter (P1-FINAL §7.2).' },
            { name: 'node:https', message: 'No network in the Phase 1 core; no model adapter (P1-FINAL §7.2).' },
          ],
          patterns: boundaryPatterns,
        },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    /*
     * Tools and tests may shell out and read the filesystem freely; they are
     * developer utilities, not part of the shared engine surface.
     *
     * **Narrowed at WP B6.** This override used to switch `no-restricted-imports`
     * off wholesale, which meant the two boundary patterns above were unenforced
     * in precisely the two directories most likely to violate them: a test
     * reaching into the research corpus, and a test importing a representation
     * internal because the barrel did not export it yet. Both were live — three
     * test files were importing past the barrel when this was written. The
     * override now re-states the rule with the `paths` list dropped and the
     * `patterns` kept.
     */
    files: ['tools/**/*.ts', 'tests/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: boundaryPatterns }],
    },
  },
  {
    // The barrel is the one file allowed to name what it re-exports.
    files: ['src/representation/index.ts', 'src/representation/**/*.ts'],
    rules: { 'no-restricted-imports': ['error', { patterns: [boundaryPatterns[0]] }] },
  },
);
