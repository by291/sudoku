import js from '@eslint/js'
import vue from 'eslint-plugin-vue'
import ts from 'typescript-eslint'
import prettier from 'eslint-config-prettier'
import globals from 'globals'

const sourceImportPatterns = [
  { regex: '^\\.', message: 'Use @/ for source imports.' },
  {
    regex: '^@reference/|^@/core/|(?:^|/)tests/reference/',
    message: 'Production must not import the retired TypeScript engine or test oracles.',
  },
]
const compositionImportPatterns = [
  ...sourceImportPatterns,
  {
    regex:
      '^@/(?:(?:App|ReadyApplication|EngineBootstrapState)(?:\\.|$)|main(?:\\.|$)|layouts/|router(?:/|$)|theme/)',
    message: 'Business and browser-service modules must not depend on application presentation.',
  },
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
      'target/**',
      'packages/sudoku-wasm/pkg/**',
      '.tools/**',
      'android/**/build/**',
      'android/**/.gradle/**',
      'android/**/.kotlin/**',
      'android/.native-tools/**',
      '.superpowers/**',
      'tests/reference/typescript-engine/**',
      '.agents/**',
      '.codex/**',
      'test-results/**',
      'playwright-report/**',
    ],
  },
  // Reference snapshots remain byte exact; executable migration tools use Node globals.
  {
    files: [
      'tests/migration/**/*.mjs',
      'tests/reference/*.mjs',
      'scripts/**/*.mjs',
      'android/interop/**/*.ts',
    ],
    languageOptions: { globals: globals.node },
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
    files: ['src/sudoku/{contracts,values,catalogue,ruleInput,seed,generationInput}.ts'],
    rules: {
      ...restrictImports({
        paths: ['vue', 'pinia', 'vue-router', 'naive-ui', 'idb'],
        patterns: [
          ...sourceImportPatterns,
          {
            regex: '^@/(?!sudoku/(?:contracts|values|catalogue|ruleInput|seed|guards)(?:[./]|$))',
            message:
              'Pure contracts and input assembly must not load a runtime or application services.',
          },
        ],
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
            regex:
              '^@/(?:runtime(?:[./]|$)|(?:features|storage|worker)/|sudoku/(?!(?:contracts|values)(?:[./]|$)))|^@sudoku/wasm(?:/|$)',
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
            regex:
              '^@/(?!shared/model/sudokuPresentation(?:[./]|$)|sudoku/(?:contracts|generationInput|seed|ruleInput|values|catalogue)(?:[./]|$)|features/(?:game|learning|settings)/model/)',
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
