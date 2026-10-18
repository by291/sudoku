import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { lessonCatalogueValidation } from './scripts/validate-lesson-catalogue.ts'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig(({ mode }) => ({
  plugins: [lessonCatalogueValidation(), vue()],
  resolve: {
    alias: {
      ...(mode === 'test'
        ? {
            '@reference': fileURLToPath(
              new URL('./tests/reference/typescript-engine/src', import.meta.url),
            ),
            // Sealed baseline sources preserve their original internal aliases, only in tests.
            '@/core/sudoku': fileURLToPath(
              new URL('./tests/reference/typescript-engine/src/core/sudoku', import.meta.url),
            ),
          }
        : {}),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@resources': fileURLToPath(new URL('./resources', import.meta.url)),
    },
  },
  worker: { format: 'es' },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    restoreMocks: true,
    css: { include: [/theme\.css/] },
  },
}))
