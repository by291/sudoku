import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { createMainEngine } from '@/sudoku/mainEngine'

// Compile immutable code once; each fixture owns fresh memory and prepared resources.
const module = new WebAssembly.Module(
  readFileSync(createRequire(import.meta.url).resolve('@sudoku/wasm/binary')),
)

export function createTestEngine() {
  return createMainEngine(module)
}

export function getTestModule(): WebAssembly.Module {
  return module
}
