import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, expect, it, vi } from 'vitest'
import GameSetupDialog from '@/features/game/components/GameSetupDialog.vue'
import type { GameSummary } from '@/storage/readModels'

const savedSummary: GameSummary = {
  id: 'saved-classic',
  revision: 2,
  mode: 'free',
  variant: 'classic',
  difficulty: 'medium',
  metadata: { kind: 'free' },
  startedAt: '2026-10-11T00:00:00.000Z',
  elapsedMs: 125000,
  completedAt: null,
  assisted: false,
  filledCount: 5,
  fillableCount: 50,
}

const cleanups: (() => void)[] = []

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) {
    cleanup()
  }

  await flushPromises()
  vi.useRealTimers()
})

function action(label: string) {
  const button = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(
    (element) => element.textContent?.trim() === label,
  )
  if (!button) {
    throw new Error(`Missing action: ${label}`)
  }

  return button
}

it.each(['free', 'daily'] as const)(
  'announces saved-record loading in the %s setup without suggesting generation has started',
  async (mode) => {
    vi.useFakeTimers()
    const wrapper = mount(GameSetupDialog, {
      attachTo: document.body,
      props: { mode, variant: 'classic', difficulty: 'easy', busy: true },
    })
    cleanups.push(() => wrapper.unmount())
    await flushPromises()

    expect(document.querySelector('[role="status"]')).toBeNull()
    expect(action(mode === 'free' ? '开始游戏' : '开始今日挑战').disabled).toBe(true)
    await vi.advanceTimersByTimeAsync(350)

    const status = document.querySelector('[role="status"]')
    expect(status).not.toBeNull()
    expect(status?.textContent).toContain('正在读取存档')
    expect(status?.textContent).not.toContain('正在生成题目')
    expect(status?.getAttribute('aria-live')).toBe('polite')
    expect(document.querySelector('[role="dialog"] [aria-busy="true"]')).not.toBeNull()
    expect(action(mode === 'free' ? '开始游戏' : '开始今日挑战').disabled).toBe(true)
    expect(action('取消').disabled).toBe(false)

    await wrapper.setProps({ busy: false })

    expect(document.querySelector('[role="status"]')).toBeNull()
    expect(action(mode === 'free' ? '开始游戏' : '开始今日挑战').disabled).toBe(false)
  },
)

it('announces generation once and prevents restarting or changing its pending selection', async () => {
  vi.useFakeTimers()
  const wrapper = mount(GameSetupDialog, {
    attachTo: document.body,
    props: {
      variant: 'classic',
      difficulty: 'easy',
      savedSummary,
      generating: true,
    },
  })
  cleanups.push(() => wrapper.unmount())
  await flushPromises()

  expect(document.querySelectorAll('[role="status"]')).toHaveLength(0)
  await vi.advanceTimersByTimeAsync(350)

  const statuses = document.querySelectorAll('[role="status"]')
  expect(statuses).toHaveLength(1)
  expect(statuses[0]?.textContent).toContain('正在生成题目…')
  expect(statuses[0]?.querySelector('.n-spin-body')?.getAttribute('aria-hidden')).toBe('true')
  expect(action('开始游戏').disabled).toBe(true)
  expect(action('继续存档').disabled).toBe(true)
  const radios = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="radio"]'))
  expect(radios.length).toBeGreaterThan(0)
  expect(radios.every((radio) => radio.disabled)).toBe(true)

  action('开始游戏').click()
  action('继续存档').click()

  expect(wrapper.emitted('start')).toBeUndefined()
  expect(wrapper.emitted('resume')).toBeUndefined()
  action('取消').click()
  expect(wrapper.emitted('cancel')).toEqual([[]])
})

it('offers resume and replacement details from a compact summary alone', async () => {
  const wrapper = mount(GameSetupDialog, {
    attachTo: document.body,
    props: { variant: 'classic', difficulty: 'easy', savedSummary },
  })
  cleanups.push(() => wrapper.unmount())
  await flushPromises()

  expect(document.body.textContent).toContain('有未完成的存档（中等')
  expect(document.body.textContent).toContain('02:05')
  expect(action('继续存档').disabled).toBe(false)
  action('继续存档').click()
  expect(wrapper.emitted('resume')).toEqual([[]])

  await wrapper.setProps({
    savedSummary: { ...savedSummary, completedAt: '2026-10-11T00:03:00.000Z' },
  })

  expect(document.body.textContent).not.toContain('继续存档')
  expect(document.body.textContent).not.toContain('有未完成的存档')
})
