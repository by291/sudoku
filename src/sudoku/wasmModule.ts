import wasmUrl from '@sudoku/wasm/binary?url'
import { validateModuleExports } from '@/sudoku/guards'

/** Compile code once for the owning runtime; Workers instantiate their own memory from this module. */
export async function loadSudokuModule(): Promise<WebAssembly.Module> {
  const response = await fetch(wasmUrl)
  if (!response.ok) {
    throw new Error(`Sudoku engine download failed (${response.status})`)
  }

  const module = await WebAssembly.compile(await response.arrayBuffer())
  validateModuleExports(module)
  return module
}
