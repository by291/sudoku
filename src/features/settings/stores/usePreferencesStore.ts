import { shallowRef, ref } from 'vue'
import { defineStore } from 'pinia'
import { useGameRuntime } from '@/runtime'
import { DEFAULT_SETTINGS } from '@/features/settings/model/preferences'
import type { Settings } from '@/features/settings/model/preferences'

export const usePreferencesStore = defineStore('preferences', () => {
  const runtime = useGameRuntime()
  const settings = shallowRef<Settings>({ ...DEFAULT_SETTINGS })
  const error = ref<string | null>(null)
  const needsReload = ref(false)
  let loaded = false
  let initialPatches: Partial<Settings> = {}
  // Serialize writes so a newer write cannot overtake one already in flight. Superseded
  // queued operations exit, and only the latest generation may publish its result.
  let tail = Promise.resolve()
  let operationGeneration = 0
  const datasetEpoch = ref<number | null>(null)

  async function load() {
    if (loaded) {
      return
    }

    const current = operationGeneration
    const fence = await runtime.repository.readDatasetEpoch()
    if (current !== operationGeneration) {
      return
    }

    if (!fence.ok) {
      error.value = '偏好读取失败，正在使用当前设置。'

      return
    }

    const result = await runtime.repository.readSettings()
    if (current !== operationGeneration) {
      return
    }

    if (result.ok) {
      settings.value = result.value
      loaded = true
      datasetEpoch.value = fence.value
      error.value = null
      needsReload.value = false
    } else {
      error.value = '偏好读取失败，正在使用当前设置。'
    }
  }

  /** Returns true only for this committed write; exercise cursors opt out of optimistic display. */
  function update(
    patch: Partial<Settings>,
    options: { optimistic: boolean; expectedEpoch?: number } = { optimistic: true },
  ) {
    if (needsReload.value) {
      return Promise.resolve(false)
    }
    if (
      options.expectedEpoch !== undefined &&
      datasetEpoch.value !== null &&
      options.expectedEpoch !== datasetEpoch.value
    ) {
      return Promise.resolve(false)
    }

    // Before reading a committed base, retain only explicit patches. Optimistic defaults
    // must never overwrite restored metadata that this tab has not loaded yet.
    const initialPatch = loaded ? null : { ...initialPatches, ...patch }
    if (initialPatch) {
      initialPatches = initialPatch
    }

    let snapshot = { ...settings.value, ...patch }
    if (options.optimistic) {
      settings.value = snapshot
    }

    const current = ++operationGeneration
    const writing = tail.then(async () => {
      if (current !== operationGeneration) {
        return false
      }

      if (datasetEpoch.value === null || initialPatch !== null) {
        const fence = await runtime.repository.readDatasetEpoch()
        if (current !== operationGeneration) {
          return false
        }

        if (!fence.ok) {
          error.value = '偏好尚未保存，请保持页面打开并重试。'

          return false
        }

        if (options.expectedEpoch !== undefined && options.expectedEpoch !== fence.value) {
          loaded = false
          initialPatches = {}
          needsReload.value = true
          error.value = '本机数据已变化，请重新读取设置。'
          return false
        }

        const stored = await runtime.repository.readSettings()
        if (current !== operationGeneration) {
          return false
        }

        if (!stored.ok) {
          error.value = '偏好读取失败，请保持页面打开并重试。'
          return false
        }

        snapshot = { ...stored.value, ...(initialPatch ?? patch) }
        loaded = true
        datasetEpoch.value = fence.value
        initialPatches = {}
        if (options.optimistic) {
          settings.value = snapshot
        }
      }

      const result = await runtime.repository.writeSettings(snapshot, datasetEpoch.value)
      if (current === operationGeneration) {
        if (result.ok && !options.optimistic) {
          settings.value = snapshot
        }
        error.value = result.ok ? null : '偏好尚未保存，请保持页面打开并重试。'
      }

      if (
        current === operationGeneration &&
        !result.ok &&
        result.error.kind === 'revision-conflict'
      ) {
        loaded = false
        needsReload.value = true
        error.value = '本机数据已变化，请重新读取设置。'
      }

      return current === operationGeneration && result.ok
    })
    tail = writing.then(() => undefined)

    return writing
  }

  async function reset() {
    operationGeneration++
    settings.value = { ...DEFAULT_SETTINGS }
    loaded = false
    datasetEpoch.value = null
    error.value = null
    needsReload.value = false
    initialPatches = {}
    await tail
  }

  async function flush() {
    await tail
  }

  async function retry() {
    if (needsReload.value) {
      await reset()
      await load()
      return loaded && error.value === null
    }

    return update({})
  }

  return { settings, error, needsReload, datasetEpoch, load, update, reset, flush, retry }
})
