import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, expect, it, vi } from 'vitest'
import { router } from '@/router/index'
import { gameRuntimeKey } from '@/runtime'
import LearningView from '@/features/learning/views/LearningView.vue'
import { DEFAULT_SETTINGS } from '@/features/settings/model/preferences'
import { createTestRuntime } from '../../../../tests/support/runtime'
import { deferred } from '../../../../tests/support/deferred'

const cleanups: (() => void)[] = []

afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) {
    cleanup()
  }
})

it('shows the course directory without inventing progress or recommendations during the first read', async () => {
  const test = await createTestRuntime()
  cleanups.push(test.dispose)
  const gate = deferred<void>()
  const read = test.runtime.repository.readLessonProgress
  vi.spyOn(test.runtime.repository, 'readLessonProgress').mockImplementation(async () => {
    await gate.promise
    return read()
  })
  await router.push('/learn')
  const wrapper = mount(LearningView, {
    global: { plugins: [test.pinia, router], provide: { [gameRuntimeKey]: test.runtime } },
  })
  cleanups.push(() => wrapper.unmount())
  await flushPromises()

  expect(wrapper.findAll('.lesson-path a')).toHaveLength(12)
  expect(wrapper.text()).not.toContain('已完成 0')
  expect(wrapper.text()).not.toContain('推荐从这里开始')
  expect(wrapper.find('.course-action a').exists()).toBe(false)
  expect(wrapper.find('.learning-load-status').exists()).toBe(true)

  gate.resolve()
  await vi.waitFor(() => expect(wrapper.get('.course-action').text()).toContain('开始学习'))
})

it('distinguishes visited and partially completed lessons while retaining current-lesson priority', async () => {
  const test = await createTestRuntime()
  cleanups.push(test.dispose)
  await test.runtime.repository.writeSettings(
    {
      ...DEFAULT_SETTINGS,
      currentLessonId: 'rules',
      lessonStages: { 'naked-single': 1, 'hidden-single': 1 },
    },
    1,
  )
  await test.runtime.repository.writeLessonProgress(
    { lessonId: 'hidden-single', completedAt: '2026-10-17T03:00:00.000Z' },
    1,
  )
  await router.push('/learn')
  const wrapper = mount(LearningView, {
    global: { plugins: [test.pinia, router], provide: { [gameRuntimeKey]: test.runtime } },
  })
  cleanups.push(() => wrapper.unmount())
  await flushPromises()
  await vi.waitFor(() => expect(wrapper.get('.course-action').text()).toContain('继续学习'))

  expect(wrapper.get('.lesson-path a[href="#/learn/rules"]').text()).toContain('学习中')
  expect(wrapper.get('.lesson-path a[href="#/learn/naked-single"]').text()).toContain('学习中')
  expect(wrapper.get('.lesson-path a[href="#/learn/hidden-single"]').text()).toContain('已完成')
  expect(wrapper.get('.lesson-path a[href="#/learn/locked-candidate"]').text()).toContain('可学习')
  expect(wrapper.get('.course-action a').attributes('href')).toBe('#/learn/rules')
  expect(wrapper.get('.course-action').text()).toContain('第 1 / 2 阶段')
})

it('shows the saved stage on the existing next-lesson recommendation', async () => {
  const test = await createTestRuntime()
  cleanups.push(test.dispose)
  await test.runtime.repository.writeSettings(
    { ...DEFAULT_SETTINGS, currentLessonId: 'rules', lessonStages: { 'naked-single': 1 } },
    1,
  )
  await test.runtime.repository.writeLessonProgress(
    { lessonId: 'rules', completedAt: '2026-10-17T03:00:00.000Z' },
    1,
  )
  await router.push('/learn')
  const wrapper = mount(LearningView, {
    global: { plugins: [test.pinia, router], provide: { [gameRuntimeKey]: test.runtime } },
  })
  cleanups.push(() => wrapper.unmount())
  await flushPromises()
  await vi.waitFor(() => expect(wrapper.get('.course-action').text()).toContain('学习下一节'))

  expect(wrapper.get('.course-action a').attributes('href')).toBe('#/learn/naked-single')
  expect(wrapper.get('.course-action').text()).toContain('第 2 / 2 阶段')
})
