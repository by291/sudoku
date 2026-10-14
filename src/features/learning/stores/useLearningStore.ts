import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'
import { useGameRuntime } from '@/runtime'
import { usePreferencesStore } from '@/features/settings/stores/usePreferencesStore'
import type { LessonProgress } from '@/storage/records'
import { LESSONS, checkExercise, lessonStages } from '@/features/learning/model/lessons'
import { stageAnswer } from '@/features/learning/model/exerciseStages'
import { explainStep } from '@/core/sudoku/techniques'
import type { Exercise } from '@/features/learning/model/lessons'

export const useLearningStore = defineStore('learning', () => {
  const runtime = useGameRuntime()
  const preferences = usePreferencesStore()
  const progress = shallowRef<readonly LessonProgress[]>([])
  const error = ref<string | null>(null)
  const exerciseStages = shallowRef<Readonly<Record<string, number>>>({})
  let operation = 0
  let datasetEpoch: number | null = null

  async function load() {
    const current = ++operation
    await preferences.load()
    if (current !== operation) {
      return
    }

    const fence = await runtime.repository.readDatasetEpoch()
    if (current !== operation) {
      return
    }

    if (!fence.ok) {
      error.value = '学习进度读取失败，请重试。'

      return
    }

    const result = await runtime.repository.readLessonProgress()
    if (current !== operation) {
      return
    }

    if (result.ok) {
      datasetEpoch = fence.value
      progress.value = result.value
      exerciseStages.value = preferences.settings.lessonStages ?? {}
      error.value = null
    } else {
      error.value = '学习进度读取失败，请重试。'
    }
  }

  async function selectLesson(id: string) {
    if (LESSONS.some((lesson) => lesson.id === id)) {
      return preferences.update({ currentLessonId: id })
    }
    return false
  }

  function exerciseStage(id: string): number {
    return exerciseStages.value[id] ?? 0
  }

  async function submitExercise(
    id: string,
    answer: Exercise['expected'],
    stageIndex = exerciseStage(id),
  ) {
    const current = operation
    const lesson = LESSONS.find((lesson) => lesson.id === id)
    if (!lesson) {
      return {
        correct: false,
        advance: false,
        completed: false,
        explanation: '找不到这节课程，请返回学习列表。',
      }
    }

    const stages = lessonStages(lesson)
    const stage = stages[stageIndex]
    if (!stage || stageIndex !== exerciseStage(id)) {
      return {
        correct: false,
        advance: false,
        completed: false,
        explanation: '请按顺序完成当前阶段，不能跳过推理。',
      }
    }
    const result = checkExercise(
      { ...lesson, exercise: stageAnswer(stage), explanation: explainStep(stage.step) },
      answer,
    )
    if (!result.correct) {
      return { ...result, advance: false, completed: false }
    }
    if (stageIndex < stages.length - 1) {
      const next = { ...exerciseStages.value, [id]: stageIndex + 1 }
      const saved = await preferences.update({ lessonStages: next }, { optimistic: false })
      if (current !== operation) {
        return { ...result, advance: false, completed: false }
      }
      if (!saved) {
        error.value = '答题正确，但阶段尚未保存。请再次提交以重试。'
        return { ...result, advance: false, completed: false }
      }
      exerciseStages.value = next
      error.value = null
      return { ...result, advance: true, completed: false }
    }
    if (!progress.value.some((item) => item.lessonId === id)) {
      if (datasetEpoch === null) {
        const fence = await runtime.repository.readDatasetEpoch()
        if (current !== operation) {
          return { ...result, advance: false, completed: false }
        }

        if (!fence.ok) {
          error.value = '答题正确，但进度尚未保存。请再次提交以重试。'

          return { ...result, advance: false, completed: false }
        }

        datasetEpoch = fence.value
      }

      const completed = { lessonId: id, completedAt: runtime.wallNow().toISOString() }
      const saved = await runtime.repository.writeLessonProgress(completed, datasetEpoch)
      if (current !== operation) {
        return { ...result, advance: false, completed: false }
      }

      if (saved.ok) {
        if (!progress.value.some((item) => item.lessonId === id)) {
          progress.value = [...progress.value, completed]
        }

        error.value = null
      } else {
        error.value = '答题正确，但进度尚未保存。请再次提交以重试。'
        return { ...result, advance: false, completed: false }
      }
    }

    const next = { ...exerciseStages.value }
    delete next[id]
    exerciseStages.value = next
    await preferences.update({ lessonStages: next }, { optimistic: false })
    if (current !== operation) {
      return { ...result, advance: false, completed: false }
    }
    return { ...result, advance: false, completed: true }
  }

  function reset() {
    operation++
    datasetEpoch = null
    progress.value = []
    error.value = null
    exerciseStages.value = {}
  }

  return { progress, error, exerciseStage, load, selectLesson, submitExercise, reset }
})
