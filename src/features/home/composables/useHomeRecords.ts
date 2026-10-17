import { computed, onScopeDispose, ref, shallowRef } from 'vue'
import { useGameRuntime } from '@/runtime'
import { getChallengeDate, type DailyVariantStatus } from '@/features/game/model/daily'
import type { SudokuVariant } from '@/sudoku/contracts'
import type { GameSummary, SummaryCursor } from '@/storage/readModels'

type HomeSheet = { kind: 'free'; variant: SudokuVariant } | { kind: 'daily' | 'resume' }

export function useHomeRecords() {
  const runtime = useGameRuntime()
  const today = ref(getChallengeDate(runtime.wallNow()))
  const unfinishedCount = ref<number | null>(null)
  const resultCount = ref<number | null>(null)
  const loading = ref(false)
  const pending = ref(false)
  const error = ref<string | null>(null)
  const sheetBusy = ref(false)
  const sheetPending = ref(false)
  const sheetError = ref<string | null>(null)
  const selectedSave = shallowRef<GameSummary | null>(null)
  const resumeChoices = shallowRef<readonly GameSummary[]>([])
  const dailyStatuses = shallowRef<readonly DailyVariantStatus[]>([])
  const nextCursor = shallowRef<SummaryCursor | null>(null)
  const pageNumber = ref(1)
  let pageCursors: (SummaryCursor | null)[] = [null]
  let homeOperation = 0
  let sheetOperation = 0
  let sheet: HomeSheet | null = null
  let maintenance: AbortController | null = null
  const sheetBlocked = computed(() => sheetBusy.value || sheetPending.value || !!sheetError.value)

  async function load() {
    const operation = ++homeOperation
    loading.value = true
    today.value = getChallengeDate(runtime.wallNow())
    const response = await runtime.repository.readHome()
    if (operation !== homeOperation) {
      return
    }
    loading.value = false
    if (!response.ok) {
      error.value = '本机记录读取失败，请重试。'
      return
    }
    pending.value = response.value.coverage === 'pending'
    unfinishedCount.value = response.value.unfinishedCount
    resultCount.value = response.value.resultCount
    error.value = null
  }

  async function loadSheet(cursor: SummaryCursor | null = null) {
    const target = sheet
    if (!target) {
      return
    }
    const operation = ++sheetOperation
    sheetBusy.value = true
    sheetError.value = null
    const response = await readSheet(target, cursor)
    if (operation !== sheetOperation) {
      return
    }
    sheetBusy.value = false
    if (!response.ok) {
      if (cursor && response.error.kind === 'revision-conflict') {
        resumeChoices.value = []
        pageCursors = [null]
        pageNumber.value = 1
        await loadSheet()
        return
      }
      sheetError.value = '存档读取失败，请重试。'
      return
    }
    sheetPending.value = response.value.coverage === 'pending'
    if (sheetPending.value) {
      return
    }
    if ('summary' in response.value) {
      selectedSave.value = response.value.summary
    } else if ('statuses' in response.value) {
      dailyStatuses.value = response.value.statuses
    } else {
      resumeChoices.value = response.value.rows
      nextCursor.value = response.value.nextCursor
    }
  }

  function readSheet(target: HomeSheet, cursor: SummaryCursor | null) {
    if (target.kind === 'free') {
      return runtime.repository.readSlotSummary('free', target.variant)
    }
    if (target.kind === 'daily') {
      return runtime.repository.readDailyStatuses(today.value)
    }
    return runtime.repository.readSummaryPage({ kind: 'sessions', unfinishedOnly: true, cursor })
  }

  async function openSheet(target: HomeSheet) {
    maintenance?.abort()
    today.value = getChallengeDate(runtime.wallNow())
    sheet = target
    selectedSave.value = null
    resumeChoices.value = []
    dailyStatuses.value = []
    sheetPending.value = false
    nextCursor.value = null
    pageNumber.value = 1
    pageCursors = [null]
    await loadSheet()
  }

  function closeSheet() {
    sheetOperation++
    sheet = null
    sheetBusy.value = false
    maintenance?.abort()
  }

  async function changePage(direction: 'next' | 'previous') {
    if (sheetBlocked.value || sheet?.kind !== 'resume') {
      return
    }
    const previousPage = pageNumber.value
    if (direction === 'next') {
      if (!nextCursor.value) {
        return
      }
      pageCursors[previousPage] = nextCursor.value
      pageNumber.value++
    } else if (pageNumber.value > 1) {
      pageNumber.value--
    } else {
      return
    }
    const target = sheet
    const reading = loadSheet(pageCursors[pageNumber.value - 1] ?? null)
    const current = sheetOperation
    await reading
    // Another sheet owns its own page state even if this older request finishes last.
    if (current === sheetOperation && target === sheet && sheetError.value) {
      pageNumber.value = previousPage
    }
  }

  async function retry() {
    if (pending.value || sheetPending.value) {
      const operation = ++sheetOperation
      maintenance?.abort()
      const controller = new AbortController()
      maintenance = controller
      sheetBusy.value = true
      const response = await runtime.repository.maintainSummaries(controller.signal)
      if (operation !== sheetOperation) {
        return
      }
      sheetBusy.value = false
      if (!response.ok) {
        const message = '旧存档整理暂时无法完成，请重试。原始数据仍然保留。'
        error.value = message
        sheetError.value = message
        return
      }
    }
    const target = sheet
    const current = sheetOperation
    await load()
    if (current !== sheetOperation || target !== sheet) {
      return
    }
    await loadSheet(pageCursors[pageNumber.value - 1] ?? null)
  }

  const unsubscribe = runtime.ownership.subscribe((notice) => {
    if (notice.kind !== 'reset') {
      return
    }
    // Never retain summaries from the replaced dataset while the new read is pending.
    unfinishedCount.value = null
    resultCount.value = null
    selectedSave.value = null
    resumeChoices.value = []
    dailyStatuses.value = []
    nextCursor.value = null
    pageNumber.value = 1
    pageCursors = [null]
    void load()
    void loadSheet()
  })
  onScopeDispose(() => {
    homeOperation++
    closeSheet()
    unsubscribe()
  })

  return {
    today,
    unfinishedCount,
    resultCount,
    loading,
    pending,
    error,
    sheetBusy,
    sheetPending,
    sheetError,
    sheetBlocked,
    selectedSave,
    resumeChoices,
    dailyStatuses,
    nextCursor,
    pageNumber,
    load,
    openSheet,
    closeSheet,
    changePage,
    retry,
  }
}
