import { shallowRef, ref } from 'vue'
import { defineStore } from 'pinia'
import { useGameRuntime } from './runtime'
import { DEFAULT_SETTINGS } from '../infrastructure/storage/records'
import type { Settings } from '../infrastructure/storage/records'
export const usePreferencesStore = defineStore('preferences', () => {
  const runtime = useGameRuntime()
  const settings = shallowRef<Settings>({ ...DEFAULT_SETTINGS })
  const error = ref<string | null>(null)
  let loaded = false
  let tail = Promise.resolve()
  let epoch = 0
  let datasetEpoch: number | null = null
  async function load() {
    if (loaded) return
    const current = epoch
    const fence = await runtime.repository.readDatasetEpoch()
    if (current !== epoch) return
    if (!fence.ok) {
      error.value = '偏好读取失败，正在使用当前设置。'
      return
    }
    const result = await runtime.repository.readSettings()
    if (current !== epoch) return
    if (result.ok) {
      settings.value = result.value
      datasetEpoch = fence.value
      loaded = true
      error.value = null
    } else error.value = '偏好读取失败，正在使用当前设置。'
  }
  function update(patch: Partial<Settings>) {
    const snapshot = { ...settings.value, ...patch }
    settings.value = snapshot
    loaded = true
    const current = ++epoch
    tail = tail.then(async () => {
      if (current !== epoch) return
      if (datasetEpoch === null) {
        const fence = await runtime.repository.readDatasetEpoch()
        if (current !== epoch) return
        if (!fence.ok) {
          error.value = '偏好尚未保存，请保持页面打开并重试。'
          return
        }
        datasetEpoch = fence.value
      }
      const result = await runtime.repository.writeSettings(snapshot, datasetEpoch)
      if (current === epoch) error.value = result.ok ? null : '偏好尚未保存，请保持页面打开并重试。'
      if (!result.ok && result.error.kind === 'revision-conflict') {
        datasetEpoch = null
        loaded = false
      }
    })
    return tail
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
