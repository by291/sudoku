import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'
import { useGameRuntime } from '@/runtime'
import { usePreferencesStore } from '@/features/settings/stores/usePreferencesStore'
import type { LessonProgress } from '@/storage/records'
import { LESSONS, checkExercise } from '@/features/learning/model/lessons'
import type { Exercise } from '@/features/learning/model/lessons'

export const useLearningStore = defineStore('learning', () => {
  const runtime = useGameRuntime()
  const preferences = usePreferencesStore()
  const progress = shallowRef<readonly LessonProgress[]>([])
  const error = ref<string | null>(null)
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
      error.value = null
    } else {
      error.value = '学习进度读取失败，请重试。'
    }
  }

  function selectLesson(id: string) {
    if (LESSONS.some((lesson) => lesson.id === id)) {
      void preferences.update({ currentLessonId: id })
    }
  }

  async function submitExercise(id: string, answer: Exercise['expected']) {
    const current = operation
    const lesson = LESSONS.find((lesson) => lesson.id === id)
    if (!lesson) {
      return { correct: false, explanation: '找不到这节课程，请返回学习列表。' }
    }

    const result = checkExercise(lesson, answer)
    if (result.correct && !progress.value.some((item) => item.lessonId === id)) {
      if (datasetEpoch === null) {
        const fence = await runtime.repository.readDatasetEpoch()
        if (current !== operation) {
          return result
        }

        if (!fence.ok) {
          error.value = '答题正确，但进度尚未保存。请再次提交以重试。'

          return result
        }

        datasetEpoch = fence.value
      }

      const completed = { lessonId: id, completedAt: runtime.wallNow().toISOString() }
      const saved = await runtime.repository.writeLessonProgress(completed, datasetEpoch)
      if (current !== operation) {
        return result
      }

      if (saved.ok) {
        if (!progress.value.some((item) => item.lessonId === id)) {
          progress.value = [...progress.value, completed]
        }

        error.value = null
      } else {
        error.value = '答题正确，但进度尚未保存。请再次提交以重试。'
      }
    }

    return result
  }

  function reset() {
    operation++
    datasetEpoch = null
    progress.value = []
    error.value = null
  }

  return { progress, error, load, selectLesson, submitExercise, reset }
})
