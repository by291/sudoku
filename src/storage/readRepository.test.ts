import 'fake-indexeddb/auto'
import { afterEach, expect, it, vi } from 'vitest'
import { deleteDB, openDB } from 'idb'
import { openSudokuDatabase } from '@/storage/database'
import { createGameRepository } from '@/storage/repository'
import { createOwnershipCoordinator } from '@/storage/ownership'
import { initialSummaryState, projectRecord } from '@/storage/projections'
import type { GameSummary } from '@/storage/readModels'
import { testEngine } from '../../tests/support/semantics'
import { makeSession } from '../../tests/support/gameFixtures'

const databases: { name: string; close(): void }[] = []

async function setup() {
  const name = crypto.randomUUID()
  const database = await openSudokuDatabase(name)
  databases.push({ name, close: () => database.close() })
  const prepareValidation = vi.fn(async () => undefined)
  const validators = {
    validatePuzzle: vi.fn(testEngine.validatePuzzle.bind(testEngine)),
    validateAssessment: testEngine.validateAssessment.bind(testEngine),
  }
  const repository = createGameRepository(() => Promise.resolve(database), validators, {
    prepareValidation,
  })
  const ownership = createOwnershipCoordinator(() => Promise.resolve(database), { channel: null })

  return { database, repository, prepareValidation, validators, ownership }
}

function makeResultSummary(overrides: Partial<GameSummary> = {}) {
  const summary = {
    ...projectRecord(
      makeSession({ completion: { completedAt: '2026-10-11T01:00:00.000Z', elapsedMs: 0 } }),
      0,
      'results',
    ),
    ...overrides,
  }

  return { ...summary, orderTime: -Date.parse(summary.completedAt ?? ''), unfinished: 0 }
}

afterEach(async () => {
  for (const database of databases.splice(0)) {
    database.close()
    await deleteDB(database.name)
  }
})

it('counts every variant from result indexes without loading canonical boards or computation', async () => {
  const { database, repository, prepareValidation, validators } = await setup()
  const session = makeSession({
    completion: { completedAt: '2026-10-17T01:00:00.000Z', elapsedMs: 0 },
  })
  session.entries = session.puzzle.solution.map((digit, cell) =>
    session.puzzle.givens[cell] ? 0 : digit,
  )
  await database.put('results', { formatVersion: 2, session })
  await database.put('resultSummaries', projectRecord(session, 0, 'results'))

  const counts = await repository.readCompletionCounts()

  expect(counts).toMatchObject({
    ok: true,
    value: {
      coverage: 'ready',
      counts: { classic: 1, diagonal: 0, jigsaw: 0, killer: 0, thermo: 0, arrow: 0 },
    },
  })
  expect(prepareValidation).not.toHaveBeenCalled()
  expect(validators.validatePuzzle).not.toHaveBeenCalled()
})

it('keeps incomplete result counts unknown but does not block them on legacy sessions', async () => {
  const { database, repository } = await setup()
  const state = initialSummaryState(false)
  await database.put('meta', state, 'summaries')

  expect(await repository.readCompletionCounts()).toMatchObject({
    ok: true,
    value: { coverage: 'pending', counts: null },
  })

  state.results.complete = true
  await database.put('meta', state, 'summaries')

  expect(await repository.readCompletionCounts()).toMatchObject({
    ok: true,
    value: {
      coverage: 'ready',
      counts: { classic: 0, diagonal: 0, jigsaw: 0, killer: 0, thermo: 0, arrow: 0 },
    },
  })
})

it('browses an empty projected database without preparing mathematical validation', async () => {
  const { repository, prepareValidation } = await setup()

  expect(await repository.readHome()).toMatchObject({
    ok: true,
    value: { coverage: 'ready', unfinishedCount: 0, resultCount: 0 },
  })
  expect(await repository.readSummaryPage({ kind: 'sessions' })).toMatchObject({
    ok: true,
    value: { coverage: 'ready', rows: [], nextCursor: null },
  })
  expect(await repository.readSlotSummary('free', 'classic')).toMatchObject({
    ok: true,
    value: { coverage: 'ready', summary: null },
  })
  expect(prepareValidation).not.toHaveBeenCalled()
})

it('validates only the selected canonical session and leaves unrelated corrupt data untouched', async () => {
  const { database, repository, validators, prepareValidation } = await setup()
  await database.put('sessions', { formatVersion: 2, revision: 3, session: makeSession() })
  await database.put('sessions', { session: { id: 'unrelated-corrupt' } })

  const selected = await repository.readSession('fixture-free-session')

  expect(selected).toMatchObject({ ok: true, value: { revision: 3 } })
  expect(validators.validatePuzzle).toHaveBeenCalledTimes(1)
  expect(prepareValidation).toHaveBeenCalledTimes(1)
  expect(await database.get('sessions', 'unrelated-corrupt')).toBeDefined()
})

it('upgrades legacy coverage as pending without loading validation, then backfills one record at a time', async () => {
  const name = crypto.randomUUID()
  const legacy = await openDB(name, 1, {
    upgrade(db) {
      const sessions = db.createObjectStore('sessions', { keyPath: 'session.id' })
      sessions.createIndex('by-mode', 'session.mode')
      sessions.createIndex('by-date', 'session.metadata.challengeDate')
      sessions.createIndex('by-lesson', 'session.metadata.lessonId')
      db.createObjectStore('results', { keyPath: 'session.id' })
      db.createObjectStore('lessons', { keyPath: 'lessonId' })
      for (const store of ['settings', 'quarantine', 'leases', 'meta']) {
        db.createObjectStore(store)
      }
    },
  })
  await legacy.put('meta', 1, 'epoch')
  await legacy.put('sessions', { formatVersion: 2, revision: 4, session: makeSession() })
  legacy.close()
  const database = await openSudokuDatabase(name)
  databases.push({ name, close: () => database.close() })
  const prepareValidation = vi.fn(async () => undefined)
  const repository = createGameRepository(() => Promise.resolve(database), testEngine, {
    prepareValidation,
  })

  expect(await repository.readHome()).toMatchObject({
    ok: true,
    value: { coverage: 'pending', unfinishedCount: null },
  })
  expect(prepareValidation).not.toHaveBeenCalled()
  expect(await repository.maintainSummaries()).toMatchObject({
    ok: true,
    value: { coverage: 'ready', processed: 1 },
  })
  expect(await repository.readHome()).toMatchObject({
    ok: true,
    value: { coverage: 'ready', unfinishedCount: 1 },
  })
  expect(await database.get('sessions', 'fixture-free-session')).toMatchObject({ revision: 4 })
})

it('pages equal timestamps deterministically and rejects a cursor after a paired write', async () => {
  const { repository, ownership } = await setup()
  for (let index = 0; index < 32; index++) {
    const session = makeSession({ id: `row-${String(index).padStart(2, '0')}` })
    const token = await ownership.acquireOwnership(session.id, 'test-owner')
    if (!token.ok || !token.value) {
      throw new Error('Fixture lease failed')
    }
    expect((await repository.writeSession(session, 0, token.value)).ok).toBe(true)
  }
  const first = await repository.readSummaryPage({ kind: 'sessions', variant: 'classic' })
  if (!first.ok) {
    throw new Error('Expected first page')
  }
  expect(first.value.rows).toHaveLength(30)
  expect(first.value.rows[0]?.id).toBe('row-00')
  const next = await repository.readSummaryPage({
    kind: 'sessions',
    variant: 'classic',
    cursor: first.value.nextCursor,
  })
  expect(next).toMatchObject({
    ok: true,
    value: { rows: [{ id: 'row-30' }, { id: 'row-31' }], nextCursor: null },
  })

  const updated = makeSession({ id: 'row-00', elapsedMs: 1000 })
  const token = await ownership.acquireOwnership(updated.id, 'test-owner')
  if (!token.ok || !token.value) {
    throw new Error('Fixture lease failed')
  }
  await repository.writeSession(updated, 1, token.value)

  expect(
    await repository.readSummaryPage({
      kind: 'sessions',
      variant: 'classic',
      cursor: first.value.nextCursor,
    }),
  ).toMatchObject({
    ok: false,
    error: { kind: 'revision-conflict' },
  })
})

it('resolves today and a free slot from targeted keys while unrelated legacy history is pending', async () => {
  const { database, repository, prepareValidation } = await setup()
  await database.put(
    'meta',
    {
      generation: 1,
      sessions: { complete: false, after: null },
      results: { complete: false, after: null },
    },
    'summaries',
  )
  await database.put('sessions', {
    formatVersion: 2,
    revision: 1,
    session: makeSession({
      id: 'old-learning',
      mode: 'learning',
      metadata: { kind: 'learning', lessonId: 'rules' },
    }),
  })

  expect(await repository.readDailyStatuses('2026-10-17')).toMatchObject({
    ok: true,
    value: {
      coverage: 'ready',
      statuses: [
        { variant: 'classic', state: 'available' },
        { variant: 'diagonal', state: 'available' },
        { variant: 'jigsaw', state: 'available' },
        { variant: 'killer', state: 'available' },
        { variant: 'thermo', state: 'available' },
        { variant: 'arrow', state: 'available' },
      ],
    },
  })
  expect(await repository.readSlotSummary('free', 'classic')).toMatchObject({
    ok: true,
    value: { coverage: 'ready', summary: null },
  })
  expect(await repository.readSlotSummary('learning')).toMatchObject({
    ok: true,
    value: { coverage: 'pending', summary: null },
  })
  expect(prepareValidation).not.toHaveBeenCalled()
})

it('waits for asynchronous validation readiness before reading a full payload', async () => {
  const { database, validators } = await setup()
  await database.put('sessions', { formatVersion: 2, revision: 3, session: makeSession() })
  let release: (() => void) | undefined
  const ready = new Promise<void>((resolve) => {
    release = resolve
  })
  const repository = createGameRepository(() => Promise.resolve(database), validators, {
    prepareValidation: () => ready,
  })

  const reading = repository.readSession('fixture-free-session')
  await repository.readSettings()
  await repository.readLessonProgress()
  expect(validators.validatePuzzle).not.toHaveBeenCalled()
  release?.()

  expect(await reading).toMatchObject({ ok: true, value: { revision: 3 } })
})

it('keeps original result facts in projections when a completed session is written again', async () => {
  const { repository, ownership, database } = await setup()
  const session = makeSession()
  const completed = {
    ...session,
    entries: session.puzzle.solution.map((digit, cell) =>
      session.puzzle.givens[cell] ? 0 : digit,
    ),
    elapsedMs: 5000,
    completion: { completedAt: '2026-10-11T01:00:05.000Z', elapsedMs: 5000 },
  }
  const acquired = await ownership.acquireOwnership(session.id, 'test-owner')
  if (!acquired.ok || !acquired.value) {
    throw new Error('Fixture lease failed')
  }
  expect((await repository.writeSession(completed, 0, acquired.value)).ok).toBe(true)

  const changed = {
    ...completed,
    elapsedMs: 8000,
    completion: { completedAt: '2026-10-11T01:00:08.000Z', elapsedMs: 8000 },
  }
  expect((await repository.writeSession(changed, 1, acquired.value)).ok).toBe(true)
  const result = await repository.readSummaryPage({ kind: 'results' })

  expect(result).toMatchObject({
    ok: true,
    value: { rows: [{ elapsedMs: 5000, completedAt: '2026-10-11T01:00:05.000Z' }] },
  })
  expect(await database.get('sessionSummaries', session.id)).toMatchObject({
    revision: 2,
    elapsedMs: 8000,
  })
  expect(await repository.readOverview('classic', '2026-10-11')).toMatchObject({
    ok: true,
    value: {
      completedCount: 1,
      summary: { freeBests: { easy: { unassisted: 5000 } } },
    },
  })
})

it('aggregates compact summaries by variant, mode, difficulty and assistance with one row per ID', async () => {
  const { database, repository, validators, prepareValidation } = await setup()
  const unassistedFree = makeResultSummary({ id: 'free', elapsedMs: 60000 })
  const summaries = [
    unassistedFree,
    unassistedFree,
    makeResultSummary({ id: 'assisted-free', elapsedMs: 30000, assisted: true }),
    makeResultSummary({ id: 'slower-free', elapsedMs: 90000 }),
    makeResultSummary({ id: 'medium-free', elapsedMs: 80000, difficulty: 'medium' }),
    makeResultSummary({
      id: 'learn',
      elapsedMs: 1000,
      mode: 'learning',
      metadata: { kind: 'learning', lessonId: 'rules' },
    }),
    makeResultSummary({
      id: 'practice',
      elapsedMs: 1000,
      mode: 'daily',
      metadata: { kind: 'daily', challengeDate: '2026-10-11', formalAttempt: false },
    }),
    makeResultSummary({
      id: 'classic-daily',
      mode: 'daily',
      metadata: { kind: 'daily', challengeDate: '2026-10-11', formalAttempt: true },
    }),
    makeResultSummary({
      id: 'arrow-daily',
      variant: 'arrow',
      mode: 'daily',
      assisted: true,
      metadata: { kind: 'daily', challengeDate: '2026-10-11', formalAttempt: true },
    }),
    makeResultSummary({ id: 'arrow-free', variant: 'arrow', elapsedMs: 3000 }),
  ]
  for (const summary of summaries) {
    // IDB key identity permits one result per attempt, even if the same ID is written again.
    await database.put('resultSummaries', summary)
  }

  const classic = await repository.readOverview('classic', '2026-10-11')
  const arrow = await repository.readOverview('arrow', '2026-10-11')

  expect(classic).toMatchObject({
    ok: true,
    value: {
      completedCount: 7,
      summary: {
        freeBests: {
          easy: { assisted: 30000, unassisted: 60000 },
          medium: { assisted: null, unassisted: 80000 },
          hard: { assisted: null, unassisted: null },
          expert: { assisted: null, unassisted: null },
        },
        dailyTotals: { assisted: 0, unassisted: 1 },
        currentStreak: 1,
        longestStreak: 1,
      },
    },
  })
  expect(arrow).toMatchObject({
    ok: true,
    value: {
      completedCount: 2,
      summary: {
        freeBests: { easy: { assisted: null, unassisted: 3000 } },
        dailyTotals: { assisted: 1, unassisted: 0 },
        currentStreak: 1,
      },
    },
  })
  expect(await database.count('results')).toBe(0)
  expect(prepareValidation).not.toHaveBeenCalled()
  expect(validators.validatePuzzle).not.toHaveBeenCalled()
})

it('uses formal Beijing completion dates for year-boundary streaks while retaining late totals', async () => {
  const { database, repository } = await setup()
  const dates = [
    { id: 'd1', date: '2026-12-30', completedAt: '2026-12-30T01:00:00.000Z', assisted: false },
    // UTC is still December 30, but Beijing has entered December 31.
    { id: 'd2', date: '2026-12-31', completedAt: '2026-12-30T16:00:00.000Z', assisted: true },
    { id: 'd3', date: '2027-01-01', completedAt: '2027-01-01T01:00:00.000Z', assisted: false },
    // The formal result counts, but Beijing has already entered January 3.
    { id: 'late', date: '2027-01-02', completedAt: '2027-01-02T16:00:00.000Z', assisted: false },
  ]
  for (const { id, date, completedAt, assisted } of dates) {
    await database.put(
      'resultSummaries',
      makeResultSummary({
        id,
        completedAt,
        assisted,
        mode: 'daily',
        metadata: { kind: 'daily', challengeDate: date, formalAttempt: true },
      }),
    )
  }

  expect(await repository.readOverview('classic', '2027-01-02')).toMatchObject({
    ok: true,
    value: {
      completedCount: 4,
      summary: { currentStreak: 3, longestStreak: 3, dailyTotals: { assisted: 1, unassisted: 3 } },
    },
  })
  expect(await repository.readOverview('classic', '2027-01-03')).toMatchObject({
    ok: true,
    value: { summary: { currentStreak: 0, longestStreak: 3 } },
  })
  expect(await repository.readOverview('classic', '2026-12-30')).toMatchObject({
    ok: true,
    value: { summary: { currentStreak: 1, longestStreak: 1 } },
  })
})

it('preserves legacy payloads and pending coverage after inconclusive validation or cancellation', async () => {
  const { database } = await setup()
  const record = { formatVersion: 2, revision: 7, session: makeSession() }
  await database.put('sessions', record)
  await database.put(
    'meta',
    {
      generation: 1,
      sessions: { complete: false, after: null },
      results: { complete: true, after: null },
    },
    'summaries',
  )
  const repository = createGameRepository(() => Promise.resolve(database), {
    validatePuzzle: () => ({ status: 'incomplete' }),
    validateAssessment: testEngine.validateAssessment.bind(testEngine),
  })

  expect(await repository.maintainSummaries()).toMatchObject({
    ok: false,
    error: { kind: 'unavailable' },
  })
  const cancelled = new AbortController()
  cancelled.abort()
  expect(await repository.maintainSummaries(cancelled.signal)).toMatchObject({
    ok: false,
    error: { kind: 'unavailable' },
  })

  expect(await database.get('sessions', record.session.id)).toEqual(record)
  expect(await database.count('quarantine')).toBe(0)
  expect(await repository.readHome()).toMatchObject({
    ok: true,
    value: { coverage: 'pending', unfinishedCount: null },
  })
})

it('removes a quarantined canonical record and its projection atomically', async () => {
  const { database, repository, ownership } = await setup()
  const session = makeSession()
  const acquired = await ownership.acquireOwnership(session.id, 'test-owner')
  if (!acquired.ok || !acquired.value) {
    throw new Error('Fixture lease failed')
  }
  await repository.writeSession(session, 0, acquired.value)
  await database.put('sessions', {
    formatVersion: 2,
    revision: 1,
    session: { ...session, notes: [] },
  })

  expect(await repository.readSession(session.id)).toEqual({ ok: true, value: null })

  expect(await database.get('sessions', session.id)).toBeUndefined()
  expect(await database.get('sessionSummaries', session.id)).toBeUndefined()
  expect(await database.count('quarantine')).toBe(1)
  expect(await repository.readHome()).toMatchObject({ ok: true, value: { unfinishedCount: 0 } })
})

it('rebuilds projections atomically on portable restore and clears them with the dataset', async () => {
  const { repository, ownership, database, prepareValidation } = await setup()
  const session = makeSession()
  const acquired = await ownership.acquireOwnership(session.id, 'test-owner')
  if (!acquired.ok || !acquired.value) {
    throw new Error('Fixture lease failed')
  }
  await repository.writeSession(session, 0, acquired.value)
  const exported = await repository.exportBackup('2026-10-17T00:00:00.000Z')
  if (!exported.ok) {
    throw new Error('Fixture export failed')
  }

  expect(await repository.restoreBackup(JSON.stringify(exported.value.backup), 1)).toEqual({
    ok: true,
    value: undefined,
  })
  expect(await database.get('sessionSummaries', session.id)).toMatchObject({ revision: 1 })
  prepareValidation.mockClear()
  expect(await repository.readHome()).toMatchObject({
    ok: true,
    value: { coverage: 'ready', epoch: 2, unfinishedCount: 1 },
  })
  expect(prepareValidation).not.toHaveBeenCalled()
  expect(await repository.clearAll()).toEqual({ ok: true, value: undefined })
  expect(await database.count('sessionSummaries')).toBe(0)
  expect(await repository.readHome()).toMatchObject({
    ok: true,
    value: { coverage: 'ready', epoch: 3, unfinishedCount: 0 },
  })
})

it('rolls back canonical writes and projection generation when projection insertion aborts', async () => {
  const { repository, ownership, database } = await setup()
  const session = makeSession()
  const acquired = await ownership.acquireOwnership(session.id, 'test-owner')
  if (!acquired.ok || !acquired.value) {
    throw new Error('Fixture lease failed')
  }
  const before = await database.get('meta', 'summaries')
  const originalPut = IDBObjectStore.prototype.put
  const put = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
    this: IDBObjectStore,
    value,
    key,
  ) {
    const request = originalPut.call(this, value, key)
    if (this.name === 'sessionSummaries') {
      request.addEventListener('success', () => this.transaction.abort())
    }
    return request
  })

  const written = await repository.writeSession(session, 0, acquired.value)
  put.mockRestore()

  expect(written).toMatchObject({ ok: false, error: { kind: 'write-failed' } })
  expect(await database.count('sessions')).toBe(0)
  expect(await database.count('sessionSummaries')).toBe(0)
  expect(await database.get('meta', 'summaries')).toEqual(before)
})

it('rejects maintenance after validation triggers a concurrent dataset replacement', async () => {
  const { database, repository } = await setup()
  await database.put('sessions', { formatVersion: 2, revision: 1, session: makeSession() })
  await database.put(
    'meta',
    {
      generation: 1,
      sessions: { complete: false, after: null },
      results: { complete: true, after: null },
    },
    'summaries',
  )
  let reset: Promise<unknown> | undefined
  const repairing = createGameRepository(() => Promise.resolve(database), {
    validatePuzzle(input) {
      const replacement = database.transaction(
        ['sessions', 'sessionSummaries', 'meta'],
        'readwrite',
      )
      reset = Promise.all([
        replacement.objectStore('sessions').clear(),
        replacement.objectStore('sessionSummaries').clear(),
        replacement.objectStore('meta').put(2, 'epoch'),
        replacement.objectStore('meta').put(
          {
            generation: 1,
            sessions: { complete: true, after: null },
            results: { complete: true, after: null },
          },
          'summaries',
        ),
        replacement.done,
      ])
      return testEngine.validatePuzzle(input)
    },
    validateAssessment: testEngine.validateAssessment.bind(testEngine),
  })

  const result = await repairing.maintainSummaries()
  await reset

  expect(result).toMatchObject({ ok: false, error: { kind: 'revision-conflict' } })
  expect(await database.count('sessions')).toBe(0)
  expect(await database.count('sessionSummaries')).toBe(0)
  expect(await repository.readHome()).toMatchObject({
    ok: true,
    value: { epoch: 2, coverage: 'ready', unfinishedCount: 0 },
  })
})

it('quarantines an invalid original result and removes its stale projection on a paired save', async () => {
  const { database, repository, ownership } = await setup()
  const session = makeSession()
  const completed = {
    ...session,
    entries: session.puzzle.solution.map((digit, cell) =>
      session.puzzle.givens[cell] ? 0 : digit,
    ),
    completion: { completedAt: session.startedAt, elapsedMs: 0 },
  }
  const acquired = await ownership.acquireOwnership(session.id, 'test-owner')
  if (!acquired.ok || !acquired.value) {
    throw new Error('Fixture lease failed')
  }
  await repository.writeSession(completed, 0, acquired.value)
  await database.put('results', { session: { ...completed, notes: [] }, formatVersion: 2 })

  expect((await repository.writeSession(completed, 1, acquired.value)).ok).toBe(true)

  expect(await database.get('resultSummaries', session.id)).toBeUndefined()
  expect(await database.get('results', session.id)).toBeUndefined()
  expect(await database.get('quarantine', `results:${session.id}`)).toBeDefined()
})

it('continues legacy maintenance after quarantining a malformed non-string identity', async () => {
  const { database, repository } = await setup()
  await database.put('sessions', { session: { id: 42 } })
  await database.put('sessions', { formatVersion: 2, revision: 1, session: makeSession() })
  await database.put(
    'meta',
    {
      generation: 1,
      sessions: { complete: false, after: null },
      results: { complete: true, after: null },
    },
    'summaries',
  )

  expect(await repository.maintainSummaries()).toMatchObject({
    ok: true,
    value: { coverage: 'ready', processed: 2 },
  })

  expect(await database.count('quarantine')).toBe(1)
  expect(await repository.readHome()).toMatchObject({
    ok: true,
    value: { coverage: 'ready', unfinishedCount: 1 },
  })
})

it('finds legacy Classic slots without explicit rules and fences replacement of their saves', async () => {
  const { database, repository, ownership } = await setup()
  const session = makeSession({ id: 'legacy-classic' })
  const puzzle: Partial<typeof session.puzzle> = { ...session.puzzle }
  delete puzzle.rules
  await database.put('sessions', { formatVersion: 1, revision: 5, session: { ...session, puzzle } })
  await database.put(
    'meta',
    {
      generation: 1,
      sessions: { complete: false, after: null },
      results: { complete: true, after: null },
    },
    'summaries',
  )

  expect(await repository.readSlotSummary('free', 'classic')).toMatchObject({
    ok: true,
    value: { coverage: 'pending', summary: null },
  })
  expect(await repository.readSlot('free', 'classic')).toMatchObject({
    ok: true,
    value: {
      revision: 5,
      session: { id: 'legacy-classic', puzzle: { rules: { kind: 'classic' } } },
    },
  })
  const replacement = makeSession({ id: 'replacement' })
  const acquired = await ownership.acquireOwnership(replacement.id, 'test-owner')
  if (!acquired.ok || !acquired.value) {
    throw new Error('Fixture lease failed')
  }

  expect(await repository.replaceActiveSession(replacement, acquired.value, null)).toMatchObject({
    ok: false,
    error: { kind: 'revision-conflict' },
  })
  expect(await database.count('sessions')).toBe(1)
})

it('continues maintenance after quarantining empty and overlong string identities', async () => {
  const { database, repository } = await setup()
  for (const id of ['', 'a'.repeat(201)]) {
    await database.put('sessions', { session: { id } })
  }
  await database.put('sessions', { formatVersion: 2, revision: 1, session: makeSession() })
  await database.put(
    'meta',
    {
      generation: 1,
      sessions: { complete: false, after: null },
      results: { complete: true, after: null },
    },
    'summaries',
  )

  expect(await repository.maintainSummaries()).toMatchObject({
    ok: true,
    value: { coverage: 'ready', processed: 3 },
  })

  expect(await database.count('quarantine')).toBe(2)
  expect(await database.count('sessions')).toBe(1)
  expect(await repository.readHome()).toMatchObject({
    ok: true,
    value: { coverage: 'ready', unfinishedCount: 1 },
  })
})

it('repairs a missing slot projection after a targeted read invalidates ready coverage', async () => {
  const { database, repository, ownership, prepareValidation } = await setup()
  const session = makeSession()
  const acquired = await ownership.acquireOwnership(session.id, 'test-owner')
  if (!acquired.ok || !acquired.value) {
    throw new Error('Fixture lease failed')
  }
  await repository.writeSession(session, 0, acquired.value)
  await database.delete('sessionSummaries', session.id)
  prepareValidation.mockClear()

  expect(await repository.readSlotSummary('free', 'classic')).toMatchObject({
    ok: true,
    value: { coverage: 'pending', summary: null },
  })
  expect(prepareValidation).not.toHaveBeenCalled()
  expect(await repository.maintainSummaries()).toMatchObject({
    ok: true,
    value: { coverage: 'ready', processed: 1 },
  })

  expect(await repository.readSlotSummary('free', 'classic')).toMatchObject({
    ok: true,
    value: { coverage: 'ready', summary: { id: session.id, revision: 1 } },
  })
  prepareValidation.mockClear()
  expect(await repository.maintainSummaries()).toMatchObject({
    ok: true,
    value: { coverage: 'ready', processed: 0 },
  })
  expect(prepareValidation).not.toHaveBeenCalled()
})

it('repairs missing formal daily projections without treating the attempt as available', async () => {
  const { database, repository, ownership, prepareValidation } = await setup()
  const session = makeSession({
    id: 'daily:2026-10-17:formal',
    mode: 'daily',
    metadata: { kind: 'daily', challengeDate: '2026-10-17', formalAttempt: true },
    startedAt: '2026-10-17T01:00:00.000Z',
  })
  const acquired = await ownership.acquireOwnership(session.id, 'test-owner')
  if (!acquired.ok || !acquired.value) {
    throw new Error('Fixture lease failed')
  }
  expect((await repository.writeSession(session, 0, acquired.value)).ok).toBe(true)
  await database.delete('sessionSummaries', session.id)
  prepareValidation.mockClear()

  expect(await repository.readDailyStatuses('2026-10-17')).toMatchObject({
    ok: true,
    value: { coverage: 'pending', statuses: [] },
  })
  expect(prepareValidation).not.toHaveBeenCalled()
  expect(await repository.maintainSummaries()).toMatchObject({
    ok: true,
    value: { coverage: 'ready', processed: 1 },
  })

  const statuses = await repository.readDailyStatuses('2026-10-17')
  if (!statuses.ok) {
    throw new Error('Expected repaired daily status')
  }
  expect(statuses.value.coverage).toBe('ready')
  expect(statuses.value.statuses.find((status) => status.variant === 'classic')).toEqual({
    variant: 'classic',
    state: 'in-progress',
  })
})

for (const scenario of [
  { read: 'slot', store: 'sessionSummaries' },
  { read: 'page', store: 'sessionSummaries' },
  { read: 'page', store: 'resultSummaries' },
  { read: 'overview', store: 'resultSummaries' },
  { read: 'daily', store: 'sessionSummaries' },
  { read: 'daily', store: 'resultSummaries' },
] as const) {
  it(`repairs corrupt ${scenario.store} reached through ${scenario.read} without discarding canonical data`, async () => {
    const { database, repository, ownership, prepareValidation } = await setup()
    const session = makeSession(
      scenario.read === 'daily'
        ? {
            id: 'daily:2026-10-17:formal',
            mode: 'daily',
            metadata: { kind: 'daily', challengeDate: '2026-10-17', formalAttempt: true },
            startedAt: '2026-10-17T01:00:00.000Z',
          }
        : {},
    )
    const completed = {
      ...session,
      entries: session.puzzle.solution.map((digit, cell) =>
        session.puzzle.givens[cell] ? 0 : digit,
      ),
      completion: { completedAt: session.startedAt, elapsedMs: 0 },
    }
    const acquired = await ownership.acquireOwnership(session.id, 'test-owner')
    if (!acquired.ok || !acquired.value) {
      throw new Error('Fixture lease failed')
    }
    expect((await repository.writeSession(completed, 0, acquired.value)).ok).toBe(true)
    const projection = await database.get(scenario.store, session.id)
    if (!projection || typeof projection !== 'object') {
      throw new Error('Fixture projection missing')
    }
    await database.put(scenario.store, { ...projection, elapsedMs: -1 })
    prepareValidation.mockClear()
    const read = () => {
      if (scenario.read === 'slot') {
        return repository.readSlotSummary('free', 'classic')
      }
      if (scenario.read === 'overview') {
        return repository.readOverview('classic', '2026-10-17')
      }
      if (scenario.read === 'daily') {
        return repository.readDailyStatuses('2026-10-17')
      }
      return repository.readSummaryPage({
        kind: scenario.store === 'sessionSummaries' ? 'sessions' : 'results',
      })
    }

    expect(await read()).toMatchObject({ ok: true, value: { coverage: 'pending' } })
    expect(prepareValidation).not.toHaveBeenCalled()
    expect(await repository.maintainSummaries()).toMatchObject({
      ok: true,
      value: { coverage: 'ready', processed: 1 },
    })

    expect(await read()).toMatchObject({ ok: true, value: { coverage: 'ready' } })
    expect(await database.get('sessions', session.id)).toMatchObject({
      session: completed,
      revision: 1,
    })
    expect(await database.get('results', session.id)).toMatchObject({ session: completed })
    expect(await database.count('quarantine')).toBe(0)
  })
}

it('removes a corrupt orphan projection when rebuilding an affected summary store', async () => {
  const { database, repository, ownership } = await setup()
  const session = makeSession()
  const acquired = await ownership.acquireOwnership(session.id, 'test-owner')
  if (!acquired.ok || !acquired.value) {
    throw new Error('Fixture lease failed')
  }
  await repository.writeSession(session, 0, acquired.value)
  const projection = await database.get('sessionSummaries', session.id)
  if (!projection || typeof projection !== 'object') {
    throw new Error('Fixture projection missing')
  }
  await database.put('sessionSummaries', { ...projection, id: 'orphan', elapsedMs: -1 })

  expect(await repository.readSummaryPage({ kind: 'sessions' })).toMatchObject({
    ok: true,
    value: { coverage: 'pending' },
  })
  expect(await repository.maintainSummaries()).toMatchObject({
    ok: true,
    value: { coverage: 'ready' },
  })

  expect(await repository.readSummaryPage({ kind: 'sessions' })).toMatchObject({
    ok: true,
    value: { coverage: 'ready', rows: [{ id: session.id }] },
  })
  expect(await database.get('sessionSummaries', 'orphan')).toBeUndefined()
  expect(await database.count('sessions')).toBe(1)
})
