import { ref, watch, onMounted, onScopeDispose, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useGameStore } from '@/features/game/stores/useGameStore'
import { useGameRuntime } from '@/runtime'
import { getChallengeDate } from '@/features/game/model/daily'
import type { DailyVariantStatus } from '@/features/game/model/daily'
import type { SudokuVariant } from '@/sudoku/contracts'
import { parseVariantQuery } from '@/features/game/model/variants'
import type { Difficulty } from '@/sudoku/contracts'

export function useDailyEntry() {
  const runtime = useGameRuntime()
  const game = useGameStore()
  const route = useRoute()
  const router = useRouter()
  const today = ref(getChallengeDate(runtime.wallNow()))
  const selectedVariant = ref<SudokuVariant>('classic')
  const setupOpen = ref(false)
  const difficulty = ref<Difficulty>('medium')
  const switching = ref(false)
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
  const queryVariant = computed(() => parseVariantQuery(route.query.variant))
  const localError = ref<string | null>(null)
  const currentDate = computed(() =>
    game.session?.metadata.kind === 'daily' ? game.session.metadata.challengeDate : today.value,
  )
  let timer = 0
  let initialization = 0
  let statusLoad = 0
  let startOperation = 0
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

  async function load() {
    const current = ++initialization
    localError.value = null
    const variant = queryVariant.value
    if (!variant.valid) {
      return
    }

    const id = typeof route.query.session === 'string' ? route.query.session : null
    if (!id) {
      const transition = await game.clearActiveSession()
      if (current !== initialization) {
        return
      }

      if (transition.status === 'ready') {
        selectedVariant.value = variant.value
        if (route.query.start === '1') {
          // An explicit start URL already expresses intent; full validation remains in startDaily.
          await startDailyAction(selectedVariant.value)
        }
      } else if (game.session?.mode === 'daily') {
        selectedVariant.value = game.activeVariant
      }

      return
    }

    if (game.session?.id === id) {
      selectedVariant.value = game.activeVariant
      return
    }

    const result = await game.findSession(id)
    if (current !== initialization) {
      return
    }

    if (!result.ok) {
      localError.value = '每日挑战存档读取失败，请重试。'

      return
    }

    const stored = result.value
    if (stored?.session.mode === 'daily') {
      const transition = await game.restoreSession(id)
      if (current !== initialization) {
        return
      }

      if (transition.status === 'ready') {
        selectedVariant.value = game.activeVariant
      }
    } else {
      const transition = await game.clearActiveSession()
      if (current !== initialization) {
        return
      }

      if (transition.status === 'ready') {
        selectedVariant.value = variant.value
      } else if (game.session?.mode === 'daily') {
        selectedVariant.value = game.activeVariant
      }

      if (route.query.session) {
        localError.value = '找不到这份每日挑战存档，请开始今天的挑战。'
      }
    }
  }

  async function start(variant = selectedVariant.value) {
    if (!statusesReady.value) {
      return
    }
    await startDailyAction(variant)
  }

  async function startDailyAction(variant: SudokuVariant) {
    if (switching.value) {
      return
    }

    const current = ++startOperation
    switching.value = true
    setupOpen.value = false
    const transition = await game.startDaily(today.value, variant)
    if (current !== startOperation) {
      return
    }
    switching.value = false
    if (transition.status === 'ready' && game.session?.mode === 'daily') {
      selectedVariant.value = game.activeVariant
      await router.replace({ query: { variant: game.activeVariant, session: game.session.id } })
      void refreshStatuses()
    }
  }

  function openSetup(event?: MouseEvent) {
    if (event?.currentTarget instanceof HTMLElement) {
      event.currentTarget.focus()
    }

    selectedVariant.value =
      game.session?.mode === 'daily' ? game.activeVariant : selectedVariant.value
    setupOpen.value = true
    void refreshStatuses()
  }

  watch(
    () => [route.query.session, route.query.variant, route.query.start],
    () => {
      void load()
      void refreshStatuses()
    },
    { immediate: true },
  )
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
    startOperation++
    initialization++
    statusLoad++
    maintenance?.abort()
    unsubscribe()
    window.clearInterval(timer)
  })

  return {
    game,
    today,
    selectedVariant,
    setupOpen,
    difficulty,
    switching,
    statuses,
    statusesLoading,
    statusesPending,
    statusesReady,
    statusError,
    completedCount,
    queryVariant,
    localError,
    currentDate,
    refreshStatuses,
    retryStatuses,
    load,
    start,
    openSetup,
  }
}
