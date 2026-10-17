import { computed, ref, shallowRef } from 'vue'
import { defineStore } from 'pinia'
import { useGameRuntime } from '@/runtime'
import { usePreferencesStore } from '@/features/settings/stores/usePreferencesStore'
import { useLearningStore } from '@/features/learning/stores/useLearningStore'
import { useGameStore } from '@/features/game/stores/useGameStore'
import { getChallengeDate } from '@/features/game/model/daily'
import { summarizeRecords } from '@/features/records/model/records'
import type { SudokuVariant } from '@/sudoku/contracts'
import type { RecordSummary } from '@/features/records/model/records'
import type { SessionRecord, ResultRecord } from '@/storage/records'
import { parseBackup, previewBackup } from '@/storage/backup'
import type { BackupPreview } from '@/storage/backup'

export const useRecordsStore = defineStore('records', () => {
  const runtime = useGameRuntime()
  const preferences = usePreferencesStore()
  const learning = useLearningStore()
  const game = useGameStore()
  const sessions = shallowRef<readonly SessionRecord[]>([])
  const results = shallowRef<readonly ResultRecord[]>([])
  const error = ref<string | null>(null)
  const notice = ref<string | null>(null)
  const quarantined = ref(0)
  const busy = ref(false)
  const loaded = ref(false)
  const backupError = ref<string | null>(null)
  const backupPreview = shallowRef<BackupPreview | null>(null)
  let restoreCandidate: { text: string; epoch: number } | null = null
  let backupOperation = 0
  const today = ref(getChallengeDate(runtime.wallNow()))
  let operation = 0
  const summaries = computed<Readonly<Record<SudokuVariant, RecordSummary>>>(() => {
    const summarize = (variant: SudokuVariant) =>
      summarizeRecords(results.value, today.value, variant)

    // Explicit keys keep the public contract checked without an unchecked fromEntries cast.
    return {
      classic: summarize('classic'),
      diagonal: summarize('diagonal'),
      jigsaw: summarize('jigsaw'),
      killer: summarize('killer'),
      thermo: summarize('thermo'),
      arrow: summarize('arrow'),
    }
  })
  const summary = computed(() => summaries.value.classic)

  async function load() {
    const epoch = ++operation
    today.value = getChallengeDate(runtime.wallNow())
    busy.value = true
    const [catalog, history] = await Promise.all([
      runtime.repository.listSessions(),
      runtime.repository.listResults(),
    ])
    if (epoch !== operation) {
      return
    }

    busy.value = false
    if (!catalog.ok || !history.ok) {
      error.value = '本机记录读取失败，请重试。'

      return
    }

    sessions.value = catalog.value
    results.value = [...history.value].sort((a, b) =>
      (b.session.completion?.completedAt ?? '').localeCompare(
        a.session.completion?.completedAt ?? '',
      ),
    )
    loaded.value = true
    const count = await runtime.repository.countQuarantined()
    if (epoch !== operation) {
      return
    }

    if (count.ok) {
      quarantined.value = count.value
      error.value = null
    } else {
      error.value = '记录已读取，但无法检查损坏数据，请重试。'
    }
  }

  function resetCatalog() {
    operation++
    backupOperation++
    restoreCandidate = null
    backupPreview.value = null
    sessions.value = []
    results.value = []
    // A replacement invalidates the old snapshot before any asynchronous reload can finish.
    loaded.value = false
    quarantined.value = 0
    busy.value = false
    error.value = null
    game.dropSession()
    learning.reset()
    return preferences.reset()
  }

  async function reloadDataset() {
    const reset = resetCatalog()
    const current = operation
    busy.value = true
    await reset
    if (current !== operation) {
      return
    }
    await preferences.load()
    if (current !== operation) {
      return
    }
    await learning.load()
    if (current !== operation) {
      return
    }
    await load()
  }

  async function settleForBackup(): Promise<boolean> {
    if (!(await game.prepareBackup())) {
      backupError.value = '当前游戏尚未保存，请重试保存后再处理备份。'
      return false
    }
    await preferences.load()
    await preferences.flush()
    if (preferences.error) {
      backupError.value = '设置尚未保存，请重试保存设置后再处理备份。'
      return false
    }
    return true
  }

  async function exportBackup(): Promise<string | null> {
    if (busy.value) {
      return null
    }
    const current = ++backupOperation
    busy.value = true
    backupError.value = null
    notice.value = null
    try {
      if (!(await settleForBackup()) || current !== backupOperation) {
        return null
      }
      const result = await runtime.repository.exportBackup(runtime.wallNow().toISOString())
      if (current !== backupOperation) {
        return null
      }
      if (!result.ok) {
        backupError.value = '备份读取失败或数据超出文件限制，请重试。'
        return null
      }
      notice.value = `备份已准备：${result.value.backup.sessions.length} 个存档、${result.value.backup.results.length} 条成绩、${result.value.backup.lessons.length} 条课程进度。已隔离 ${result.value.quarantined} 条，另排除 ${result.value.excluded} 条无效记录。`
      return JSON.stringify(result.value.backup)
    } finally {
      if (current === backupOperation) {
        busy.value = false
      }
    }
  }

  function cancelRestore() {
    restoreCandidate = null
    backupPreview.value = null
  }

  async function previewRestore(text: string) {
    if (busy.value) {
      return
    }
    cancelRestore()
    backupError.value = null
    const current = ++backupOperation
    let parsed
    try {
      parsed = parseBackup(text, runtime.engine)
    } catch {
      backupError.value = '备份校验暂时无法完成，请重试。本机数据没有改变。'
      return
    }
    if (!parsed.valid) {
      backupError.value = '备份文件无效、不兼容或超出限制，本机数据没有改变。'
      return
    }
    busy.value = true
    const epoch = await runtime.repository.readDatasetEpoch()
    if (current !== backupOperation) {
      return
    }
    busy.value = false
    if (!epoch.ok) {
      backupError.value = '无法读取本机数据状态，请重试。'
      return
    }
    restoreCandidate = { text, epoch: epoch.value }
    backupPreview.value = previewBackup(parsed.value)
  }

  async function restoreBackup() {
    if (busy.value || !restoreCandidate) {
      return
    }
    const candidate = restoreCandidate
    const current = ++backupOperation
    busy.value = true
    backupError.value = null
    notice.value = null
    if (!(await settleForBackup()) || current !== backupOperation) {
      if (current === backupOperation) {
        busy.value = false
      }
      return
    }
    const result = await runtime.repository.restoreBackup(candidate.text, candidate.epoch)
    if (!result.ok) {
      if (current === backupOperation) {
        busy.value = false
        backupError.value =
          result.error.kind === 'revision-conflict'
            ? '预览后本机数据已被替换，请重新选择备份文件。'
            : '恢复失败，本机数据仍然保留，请重试。'
      }
      return
    }

    // The committed reset cancels in-memory saves and late Worker installs before reloading.
    await reloadDataset()
    notice.value = '备份已恢复，存档以暂停状态保留。其他标签页的旧游戏已停止。'
  }

  async function clearLocalData() {
    busy.value = true
    notice.value = null
    await game.leaveGame()
    await preferences.flush()
    const result = await runtime.repository.clearAll()
    if (result.ok) {
      await resetCatalog()
      loaded.value = true
      notice.value = '本机数据已清空。'
    } else {
      busy.value = false
      error.value = '清空失败，数据仍然保留，请重试。'
    }
  }

  async function removeQuarantined() {
    const result = await runtime.repository.removeQuarantined()
    if (result.ok) {
      quarantined.value = 0
      notice.value = '损坏记录已清理，有效数据保留。'
    } else {
      error.value = '清理失败，请重试。'
    }
  }

  const unsubscribe = runtime.ownership.subscribe((notice) => {
    if (notice.kind === 'reset') {
      void reloadDataset()
    }
  })

  function dispose() {
    operation++
    backupOperation++
    unsubscribe()
  }

  return {
    sessions,
    results,
    summary,
    summaries,
    today,
    quarantined,
    error,
    notice,
    busy,
    loaded,
    backupError,
    backupPreview,
    exportBackup,
    previewRestore,
    restoreBackup,
    cancelRestore,
    load,
    clearLocalData,
    removeQuarantined,
    dispose,
  }
})
