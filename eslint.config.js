// ESLint config.
//
// Deliberately narrow. This repo has no build step and the style is consistent
// already, so a big rule set would be noise. What is here catches the classes of
// bug that actually bit during development:
//
//   - `stepping` used before its `let` (temporal dead zone)
//   - a function signature changed, leaving a caller silently broken
//   - variables left behind after a refactor
//   - `coin = (n) => n === 1 ? 'gold' : 'gold'` — identical ternary branches
//
// Formatting is not enforced. Nobody has argued about it and a formatter would
// produce a huge diff for no defect caught.

import js from '@eslint/js';
import globals from 'globals';

export default [
  js.configs.recommended,

  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      // The ones that catch real bugs.
      'no-unused-vars': ['error', {
        args: 'after-used',
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrors: 'none',        // `catch {}` with an ignored error is fine
      }],
      'no-use-before-define': ['error', {
        functions: false,            // hoisted function decls are used deliberately
        variables: true,             // but a `let` read before its line is the TDZ bug
        classes: true,
      }],
      'no-dupe-else-if': 'error',
      'no-duplicate-imports': 'error',
      'no-self-compare': 'error',
      'no-unmodified-loop-condition': 'error',
      'no-constant-binary-expression': 'error',
      'no-promise-executor-return': 'error',
      'require-atomic-updates': 'error',

      // Async correctness. Resolution became async when effects landed and a
      // forgotten await was exactly how the commit() race got in.
      'no-async-promise-executor': 'error',
      'no-await-in-loop': 'off',     // sequential animation genuinely needs this

      // Light hygiene, no formatting opinions.
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-var': 'error',
      'prefer-const': ['error', { destructuring: 'all' }],
      'no-console': 'off',           // the .mjs tools are CLIs; console IS the output
    },
  },

  {
    // Test files legitimately poke at internals and leave helpers around.
    files: ['**/*.test.js', 'e2e/**/*.js'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: { 'no-unused-vars': 'warn' },
  },

  {
    ignores: ['node_modules/', 'test-results/', 'playwright-report/', 'assets/gen/'],
  },
];
