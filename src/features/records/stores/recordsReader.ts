import { ref, shallowRef } from 'vue'
import type { GameRuntime } from '@/runtime'
import { getChallengeDate } from '@/features/game/model/daily'
import type { SudokuVariant } from '@/sudoku/contracts'
import type { GameSummary, RecordSummary, SummaryCursor } from '@/storage/readModels'
import type { ResultRecord } from '@/storage/records'

export type RecordsSelection = { tab: 'overview' | 'saves' | 'history'; variant: SudokuVariant }
type ActiveSelection = RecordsSelection | { tab: 'result'; id: string }

// Own the current read snapshot, its paging history and cancellable legacy maintenance.
export function createRecordsReader(runtime: Pick<GameRuntime, 'repository' | 'wallNow'>) {
  const rows = shallowRef<readonly GameSummary[]>([])
  const summary = shallowRef<RecordSummary | null>(null)
  const completedCount = ref<number | null>(null)
  const completionCounts = shallowRef<Record<SudokuVariant, number> | null>(null)
  const result = shallowRef<ResultRecord | null>(null)
  const pending = ref(false)
  const nextCursor = shallowRef<SummaryCursor | null>(null)
  const pageNumber = ref(1)
  const error = ref<string | null>(null)
  const readBusy = ref(false)
  const loaded = ref(false)
  const today = ref(getChallengeDate(runtime.wallNow()))
  let pageCursors: (SummaryCursor | null)[] = [null]
  let selection: ActiveSelection | null = null
  let readOwner: symbol | null = null
  let maintenance: AbortController | null = null
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

    const [response, counts] = await Promise.all([
      target.tab === 'overview'
        ? runtime.repository.readOverview(target.variant, today.value)
        : runtime.repository.readSummaryPage({
            kind: target.tab === 'saves' ? 'sessions' : 'results',
            variant: target.variant,
            cursor,
          }),
      runtime.repository.readCompletionCounts(),
    ])
    if (current !== operation) {
      return
    }

    readBusy.value = false
    if (!response.ok || !counts.ok) {
      // A cursor belongs to one dataset generation; restart rather than mix snapshots.
      if (!response.ok && cursor && response.error.kind === 'revision-conflict') {
        clearReadSnapshot()
        await readSelection(target)
        return
      }
      error.value = '本机记录读取失败，请重试。'
      return
    }

    completionCounts.value = counts.value.counts
    pending.value = response.value.coverage === 'pending' || counts.value.coverage === 'pending'
    if (response.value.coverage === 'ready') {
      if ('summary' in response.value) {
        summary.value = response.value.summary
        completedCount.value = response.value.completedCount
      } else {
        rows.value = response.value.rows
        nextCursor.value = response.value.nextCursor
      }
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

    // Only the currently installed view can release reads started on its behalf.
    operation++
    maintenance?.abort()
    maintenance = null
    selection = null
    readOwner = null
    readBusy.value = false
    completionCounts.value = null
    clearReadSnapshot()
  }

  async function changePage(direction: 'next' | 'previous') {
    if (
      readBusy.value ||
      !selection ||
      selection.tab === 'overview' ||
      selection.tab === 'result'
    ) {
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

  /** Clears the old dataset immediately and fences the coordinator's asynchronous reset. */
  function beginDatasetReload(): number {
    const current = ++operation
    maintenance?.abort()
    maintenance = null
    clearReadSnapshot()
    completionCounts.value = null
    error.value = null
    readBusy.value = true

    return current
  }

  function isCurrent(generation: number): boolean {
    return generation === operation
  }

  async function finishDatasetReload(generation: number) {
    if (!isCurrent(generation)) {
      return
    }

    if (selection) {
      await readSelection(selection)
    } else {
      readBusy.value = false
    }
  }

  function dispose() {
    operation++
    maintenance?.abort()
    maintenance = null
  }

  return {
    rows,
    summary,
    completedCount,
    completionCounts,
    result,
    pending,
    nextCursor,
    pageNumber,
    error,
    readBusy,
    loaded,
    today,
    load,
    loadResult,
    releaseReader,
    changePage,
    retry,
    beginDatasetReload,
    finishDatasetReload,
    isCurrent,
    dispose,
  }
}
