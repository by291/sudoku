import { computed, onMounted, onScopeDispose, ref, watch, toValue } from 'vue'
import type { MaybeRefOrGetter } from 'vue'
import type { Digit } from '@/core/sudoku/types'
import { isDigit } from '@/core/sudoku/types'
import { maskOf } from '@/core/sudoku/board'
import { isKeyboardOwnedByControl } from '@/shared/utils/keyboardOwnership'
import { useLearningStore } from '@/features/learning/stores/useLearningStore'
import type { Lesson } from '@/features/learning/model/lessons'

export function useLessonExercise(
  lesson: MaybeRefOrGetter<Lesson | undefined>,
  practice: MaybeRefOrGetter<boolean>,
) {
  const learning = useLearningStore()
  const currentLesson = computed(() => toValue(lesson))
  const inPractice = computed(() => toValue(practice))

  const selected = ref<number | null>(null)
  const removals = ref<{ cell: number; digit: Digit }[]>([])
  const feedback = ref<string | null>(null)
  const correct = ref(false)
  const busy = ref(false)
  const showExplanation = ref(false)
  const exerciseCells = computed(() =>
    !currentLesson.value
      ? []
      : currentLesson.value.exercise.kind === 'placement'
        ? [currentLesson.value.exercise.expected.cell]
        : [...new Set(currentLesson.value.exercise.expected.map((pair) => pair.cell))],
  )
  const exercisePrompt = computed(() =>
    currentLesson.value?.exercise.kind === 'placement'
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
      currentLesson.value?.candidates.map((mask, cell) =>
        removals.value
          .filter((pair) => pair.cell === cell)
          .reduce((remaining, pair) => remaining & ~maskOf(pair.digit), mask),
      ) ?? [],
  )
  // Local feedback belongs to a lesson and route mode, independently of durable progress writes.
  let ownerGeneration = 0
  let disposed = false

  watch(
    () => [currentLesson.value?.id, inPractice.value],
    async () => {
      const owner = ++ownerGeneration
      const id = currentLesson.value?.id
      selected.value = null
      removals.value = []
      feedback.value = null
      correct.value = false
      busy.value = false
      showExplanation.value = false

      await learning.load()
      if (!disposed && owner === ownerGeneration && id) {
        learning.selectLesson(id)
      }
    },
    { immediate: true },
  )

  async function answer(digit: Digit) {
    if (inPractice.value || !currentLesson.value || selected.value === null || busy.value) {
      return
    }

    if (currentLesson.value.exercise.kind === 'elimination') {
      if (!(currentLesson.value.candidates[selected.value] & maskOf(digit))) {
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
      const result = await learning.submitExercise(currentLesson.value.id, {
        cell: selected.value,
        digit,
      })
      if (disposed || owner !== ownerGeneration) {
        return
      }

      feedback.value = result.explanation
      correct.value = result.correct
      busy.value = false
    }
  }

  async function submitEliminations() {
    if (inPractice.value || !currentLesson.value || busy.value) {
      return
    }

    const owner = ownerGeneration
    busy.value = true
    const result = await learning.submitExercise(currentLesson.value.id, removals.value)
    if (disposed || owner !== ownerGeneration) {
      return
    }

    feedback.value = result.explanation
    correct.value = result.correct
    busy.value = false
  }

  function resetExercise() {
    removals.value = []
    feedback.value = null
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
  }
}
