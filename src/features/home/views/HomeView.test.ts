import { initialSummaryState } from '@/storage/projections'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { afterEach, expect, it, vi } from 'vitest'
import HomeView from '@/features/home/views/HomeView.vue'
import { usePreferencesStore } from '@/features/settings/stores/usePreferencesStore'
import type { GameSession } from '@/features/game/model/session'
import { gameRuntimeKey } from '@/runtime'
import { createTestRuntime } from '../../../../tests/support/runtime'
import { makeSession } from '../../../../tests/support/gameFixtures'

const cleanups: (() => void)[] = []

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) {
    cleanup()
  }
  await flushPromises()
})

async function setup(sessions: GameSession[], currentLessonId: string | null = null) {
  const test = await createTestRuntime()
  cleanups.push(test.dispose)
  const preferences = test.app.runWithContext(() => usePreferencesStore(test.pinia))
  if (currentLessonId) {
    preferences.settings = { ...preferences.settings, currentLessonId }
  }
  for (const session of sessions) {
    await test.database.put('sessions', { formatVersion: 2, revision: 1, session })
  }

  await test.database.put('meta', initialSummaryState(false), 'summaries')
  expect((await test.runtime.repository.maintainSummaries()).ok).toBe(true)
  const homeRead = vi.spyOn(test.runtime.repository, 'readHome')
  const sessionsRead = vi.spyOn(test.runtime.repository, 'listSessions')
  const resultsRead = vi.spyOn(test.runtime.repository, 'listResults')
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: HomeView },
      { path: '/play/:mode', component: { template: '<div />' } },
      { path: '/learn/:lessonId?', component: { template: '<div />' } },
      { path: '/records', component: { template: '<div />' } },
    ],
  })
  await router.push('/')
  const wrapper = mount(RouterView, {
    attachTo: document.body,
    global: { plugins: [test.pinia, router], provide: { [gameRuntimeKey]: test.runtime } },
  })
  cleanups.push(() => wrapper.unmount())
  await vi.waitFor(() => expect(homeRead).toHaveBeenCalledOnce())
  await vi.waitFor(() => expect(wrapper.find('button[disabled]').exists()).toBe(false))
  expect(sessionsRead).not.toHaveBeenCalled()
  expect(resultsRead).not.toHaveBeenCalled()
  await flushPromises()

  const resume = wrapper.findAll('button').find((button) => button.text() === '继续上次')
  if (!resume) {
    throw new Error('Missing Continue Last action')
  }

  return { ...test, wrapper, router, resume }
}

it('shows recent-first save details and resumes the exact selected daily practice', async () => {
  const entries = [...makeSession().entries]
  entries[2] = 9
  const older = makeSession({ id: 'a-older-free', startedAt: new Date(2025, 11, 31).toISOString() })
  const recent = makeSession({
    id: 'z-recent-practice',
    mode: 'daily',
    metadata: { kind: 'daily', challengeDate: '2026-10-11', formalAttempt: false },
    entries,
    elapsedMs: 65000,
    startedAt: new Date(2026, 9, 11, 18, 25).toISOString(),
  })
  const { resume, router } = await setup([older, recent])

  await resume.trigger('click')
  await vi.waitFor(() => expect(document.querySelectorAll('[role="dialog"] a')).toHaveLength(2))

  const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('[role="dialog"] a'))
  expect(links.map((link) => link.getAttribute('href'))).toEqual([
    '/play/daily?variant=classic&session=z-recent-practice',
    '/play/free?variant=classic&session=a-older-free',
  ])
  const practice = links[0]
  expect(practice?.textContent).toContain('2026-10-11 · 每日练习')
  expect(practice?.textContent).toContain('已填 1 / 51 格')
  expect(practice?.textContent).toContain('已用时 01:05')
  expect(practice?.textContent).toContain('2026/10/11 18:25')
  expect(links[1]?.textContent).toContain('2025/12/31 00:00')

  practice?.click()
  await flushPromises()

  expect(router.currentRoute.value.path).toBe('/play/daily')
  expect(router.currentRoute.value.query).toEqual({ variant: 'classic', session: recent.id })
  expect(document.querySelector('[role="dialog"]')).toBeNull()
})

it('resumes a single save directly even when a recent lesson is available', async () => {
  const { resume, router } = await setup([makeSession({ id: 'only-save' })], 'rules')

  await resume.trigger('click')
  await vi.waitFor(() => expect(router.currentRoute.value.query.session).toBe('only-save'))

  expect(router.currentRoute.value.query.session).toBe('only-save')
  expect(document.querySelector('[role="dialog"]')).toBeNull()
})

it('keeps the recent lesson available alongside multiple saves', async () => {
  const { resume, router } = await setup(
    [makeSession({ id: 'first' }), makeSession({ id: 'second' })],
    'rules',
  )

  await resume.trigger('click')
  await flushPromises()
  const lesson = document.querySelector<HTMLAnchorElement>('[role="dialog"] a[href="/learn/rules"]')
  expect(lesson?.textContent).toContain('继续最近的课程')

  lesson?.click()
  await flushPromises()

  expect(router.currentRoute.value.path).toBe('/learn/rules')
})
