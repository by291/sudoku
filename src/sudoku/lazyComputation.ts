import type { MainSudokuEngine } from '@/sudoku/mainEngine'

/** Owns one lazy engine and releases an initializer that finishes after its owner. */
export function createLazyComputation() {
  let disposed = false
  let ready: { engine: MainSudokuEngine; module: WebAssembly.Module } | null = null
  let opening: Promise<void> | null = null

  function ensureReady(): Promise<void> {
    if (disposed) {
      return Promise.reject(new Error('Computation has been disposed'))
    }
    if (ready) {
      return Promise.resolve()
    }
    if (!opening) {
      opening = initialize().catch((error: unknown) => {
        // A transport or instantiation failure may be transient; the next player action retries.
        opening = null
        throw error
      })
    }
    return opening
  }

  async function initialize() {
    const [{ loadSudokuModule }, { createMainEngine }] = await Promise.all([
      import('@/sudoku/wasmModule'),
      import('@/sudoku/mainEngine'),
    ])
    if (disposed) {
      throw new Error('Computation has been disposed')
    }
    const module = await loadSudokuModule()
    if (disposed) {
      throw new Error('Computation has been disposed')
    }
    const engine = await createMainEngine(module)
    if (disposed) {
      engine.dispose()
      throw new Error('Computation has been disposed')
    }
    ready = { engine, module }
  }

  function active() {
    if (disposed || !ready) {
      throw new Error(disposed ? 'Computation has been disposed' : 'Computation is not ready')
    }
    return ready
  }

  return {
    ensureReady,
    get engine() {
      return active().engine
    },
    get module() {
      return active().module
    },
    dispose() {
      disposed = true
      ready?.engine.dispose()
      ready = null
    },
  }
}
