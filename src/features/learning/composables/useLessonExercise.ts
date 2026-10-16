import { computed, onMounted, onScopeDispose, ref, watch, toValue } from 'vue'
import type { MaybeRefOrGetter } from 'vue'
import type { Digit } from '@/sudoku/contracts'
import { isDigit } from '@/sudoku/values'
import { maskOf } from '@/shared/model/sudokuPresentation'
import { isKeyboardOwnedByControl } from '@/shared/utils/keyboardOwnership'
import { useLearningStore } from '@/features/learning/stores/useLearningStore'
import type { Lesson } from '@/features/learning/model/lessons'
import { lessonStages } from '@/features/learning/model/lessons'
import { stageAnswer } from '@/features/learning/model/exerciseStages'
import { explainStep } from '@/features/game/model/techniquePresentation'

export function useLessonExercise(
  lesson: MaybeRefOrGetter<Lesson | undefined>,
  practice: MaybeRefOrGetter<boolean>,
) {
  const learning = useLearningStore()
  const currentLesson = computed(() => toValue(lesson))
  const inPractice = computed(() => toValue(practice))
  const stageIndex = ref(0)
  const canAdvance = ref(false)
  const completed = ref(false)
  const stages = computed(() => (currentLesson.value ? lessonStages(currentLesson.value) : []))
  const stageLesson = computed(() => {
    const source = currentLesson.value
    const stage = stages.value[stageIndex.value]
    return source && stage
      ? {
          ...source,
          board: stage.board,
          candidates: stage.candidates,
          rules: stage.rules,
          exercise: stageAnswer(stage),
          step: stage.step,
          explanation: explainStep(stage.step),
        }
      : undefined
  })
  const stageCaption = computed(() => {
    let start = 0
    for (const exercise of currentLesson.value?.exercises ?? []) {
      if (stageIndex.value < start + exercise.stages.length) {
        return `${exercise.title} · 第 ${stageIndex.value - start + 1} / ${exercise.stages.length} 步 · 练习阶段 ${stageIndex.value + 1} / ${stages.value.length}`
      }
      start += exercise.stages.length
    }
    return ''
  })

  const selected = ref<number | null>(null)
  const removals = ref<{ cell: number; digit: Digit }[]>([])
  const feedback = ref<string | null>(null)
  const correct = ref(false)
  const busy = ref(false)
  const showExplanation = ref(false)
  const exerciseCells = computed(() =>
    !stageLesson.value
      ? []
      : stageLesson.value.exercise.kind === 'placement'
        ? [stageLesson.value.exercise.expected.cell]
        : [...new Set(stageLesson.value.exercise.expected.map((pair) => pair.cell))],
  )
  const exercisePrompt = computed(() =>
    stageLesson.value?.exercise.kind === 'placement'
      ? '点击圆点标出的空格，填写应该出现的数字。'
      : '点击圆点标出的格子，选择可以排除的候选数。再次选择可撤回，然后提交全部排除。',
  )
  const selectionText = computed(() =>
    selected.value === null
      ? '先选择一个练习格'
      : `已选第${Math.floor(selected.value / 9) + 1}行第${(selected.value % 9) + 1}列`,
  )
  const exampleNotes = computed(
    () =>
      stageLesson.value?.candidates.map((mask, cell) =>
        removals.value
          .filter((pair) => pair.cell === cell)
          .reduce((remaining, pair) => remaining & ~maskOf(pair.digit), mask),
      ) ?? [],
  )
  // Local feedback belongs to a lesson and route mode, independently of durable progress writes.
  let ownerGeneration = 0
  let disposed = false
  let initializingRoute = false

  watch(
    () =>
      [
        currentLesson.value?.id,
        inPractice.value,
        learning.datasetGeneration,
        learning.readyGeneration,
      ] as const,
    async (values, previous) => {
      const routeChanged = !previous || values[0] !== previous[0] || values[1] !== previous[1]
      const datasetChanged = previous && values[2] !== previous[2]
      // The route initializer owns its awaited load/visit. Its own readiness publication
      // must not start a second initializer that clears a player's selected cell.
      if (!routeChanged && !datasetChanged && initializingRoute) {
        return
      }
      initializingRoute = routeChanged
      const owner = ++ownerGeneration
      const id = currentLesson.value?.id
      selected.value = null
      removals.value = []
      feedback.value = null
      correct.value = false
      busy.value = true
      showExplanation.value = false
      stageIndex.value = 0
      canAdvance.value = false
      completed.value = false

      if (routeChanged) {
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
      if (!disposed && owner === ownerGeneration && id) {
        stageIndex.value = Math.min(learning.exerciseStage(id), stages.value.length - 1)
        if (routeChanged) {
          // Settle the visit write before answers enqueue stages. A dataset-only reload
          // must preserve the imported last-visited preference in other open tabs.
          await learning.selectLesson(id)
        }
      }
      if (!disposed && owner === ownerGeneration) {
        busy.value = false
        initializingRoute = false
      }
    },
    { immediate: true },
  )

  async function answer(digit: Digit) {
    if (
      inPractice.value ||
      !stageLesson.value ||
      selected.value === null ||
      busy.value ||
      canAdvance.value ||
      completed.value
    ) {
      return
    }

    if (stageLesson.value.exercise.kind === 'elimination') {
      if (!(stageLesson.value.candidates[selected.value] & maskOf(digit))) {
        return
      }

      const pair = { cell: selected.value, digit }
      const exists = removals.value.some(
        (item) => item.cell === pair.cell && item.digit === pair.digit,
      )
      removals.value = exists
        ? removals.value.filter((item) => item.cell !== pair.cell || item.digit !== pair.digit)
        : [...removals.value, pair]
    } else {
      const owner = ownerGeneration
      busy.value = true
      const result = await learning.submitExercise(
        stageLesson.value.id,
        {
          cell: selected.value,
          digit,
        },
        stageIndex.value,
      )
      if (disposed || owner !== ownerGeneration) {
        return
      }

      feedback.value = result.explanation
      correct.value = result.correct
      canAdvance.value = result.advance
      completed.value = result.completed
      busy.value = false
    }
  }

  async function submitEliminations() {
    if (
      inPractice.value ||
      !stageLesson.value ||
      busy.value ||
      canAdvance.value ||
      completed.value
    ) {
      return
    }

    const owner = ownerGeneration
    busy.value = true
    const result = await learning.submitExercise(
      stageLesson.value.id,
      removals.value,
      stageIndex.value,
    )
    if (disposed || owner !== ownerGeneration) {
      return
    }

    feedback.value = result.explanation
    correct.value = result.correct
    canAdvance.value = result.advance
    completed.value = result.completed
    busy.value = false
  }

  function resetExercise() {
    removals.value = []
    feedback.value = null
  }

  function nextStage() {
    if (!canAdvance.value || stageIndex.value >= stages.value.length - 1) {
      return
    }
    stageIndex.value++
    selected.value = null
    removals.value = []
    feedback.value = null
    correct.value = false
    canAdvance.value = false
    showExplanation.value = false
  }

  function handleExerciseKey(event: KeyboardEvent) {
    if (
      inPractice.value ||
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
    void answer(digit)
  }

  onMounted(() => window.addEventListener('keydown', handleExerciseKey))
  onScopeDispose(() => {
    disposed = true
    ownerGeneration++
    window.removeEventListener('keydown', handleExerciseKey)
  })

  return {
    selected,
    removals,
    feedback,
    correct,
    busy,
    showExplanation,
    exerciseCells,
    exercisePrompt,
    selectionText,
    exampleNotes,
    answer,
    submitEliminations,
    resetExercise,
    stageLesson,
    stageCaption,
    canAdvance,
    completed,
    nextStage,
  }
}
