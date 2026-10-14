import { shallowRef, ref } from 'vue'
import { defineStore } from 'pinia'
import { useGameRuntime } from '@/runtime'
import { DEFAULT_SETTINGS } from '@/features/settings/model/preferences'
import type { Settings } from '@/features/settings/model/preferences'

export const usePreferencesStore = defineStore('preferences', () => {
  const runtime = useGameRuntime()
  const settings = shallowRef<Settings>({ ...DEFAULT_SETTINGS })
  const error = ref<string | null>(null)
  let loaded = false
  let tail = Promise.resolve()
  let epoch = 0
  let datasetEpoch: number | null = null

  async function load() {
    if (loaded) {
      return
    }

    const current = epoch
    const fence = await runtime.repository.readDatasetEpoch()
    if (current !== epoch) {
      return
    }

    if (!fence.ok) {
      error.value = '偏好读取失败，正在使用当前设置。'

      return
    }

    const result = await runtime.repository.readSettings()
    if (current !== epoch) {
      return
    }

    if (result.ok) {
      settings.value = result.value
      datasetEpoch = fence.value
      loaded = true
      error.value = null
    } else {
      error.value = '偏好读取失败，正在使用当前设置。'
    }
  }

  /** Returns true only for this committed write; exercise cursors opt out of optimistic display. */
  function update(
    patch: Partial<Settings>,
    options: { optimistic: boolean } = { optimistic: true },
  ) {
    const snapshot = { ...settings.value, ...patch }
    if (options.optimistic) {
      settings.value = snapshot
    }
    loaded = true
    const current = ++epoch
    const writing = tail.then(async () => {
      if (current !== epoch) {
        return false
      }

      if (datasetEpoch === null) {
        const fence = await runtime.repository.readDatasetEpoch()
        if (current !== epoch) {
          return false
        }

        if (!fence.ok) {
          error.value = '偏好尚未保存，请保持页面打开并重试。'

          return false
        }

        datasetEpoch = fence.value
      }

      const result = await runtime.repository.writeSettings(snapshot, datasetEpoch)
      if (current === epoch) {
        if (result.ok && !options.optimistic) {
          settings.value = snapshot
        }
        error.value = result.ok ? null : '偏好尚未保存，请保持页面打开并重试。'
      }

      if (!result.ok && result.error.kind === 'revision-conflict') {
        datasetEpoch = null
        loaded = false
      }
      return current === epoch && result.ok
    })
    tail = writing.then(() => undefined)

    return writing
  }

  async function reset() {
    epoch++
    settings.value = { ...DEFAULT_SETTINGS }
    loaded = false
    datasetEpoch = null
    error.value = null
    await tail
  }

  async function flush() {
    await tail
  }

  return { settings, error, load, update, reset, flush }
})
