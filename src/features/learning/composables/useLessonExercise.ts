import { computed, onMounted, onScopeDispose, ref, watch, toValue } from 'vue'
import type { MaybeRefOrGetter } from 'vue'
import type { Digit } from '@/sudoku/contracts'
import { UNIT_SIZE, isDigit } from '@/sudoku/values'
import { maskOf } from '@/shared/model/sudokuPresentation'
import { isKeyboardOwnedByControl } from '@/shared/utils/keyboardOwnership'
import { useLearningStore } from '@/features/learning/stores/useLearningStore'
import type { Lesson } from '@/features/learning/model/lessons'
import { lessonStages } from '@/features/learning/model/lessons'
import { stageAnswer } from '@/features/learning/model/exerciseStages'

/** Own the exercise draft and publish feedback only for the current lesson and dataset. */
export function useLessonExercise(
  lesson: MaybeRefOrGetter<Lesson | undefined>,
  practice: MaybeRefOrGetter<boolean>,
) {
  const learning = useLearningStore()
  const currentLesson = computed(() => toValue(lesson))
  const inPractice = computed(() => toValue(practice))
  const mode = ref<'guide' | 'exercise'>('guide')
  const stageIndex = ref(0)
  const canAdvance = ref(false)
  const completed = ref(false)
  const stages = computed(() => (currentLesson.value ? lessonStages(currentLesson.value) : []))
  const exercisePresentation = computed(() => {
    const stage = stages.value[stageIndex.value]
    return stage ? { stage, answer: stageAnswer(stage) } : undefined
  })
  const stageCaption = computed(() => {
    let firstStageIndex = 0
    for (const exercise of currentLesson.value?.exercises ?? []) {
      if (stageIndex.value < firstStageIndex + exercise.stages.length) {
        return `${exercise.title} · 第 ${stageIndex.value - firstStageIndex + 1} / ${exercise.stages.length} 步 · 练习阶段 ${stageIndex.value + 1} / ${stages.value.length}`
      }
      firstStageIndex += exercise.stages.length
    }
    return ''
  })

  const selected = ref<number | null>(null)
  const placement = ref<{ cell: number; digit: Digit } | null>(null)
  const removals = ref<{ cell: number; digit: Digit }[]>([])
  const feedback = ref<string | null>(null)
  const correct = ref(false)
  const busy = ref(false)
  const exerciseCells = computed(() => {
    const expectedAnswer = exercisePresentation.value?.answer
    if (!expectedAnswer) {
      return []
    }

    if (expectedAnswer.kind === 'placement') {
      return [expectedAnswer.expected.cell]
    }

    const cells = expectedAnswer.expected.map((removal) => removal.cell)
    return [...new Set(cells)]
  })
  const exercisePrompt = computed(() =>
    exercisePresentation.value?.answer.kind === 'placement'
      ? '点击圆点标出的空格，选择应该出现的数字，再提交答案。'
      : '点击圆点标出的格子，选择可以排除的候选数。再次选择可撤回，然后提交全部排除。',
  )
  const selectionText = computed(() =>
    selected.value === null
      ? '先选择一个练习格'
      : `已选第${Math.floor(selected.value / UNIT_SIZE) + 1}行第${(selected.value % UNIT_SIZE) + 1}列`,
  )
  const exampleNotes = computed(
    () =>
      exercisePresentation.value?.stage.candidates.map((mask, cell) =>
        removals.value
          .filter((pair) => pair.cell === cell)
          .reduce((remaining, pair) => remaining & ~maskOf(pair.digit), mask),
      ) ?? [],
  )
  const exerciseBoard = computed(
    () =>
      exercisePresentation.value?.stage.board.map((value, cell) =>
        placement.value?.cell === cell ? placement.value.digit : value,
      ) ?? [],
  )
  const canSubmit = computed(
    () =>
      mode.value === 'exercise' &&
      !busy.value &&
      !canAdvance.value &&
      !completed.value &&
      (exercisePresentation.value?.answer.kind === 'elimination' || placement.value !== null),
  )

  // Local feedback belongs to a lesson and route mode, independently of durable progress writes.
  let ownerGeneration = 0
  let disposed = false
  let initializingRoute = false

  function clearFeedback() {
    feedback.value = null
    correct.value = false
  }

  function clearAnswerDraft() {
    placement.value = null
    removals.value = []
    clearFeedback()
  }

  watch(
    () => ({
      lessonId: currentLesson.value?.id,
      isPractice: inPractice.value,
      datasetGeneration: learning.datasetGeneration,
      readyGeneration: learning.readyGeneration,
    }),
    async (selection, previous) => {
      const hasRouteChanged =
        !previous ||
        selection.lessonId !== previous.lessonId ||
        selection.isPractice !== previous.isPractice
      const hasDatasetChanged =
        previous && selection.datasetGeneration !== previous.datasetGeneration

      // The route initializer owns its awaited load/visit. Its own readiness publication
      // must not start a second initializer that clears a player's selected cell.
      if (!hasRouteChanged && !hasDatasetChanged && initializingRoute) {
        return
      }

      initializingRoute = hasRouteChanged
      const owner = ++ownerGeneration
      const lessonId = selection.lessonId
      if (hasRouteChanged) {
        mode.value = 'guide'
      }
      selected.value = null
      clearAnswerDraft()
      busy.value = true
      stageIndex.value = 0
      canAdvance.value = false
      completed.value = false

      if (hasRouteChanged) {
        await learning.load()
      }

      // Reset invalidates pending answers immediately. The committed reload then supplies
      // the new cursor; ordinary stage writes do not trigger this watcher or skip Next.
      if (learning.readyGeneration !== learning.datasetGeneration) {
        if (owner === ownerGeneration) {
          initializingRoute = false
        }
        return
      }
      if (disposed || owner !== ownerGeneration) {
        return
      }

      if (lessonId) {
        stageIndex.value = Math.min(learning.exerciseStage(lessonId), stages.value.length - 1)
        if (hasRouteChanged) {
          // Settle the visit write before answers enqueue stages. A dataset-only reload
          // must preserve the imported last-visited preference in other open tabs.
          await learning.selectLesson(lessonId)
        }
      }

      if (!disposed && owner === ownerGeneration) {
        busy.value = false
        initializingRoute = false
      }
    },
    { immediate: true },
  )

  function selectMode(value: string | number | boolean) {
    if (value === 'guide' || value === 'exercise') {
      mode.value = value
    }
  }

  function answer(digit: Digit) {
    if (
      inPractice.value ||
      mode.value !== 'exercise' ||
      !exercisePresentation.value ||
      selected.value === null ||
      exercisePresentation.value.stage.board[selected.value] !== 0 ||
      busy.value ||
      canAdvance.value ||
      completed.value
    ) {
      return
    }

    if (exercisePresentation.value.answer.kind === 'elimination') {
      if (!(exercisePresentation.value.stage.candidates[selected.value] & maskOf(digit))) {
        return
      }

      const pair = { cell: selected.value, digit }
      const hasRemoval = removals.value.some(
        (item) => item.cell === pair.cell && item.digit === pair.digit,
      )
      removals.value = hasRemoval
        ? removals.value.filter((item) => item.cell !== pair.cell || item.digit !== pair.digit)
        : [...removals.value, pair]
    } else {
      placement.value = { cell: selected.value, digit }
    }

    clearFeedback()
  }

  async function submitAnswer() {
    if (
      inPractice.value ||
      !currentLesson.value ||
      !exercisePresentation.value ||
      !canSubmit.value
    ) {
      return
    }

    const supplied =
      exercisePresentation.value.answer.kind === 'elimination'
        ? [...removals.value]
        : placement.value
    if (!supplied) {
      return
    }

    // A route change may replace the current draft while persistence is in flight.
    const owner = ownerGeneration
    busy.value = true
    const result = await learning.submitExercise(currentLesson.value.id, supplied, stageIndex.value)

    if (disposed || owner !== ownerGeneration) {
      return
    }

    feedback.value = result.explanation
    canAdvance.value = false
    completed.value = false

    switch (result.kind) {
      case 'incorrect':
      case 'unavailable':
        correct.value = false
        break
      case 'cancelled':
      case 'save-failed':
        correct.value = true
        break
      case 'advance':
        correct.value = true
        canAdvance.value = true
        break
      case 'completed':
        correct.value = true
        completed.value = true
        break
      default:
        result satisfies never
    }

    busy.value = false
  }

  function resetExercise() {
    if (busy.value || canAdvance.value || completed.value) {
      return
    }

    clearAnswerDraft()
  }

  function nextStage() {
    if (!canAdvance.value || stageIndex.value >= stages.value.length - 1) {
      return
    }

    stageIndex.value++
    selected.value = null
    clearAnswerDraft()
    canAdvance.value = false
  }

  function dispatchExerciseKey(event: KeyboardEvent) {
    if (
      inPractice.value ||
      mode.value !== 'exercise' ||
      !currentLesson.value ||
      selected.value === null ||
      busy.value ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      isKeyboardOwnedByControl(event)
    ) {
      return
    }

    const digit = Number(event.key)
    if (event.key.length !== 1 || !isDigit(digit)) {
      return
    }

    event.preventDefault()
    answer(digit)
  }

  onMounted(() => window.addEventListener('keydown', dispatchExerciseKey))
  onScopeDispose(() => {
    disposed = true
    ownerGeneration++
    window.removeEventListener('keydown', dispatchExerciseKey)
  })

  return {
    selected,
    placement,
    mode,
    selectMode,
    removals,
    feedback,
    correct,
    busy,
    exerciseCells,
    exercisePrompt,
    selectionText,
    exampleNotes,
    exerciseBoard,
    canSubmit,
    answer,
    submitAnswer,
    resetExercise,
    exercisePresentation,
    stageCaption,
    canAdvance,
    completed,
    nextStage,
  }
}
