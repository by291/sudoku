import { ref, watch, onScopeDispose, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useGameStore } from '@/features/game/stores/useGameStore'
import { useDailyStatuses } from '@/features/game/composables/useDailyStatuses'
import type { SudokuVariant } from '@/sudoku/contracts'
import { parseVariantQuery } from '@/features/game/model/variants'
import type { Difficulty } from '@/sudoku/contracts'
import { focusDialogOpener } from '@/features/game/composables/dialogFocus'

/** Coordinate daily route entry, save restoration, and challenge selection. */
export function useDailyEntry() {
  const game = useGameStore()
  const route = useRoute()
  const router = useRouter()
  const selectedVariant = ref<SudokuVariant>('classic')
  const setupOpen = ref(false)
  const difficulty = ref<Difficulty>('medium')
  const switching = ref(false)
  const {
    today,
    statuses,
    statusesLoading,
    statusesPending,
    statusesReady,
    statusError,
    completedCount,
    refreshStatuses,
    retryStatuses,
  } = useDailyStatuses(setupOpen)
  const queryVariant = computed(() => parseVariantQuery(route.query.variant))
  const localError = ref<string | null>(null)
  const currentDate = computed(() =>
    game.session?.metadata.kind === 'daily' ? game.session.metadata.challengeDate : today.value,
  )
  let initialization = 0
  let startOperation = 0

  async function load() {
    const current = ++initialization
    localError.value = null
    const variant = queryVariant.value
    if (!variant.valid) {
      return
    }

    const id = typeof route.query.session === 'string' ? route.query.session : null
    if (!id) {
      await enterWithoutSave(variant.value, current)
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
    if (stored?.session.mode !== 'daily') {
      await clearInvalidSaveLink(variant.value, current)
      return
    }

    const transition = await game.restoreSession(id)
    if (current === initialization && transition.status === 'ready') {
      selectedVariant.value = game.activeVariant
    }
  }

  async function clearToVariant(variant: SudokuVariant, current: number): Promise<boolean> {
    const transition = await game.clearActiveSession()
    if (current !== initialization) {
      return false
    }

    if (transition.status === 'ready') {
      selectedVariant.value = variant
      return true
    }

    if (game.session?.mode === 'daily') {
      selectedVariant.value = game.activeVariant
    }

    return false
  }

  async function enterWithoutSave(variant: SudokuVariant, current: number) {
    const canStart = await clearToVariant(variant, current)
    if (current !== initialization || !canStart || route.query.start !== '1') {
      return
    }

    // The explicit start URL supplies intent; startDaily still validates the challenge.
    await startDailyAction(selectedVariant.value)
  }

  async function clearInvalidSaveLink(variant: SudokuVariant, current: number) {
    await clearToVariant(variant, current)
    if (current === initialization && route.query.session) {
      localError.value = '找不到这份每日挑战存档，请开始今天的挑战。'
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
    focusDialogOpener(event)

    selectedVariant.value =
      game.session?.mode === 'daily' ? game.activeVariant : selectedVariant.value
    setupOpen.value = true
    void refreshStatuses()
  }

  // prettier-ignore
  const readRouteQuery = () => [
    route.query.session,
    route.query.variant,
    route.query.start,
  ]
  watch(
    readRouteQuery,
    () => {
      void load()
      void refreshStatuses()
    },
    { immediate: true },
  )
  onScopeDispose(() => {
    startOperation++
    initialization++
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
