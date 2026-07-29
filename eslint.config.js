// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

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
        },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // Tools may read the filesystem freely; they are developer utilities, not
    // part of the shared engine surface.
    files: ['tools/**/*.ts', 'tests/**/*.ts'],
    rules: { 'no-restricted-imports': 'off' },
  },
);
