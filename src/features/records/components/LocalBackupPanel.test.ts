import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import LocalBackupPanel from '@/features/records/components/LocalBackupPanel.vue'
import { useRecordsStore } from '@/features/records/stores/useRecordsStore'
import { DEFAULT_SETTINGS } from '@/features/settings/model/preferences'
import { BACKUP_LIMITS } from '@/storage/backup'
import { gameRuntimeKey } from '@/runtime'
import { createTestRuntime } from '../../../../tests/support/runtime'
import { deferred } from '../../../../tests/support/deferred'

const cleanups: (() => void)[] = []

beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }))
})

afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) {
    cleanup()
  }
  vi.unstubAllGlobals()
})

it('reports file size and read failures in the backup alert and clears them for a new selection', async () => {
  const test = await createTestRuntime()
  cleanups.push(test.dispose)
  const records = test.app.runWithContext(() => useRecordsStore(test.pinia))
  cleanups.push(records.dispose)
  const wrapper = mount(LocalBackupPanel, {
    global: { plugins: [test.pinia], provide: { [gameRuntimeKey]: test.runtime } },
  })
  cleanups.push(() => wrapper.unmount())
  const input = wrapper.get<HTMLInputElement>('input[aria-label="选择备份文件"]')
  const oversized = { size: BACKUP_LIMITS.bytes + 1, text: vi.fn() }
  Object.defineProperty(input.element, 'files', { value: [oversized], configurable: true })

  await input.trigger('change')

  expect(wrapper.get('#backup-error').text()).toBe('备份文件超过 25 MiB，本机数据没有改变。')
  expect(oversized.text).not.toHaveBeenCalled()
  expect(input.element.value).toBe('')
  const unreadable = { size: 1, text: vi.fn().mockRejectedValue(new Error('Unreadable file')) }
  Object.defineProperty(input.element, 'files', { value: [unreadable], configurable: true })

  await input.trigger('change')
  await flushPromises()

  expect(wrapper.get('#backup-error').text()).toBe('备份文件读取失败，请重新选择文件。')
  const reading = deferred<string>()
  const readable = { size: 1, text: () => reading.promise }
  Object.defineProperty(input.element, 'files', { value: [readable], configurable: true })

  await input.trigger('change')

  expect(wrapper.find('#backup-error').exists()).toBe(false)
  reading.resolve(
    JSON.stringify({
      backupVersion: 1,
      exportedAt: '2026-10-14T03:00:00.000Z',
      sessions: [],
      results: [],
      lessons: [],
      settings: DEFAULT_SETTINGS,
    }),
  )
  await flushPromises()
  await vi.waitFor(() => {
    expect(wrapper.get('[aria-label="备份预览"]').text()).toContain('存档 0 个')
  })

  expect(wrapper.find('#backup-error').exists()).toBe(false)
  expect(await test.database.get('meta', 'epoch')).toBe(1)
})
