import { computed, ref, shallowRef } from 'vue'
import { defineStore } from 'pinia'
import { useGameRuntime } from '@/runtime'
import { usePreferencesStore } from '@/features/settings/stores/usePreferencesStore'
import { useLearningStore } from '@/features/learning/stores/useLearningStore'
import { useGameStore } from '@/features/game/stores/useGameStore'
import { getChallengeDate } from '@/features/game/model/daily'
import type { SudokuVariant } from '@/sudoku/contracts'
import type { GameSummary, RecordSummary, SummaryCursor } from '@/storage/readModels'
import type { ResultRecord } from '@/storage/records'
import { parseBackup, previewBackup } from '@/storage/backup'
import type { BackupPreview } from '@/storage/backup'

export type RecordsSelection = { tab: 'overview' | 'saves' | 'history'; variant: SudokuVariant }
type ActiveSelection = RecordsSelection | { tab: 'result'; id: string }

export const useRecordsStore = defineStore('records', () => {
  const runtime = useGameRuntime()
  const preferences = usePreferencesStore()
  const learning = useLearningStore()
  const game = useGameStore()
  const rows = shallowRef<readonly GameSummary[]>([])
  const summary = shallowRef<RecordSummary | null>(null)
  const completedCount = ref<number | null>(null)
  const result = shallowRef<ResultRecord | null>(null)
  const pending = ref(false)
  const nextCursor = shallowRef<SummaryCursor | null>(null)
  const pageNumber = ref(1)
  let pageCursors: (SummaryCursor | null)[] = [null]
  let selection: ActiveSelection | null = null
  let readOwner: symbol | null = null
  let maintenance: AbortController | null = null
  const error = ref<string | null>(null)
  const notice = ref<string | null>(null)
  const quarantined = ref(0)
  const readBusy = ref(false)
  const backupBusy = ref(false)
  const busy = computed(() => readBusy.value || backupBusy.value)
  const loaded = ref(false)
  const backupError = ref<string | null>(null)
  const backupPreview = shallowRef<BackupPreview | null>(null)
  let restoreCandidate: { text: string; epoch: number } | null = null
  let backupOperation = 0
  const today = ref(getChallengeDate(runtime.wallNow()))
  let operation = 0

  function clearReadSnapshot() {
    rows.value = []
    summary.value = null
    completedCount.value = null
    result.value = null
    loaded.value = false
    pending.value = false
    nextCursor.value = null
    pageNumber.value = 1
    pageCursors = [null]
  }

  async function readSelection(target: ActiveSelection, cursor: SummaryCursor | null = null) {
    maintenance?.abort()
    maintenance = null
    const current = ++operation
    today.value = getChallengeDate(runtime.wallNow())
    readBusy.value = true
    error.value = null

    if (target.tab === 'result') {
      const response = await runtime.repository.readResult(target.id)
      if (current !== operation) {
        return
      }
      readBusy.value = false
      if (!response.ok) {
        error.value = '本机记录读取失败，请重试。'
        return
      }
      result.value = response.value
      loaded.value = true
      return
    }

    if (target.tab === 'overview') {
      const response = await runtime.repository.readOverview(target.variant, today.value)
      if (current !== operation) {
        return
      }
      readBusy.value = false
      if (!response.ok) {
        error.value = '本机记录读取失败，请重试。'
        return
      }
      pending.value = response.value.coverage === 'pending'
      if (!pending.value) {
        summary.value = response.value.summary
        completedCount.value = response.value.completedCount
        loaded.value = true
      }
      return
    }

    const response = await runtime.repository.readSummaryPage({
      kind: target.tab === 'saves' ? 'sessions' : 'results',
      variant: target.variant,
      cursor,
    })
    if (current !== operation) {
      return
    }
    readBusy.value = false
    if (!response.ok) {
      // A cursor belongs to one dataset generation; restart rather than mix snapshots.
      if (cursor && response.error.kind === 'revision-conflict') {
        clearReadSnapshot()
        await readSelection(target)
        return
      }
      error.value = '本机记录读取失败，请重试。'
      return
    }
    pending.value = response.value.coverage === 'pending'
    if (!pending.value) {
      rows.value = response.value.rows
      nextCursor.value = response.value.nextCursor
      loaded.value = true
    }
  }

  async function load(target?: RecordsSelection, owner?: symbol) {
    if (owner) {
      readOwner = owner
    }
    const next = target ?? selection ?? { tab: 'overview', variant: 'classic' }
    const sameSelection =
      selection?.tab === next.tab &&
      (next.tab === 'result'
        ? selection.tab === 'result' && selection.id === next.id
        : selection.tab !== 'result' && selection.variant === next.variant)
    if (!sameSelection) {
      clearReadSnapshot()
    } else if (next.tab !== 'result') {
      // Refresh the same filter in place while replacing its paging history.
      pageNumber.value = 1
      pageCursors = [null]
    }
    selection = next
    await readSelection(next)
  }

  async function loadResult(id: string, owner?: symbol) {
    if (owner) {
      readOwner = owner
    }
    if (selection?.tab !== 'result' || selection.id !== id) {
      clearReadSnapshot()
    }
    selection = { tab: 'result', id }
    await readSelection(selection)
  }

  function releaseReader(owner: symbol) {
    if (readOwner !== owner) {
      return
    }
    operation++
    maintenance?.abort()
    selection = null
    readOwner = null
    readBusy.value = false
    clearReadSnapshot()
  }

  async function changePage(direction: 'next' | 'previous') {
    if (busy.value || !selection || selection.tab === 'overview' || selection.tab === 'result') {
      return
    }
    const previousPage = pageNumber.value
    if (direction === 'next') {
      if (!nextCursor.value) {
        return
      }
      pageCursors[previousPage] = nextCursor.value
      pageNumber.value++
    } else {
      if (previousPage === 1) {
        return
      }
      pageNumber.value--
    }
    const target = selection
    const reading = readSelection(target, pageCursors[pageNumber.value - 1] ?? null)
    const current = operation
    await reading
    // A late page failure cannot roll back the page number of a newer filter or reader.
    if (current === operation && target === selection && error.value) {
      pageNumber.value = previousPage
    }
  }

  async function retry() {
    if (pending.value) {
      maintenance?.abort()
      const controller = new AbortController()
      maintenance = controller
      const current = ++operation
      readBusy.value = true
      error.value = null
      const response = await runtime.repository.maintainSummaries(controller.signal)
      if (current !== operation) {
        return
      }
      readBusy.value = false
      if (!response.ok) {
        error.value = '旧存档整理暂时无法完成，请重试。原始数据仍然保留。'
        return
      }
    }
    await load()
  }

  async function inspectBackup() {
    const current = backupOperation
    const count = await runtime.repository.countQuarantined()
    if (current !== backupOperation) {
      return
    }
    if (count.ok) {
      quarantined.value = count.value
    } else {
      backupError.value = '无法检查损坏数据，请重试。'
    }
  }

  function resetCatalog() {
    operation++
    backupOperation++
    restoreCandidate = null
    backupPreview.value = null
    maintenance?.abort()
    // A replacement invalidates the old snapshot before any asynchronous reload can finish.
    clearReadSnapshot()
    quarantined.value = 0
    readBusy.value = false
    backupBusy.value = false
    error.value = null
    game.dropSession()
    learning.reset()
    return preferences.reset()
  }

  async function reloadDataset() {
    const reset = resetCatalog()
    const current = operation
    readBusy.value = true
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
    if (selection) {
      await readSelection(selection)
    } else {
      readBusy.value = false
    }
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
    backupBusy.value = true
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
        backupBusy.value = false
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
    backupBusy.value = true
    let parsed
    try {
      await runtime.ensureEngine()
      if (current !== backupOperation) {
        return
      }
      parsed = parseBackup(text, runtime.engine)
    } catch {
      if (current === backupOperation) {
        backupBusy.value = false
        backupError.value = '备份校验暂时无法完成，请重试。本机数据没有改变。'
      }
      return
    }
    if (!parsed.valid) {
      backupBusy.value = false
      backupError.value = '备份文件无效、不兼容或超出限制，本机数据没有改变。'
      return
    }
    backupBusy.value = true
    const epoch = await runtime.repository.readDatasetEpoch()
    if (current !== backupOperation) {
      return
    }
    backupBusy.value = false
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
    backupBusy.value = true
    backupError.value = null
    notice.value = null
    if (!(await settleForBackup()) || current !== backupOperation) {
      if (current === backupOperation) {
        backupBusy.value = false
      }
      return
    }
    const result = await runtime.repository.restoreBackup(candidate.text, candidate.epoch)
    if (!result.ok) {
      if (current === backupOperation) {
        backupBusy.value = false
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
    backupBusy.value = true
    notice.value = null
    await game.leaveGame()
    await preferences.flush()
    const result = await runtime.repository.clearAll()
    if (result.ok) {
      const reset = resetCatalog()
      const current = operation
      await reset
      if (current === operation && selection) {
        await readSelection(selection)
      }
      notice.value = '本机数据已清空。'
    } else {
      backupBusy.value = false
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
    maintenance?.abort()
    unsubscribe()
  }

  return {
    rows,
    summary,
    completedCount,
    result,
    pending,
    nextCursor,
    pageNumber,
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
    loadResult,
    releaseReader,
    changePage,
    retry,
    inspectBackup,
    clearLocalData,
    removeQuarantined,
    dispose,
  }
})
