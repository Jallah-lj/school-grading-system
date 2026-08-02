// @ts-check
import js from '@eslint/js';
import importX from 'eslint-plugin-import-x';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['**/node_modules/**', '**/dist/**', '**/coverage/**', '**/package-lock.json'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Underscore-prefixed names are intentionally unused (omitted values, Express middleware args).
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    // Node.js environments (server sources, Prisma seed, build/CI scripts, config files).
    files: [
      'server/**/*.{js,ts}',
      'scripts/**/*.{js,mjs,ts}',
      'e2e/**/*.{js,ts}',
      'client/*.config.{js,ts}',
      '*.config.{js,mjs}',
    ],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    // Service worker runs in a ServiceWorkerGlobalScope, not a window.
    files: ['client/public/sw.js', 'client/**/*.sw.js'],
    languageOptions: {
      globals: { ...globals.serviceworker, ...globals.browser },
    },
  },
  {
    // Browser environment for the React client.
    files: ['client/src/**/*.{ts,tsx}'],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    // React hooks rules for the client.
    files: ['client/src/**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: reactHooks.configs['recommended-latest'].rules,
  },
  {
    // Plain CommonJS utility scripts are allowed to use require().
    files: ['server/scripts/**/*.js'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    // Consistent, deterministic import ordering across the whole repo.
    files: ['**/*.{ts,tsx,js,mjs,cjs}'],
    plugins: {
      'import-x': importX,
    },
    rules: {
      'import-x/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index', 'type'],
          'newlines-between': 'always',
          'newlines-between-types': 'always',
          sortTypesGroup: true,
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
      'import-x/no-duplicates': 'error',
    },
  },
);
