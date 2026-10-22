import { createRequire } from 'node:module'
import { createBindings } from '@sudoku/wasm/factory'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createMainEngine } from '@/sudoku/mainEngine'

const compiled = new WebAssembly.Module(
  readFileSync(createRequire(import.meta.url).resolve('@sudoku/wasm/binary')),
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

it('heavy_layouts_only_allow_cheap_preview_on_the_main_thread', async () => {
  const engine = await createMainEngine(compiled)
  const layout = engine.prepare({
    kind: 'killer',
    cages: Array.from({ length: 9 }, (_, row) => ({
      cells: Array.from({ length: 9 }, (_, column) => row * 9 + column),
      sum: 45,
    })),
  })
  const board = Array<0 | 1>(81).fill(0)
  board[0] = 1
  board[1] = 1

  expect(layout.liveExecution).toBe('worker')
  expect(layout.previewConflicts(board).result.status).toBe('incomplete')
  expect(layout.previewConflicts(board).result.violations[0]?.cells).toEqual([0, 1])
  expect(() => layout.conflicts({ board })).toThrow(/Worker/)
  expect(() => layout.candidates({ board })).toThrow(/Worker/)
  expect(() =>
    layout.edit({
      givens: Array(81).fill(0),
      entries: board,
      notes: Array(81).fill(0),
      action: { kind: 'generate-notes' },
    }),
  ).toThrow(/Worker/)
  expect(
    layout.edit({
      givens: Array(81).fill(0),
      entries: board,
      notes: Array(81).fill(0),
      action: { kind: 'erase', cell: 0 },
    }).result.status,
  ).toBe('complete')
  engine.dispose()
})

it('live_result_parsers_reject_invalid_values_and_preserve_partial_results', async () => {
  const engine = await createMainEngine(compiled)
  const partial = {
    result: {
      status: 'incomplete',
      violations: [{ constraintId: 'row:0', cells: [0, 1], code: { kind: 'duplicate' } }],
    },
  }

  expect(engine.parseConflicts(partial)).toEqual(partial)
  expect(() => engine.parseConflicts({ result: null })).toThrow()
  expect(() =>
    engine.parseConflicts({
      ...partial,
      result: {
        status: 'complete',
        violations: [{ constraintId: 'row:0', cells: [81], code: { kind: 'duplicate' } }],
      },
    }),
  ).toThrow()
  const complete = {
    result: {
      status: 'complete',
      entries: Array(81).fill(0),
      notes: Array(81).fill(511),
      changed: false,
      boardComplete: false,
    },
  }
  expect(engine.parseEdit(complete)).toEqual(complete)
  expect(() =>
    engine.parseEdit({ ...complete, result: { ...complete.result, notes: [512] } }),
  ).toThrow()
  expect(() =>
    engine.parseEdit({ ...complete, result: { ...complete.result, entries: Array(81).fill(10) } }),
  ).toThrow()
  expect(engine.parseEdit({ result: { status: 'incomplete' } }).result.status).toBe('incomplete')
  engine.dispose()
})
