import { ref, shallowRef } from 'vue'
import type { GameRuntime } from '@/runtime'
import { parseBackup, previewBackup } from '@/storage/backup'
import type { BackupPreview } from '@/storage/backup'

export type BackupOperation = symbol
export type BackupRestoreOperation = {
  readonly operation: BackupOperation
  readonly text: string
  readonly epoch: number
}
export type BackupFileError = 'too-large' | 'unreadable'

// Own backup work and preview identity; the public store settles saves and resets other stores.
export function createRecordsBackup(
  runtime: Pick<GameRuntime, 'repository' | 'wallNow' | 'ensureEngine' | 'engine'>,
) {
  const backupBusy = ref(false)
  const backupError = ref<string | null>(null)
  const backupPreview = shallowRef<BackupPreview | null>(null)
  const notice = ref<string | null>(null)
  const quarantined = ref(0)
  let restoreCandidate: { readonly text: string; readonly epoch: number } | null = null
  let operation = Symbol('backup')

  function isCurrent(current: BackupOperation): boolean {
    return current === operation
  }

  function beginOperation(): BackupOperation {
    operation = Symbol('backup')
    backupBusy.value = true
    backupError.value = null

    return operation
  }

  function finishOperation(current: BackupOperation) {
    // An obsolete completion cannot release the busy state owned by a newer operation.
    if (isCurrent(current)) {
      backupBusy.value = false
    }
  }

  function reportError(current: BackupOperation, message: string) {
    if (isCurrent(current)) {
      backupError.value = message
    }
  }

  async function inspectBackup() {
    const current = operation
    const count = await runtime.repository.countQuarantined()
    if (!isCurrent(current)) {
      return
    }

    if (count.ok) {
      quarantined.value = count.value
    } else {
      backupError.value = '无法检查损坏数据，请重试。'
    }
  }

  function beginExport(): BackupOperation {
    notice.value = null

    return beginOperation()
  }

  async function exportBackup(current: BackupOperation): Promise<string | null> {
    const result = await runtime.repository.exportBackup(runtime.wallNow().toISOString())
    if (!isCurrent(current)) {
      return null
    }
    if (!result.ok) {
      backupError.value = '备份读取失败或数据超出文件限制，请重试。'
      return null
    }

    notice.value = `备份已准备：${result.value.backup.sessions.length} 个存档、${result.value.backup.results.length} 条成绩、${result.value.backup.lessons.length} 条课程进度。已隔离 ${result.value.quarantined} 条，另排除 ${result.value.excluded} 条无效记录。`

    return JSON.stringify(result.value.backup)
  }

  function cancelRestore() {
    restoreCandidate = null
    backupPreview.value = null
  }

  function beginBackupFileSelection() {
    cancelRestore()
    backupError.value = null
  }

  function reportBackupFileError(kind: BackupFileError) {
    backupError.value =
      kind === 'too-large'
        ? '备份文件超过 25 MiB，本机数据没有改变。'
        : '备份文件读取失败，请重新选择文件。'
  }

  async function previewRestore(text: string) {
    cancelRestore()
    const current = beginOperation()

    try {
      let parsed
      try {
        await runtime.ensureEngine()
        if (!isCurrent(current)) {
          return
        }
        parsed = parseBackup(text, runtime.engine)
      } catch {
        reportError(current, '备份校验暂时无法完成，请重试。本机数据没有改变。')
        return
      }
      if (!parsed.valid) {
        reportError(current, '备份文件无效、不兼容或超出限制，本机数据没有改变。')
        return
      }

      const epoch = await runtime.repository.readDatasetEpoch()
      if (!isCurrent(current)) {
        return
      }
      if (!epoch.ok) {
        reportError(current, '无法读取本机数据状态，请重试。')
        return
      }

      // Confirmation must replace the dataset inspected for this exact validated preview.
      restoreCandidate = { text, epoch: epoch.value }
      backupPreview.value = previewBackup(parsed.value)
    } finally {
      finishOperation(current)
    }
  }

  function beginRestore(): BackupRestoreOperation | null {
    if (!restoreCandidate) {
      return null
    }

    const candidate = restoreCandidate
    notice.value = null
    const current = beginOperation()

    return { operation: current, ...candidate }
  }

  async function replaceDataset(candidate: BackupRestoreOperation): Promise<boolean> {
    const result = await runtime.repository.restoreBackup(candidate.text, candidate.epoch)
    if (!result.ok) {
      reportError(
        candidate.operation,
        result.error.kind === 'revision-conflict'
          ? '预览后本机数据已被替换，请重新选择备份文件。'
          : '恢复失败，本机数据仍然保留，请重试。',
      )
      return false
    }

    return true
  }

  function beginClear(): BackupOperation {
    operation = Symbol('clear')
    backupBusy.value = true
    notice.value = null

    return operation
  }

  async function removeQuarantined(): Promise<boolean> {
    const result = await runtime.repository.removeQuarantined()
    if (!result.ok) {
      return false
    }

    quarantined.value = 0
    notice.value = '损坏记录已清理，有效数据保留。'

    return true
  }

  function reset() {
    operation = Symbol('reset')
    cancelRestore()
    quarantined.value = 0
    backupBusy.value = false
  }

  function dispose() {
    operation = Symbol('disposed')
  }

  return {
    backupBusy,
    backupError,
    backupPreview,
    notice,
    quarantined,
    beginExport,
    exportBackup,
    beginBackupFileSelection,
    reportBackupFileError,
    previewRestore,
    beginRestore,
    replaceDataset,
    cancelRestore,
    beginClear,
    removeQuarantined,
    inspectBackup,
    finishOperation,
    reportError,
    isCurrent,
    reset,
    dispose,
  }
}
