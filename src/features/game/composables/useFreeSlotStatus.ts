import { onScopeDispose, ref, watch } from 'vue'
import type { Ref } from 'vue'
import { useGameRuntime } from '@/runtime'
import type { GameSummary } from '@/storage/readModels'
import type { SudokuVariant } from '@/sudoku/contracts'

/** Owns the setup selector's summary reads and cancellable legacy repair, without opening a game. */
export function useFreeSlotStatus(
  variant: Readonly<Ref<SudokuVariant>>,
  enabled: Readonly<Ref<boolean>>,
) {
  const { repository } = useGameRuntime()
  const summary = ref<GameSummary | null>(null)
  const loading = ref(false)
  const pending = ref(false)
  const error = ref<string | null>(null)
  let lookup = 0
  let maintenance: AbortController | null = null

  async function refresh() {
    maintenance?.abort()
    maintenance = null
    const current = ++lookup
    if (!enabled.value) {
      return
    }

    loading.value = true
    const result = await repository.readSlotSummary('free', variant.value)
    // A previous selection must not replace the current slot's presence or recovery state.
    if (current !== lookup) {
      return
    }

    loading.value = false
    summary.value = result.ok ? result.value.summary : null
    pending.value = result.ok && result.value.coverage === 'pending'
    if (!result.ok) {
      error.value = '目标玩法存档读取失败，请重试。'
    } else if (pending.value) {
      error.value = '旧存档尚待校验，请重新读取后继续。'
    } else {
      error.value = null
    }
  }

  async function retry() {
    if (pending.value) {
      loading.value = true
      const current = ++lookup
      maintenance?.abort()
      const controller = new AbortController()
      maintenance = controller

      const result = await repository.maintainSummaries(controller.signal)
      if (current !== lookup) {
        return
      }
      if (!result.ok) {
        loading.value = false
        error.value = '旧存档暂时无法校验，请重试。原有进度已保留。'
        return
      }
    }

    await refresh()
  }

  watch(variant, () => {
    void refresh()
  })

  onScopeDispose(() => {
    // Fence reads as well as aborting repair: a late completion cannot publish after route disposal.
    lookup++
    maintenance?.abort()
  })

  return { summary, loading, pending, error, refresh, retry }
}
