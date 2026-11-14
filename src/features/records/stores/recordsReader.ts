import { ref, shallowRef } from 'vue'
import type { GameRuntime } from '@/runtime'
import { getChallengeDate } from '@/features/game/model/daily'
import type { SudokuVariant } from '@/sudoku/contracts'
import type {
  CompletionCountsRead,
  GameSummary,
  OverviewRead,
  RecordSummary,
  SummaryCursor,
  SummaryPage,
} from '@/storage/readModels'
import type { ResultRecord } from '@/storage/records'

export type RecordsSelection = { tab: 'overview' | 'saves' | 'history'; variant: SudokuVariant }
type ActiveSelection = RecordsSelection | { tab: 'result'; id: string }

const SNAPSHOT_READ_ATTEMPTS = 2

/** Owns the selected read snapshot, its paging history and cancellable legacy maintenance. */
export function createRecordsReader(runtime: Pick<GameRuntime, 'repository' | 'wallNow'>) {
  const rows = shallowRef<readonly GameSummary[]>([])
  const summary = shallowRef<RecordSummary | null>(null)
  const completedCount = ref<number | null>(null)
  const completionCounts = shallowRef<Record<SudokuVariant, number> | null>(null)
  const result = shallowRef<ResultRecord | null>(null)
  const isPending = ref(false)
  const nextCursor = shallowRef<SummaryCursor | null>(null)
  const pageNumber = ref(1)
  const error = ref<string | null>(null)
  const isReadBusy = ref(false)
  const isLoaded = ref(false)
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
    isLoaded.value = false
    isPending.value = false
    nextCursor.value = null
    pageNumber.value = 1
    pageCursors = [null]
  }

  async function readResultSelection(id: string, current: number) {
    const response = await runtime.repository.readResult(id)

    // A newer selection or a released reader owns the outcome after the read settles.
    if (!isCurrent(current)) {
      return
    }

    isReadBusy.value = false
    if (!response.ok) {
      error.value = '本机记录读取失败，请重试。'
      return
    }

    result.value = response.value
    isLoaded.value = true
  }

  function publishCatalogueSnapshot(
    selected: SummaryPage | OverviewRead,
    navigation: CompletionCountsRead,
  ) {
    if (selected.coverage === 'pending') {
      // A repair invalidated the old page, so it cannot be shown with the new counts.
      clearReadSnapshot()
    } else {
      if ('summary' in selected) {
        summary.value = selected.summary
        completedCount.value = selected.completedCount
      } else {
        rows.value = selected.rows
        nextCursor.value = selected.nextCursor
      }
      isLoaded.value = true
    }

    completionCounts.value = navigation.counts
    isPending.value = selected.coverage === 'pending' || navigation.coverage === 'pending'
  }

  function readSelectedCatalogue(
    target: RecordsSelection,
    cursor: SummaryCursor | null,
    challengeDate: string,
  ) {
    if (target.tab === 'overview') {
      return runtime.repository.readOverview(target.variant, challengeDate)
    }

    return runtime.repository.readSummaryPage({
      kind: target.tab === 'saves' ? 'sessions' : 'results',
      variant: target.variant,
      cursor,
    })
  }

  async function readCatalogueSelection(
    target: RecordsSelection,
    cursor: SummaryCursor | null,
    current: number,
  ) {
    const challengeDate = today.value
    let pageCursor = cursor

    for (let attempt = 0; attempt < SNAPSHOT_READ_ATTEMPTS; attempt++) {
      const selectedRead = readSelectedCatalogue(target, pageCursor, challengeDate)
      const [response, counts] = await Promise.all([
        selectedRead,
        runtime.repository.readCompletionCounts(),
      ])

      if (!isCurrent(current)) {
        return
      }

      if (!response.ok && pageCursor && response.error.kind === 'revision-conflict') {
        // A cursor can only resume the generation that produced its preceding page.
        clearReadSnapshot()
        pageCursor = null
        continue
      }
      if (!response.ok || !counts.ok) {
        break
      }

      const selected = response.value
      const navigation = counts.value
      const isSameSnapshot =
        selected.epoch === navigation.epoch && selected.generation === navigation.generation
      if (!isSameSnapshot) {
        // Separate transactions can straddle a write or a dataset replacement.
        if (selected.epoch !== navigation.epoch) {
          clearReadSnapshot()
          completionCounts.value = null
          pageCursor = null
        }
        continue
      }

      publishCatalogueSnapshot(selected, navigation)
      isReadBusy.value = false
      return
    }

    isReadBusy.value = false
    error.value = '本机记录读取失败，请重试。'
  }

  async function readSelection(target: ActiveSelection, cursor: SummaryCursor | null = null) {
    maintenance?.abort()
    maintenance = null

    const current = ++operation
    today.value = getChallengeDate(runtime.wallNow())
    isReadBusy.value = true
    error.value = null

    if (target.tab === 'result') {
      await readResultSelection(target.id, current)
      return
    }

    await readCatalogueSelection(target, cursor, current)
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
    isReadBusy.value = false
    completionCounts.value = null
    clearReadSnapshot()
  }

  async function changePage(direction: 'next' | 'previous') {
    if (
      isReadBusy.value ||
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
    if (current === operation && target === selection && error.value && isLoaded.value) {
      pageNumber.value = previousPage
    }
  }

  async function retry() {
    if (isPending.value) {
      maintenance?.abort()
      const controller = new AbortController()
      maintenance = controller
      const current = ++operation
      isReadBusy.value = true
      error.value = null

      const response = await runtime.repository.maintainSummaries(controller.signal)

      // A stale repair may have committed a record but cannot publish into a newer view.
      if (!isCurrent(current)) {
        return
      }

      isReadBusy.value = false
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
    isReadBusy.value = true

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
      isReadBusy.value = false
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
    pending: isPending,
    nextCursor,
    pageNumber,
    error,
    readBusy: isReadBusy,
    loaded: isLoaded,
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
