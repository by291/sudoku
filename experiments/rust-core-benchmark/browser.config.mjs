import { defineConfig } from 'vite'
import { resolve } from 'node:path'

export default defineConfig({
  root: import.meta.dirname,
  publicDir: resolve(import.meta.dirname, '../../.superpowers/rust-core-benchmark/browser-public'),
  resolve: { alias: { '@': resolve(import.meta.dirname, '../../src') } },
  build: {
    target: 'es2022',
    outDir: resolve(import.meta.dirname, '../../.superpowers/rust-core-benchmark/browser-dist'),
    emptyOutDir: true,
    rolldownOptions: {
      input: resolve(import.meta.dirname, 'browser.html'),
      external: ['/wasm/sudoku_core_benchmark.js'],
    },
  },
})
