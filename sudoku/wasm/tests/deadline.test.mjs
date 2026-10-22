import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { URL } from 'node:url'
import { createBindings } from '../pkg/factory.js'

const bindings = createBindings()
const binary = readFileSync(new URL('../pkg/sudoku_wasm_bg.wasm', import.meta.url))
bindings.initSync({ module: new globalThis.WebAssembly.Module(binary) })

function withExpiredDeadline(operation) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'performance')
  let milliseconds = 0
  Object.defineProperty(globalThis, 'performance', {
    configurable: true,
    value: {
      now() {
        milliseconds += 4_000
        return milliseconds
      },
    },
  })

  try {
    operation()
  } finally {
    Object.defineProperty(globalThis, 'performance', original)
  }
}

function assertTimeout(operation) {
  assert.throws(operation, { message: 'Computation timed out' })
}

test('generation cancellation takes precedence over an inner preparation error', () => {
  withExpiredDeadline(() => {
    assertTimeout(() =>
      bindings.generate(new Uint8Array(32), {
        variant: 'classic',
        difficulty: 'easy',
        puzzleVersion: 'sudoku-v12',
      }),
    )
  })
})

test('an expired generation deadline takes precedence over a returned core error', () => {
  const options = {
    variant: 'classic',
    difficulty: 'easy',
    puzzleVersion: 'sudoku-v12',
    limits: { maxLayouts: 4_294_967_295, maxSteps: 500 },
  }
  assert.throws(
    () => bindings.generate(new Uint8Array(32), options),
    /Invalid generation limit: maxLayouts/,
  )

  withExpiredDeadline(() => {
    assertTimeout(() => bindings.generate(new Uint8Array(32), options))
  })
})

test('raw and prepared computations settle expired deadlines before returning results', () => {
  const board = Array(81).fill(0)
  const rules = { kind: 'classic' }
  const prepared = new bindings.PreparedPuzzle({ rules })

  try {
    withExpiredDeadline(() => {
      assertTimeout(() => new bindings.PreparedPuzzle({ rules }))
      assertTimeout(() => bindings.count_solutions({ board, rules }))
      assertTimeout(() => prepared.candidates({ board }))
      assertTimeout(() => prepared.conflicts({ board }))
      assertTimeout(() => prepared.count_solutions({ board }))
      assertTimeout(() =>
        prepared.edit({
          givens: board,
          entries: board,
          notes: Array(81).fill(0),
          action: { kind: 'generate-notes' },
        }),
      )
    })

    assert.equal(prepared.candidates({ board }).result.status, 'complete')
  } finally {
    prepared.free()
  }
})
