import { createBindings } from '@sudoku/wasm/factory'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createMainEngine } from '@/sudoku/mainEngine'

const compiled = new WebAssembly.Module(
  readFileSync('packages/sudoku-wasm/pkg/sudoku_wasm_bg.wasm'),
)

describe('owned main-thread WASM engine', () => {
  it('failed_or_mismatched_module_blocks_semantic_actions', async () => {
    const empty = new WebAssembly.Module(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]))

    await expect(createMainEngine(empty)).rejects.toThrow(/exports|bridge/i)
  })

  it('dispose_is_idempotent_and_retires_all_resources', async () => {
    const engine = await createMainEngine(compiled)
    const puzzle = engine.prepare({ kind: 'classic' })

    expect(puzzle.metadata().units).toHaveLength(27)
    puzzle.dispose()
    puzzle.dispose()
    expect(() => puzzle.metadata()).toThrow(/disposed/i)
    const retained = engine.prepare({ kind: 'classic' })
    engine.dispose()
    engine.dispose()
    expect(() => retained.metadata()).toThrow(/disposed/i)
    expect(() => engine.deriveSeed(new Uint8Array())).toThrow(/disposed/i)
  })

  it('separate_engines_own_independent_memory_and_resources', async () => {
    const first = await createMainEngine(compiled)
    const second = await createMainEngine(compiled)
    const retained = second.prepare({ kind: 'diagonal' })

    first.dispose()
    expect(retained.metadata().units).toHaveLength(29)
    expect(second.deriveSeed(new Uint8Array())).toHaveLength(32)
    second.dispose()
  })
})

it('binding_factories_instantiate_distinct_owned_memories', async () => {
  const first = await createBindings().default({ module_or_path: compiled })
  const second = await createBindings().default({ module_or_path: compiled })

  expect(first.memory).not.toBe(second.memory)
  expect(first.memory.buffer).not.toBe(second.memory.buffer)
})
