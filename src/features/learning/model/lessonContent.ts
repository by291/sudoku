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

  async function load(id: string): Promise<Lesson> {
    const cached = cache.get(id)
    if (cached) {
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
          cache.set(id, lesson)
          while (cache.size > MAX_DECODED_LESSONS) {
            const oldest = cache.keys().next().value
            if (oldest !== undefined) {
              cache.delete(oldest)
            }
          }
          return lesson
        })
        .finally(() => pending.delete(id))
      pending.set(id, request)
    }
    return structuredClone(await request)
  }

  return { load }
}
