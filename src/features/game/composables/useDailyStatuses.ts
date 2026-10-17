import { computed, onMounted, onScopeDispose, ref, watch } from 'vue'
import type { Ref } from 'vue'
import { useGameRuntime } from '@/runtime'
import { useGameStore } from '@/features/game/stores/useGameStore'
import { getChallengeDate } from '@/features/game/model/daily'
import type { DailyVariantStatus } from '@/features/game/model/daily'

/** Owns daily summary reads and explicit maintenance without blocking route entry. */
export function useDailyStatuses(setupOpen: Readonly<Ref<boolean>>) {
  const runtime = useGameRuntime()
  const game = useGameStore()
  const today = ref(getChallengeDate(runtime.wallNow()))
  const statuses = ref<readonly DailyVariantStatus[]>([])
  const statusesLoading = ref(false)
  const statusesPending = ref(false)
  const statusError = ref<string | null>(null)
  const statusDate = ref<string | null>(null)
  const statusesReady = computed(
    () =>
      statusDate.value === today.value &&
      !statusesLoading.value &&
      !statusesPending.value &&
      !statusError.value,
  )
  const completedCount = computed(() =>
    statusDate.value === today.value
      ? statuses.value.filter((status) => status.state === 'completed').length
      : null,
  )
  let timer = 0
  let statusLoad = 0
  let maintenance: AbortController | null = null

  async function refreshStatuses() {
    maintenance?.abort()
    maintenance = null
    const epoch = ++statusLoad
    const date = today.value
    statusesLoading.value = true
    statusError.value = null
    const result = await runtime.repository.readDailyStatuses(date)
    if (epoch !== statusLoad) {
      return
    }

    statusesLoading.value = false
    if (!result.ok) {
      statusError.value = '每日状态读取失败，请重试读取。'
      return
    }
    statusesPending.value = result.value.coverage === 'pending'
    if (!statusesPending.value) {
      statuses.value = result.value.statuses
      statusDate.value = date
    }
  }

  async function retryStatuses() {
    if (statusesPending.value) {
      maintenance?.abort()
      const controller = new AbortController()
      maintenance = controller
      const epoch = ++statusLoad
      statusesLoading.value = true
      statusError.value = null
      const result = await runtime.repository.maintainSummaries(controller.signal)
      if (epoch !== statusLoad) {
        return
      }
      statusesLoading.value = false
      if (!result.ok) {
        statusError.value = '旧存档整理暂时无法完成，请重试。原始数据仍然保留。'
        return
      }
    }
    await refreshStatuses()
  }

  watch(setupOpen, (open) => {
    if (!open && maintenance) {
      // Closing the selector cancels explicit repair without letting late work publish status.
      statusLoad++
      maintenance.abort()
      maintenance = null
      statusesLoading.value = false
    }
  })
  watch(
    () => game.saveState,
    (state) => {
      if (state === 'saved') {
        void refreshStatuses()
      }
    },
  )
  watch(today, () => {
    void refreshStatuses()
  })
  onMounted(() => {
    timer = window.setInterval(() => {
      today.value = getChallengeDate(runtime.wallNow())
    }, 10000)
  })
  const unsubscribe = runtime.ownership.subscribe((notice) => {
    if (notice.kind === 'reset') {
      statusDate.value = null
      statuses.value = []
      statusesPending.value = false
      void refreshStatuses()
    }
  })
  onScopeDispose(() => {
    statusLoad++
    maintenance?.abort()
    unsubscribe()
    window.clearInterval(timer)
  })

  return {
    today,
    statuses,
    statusesLoading,
    statusesPending,
    statusesReady,
    statusError,
    completedCount,
    refreshStatuses,
    retryStatuses,
  }
}
