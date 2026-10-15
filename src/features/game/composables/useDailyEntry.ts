import { ref, watch, onMounted, onScopeDispose, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useGameStore } from '@/features/game/stores/useGameStore'
import { useGameRuntime } from '@/runtime'
import { getChallengeDate } from '@/features/game/model/daily'
import type { DailyVariantStatus } from '@/features/game/model/daily'
import type { SudokuVariant } from '@/core/sudoku/rules/types'
import { parseVariantQuery } from '@/features/game/model/variants'
import type { Difficulty } from '@/core/sudoku/types'

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
  const completedCount = computed(
    () => statuses.value.filter((status) => status.state === 'completed').length,
  )
  const queryVariant = computed(() => parseVariantQuery(route.query.variant))
  const localError = ref<string | null>(null)
  const currentDate = computed(() =>
    game.session?.metadata.kind === 'daily' ? game.session.metadata.challengeDate : today.value,
  )
  let timer = 0
  let initialization = 0
  let statusLoad = 0

  async function refreshStatuses() {
    const epoch = ++statusLoad
    statusesLoading.value = true
    const result = await game.loadDailyStatuses(today.value)
    if (epoch !== statusLoad) {
      return
    }

    statusesLoading.value = false
    if (result.ok) {
      statuses.value = result.value
    } else {
      localError.value = '每日状态读取失败，请重试读取。'
    }
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
          await start()
        }
      } else if (game.session?.mode === 'daily') {
        selectedVariant.value = game.activeVariant
      }

      void refreshStatuses()

      return
    }

    if (game.session?.id === id) {
      selectedVariant.value = game.activeVariant
      void refreshStatuses()

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

    void refreshStatuses()
  }

  async function start(variant = selectedVariant.value) {
    if (switching.value) {
      return
    }

    switching.value = true
    setupOpen.value = false
    const transition = await game.startDaily(today.value, variant)
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
    () => [route.query.session, route.query.variant],
    () => {
      void load()
    },
    { immediate: true },
  )
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
  onScopeDispose(() => {
    initialization++
    statusLoad++
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
    completedCount,
    queryVariant,
    localError,
    currentDate,
    refreshStatuses,
    load,
    start,
    openSetup,
  }
}
