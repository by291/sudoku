import { computed, ref, shallowRef } from 'vue'
import { defineStore } from 'pinia'
import { useGameRuntime } from '@/infrastructure/runtime'
import { usePreferencesStore } from '@/features/settings/stores/usePreferencesStore'
import { useLearningStore } from '@/features/learning/stores/useLearningStore'
import { useGameStore } from '@/features/game/stores/useGameStore'
import { getChallengeDate } from '@/features/game/model/daily'
import { summarizeRecords } from '@/features/records/model/records'
import type { SudokuVariant } from '@/core/sudoku/rules'
import type { RecordSummary } from '@/features/records/model/records'
import type { SessionRecord, ResultRecord } from '@/storage/records'
export const useRecordsStore = defineStore('records', () => {
  const runtime = useGameRuntime(),
    preferences = usePreferencesStore(),
    learning = useLearningStore(),
    game = useGameStore()
  const sessions = shallowRef<readonly SessionRecord[]>([]),
    results = shallowRef<readonly ResultRecord[]>([])
  const error = ref<string | null>(null),
    notice = ref<string | null>(null)
  const quarantined = ref(0),
    busy = ref(false)
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
    if (epoch !== operation) return
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
    const count = await runtime.repository.countQuarantined()
    if (epoch !== operation) return
    if (count.ok) {
      quarantined.value = count.value
      error.value = null
    } else error.value = '记录已读取，但无法检查损坏数据，请重试。'
  }
  function resetCatalog() {
    operation++
    sessions.value = []
    results.value = []
    quarantined.value = 0
    busy.value = false
    error.value = null
    game.dropSession()
    learning.reset()
    void preferences.reset()
  }
  async function clearLocalData() {
    busy.value = true
    notice.value = null
    await game.leaveGame()
    await preferences.flush()
    const result = await runtime.repository.clearAll()
    if (result.ok) {
      resetCatalog()
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
    } else error.value = '清理失败，请重试。'
  }
  const unsubscribe = runtime.ownership.subscribe((notice) => {
    if (notice.kind === 'reset') resetCatalog()
  })
  function dispose() {
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
    load,
    clearLocalData,
    removeQuarantined,
    dispose,
  }
})
