import js from '@eslint/js'
import vue from 'eslint-plugin-vue'
import ts from 'typescript-eslint'
import prettier from 'eslint-config-prettier'
import globals from 'globals'

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
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: ['vue', 'pinia', 'idb', '**/app/**', '**/features/**', '**/infrastructure/**'],
        },
      ],
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
    files: ['src/features/**/**Page.vue'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: ['**/storage/database*', '**/storage/repository*'] },
      ],
    },
  },
  {
    files: ['src/features/game/session.ts', 'src/features/game/timer.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: ['vue', 'pinia', '**/infrastructure/**'] }],
    },
  },
  prettier,
]
