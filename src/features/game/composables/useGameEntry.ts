import { computed, ref, watch, onScopeDispose } from 'vue'
import { storeToRefs } from 'pinia'
import { useRoute, useRouter } from 'vue-router'
import type { Difficulty } from '@/core/sudoku/types'
import { isDifficulty } from '@/core/sudoku/types'
import type { SudokuVariant } from '@/core/sudoku/rules'
import { createGenerationInput } from '@/core/sudoku/generation'
import { parseVariantQuery } from '@/features/game/model/variants'
import type { SessionMetadata } from '@/features/game/model/session'
import type { SessionRecord } from '@/storage/records'
import { useGameStore } from '@/features/game/stores/useGameStore'
import { useGameRuntime } from '@/runtime'

type GameEntryOptions = {
  metadata(): SessionMetadata
  autoRestore(): boolean
  practiceVariant(): SudokuVariant
  practiceDifficulty(): Difficulty
  chooseDaily(): void
}

export function useGameEntry(options: GameEntryOptions) {
  const route = useRoute()
  const router = useRouter()
  const runtime = useGameRuntime()
  const game = useGameStore()
  const { session, activeVariant } = storeToRefs(game)
  const metadata = computed(options.metadata)

  const difficulty = ref<Difficulty>(options.practiceDifficulty())
  const setupOpen = ref(false)
  const targetLoading = ref(false)
  const nextVariant = ref<SudokuVariant>(options.practiceVariant())
  const queryVariant = computed(() => parseVariantQuery(route.query.variant))
  const targetSession = ref<SessionRecord | null>(null)
  let targetLookup = 0

  async function refreshTarget() {
    const epoch = ++targetLookup
    if (metadata.value.kind !== 'free') {
      return
    }

    targetLoading.value = true
    const result = await game.findFreeSession(nextVariant.value)
    if (epoch !== targetLookup) {
      return
    }

    targetLoading.value = false
    targetSession.value = result.ok ? result.value : null
    if (!result.ok) {
      initializationError.value = '目标玩法存档读取失败。新开一局可暂存在内存中，请保持页面打开。'
    }
  }

  watch(nextVariant, () => {
    void refreshTarget()
  })

  const ready = ref(false)
  const replacementAvailable = ref(false)
  const initializationError = ref<string | null>(null)
  let initialization = 0
  let disposed = false
  onScopeDispose(() => {
    disposed = true
    initialization++
    targetLookup++
  })
  const active = computed(
    () =>
      session.value &&
      session.value.mode === metadata.value.kind &&
      (metadata.value.kind !== 'learning' ||
        (session.value.metadata.kind === 'learning' &&
          session.value.metadata.lessonId === metadata.value.lessonId)),
  )

  async function initialize() {
    const current = ++initialization
    const requestedId = typeof route.query.session === 'string' ? route.query.session : null
    ready.value = false
    initializationError.value = null
    if (!queryVariant.value.valid) {
      ready.value = true

      return
    }

    // Updating the URL after a successful transition must not pause or reload that session.
    if (options.autoRestore() && requestedId === session.value?.id && active.value) {
      nextVariant.value = activeVariant.value
      ready.value = true
      void refreshTarget()

      return
    }

    nextVariant.value =
      metadata.value.kind === 'learning' ? options.practiceVariant() : queryVariant.value.value
    if (options.autoRestore() && !requestedId && metadata.value.kind === 'free') {
      // Only an explicit save link resumes a board; ordinary entry waits for the setup dialog.
      const transition = await game.clearActiveSession()
      if (current !== initialization) {
        return
      }

      ready.value = true
      if (transition.status !== 'ready') {
        return
      }

      if (route.query.start === '1') {
        if (!isDifficulty(route.query.difficulty)) {
          initializationError.value = '无法识别指定的难度，请重新选择。'

          return
        }

        difficulty.value = route.query.difficulty
        await start()
      } else {
        void refreshTarget()
      }

      return
    }

    if (options.autoRestore()) {
      const records = await findRequestedSave(requestedId)
      if (current !== initialization) {
        return
      }

      if (!records.ok) {
        initializationError.value = '读取存档失败。新开一局可暂存在内存中，请保持页面打开。'
      } else {
        replacementAvailable.value = !!records.value
        const id = requestedId
        const record = records.value
        if (
          record &&
          record.session.mode === metadata.value.kind &&
          (metadata.value.kind !== 'learning' ||
            (record.session.metadata.kind === 'learning' &&
              record.session.metadata.lessonId === metadata.value.lessonId))
        ) {
          const transition = await game.restoreSession(record.session.id)
          if (current !== initialization) {
            return
          }

          if (transition.status === 'ready') {
            nextVariant.value = record.session.puzzle.rules.kind
          }
        } else {
          await game.clearActiveSession()
          if (current !== initialization) {
            return
          }

          if (id) {
            initializationError.value = '存档与当前模式不匹配，或已被清除。'
          }
        }
      }
    }

    if (current !== initialization) {
      return
    }

    ready.value = true
    void refreshTarget()
  }

  function findRequestedSave(requestedId: string | null) {
    if (requestedId) {
      return game.findSession(requestedId)
    }

    if (metadata.value.kind === 'free') {
      return game.findFreeSession(nextVariant.value)
    }

    return game.findPracticeSession()
  }

  watch(
    () => [
      route.query.session,
      route.query.variant,
      options.practiceVariant(),
      metadata.value.kind,
      metadata.value.kind === 'learning' ? metadata.value.lessonId : '',
    ],
    () => {
      void initialize()
    },
    { immediate: true },
  )

  async function start() {
    if (!queryVariant.value.valid) {
      return
    }

    const transition = await game.startGame(
      createGenerationInput(nextVariant.value, difficulty.value, runtime.createId()),
      metadata.value,
    )
    if (transition.status === 'ready') {
      await syncSessionRoute()
    }

    if (disposed) {
      return
    }

    await refreshTarget()
  }

  async function syncSessionRoute() {
    if (disposed || metadata.value.kind === 'daily' || !active.value || !session.value) {
      return
    }

    const query = { ...route.query }
    delete query.start
    delete query.difficulty
    await router.replace({
      query: { ...query, variant: activeVariant.value, session: session.value.id },
    })
  }

  async function retryGeneration() {
    const transition = await game.retryGeneration()
    if (transition?.status === 'ready') {
      await syncSessionRoute()
    }
  }

  async function requestNew() {
    if (metadata.value.kind === 'daily') {
      options.chooseDaily()

      return
    }

    if (metadata.value.kind === 'free') {
      nextVariant.value = active.value ? activeVariant.value : nextVariant.value
      difficulty.value =
        active.value && session.value ? session.value.puzzle.difficulty : difficulty.value
      setupOpen.value = true
      void refreshTarget()

      return
    }

    await refreshTarget()
    if (
      targetSession.value ||
      (metadata.value.kind === 'learning' && (active.value || replacementAvailable.value))
    ) {
      return true
    } else {
      void start()
    }
  }

  function startSelected() {
    setupOpen.value = false
    void start()
  }

  async function resumeTarget() {
    if (!targetSession.value) {
      return
    }

    setupOpen.value = false
    const transition = await game.restoreSession(targetSession.value.session.id)
    if (transition.status === 'ready') {
      await game.resume()
      await syncSessionRoute()
    }
  }

  return {
    ready,
    initializationError,
    queryVariant,
    active,
    nextVariant,
    difficulty,
    setupOpen,
    targetSession,
    targetLoading,
    replacementAvailable,
    initialize,
    start,
    syncSessionRoute,
    retryGeneration,
    requestNew,
    startSelected,
    resumeTarget,
    refreshTarget,
  }
}
