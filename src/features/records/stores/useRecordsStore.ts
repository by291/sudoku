import { computed } from 'vue'
import { defineStore } from 'pinia'
import { useGameRuntime } from '@/runtime'
import { usePreferencesStore } from '@/features/settings/stores/usePreferencesStore'
import { useLearningStore } from '@/features/learning/stores/useLearningStore'
import { useGameStore } from '@/features/game/stores/useGameStore'
import { createRecordsReader } from '@/features/records/stores/recordsReader'
import { createRecordsBackup } from '@/features/records/stores/recordsBackup'
import type { BackupOperation } from '@/features/records/stores/recordsBackup'

export type { RecordsSelection } from '@/features/records/stores/recordsReader'

export const useRecordsStore = defineStore('records', () => {
  const runtime = useGameRuntime()
  const preferences = usePreferencesStore()
  const learning = useLearningStore()
  const game = useGameStore()
  const reader = createRecordsReader(runtime)
  const backup = createRecordsBackup(runtime)
  const busy = computed(() => reader.readBusy.value || backup.backupBusy.value)

  function resetCatalog() {
    // Invalidate both owners before any asynchronous reload can publish an old dataset.
    const generation = reader.beginDatasetReload()
    backup.reset()
    game.dropSession()
    learning.reset()

    return { generation, resetting: preferences.reset() }
  }

  async function reloadDataset() {
    const { generation, resetting } = resetCatalog()
    await resetting
    if (!reader.isCurrent(generation)) {
      return
    }

    await preferences.load()
    if (!reader.isCurrent(generation)) {
      return
    }

    await learning.load()
    await reader.finishDatasetReload(generation)
  }

  async function settleForBackup(operation: BackupOperation): Promise<boolean> {
    // Capture/save the active game before the repository takes its committed backup snapshot.
    const saved = await game.prepareBackup()
    // A peer replacement can finish while saving; its new backup owns subsequent feedback.
    if (!backup.isCurrent(operation)) {
      return false
    }
    if (!saved) {
      backup.reportError(operation, '当前游戏尚未保存，请重试保存后再处理备份。')
      return false
    }

    await preferences.load()
    if (!backup.isCurrent(operation)) {
      return false
    }

    await preferences.flush()
    if (!backup.isCurrent(operation)) {
      return false
    }
    if (preferences.error) {
      backup.reportError(operation, '设置尚未保存，请重试保存设置后再处理备份。')
      return false
    }

    return true
  }

  async function exportBackup(): Promise<string | null> {
    if (busy.value) {
      return null
    }

    const operation = backup.beginExport()
    try {
      if (!(await settleForBackup(operation)) || !backup.isCurrent(operation)) {
        return null
      }

      return await backup.exportBackup(operation)
    } finally {
      backup.finishOperation(operation)
    }
  }

  async function previewRestore(text: string) {
    if (busy.value) {
      return
    }

    await backup.previewRestore(text)
  }

  async function restoreBackup() {
    if (busy.value) {
      return
    }
    const candidate = backup.beginRestore()
    if (!candidate) {
      return
    }

    try {
      if (!(await settleForBackup(candidate.operation)) || !backup.isCurrent(candidate.operation)) {
        return
      }
      if (!(await backup.replaceDataset(candidate))) {
        return
      }

      // Only a committed replacement can reset stores and cancel late Worker installs/saves.
      await reloadDataset()
      backup.notice.value = '备份已恢复，存档以暂停状态保留。其他标签页的旧游戏已停止。'
    } finally {
      backup.finishOperation(candidate.operation)
    }
  }

  async function clearLocalData() {
    const operation = backup.beginClear()
    await game.leaveGame()
    await preferences.flush()
    const result = await runtime.repository.clearAll()
    if (!result.ok) {
      backup.finishOperation(operation)
      reader.error.value = '清空失败，数据仍然保留，请重试。'
      return
    }

    const { generation, resetting } = resetCatalog()
    await resetting
    await reader.finishDatasetReload(generation)
    backup.notice.value = '本机数据已清空。'
  }

  async function removeQuarantined() {
    if (!(await backup.removeQuarantined())) {
      reader.error.value = '清理失败，请重试。'
    }
  }

  async function changePage(direction: 'next' | 'previous') {
    if (busy.value) {
      return
    }

    await reader.changePage(direction)
  }

  const unsubscribe = runtime.ownership.subscribe((notice) => {
    if (notice.kind === 'reset') {
      void reloadDataset()
    }
  })

  function dispose() {
    reader.dispose()
    backup.dispose()
    unsubscribe()
  }

  return {
    rows: reader.rows,
    summary: reader.summary,
    completedCount: reader.completedCount,
    completionCounts: reader.completionCounts,
    result: reader.result,
    pending: reader.pending,
    nextCursor: reader.nextCursor,
    pageNumber: reader.pageNumber,
    today: reader.today,
    quarantined: backup.quarantined,
    error: reader.error,
    notice: backup.notice,
    busy,
    backupBusy: backup.backupBusy,
    loaded: reader.loaded,
    backupError: backup.backupError,
    backupPreview: backup.backupPreview,
    exportBackup,
    previewRestore,
    restoreBackup,
    cancelRestore: backup.cancelRestore,
    beginBackupFileSelection: backup.beginBackupFileSelection,
    reportBackupFileError: backup.reportBackupFileError,
    load: reader.load,
    loadResult: reader.loadResult,
    releaseReader: reader.releaseReader,
    changePage,
    retry: reader.retry,
    inspectBackup: backup.inspectBackup,
    clearLocalData,
    removeQuarantined,
    dispose,
  }
})
