import { lessonLoaders } from 'virtual:sudoku-lessons'
import { decodeLesson } from '@/features/learning/model/lessonCatalogue'
import type { Lesson } from '@/features/learning/model/lessons'

const MAX_DECODED_LESSONS = 3

/** Each store owns its bounded decoded cache; callers receive isolated snapshots. */
export function createLessonContentLoader(
  loaders: Readonly<Record<string, () => Promise<{ default: unknown }>>> = lessonLoaders,
) {
  const cache = new Map<string, Lesson>()
  const pending = new Map<string, Promise<Lesson>>()

  function rememberLesson(id: string, lesson: Lesson) {
    cache.set(id, lesson)

    if (cache.size > MAX_DECODED_LESSONS) {
      const oldest = cache.keys().next().value
      if (oldest !== undefined) {
        cache.delete(oldest)
      }
    }
  }

  /** Load the selected lesson, sharing in-flight work and returning an owned snapshot. */
  async function load(id: string): Promise<Lesson> {
    const cached = cache.get(id)
    if (cached) {
      // Reinsertion refreshes the order used for least-recently-used eviction.
      cache.delete(id)
      cache.set(id, cached)
      return structuredClone(cached)
    }

    const loader = loaders[id]
    if (!loader) {
      throw new Error(`Unknown lesson: ${id}`)
    }

    let request = pending.get(id)
    if (!request) {
      request = loader()
        .then((module) => {
          const lesson = decodeLesson(module.default, id)
          rememberLesson(id, lesson)
          return lesson
        })
        // Failed imports must be retryable by the same lesson ID.
        .finally(() => pending.delete(id))
      pending.set(id, request)
    }

    return structuredClone(await request)
  }

  return { load }
}
