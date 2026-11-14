import wasmUrl from '@sudoku/wasm/binary?url'
import { validateModuleExports } from '@/sudoku/guards'

/** Compile the shared code module; each consumer instantiates its own WASM memory. */
export async function loadSudokuModule(): Promise<WebAssembly.Module> {
  const response = await fetch(wasmUrl)
  if (!response.ok) {
    throw new Error(`Sudoku engine download failed (${response.status})`)
  }

  const module = await WebAssembly.compile(await response.arrayBuffer())
  validateModuleExports(module)

  return module
}
