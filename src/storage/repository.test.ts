import { createGameRepository } from '../../tests/support/semantics'
import 'fake-indexeddb/auto'
import { afterEach, expect, it, vi } from 'vitest'
import { deleteDB, unwrap } from 'idb'
import { openSudokuDatabase } from '@/storage/database'

import { makeAssessment, makeSession } from '../../tests/support/gameFixtures'
import { deferred } from '../../tests/support/deferred'
import { createOwnershipCoordinator } from '@/storage/ownership'
import { VARIANT_FIXTURES } from '../../tests/fixtures/variants'

const databases: { name: string; close: () => void }[] = []

async function setup() {
  const name = crypto.randomUUID()
  const database = await openSudokuDatabase(name)
  databases.push({ name, close: () => database.close() })

  return { database, repository: createGameRepository(() => Promise.resolve(database)) }
}

afterEach(async () => {
  for (const database of databases.splice(0)) {
    database.close()
    await deleteDB(database.name)
  }
})

it('keeps corrupt assessment metadata out of quarantine and preserves completed snapshots', async () => {
  const { database, repository } = await setup()
  const session = makeSession()
  await database.put('sessions', {
    formatVersion: 2,
    revision: 8,
    session: { ...session, assessment: null },
  })
  const completed = makeSession({ assessment: makeAssessment() })
  completed.entries = completed.puzzle.solution.map((digit, cell) =>
    completed.puzzle.givens[cell] ? 0 : digit,
  )
  completed.completion = { completedAt: completed.startedAt, elapsedMs: 0 }
  await database.put('results', { formatVersion: 2, session: completed })

  expect(await repository.listSessions()).toMatchObject({
    ok: true,
    value: [
      {
        revision: 8,
        session: { ...session, assessment: { status: 'unavailable', reason: 'invalid-summary' } },
      },
    ],
  })
  expect(await repository.listResults()).toEqual({
    ok: true,
    value: [{ formatVersion: 2, session: completed }],
  })
  expect(await database.count('quarantine')).toBe(0)
})
it('upgrades an empty database and round-trips settings and progress', async () => {
  const { database, repository } = await setup()

  expect(database.objectStoreNames.contains('sessions')).toBe(true)
  const settings = {
    theme: 'dark',
    showTimer: false,
    highlightConflicts: true,
    currentLessonId: null,
  } as const

  expect(await repository.writeSettings(settings, 1)).toEqual({ ok: true, value: undefined })
  expect(await repository.readSettings()).toEqual({ ok: true, value: settings })
  const progress = { lessonId: 'rules', completedAt: '2026-10-11T01:00:00.000Z' }
  await repository.writeLessonProgress(progress, 1)

  expect(await repository.readLessonProgress()).toEqual({ ok: true, value: [progress] })
})
it('isolates corrupt records and preserves valid saves during cleanup', async () => {
  const { database, repository } = await setup()

  expect(database.objectStoreNames.contains('sessions')).toBe(true)
  const valid = { formatVersion: 1, revision: 0, session: makeSession() }
  await database.put('sessions', valid)
  await database.put('sessions', {
    ...valid,
    session: { ...valid.session, id: 'corrupt', notes: [512] },
  })

  expect(await repository.listSessions()).toEqual({
    ok: true,
    value: [{ ...valid, formatVersion: 2 }],
  })
  expect(await database.count('quarantine')).toBe(1)
  expect(await repository.countQuarantined()).toEqual({ ok: true, value: 1 })
  await repository.removeQuarantined()

  expect(await database.count('quarantine')).toBe(0)
  expect(await database.count('sessions')).toBe(1)
})
it('returns an explicit failure when IndexedDB cannot open', async () => {
  const repository = createGameRepository(() => Promise.reject(new Error('Storage blocked')))

  expect(await repository.listSessions()).toMatchObject({
    ok: false,
    error: { kind: 'unavailable' },
  })
})

it('classifies a failed database acquisition as unavailable for a write operation', async () => {
  const repository = createGameRepository(() => Promise.reject(new Error('Storage blocked')))

  const result = await repository.writeLessonProgress(
    { lessonId: 'rules', completedAt: '2026-10-11T01:00:00.000Z' },
    1,
  )

  expect(result).toMatchObject({ ok: false, error: { kind: 'unavailable' } })
})

it('does not claim write success after its connection has closed', async () => {
  const { database, repository } = await setup()
  database.close()
  const result = await repository.writeSettings(
    {
      theme: 'light',
      showTimer: true,
      highlightConflicts: true,
      currentLessonId: null,
    },
    1,
  )

  expect(result).toMatchObject({ ok: false, error: { kind: 'write-failed' } })
})

it('reports an aborted transaction without committing preferences or leaking a rejection', async () => {
  const { database, repository } = await setup()
  const raw = unwrap(database)
  const original = raw.transaction.bind(raw)
  const spy = vi.spyOn(raw, 'transaction').mockImplementation((stores, mode, options) => {
    const transaction = original(stores, mode, options)
    queueMicrotask(() => transaction.abort())

    return transaction
  })
  const result = await repository.writeSettings(
    {
      theme: 'dark',
      showTimer: true,
      highlightConflicts: true,
      currentLessonId: null,
    },
    1,
  )
  spy.mockRestore()

  expect(result).toMatchObject({ ok: false, error: { kind: 'write-failed' } })
  expect(await database.get('settings', 'preferences')).toBeUndefined()
})
for (const store of ['settings', 'lessons'] as const) {
  it(`fences a delayed ${store} write against a concurrent clear-all`, async () => {
    const { database, repository } = await setup()
    const gate = deferred<void>()
    const entered = deferred<void>()
    const otherTab = createGameRepository(async () => {
      entered.resolve()
      await gate.promise

      return database
    })
    const pending =
      store === 'settings'
        ? otherTab.writeSettings(
            { theme: 'dark', showTimer: true, highlightConflicts: true, currentLessonId: 'rules' },
            1,
          )
        : otherTab.writeLessonProgress(
            { lessonId: 'rules', completedAt: '2026-10-11T01:00:00.000Z' },
            1,
          )
    await entered.promise

    expect(await repository.clearAll()).toEqual({ ok: true, value: undefined })
    gate.resolve()

    expect(await pending).toMatchObject({ ok: false, error: { kind: 'revision-conflict' } })
    expect(await database.count(store)).toBe(0)
  })
}

it('replaces only the requested free variant slot and maintains schema v2', async () => {
  const { database, repository } = await setup()
  const owner = createOwnershipCoordinator(() => Promise.resolve(database), { channel: null })

  async function acquire(id: string) {
    const result = await owner.acquireOwnership(id, 'test-tab')
    if (!result.ok || !result.value) {
      throw new Error('Expected edit lease')
    }

    return result.value
  }

  try {
    const classic = makeSession({ id: 'classic-save' })
    const arrow = makeSession({
      id: 'arrow-save',
      puzzle: { ...makeSession().puzzle, ...VARIANT_FIXTURES.arrow },
    })
    const classicToken = await acquire(classic.id)
    const arrowToken = await acquire(arrow.id)
    const outcomes = await Promise.all([
      repository.replaceActiveSession(classic, classicToken, null),
      repository.replaceActiveSession(arrow, arrowToken, null),
    ])

    expect(outcomes.every((result) => result.ok)).toBe(true)
    const replacement = { ...arrow, id: 'arrow-new' }
    const nextToken = await acquire(replacement.id)

    expect(
      await repository.replaceActiveSession(replacement, nextToken, {
        id: classic.id,
        revision: 1,
        token: classicToken,
      }),
    ).toMatchObject({ ok: false, error: { kind: 'revision-conflict' } })
    const controller = new AbortController()
    controller.abort()

    expect(
      (
        await repository.replaceActiveSession(
          replacement,
          nextToken,
          { id: arrow.id, revision: 1, token: arrowToken },
          controller.signal,
        )
      ).ok,
    ).toBe(false)
    expect(await database.count('sessions')).toBe(2)
    expect(
      await repository.replaceActiveSession(replacement, nextToken, {
        id: arrow.id,
        revision: 0,
        token: arrowToken,
      }),
    ).toMatchObject({ ok: false, error: { kind: 'revision-conflict' } })
    expect(
      await repository.replaceActiveSession(replacement, nextToken, {
        id: arrow.id,
        revision: 1,
        token: arrowToken,
      }),
    ).toMatchObject({ ok: true, value: { formatVersion: 2 } })
    const remaining = await repository.listSessions()
    if (!remaining.ok) {
      throw new Error('Expected valid remaining saves')
    }

    expect(remaining.value.map((record) => record.session.id).sort()).toEqual([
      'arrow-new',
      'classic-save',
    ])
    expect(database.version).toBe(2)
  } finally {
    owner.dispose()
  }
})

it('preserves the single learning practice slot across variants', async () => {
  const { database, repository } = await setup()
  const owner = createOwnershipCoordinator(() => Promise.resolve(database), { channel: null })
  const classic = makeSession({
    id: 'practice-classic',
    mode: 'learning',
    metadata: { kind: 'learning', lessonId: 'rules' },
  })
  const arrow = {
    ...classic,
    id: 'practice-arrow',
    puzzle: { ...classic.puzzle, ...VARIANT_FIXTURES.arrow },
  }
  const first = await owner.acquireOwnership(classic.id, 'tab')
  const next = await owner.acquireOwnership(arrow.id, 'tab')
  if (!first.ok || !first.value || !next.ok || !next.value) {
    throw new Error('Expected leases')
  }

  try {
    expect((await repository.replaceActiveSession(classic, first.value, null)).ok).toBe(true)
    expect(await repository.replaceActiveSession(arrow, next.value, null)).toMatchObject({
      ok: false,
      error: { kind: 'revision-conflict' },
    })
    expect(
      (
        await repository.replaceActiveSession(arrow, next.value, {
          id: classic.id,
          revision: 1,
          token: first.value,
        })
      ).ok,
    ).toBe(true)
    expect(await database.count('sessions')).toBe(1)
  } finally {
    owner.dispose()
  }
})

it('upgrades a legacy completed save on write and quarantines unsupported bytes with reasons', async () => {
  const { database, repository } = await setup()
  const owner = createOwnershipCoordinator(() => Promise.resolve(database), { channel: null })
  const session = makeSession({
    id: 'daily:2026-10-11:formal',
    mode: 'daily',
    metadata: { kind: 'daily', challengeDate: '2026-10-11', formalAttempt: true },
  })
  session.entries = session.puzzle.solution.map((digit, cell) =>
    session.puzzle.givens[cell] === 0 ? digit : 0,
  )
  session.completion = { completedAt: session.startedAt, elapsedMs: 0 }
  const { rules, ...puzzle } = session.puzzle

  expect(rules.kind).toBe('classic')
  const legacySession = { ...session, puzzle }
  await database.put('sessions', { formatVersion: 1, revision: 9, session: legacySession })
  await database.put('results', { formatVersion: 1, session: legacySession })
  const malformed = { formatVersion: 99, revision: 1, session: { ...session, id: 'foreign' } }
  await database.put('sessions', malformed)
  const parsed = await repository.listSessions()
  if (!parsed.ok) {
    throw new Error('Expected valid legacy normalization')
  }

  expect(parsed.value).toMatchObject([
    {
      formatVersion: 2,
      revision: 9,
      session: { id: session.id, puzzle: { rules: { kind: 'classic' } } },
    },
  ])
  expect(await database.get('quarantine', 'sessions:foreign')).toMatchObject({
    value: malformed,
    issues: ['Unsupported session format or revision'],
  })
  const lease = await owner.acquireOwnership(session.id, 'migration-tab')
  if (!lease.ok || !lease.value) {
    throw new Error('Expected migration lease')
  }

  try {
    expect(await repository.writeSession(parsed.value[0].session, 9, lease.value)).toMatchObject({
      ok: true,
      value: { formatVersion: 2, revision: 10 },
    })
    expect(await database.get('results', session.id)).toMatchObject({ formatVersion: 2, session })
    expect(await database.count('results')).toBe(1)
  } finally {
    owner.dispose()
  }
})

it('keeps saved records when synchronous semantic validation exhausts its budget', async () => {
  const { database } = await setup()
  const record = { formatVersion: 2, revision: 7, session: makeSession() }
  await database.put('sessions', record)
  const { createTestEngine } = await import('../../tests/support/wasm')
  const engine = await createTestEngine()
  const { createGameRepository: createRepository } = await import('@/storage/repository')
  const repository = createRepository(() => Promise.resolve(database), {
    ...engine,
    validatePuzzle: () => ({ status: 'budget-exhausted' }),
  })
  const owner = createOwnershipCoordinator(() => Promise.resolve(database), { channel: null })
  const lease = await owner.acquireOwnership(record.session.id, 'budget-test')
  if (!lease.ok || !lease.value) {
    throw new Error('Fixture lease failed')
  }

  try {
    expect(await repository.listSessions()).toMatchObject({
      ok: false,
      error: { kind: 'unavailable' },
    })
    // A semantic budget failure must outrank the write-failed policy and preserve the saved revision.
    expect(
      await repository.writeSession(record.session, record.revision, lease.value),
    ).toMatchObject({
      ok: false,
      error: { kind: 'unavailable' },
    })
    expect(await database.get('sessions', record.session.id)).toEqual(record)
    expect(await database.count('quarantine')).toBe(0)
  } finally {
    owner.dispose()
    engine.dispose()
  }
})
