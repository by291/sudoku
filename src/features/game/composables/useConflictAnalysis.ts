import { onScopeDispose, ref, shallowRef, watch } from 'vue'
import type { ComputedRef, ShallowRef } from 'vue'
import type { Board, ConflictWorkDto } from '@/sudoku/contracts'
import type { PreparedPuzzle } from '@/sudoku/mainEngine'
import type { SudokuWorkerClient } from '@/worker/client'

/** Owns only live conflicts; hint, note and session transition cancellation stay independent. */
export function useConflictAnalysis(
  layout: ShallowRef<PreparedPuzzle | null>,
  board: ComputedRef<Board>,
  enabled: ComputedRef<boolean>,
  worker: SudokuWorkerClient,
) {
  const evaluation = shallowRef<ConflictWorkDto['result']>({ status: 'complete', violations: [] })
  const state = ref<'ready' | 'pending' | 'failed'>('ready')
  let generation = 0
  let controller: AbortController | null = null

  const stop = watch(
    [() => layout.value, () => board.value.join(','), enabled],
    () => {
      const current = ++generation
      controller?.abort()
      controller = null
      const prepared = layout.value
      state.value = 'ready'
      if (!prepared) {
        evaluation.value = { status: 'complete', violations: [] }
        return
      }
      if (prepared.liveExecution === 'immediate') {
        evaluation.value = prepared.conflicts({ board: [...board.value] }).result
        return
      }

      evaluation.value = prepared.previewConflicts(board.value).result
      if (!enabled.value) {
        return
      }
      state.value = 'pending'
      const owner = new AbortController()
      controller = owner
      const rules = prepared.metadata().rules
      void worker
        .conflicts(board.value, rules, owner.signal)
        .then((outcome) => {
          // Abort is best-effort transport cleanup; generation is the authority for late replies.
          if (current !== generation || owner.signal.aborted) {
            return
          }
          controller = null
          if (outcome.status === 'completed') {
            evaluation.value = outcome.value.computation.result
            state.value = 'ready'
          } else {
            state.value = 'failed'
          }
        })
        .catch(() => {
          if (current === generation && !owner.signal.aborted) {
            controller = null
            state.value = 'failed'
          }
        })
    },
    { immediate: true, flush: 'sync' },
  )

  function dispose() {
    stop()
    generation++
    controller?.abort()
    controller = null
  }

  onScopeDispose(dispose)
  return { evaluation, state, dispose }
}
