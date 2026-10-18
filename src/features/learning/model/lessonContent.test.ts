import { expect, it } from 'vitest'
import catalogue from '@resources/lessons/catalogue.json' with { type: 'json' }
import { createLessonContentLoader } from '@/features/learning/model/lessonContent'
import { deferred } from '../../../../tests/support/deferred'

it('loads only requested content and evicts the least recently used decoded lesson after three entries', async () => {
  const loads: string[] = []
  const loaders = Object.fromEntries(
    catalogue.lessons.slice(0, 4).map((lesson) => [
      lesson.id,
      async () => {
        loads.push(lesson.id)
        return { default: lesson }
      },
    ]),
  )
  const content = createLessonContentLoader(loaders)
  expect(loads).toEqual([])

  await content.load('rules')
  await content.load('naked-single')
  await content.load('hidden-single')
  await content.load('rules')
  await content.load('locked-candidate')
  await content.load('rules')
  await content.load('naked-single')

  expect(loads).toEqual([
    'rules',
    'naked-single',
    'hidden-single',
    'locked-candidate',
    'naked-single',
  ])
})

it('shares pending reads but returns isolated owned snapshots to each consumer', async () => {
  const gate = deferred<void>()
  let loads = 0
  const content = createLessonContentLoader({
    rules: async () => {
      loads++
      await gate.promise
      return { default: catalogue.lessons[0] }
    },
  })
  const first = content.load('rules')
  const second = content.load('rules')
  gate.resolve()
  const [left, right] = await Promise.all([first, second])
  const original = right.guided.board[0]

  Object.assign(left.guided.board, { 0: 0 })

  expect(loads).toBe(1)
  expect(right.guided.board[0]).toBe(original)
  expect((await content.load('rules')).guided.board[0]).toBe(original)
})

it('retries failed reads and rejects a lesson returned for another identity', async () => {
  let attempts = 0
  const content = createLessonContentLoader({
    rules: async () => {
      attempts++
      return { default: catalogue.lessons[attempts === 1 ? 1 : 0] }
    },
  })

  await expect(content.load('rules')).rejects.toThrow(/catalogue entry/)
  expect((await content.load('rules')).id).toBe('rules')
})
