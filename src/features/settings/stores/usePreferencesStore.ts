import { shallowRef, ref } from 'vue'
import { defineStore } from 'pinia'
import { useGameRuntime } from '@/runtime'
import { DEFAULT_SETTINGS } from '@/features/settings/model/preferences'
import type { Settings } from '@/features/settings/model/preferences'

type PreferenceUpdateOptions = {
  optimistic: boolean
  expectedEpoch?: number
}

type PreferenceWrite = {
  generation: number
  attachment: number
  patch: Partial<Settings>
  options: PreferenceUpdateOptions
}

/** Owns optimistic display and serialized writes for one local settings dataset. */
export const usePreferencesStore = defineStore('preferences', () => {
  const runtime = useGameRuntime()
  const settings = shallowRef<Settings>({ ...DEFAULT_SETTINGS })
  const error = ref<string | null>(null)
  const needsReload = ref(false)
  const datasetEpoch = ref<number | null>(null)
  let committed: Settings | null = null
  let optimisticPatches: Partial<Settings> = {}

  // A superseded write may still commit, so retain its snapshot as the base for the next write.
  let tail = Promise.resolve()
  let operationGeneration = 0
  let attachment = 0

  /** Load the committed settings before showing values from an existing dataset. */
  async function load() {
    if (committed) {
      return
    }

    const generation = operationGeneration
    const fence = await runtime.repository.readDatasetEpoch()
    if (generation !== operationGeneration) {
      return
    }

    if (!fence.ok) {
      error.value = '偏好读取失败，正在使用当前设置。'
      return
    }

    const result = await runtime.repository.readSettings()
    if (generation !== operationGeneration) {
      return
    }

    if (!result.ok) {
      error.value = '偏好读取失败，正在使用当前设置。'
      return
    }

    committed = result.value
    settings.value = { ...committed, ...optimisticPatches }
    datasetEpoch.value = fence.value
    error.value = null
    needsReload.value = false
  }

  function markDatasetChanged() {
    attachment++
    committed = null
    optimisticPatches = {}
    needsReload.value = true
    error.value = '本机数据已变化，请重新读取设置。'
  }

  function isCurrent(write: PreferenceWrite): boolean {
    return write.generation === operationGeneration && write.attachment === attachment
  }

  async function readWriteBase(write: PreferenceWrite): Promise<boolean> {
    const fence = await runtime.repository.readDatasetEpoch()
    if (!isCurrent(write)) {
      return false
    }

    if (!fence.ok) {
      error.value = '偏好尚未保存，请保持页面打开并重试。'
      return false
    }

    if (write.options.expectedEpoch !== undefined && write.options.expectedEpoch !== fence.value) {
      markDatasetChanged()
      return false
    }

    const stored = await runtime.repository.readSettings()
    if (!isCurrent(write)) {
      return false
    }

    if (!stored.ok) {
      error.value = '偏好读取失败，请保持页面打开并重试。'
      return false
    }

    committed = stored.value
    datasetEpoch.value = fence.value
    return true
  }

  function acknowledgeOptimisticPatches(submitted: Partial<Settings>) {
    const remaining = { ...optimisticPatches }
    for (const key in submitted) {
      const setting = key as keyof Settings
      if (remaining[setting] === submitted[setting]) {
        delete remaining[setting]
      }
    }
    optimisticPatches = remaining
  }

  async function persist(write: PreferenceWrite): Promise<boolean> {
    if (!isCurrent(write)) {
      return false
    }

    if ((!committed || datasetEpoch.value === null) && !(await readWriteBase(write))) {
      return false
    }

    const epoch = datasetEpoch.value
    if (!isCurrent(write) || !committed || epoch === null) {
      return false
    }

    // Rebase explicit patches after earlier writes settle. An undisplayed cursor must survive
    // a subsequent timer or theme change, while unread defaults must never enter this snapshot.
    const submitted = optimisticPatches
    const snapshot = {
      ...committed,
      ...submitted,
      ...write.patch,
    }
    if (write.options.optimistic) {
      settings.value = { ...committed, ...optimisticPatches }
    }

    const result = await runtime.repository.writeSettings(snapshot, epoch)
    if (result.ok && write.attachment === attachment) {
      committed = snapshot
      acknowledgeOptimisticPatches(submitted)
    }

    if (!isCurrent(write)) {
      return false
    }

    if (!result.ok) {
      if (result.error.kind === 'revision-conflict') {
        markDatasetChanged()
      } else {
        error.value = '偏好尚未保存，请保持页面打开并重试。'
      }
      return false
    }

    optimisticPatches = {}
    settings.value = snapshot
    error.value = null

    return true
  }

  /** Report success for the current committed write; cursors can opt out of optimistic display. */
  function update(
    patch: Partial<Settings>,
    options: PreferenceUpdateOptions = { optimistic: true },
  ): Promise<boolean> {
    if (needsReload.value) {
      return Promise.resolve(false)
    }

    const hasStaleEpoch =
      options.expectedEpoch !== undefined &&
      datasetEpoch.value !== null &&
      options.expectedEpoch !== datasetEpoch.value
    if (hasStaleEpoch) {
      return Promise.resolve(false)
    }

    const ownedPatch = structuredClone(patch)
    if (options.optimistic) {
      optimisticPatches = { ...optimisticPatches, ...ownedPatch }
      settings.value = { ...settings.value, ...ownedPatch }
    }

    const write: PreferenceWrite = {
      generation: ++operationGeneration,
      attachment,
      patch: ownedPatch,
      options: { ...options },
    }
    const writing = tail.then(() => persist(write))
    tail = writing.then(() => undefined)

    return writing
  }

  /** Discard state from the old dataset and wait for its writes to settle. */
  async function reset() {
    operationGeneration++
    attachment++
    settings.value = { ...DEFAULT_SETTINGS }
    committed = null
    datasetEpoch.value = null
    error.value = null
    needsReload.value = false
    optimisticPatches = {}

    await tail
  }

  /** Wait until the currently queued writes have settled. */
  async function flush() {
    await tail
  }

  /** Retry optimistic changes or reload the settings after a dataset conflict. */
  async function retry() {
    if (needsReload.value) {
      await reset()
      await load()
      return committed !== null && error.value === null
    }

    return update({})
  }

  return {
    settings,
    error,
    needsReload,
    datasetEpoch,
    load,
    update,
    reset,
    flush,
    retry,
  }
})
