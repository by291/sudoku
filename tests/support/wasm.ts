import { readFileSync } from 'node:fs'
import { createMainEngine } from '@/sudoku/mainEngine'

// Compile immutable code once; each fixture owns fresh memory and prepared resources.
const module = new WebAssembly.Module(readFileSync('packages/sudoku-wasm/pkg/sudoku_wasm_bg.wasm'))

export function createTestEngine() {
  return createMainEngine(module)
}

export function getTestModule(): WebAssembly.Module {
  return module
}
