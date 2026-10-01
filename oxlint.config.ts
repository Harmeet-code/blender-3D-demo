// oxlint.config.ts

export default {
  plugins: ['typescript', 'unicorn', 'oxc'],

  ignorePatterns: ['.opencode/', 'dist/', 'build/', 'node_modules/', 'coverage/', '*.d.ts'],

  categories: {
    correctness: 'warn',
  },

  rules: {
    /*
     * Core correctness
     */
    'no-console': 'off',
    'no-debugger': 'error',
    'no-unused-vars': 'error',
    'no-empty': 'error',
    'no-unreachable': 'error',
    'no-shadow': 'warn',

    /*
     * Safer JS/TS patterns
     */
    eqeqeq: 'error',
    curly: 'error',
    'no-var': 'error',
    'prefer-const': 'error',
    'prefer-template': 'error',
    'object-shorthand': 'error',
    'prefer-arrow-callback': 'warn',
    'prefer-destructuring': 'warn',

    /*
     * Async / Promise safety
     */
    'typescript/no-floating-promises': 'error',
    'typescript/no-misused-promises': 'error',
    'typescript/await-thenable': 'error',
    'typescript/no-misused-spread': 'error',
    'typescript/no-extra-non-null-assertion': 'error',
    'typescript/no-non-null-asserted-optional-chain': 'error',
    'typescript/prefer-optional-chain': 'warn',
    'typescript/prefer-nullish-coalescing': 'warn',

    /*
     * TypeScript hygiene
     */
    'typescript/consistent-type-imports': 'warn',
    'typescript/no-explicit-any': 'warn',
    'typescript/prefer-as-const': 'warn',
    'typescript/switch-exhaustiveness-check': 'warn',

    /*
     * Performance / modern patterns
     */
    'oxc/no-map-spread': 'warn',
    'unicorn/prefer-set-has': 'warn',
    'unicorn/prefer-string-starts-ends-with': 'warn',

    /*
     * Maintainability
     */
    'no-useless-constructor': 'warn',
    'unicorn/no-useless-undefined': 'warn',
    'unicorn/prefer-node-protocol': 'warn',

    /*
     * Format consistency (matches oxfmt output)
     */
  },
};
