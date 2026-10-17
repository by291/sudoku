import { effectScope } from 'vue'
import { afterEach, expect, it, vi } from 'vitest'
import { useHomeRecords } from '@/features/home/composables/useHomeRecords'
import { initialSummaryState } from '@/storage/projections'
import { createTestRuntime } from '../../../../tests/support/runtime'
import { makeSession } from '../../../../tests/support/gameFixtures'
import { deferred } from '../../../../tests/support/deferred'

const cleanups: (() => void)[] = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) {
    cleanup()
  }
})

async function setup() {
  const test = await createTestRuntime()
  cleanups.push(test.dispose)
  const scope = effectScope()
  cleanups.push(() => scope.stop())
  const home = scope.run(() => test.app.runWithContext(useHomeRecords))
  if (!home) {
    throw new Error('Home scope is unavailable')
  }
  return { ...test, home }
}

it('keeps initial presence unknown and loads only the requested sheet without computation', async () => {
  const { runtime, home } = await setup()
  const homeResponse = await runtime.repository.readHome()
  const pending = deferred<typeof homeResponse>()
  vi.spyOn(runtime.repository, 'readHome').mockReturnValueOnce(pending.promise)
  const slots = vi.spyOn(runtime.repository, 'readSlotSummary')
  const pages = vi.spyOn(runtime.repository, 'readSummaryPage')
  const daily = vi.spyOn(runtime.repository, 'readDailyStatuses')
  const computation = vi.spyOn(runtime, 'ensureEngine')

  const loading = home.load()

  expect(home.unfinishedCount.value).toBeNull()
  expect(home.resultCount.value).toBeNull()
  expect(slots).not.toHaveBeenCalled()
  expect(pages).not.toHaveBeenCalled()
  expect(daily).not.toHaveBeenCalled()
  pending.resolve(homeResponse)
  await loading
  expect(home.unfinishedCount.value).toBe(0)

  await home.openSheet({ kind: 'free', variant: 'arrow' })

  expect(slots).toHaveBeenCalledExactlyOnceWith('free', 'arrow')
  expect(pages).not.toHaveBeenCalled()
  expect(daily).not.toHaveBeenCalled()
  expect(computation).not.toHaveBeenCalled()
})

it('blocks a pending legacy slot until maintenance establishes its saved summary', async () => {
  const { runtime, database, home } = await setup()
  await database.put('sessions', { formatVersion: 2, revision: 1, session: makeSession() })
  await database.put('meta', initialSummaryState(false), 'summaries')

  await home.load()
  await home.openSheet({ kind: 'free', variant: 'classic' })

  expect(home.unfinishedCount.value).toBeNull()
  expect(home.sheetBlocked.value).toBe(true)
  expect(home.selectedSave.value).toBeNull()

  await home.retry()

  expect(home.sheetBlocked.value).toBe(false)
  expect(home.selectedSave.value?.id).toBe('fixture-free-session')
  expect(home.unfinishedCount.value).toBe(1)
  expect((await runtime.repository.readHome()).ok).toBe(true)
})

it('does not publish a slow sheet response after the sheet closes', async () => {
  const { runtime, home } = await setup()
  const response = await runtime.repository.readSlotSummary('free', 'classic')
  const pending = deferred<typeof response>()
  vi.spyOn(runtime.repository, 'readSlotSummary').mockReturnValueOnce(pending.promise)

  const loading = home.openSheet({ kind: 'free', variant: 'classic' })
  home.closeSheet()
  pending.resolve(response)
  await loading

  expect(home.sheetBusy.value).toBe(false)
  expect(home.selectedSave.value).toBeNull()
})

async function setupPagedSaves() {
  const test = await setup()
  for (let index = 0; index < 65; index++) {
    const session = makeSession({ id: `saved-${String(index).padStart(3, '0')}` })
    await test.database.put('sessions', { formatVersion: 2, revision: 1, session })
  }
  await test.database.put('meta', initialSummaryState(false), 'summaries')
  expect((await test.runtime.repository.maintainSummaries()).ok).toBe(true)
  await test.home.openSheet({ kind: 'resume' })
  await test.home.changePage('next')
  return test
}

it('retries the current resume page with matching rows and page number', async () => {
  const { home } = await setupPagedSaves()
  const secondPage = home.resumeChoices.value.map((row) => row.id)

  await home.retry()

  expect(home.pageNumber.value).toBe(2)
  expect(home.resumeChoices.value.map((row) => row.id)).toEqual(secondPage)
})

it('does not roll an older resume page number into a newly opened failing sheet', async () => {
  const { runtime, home } = await setupPagedSaves()
  const thirdPage = await runtime.repository.readSummaryPage({
    kind: 'sessions',
    unfinishedOnly: true,
    cursor: home.nextCursor.value,
  })
  const pending = deferred<typeof thirdPage>()
  vi.spyOn(runtime.repository, 'readSummaryPage').mockReturnValueOnce(pending.promise)
  vi.spyOn(runtime.repository, 'readSlotSummary').mockResolvedValueOnce({
    ok: false,
    error: { kind: 'unavailable', message: 'Injected failure' },
  })

  const paging = home.changePage('next')
  await home.openSheet({ kind: 'free', variant: 'arrow' })
  pending.resolve(thirdPage)
  await paging

  expect(home.sheetError.value).toContain('读取失败')
  expect(home.pageNumber.value).toBe(1)
  expect(home.resumeChoices.value).toEqual([])
})
