import js from '@eslint/js'
import vue from 'eslint-plugin-vue'
import ts from 'typescript-eslint'
import prettier from 'eslint-config-prettier'
import globals from 'globals'

const sourceImportPatterns = [{ regex: '^\\.', message: 'Use @/ for source imports.' }]
const compositionImportPatterns = [
  ...sourceImportPatterns,
  {
    regex: '^@/(?:App(?:\\.|$)|main(?:\\.|$)|layouts/|router(?:/|$)|theme/)',
    message: 'Business and browser-service modules must not depend on application presentation.',
  },
]

const coreImportPatterns = [
  ...sourceImportPatterns,
  { regex: '^@/(?!core/)', message: 'The Sudoku engine must remain independent.' },
]
const coreExternalPackages = ['vue', 'pinia', 'vue-router', 'naive-ui', 'idb']

// Each entry includes the base engine policy because flat-config rule options replace it.
const coreDependencyPolicies = [
  { files: ['src/core/sudoku/{types,budget,random}.ts'], forbidden: 'logic|rating|generation' },
  {
    files: ['src/core/sudoku/rules/**/*.ts'],
    forbidden: 'constraints|search|logic|rating|generation',
  },
  { files: ['src/core/sudoku/constraints/**/*.ts'], forbidden: 'search|logic|rating|generation' },
  { files: ['src/core/sudoku/search/**/*.ts'], forbidden: 'logic|rating|generation' },
  { files: ['src/core/sudoku/logic/**/*.ts'], forbidden: 'rating|generation' },
  { files: ['src/core/sudoku/rating/**/*.ts'], forbidden: 'generation' },
]

function restrictImports({ paths = [], patterns }) {
  // Static import restrictions do not inspect import(). Generate both from one policy.
  const dynamicImports = [
    {
      selector: 'ImportExpression[source.type!="Literal"]',
      message: 'Use string-literal module paths so dependency boundaries can be checked.',
    },
    ...paths.map((name) => ({
      selector: `ImportExpression[source.value=${JSON.stringify(name)}]`,
      message: `This layer must not import ${name}.`,
    })),
    ...patterns.map(({ regex, message }) => ({
      // ESQuery attribute regexes require Unicode escapes for forward slashes.
      selector: `ImportExpression[source.value=/${regex.replaceAll('/', '\\u002f')}/i]`,
      message,
    })),
  ]
  return {
    'no-restricted-imports': ['error', { paths, patterns }],
    'no-restricted-syntax': ['error', ...dynamicImports],
  }
}

export default [
  {
    ignores: [
      'dist/**',
      'dist-subpath/**',
      'node_modules/**',
      '.superpowers/**',
      '.agents/**',
      '.codex/**',
      'test-results/**',
      'playwright-report/**',
    ],
  },
  js.configs.recommended,
  ...ts.configs.recommended,
  ...vue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: { globals: globals.browser, parserOptions: { parser: ts.parser } },
  },
  {
    files: ['src/**/*.{ts,vue}'],
    ignores: ['src/**/*.test.ts'],
    rules: { ...restrictImports({ patterns: sourceImportPatterns }) },
  },
  {
    files: ['src/core/**/*.ts'],
    ignores: ['src/**/*.test.ts'],
    rules: {
      ...restrictImports({
        paths: coreExternalPackages,
        patterns: coreImportPatterns,
      }),
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'separate-type-imports' },
      ],
      '@typescript-eslint/no-non-null-assertion': 'error',
      'no-restricted-globals': [
        'error',
        'window',
        'document',
        'Worker',
        'indexedDB',
        'localStorage',
        'performance',
      ],
    },
  },
  ...coreDependencyPolicies.map(({ files, forbidden }) => ({
    files,
    ignores: ['src/**/*.test.ts'],
    rules: restrictImports({
      paths: coreExternalPackages,
      patterns: [
        ...coreImportPatterns,
        {
          regex: `^@/core/sudoku/(?:${forbidden})(?:/|$)`,
          message: 'Import a lower-level owner; Sudoku dependencies must not point upward.',
        },
      ],
    }),
  })),
  {
    files: ['src/core/sudoku/rules/definitions/**/*.ts'],
    ignores: ['src/**/*.test.ts'],
    rules: restrictImports({
      paths: coreExternalPackages,
      patterns: [
        ...coreImportPatterns,
        {
          regex:
            '^@/core/sudoku/(?:constraints|search|logic|rating|generation)(?:/|$)|^@/core/sudoku/rules/(?:registry|context)(?:[./]|$)',
          message:
            'Rule definitions must remain independent of registries and higher-level operations.',
        },
      ],
    }),
  },
  {
    files: ['src/runtime.ts', 'src/{features,storage,worker,shared}/**/*.{ts,vue}'],
    ignores: ['src/**/*.test.ts'],
    rules: { ...restrictImports({ patterns: compositionImportPatterns }) },
  },
  {
    files: ['src/shared/**/*.{ts,vue}'],
    ignores: ['src/**/*.test.ts'],
    rules: {
      ...restrictImports({
        patterns: [
          ...compositionImportPatterns,
          {
            regex: '^@/(?:runtime(?:[./]|$)|(?:features|storage|worker)/)',
            message: 'Shared presentation must not depend on feature state or browser services.',
          },
        ],
      }),
    },
  },
  {
    files: ['src/runtime.ts', 'src/{storage,worker}/**/*.ts'],
    ignores: ['src/**/*.test.ts'],
    rules: {
      ...restrictImports({
        patterns: [
          ...compositionImportPatterns,
          {
            regex: '^@/features/[^/]+/(?!model/)',
            message: 'Browser services may consume persisted models, not feature UI or stores.',
          },
          {
            regex: '^@/runtime(?:[./]|$)',
            message: 'Storage and workers must not depend on the application runtime.',
          },
        ],
      }),
    },
  },
  {
    files: ['src/features/**/views/*.vue'],
    rules: {
      ...restrictImports({
        patterns: [
          ...compositionImportPatterns,
          {
            regex: '^@/storage/(?:database|repository)(?:$|[./])',
            message: 'Views must use store actions rather than write directly to the database.',
          },
        ],
      }),
    },
  },
  {
    files: ['src/features/{game,learning,settings}/model/*.ts'],
    ignores: ['src/**/*.test.ts'],
    rules: {
      ...restrictImports({
        paths: ['vue', 'pinia', 'vue-router', 'naive-ui', 'idb'],
        patterns: [
          ...compositionImportPatterns,
          {
            regex: '^@/(?!core/|features/(?:game|learning|settings)/model/)',
            message: 'Pure models may only depend on the engine and other pure models.',
          },
        ],
      }),
    },
  },
  prettier,
  {
    files: ['src/**/*.{ts,vue}'],
    rules: {
      curly: ['error', 'all'],
      'one-var': ['error', 'never'],
    },
  },
]
