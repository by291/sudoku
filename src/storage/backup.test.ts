import {
  createGameRepository,
  parseBackup,
  applySessionAction,
} from '../../tests/support/semantics'
import 'fake-indexeddb/auto'
import { afterEach, expect, it, vi } from 'vitest'
import { deleteDB, unwrap } from 'idb'
import { BACKUP_LIMITS } from '@/storage/backup'

import { openSudokuDatabase } from '@/storage/database'
import { createOwnershipCoordinator } from '@/storage/ownership'
import { DEFAULT_SETTINGS } from '@/features/settings/model/preferences'
import { makeSession, makeAssessment } from '../../tests/support/gameFixtures'
import { CORPUS_COMBINATIONS } from '../../tests/fixtures/generationCorpus'
import { VARIANT_TEMPLATES } from '@/core/sudoku/examples/variants'
import { CLASSIC_PUZZLE_FIXTURES } from '../../tests/fixtures/classicPuzzles'

import { createSaveQueue } from '@/storage/saveQueue'
import { deferred } from '../../tests/support/deferred'

const databases: { name: string; close(): void }[] = []
const exportedAt = '2026-10-14T03:00:00.000Z'
function envelope() {
  return {
    backupVersion: 1,
    exportedAt,
    sessions: [],
    results: [],
    lessons: [],
    settings: { ...DEFAULT_SETTINGS },
  }
}
async function setup() {
  const name = crypto.randomUUID()
  const database = await openSudokuDatabase(name)
  databases.push({ name, close: () => database.close() })
  const reset = vi.fn()
  return {
    database,
    reset,
    repository: createGameRepository(() => Promise.resolve(database), { onReset: reset }),
  }
}
afterEach(async () => {
  for (const database of databases.splice(0)) {
    database.close()
    await deleteDB(database.name)
  }
})

it.each(CORPUS_COMBINATIONS)(
  'round-trips $variant/$difficulty domain facts and revision rebasing',
  async ({ variant, difficulty }) => {
    const { database, repository, reset } = await setup()
    const template =
      variant === 'classic'
        ? CLASSIC_PUZZLE_FIXTURES.find((item) => item.difficulty === difficulty)
        : VARIANT_TEMPLATES[variant][difficulty][0]
    if (!template) {
      throw new Error('Missing backup fixture')
    }
    const session = makeSession({
      id: `backup-${variant}-${difficulty}`,
      puzzle: {
        ...makeSession().puzzle,
        ...template,
        rules:
          variant === 'classic'
            ? { kind: 'classic' }
            : VARIANT_TEMPLATES[variant][difficulty][0].rules,
      },
      elapsedMs: 27000,
    })
    await database.put('sessions', { formatVersion: 2, revision: 83, session })
    await repository.writeSettings(
      { ...DEFAULT_SETTINGS, theme: 'dark', lessonStages: { 'diagonal-combined': 2 } },
      1,
    )
    await repository.writeLessonProgress({ lessonId: 'rules', completedAt: exportedAt }, 1)

    const result = await repository.exportBackup(exportedAt)
    expect(result.ok).toBe(true)
    if (!result.ok) {
      throw new Error(result.error.message)
    }
    expect(result.value.excluded).toBe(0)
    const text = JSON.stringify(result.value.backup)
    expect(parseBackup(text).valid).toBe(true)
    await repository.clearAll()
    expect(await repository.restoreBackup(text, 2)).toEqual({ ok: true, value: undefined })

    expect(await repository.listSessions()).toEqual({
      ok: true,
      value: [{ formatVersion: 2, revision: 1, session }],
    })
    expect(await repository.readSettings()).toMatchObject({
      ok: true,
      value: { theme: 'dark', lessonStages: { 'diagonal-combined': 2 } },
    })
    expect(await database.get('meta', 'epoch')).toBe(3)
    expect(reset).toHaveBeenCalledTimes(2)
  },
)

it('preserves formal daily and practice results, original time and optional assessment availability', async () => {
  const { database, repository } = await setup()
  for (const [mode, metadata, id] of [
    [
      'daily',
      { kind: 'daily', challengeDate: '2026-10-11', formalAttempt: true },
      'daily:2026-10-11:formal',
    ],
    [
      'daily',
      { kind: 'daily', challengeDate: '2026-10-11', formalAttempt: false },
      'daily-practice',
    ],
    ['learning', { kind: 'learning', lessonId: 'rules' }, 'practice-rules'],
  ] as const) {
    const session = makeSession({
      id,
      mode,
      metadata,
      elapsedMs: 71300,
      assessment: makeAssessment(),
    })
    session.entries = session.puzzle.solution.map((digit, cell) =>
      session.puzzle.givens[cell] ? 0 : digit,
    )
    session.completion = { elapsedMs: 71300, completedAt: exportedAt }
    await database.put('results', {
      formatVersion: 2,
      session: {
        ...session,
        assessment: { status: 'unavailable', reason: 'unsupported-version', issues: [] },
      },
    })
  }
  const exported = await repository.exportBackup(exportedAt)
  if (!exported.ok) {
    throw new Error(exported.error.message)
  }
  expect(await repository.restoreBackup(JSON.stringify(exported.value.backup), 1)).toMatchObject({
    ok: true,
  })
  expect(await repository.listResults()).toMatchObject({
    ok: true,
    value: [
      { session: { id: 'daily-practice', metadata: { formalAttempt: false }, elapsedMs: 71300 } },
      {
        session: {
          id: 'daily:2026-10-11:formal',
          metadata: { formalAttempt: true },
          assessment: { status: 'unavailable', reason: 'unsupported-version', issues: [] },
        },
      },
      { session: { id: 'practice-rules', mode: 'learning', completion: { elapsedMs: 71300 } } },
    ],
  })
})

it('preserves notes, both history stacks, assistance and legacy puzzle identity', async () => {
  const { database, repository } = await setup()
  let session = makeSession({
    puzzle: { ...makeSession().puzzle, puzzleVersion: 'sudoku-v1' },
    elapsedMs: 98700,
  })
  for (const action of [
    { kind: 'toggle-note', cell: 2, digit: 4 },
    { kind: 'enter', cell: 3, digit: 6 },
    { kind: 'check' },
    { kind: 'undo' },
  ] as const) {
    session = applySessionAction(session, action).session
  }
  expect(session.notes[2]).toBe(8)
  expect(session.undoStack).toHaveLength(1)
  expect(session.redoStack).toHaveLength(1)
  await database.put('sessions', { formatVersion: 1, revision: 8, session })

  const snapshot = await repository.exportBackup(exportedAt)
  if (!snapshot.ok) {
    throw new Error(snapshot.error.message)
  }
  await repository.restoreBackup(JSON.stringify(snapshot.value.backup), 1)

  expect(await repository.listSessions()).toEqual({
    ok: true,
    value: [{ formatVersion: 2, revision: 1, session }],
  })
  expect(session.assistance).toMatchObject({ assisted: true, checkCount: 1 })
})

it.each([
  'version',
  'duplicate',
  'history',
  'rules',
  'result',
  'completion',
  'records',
  'history-limit',
])('rejects invalid %s before changing a dataset', async (failure) => {
  const { database, repository, reset } = await setup()
  const session = makeSession()
  await database.put('sessions', { formatVersion: 2, revision: 7, session })
  const value = {
    ...envelope(),
    sessions: [{ formatVersion: 2, revision: 7, session }],
    results: [] as unknown[],
  }
  if (failure === 'version') {
    value.backupVersion = 2
  }
  if (failure === 'duplicate') {
    value.sessions.push(value.sessions[0])
  }
  if (failure === 'history') {
    value.sessions[0].session = {
      ...session,
      undoStack: [
        {
          before: { entries: Array(81).fill(0), notes: Array(81).fill(0) },
          after: { entries: Array(81).fill(1), notes: Array(81).fill(0) },
        },
      ],
    }
  }
  if (failure === 'rules') {
    value.sessions[0].session.puzzle = { ...session.puzzle, rules: { kind: 'jigsaw', regions: [] } }
  }
  if (failure === 'result') {
    value.results.push({ formatVersion: 2, session })
  }
  if (failure === 'completion') {
    const completed = {
      ...session,
      entries: session.puzzle.solution.map((digit, cell) =>
        session.puzzle.givens[cell] ? 0 : digit,
      ),
      completion: { elapsedMs: 0, completedAt: exportedAt },
    }
    value.sessions[0].session = completed
    value.results.push({
      formatVersion: 2,
      session: {
        ...completed,
        completion: { ...completed.completion, completedAt: session.startedAt },
      },
    })
  }
  if (failure === 'records') {
    value.results = Array(BACKUP_LIMITS.records + 1).fill({})
  }
  if (failure === 'history-limit') {
    value.sessions[0].session.undoStack = Array(BACKUP_LIMITS.historyPerSession + 1).fill({})
  }
  expect((await repository.restoreBackup(JSON.stringify(value), 1)).ok).toBe(false)
  expect(await database.count('sessions')).toBe(1)
  expect(await database.get('meta', 'epoch')).toBe(1)
  expect(reset).not.toHaveBeenCalled()
})

it('bounds bytes, nesting and parser work before domain decoding', () => {
  expect(parseBackup(' '.repeat(BACKUP_LIMITS.bytes + 1)).valid).toBe(false)
  expect(parseBackup('{').valid).toBe(false)
  expect(
    parseBackup(JSON.stringify({ ...envelope(), extra: Array(BACKUP_LIMITS.nodes + 1).fill(0) }))
      .valid,
  ).toBe(false)
  let nested: unknown = 0
  for (let depth = 0; depth <= BACKUP_LIMITS.depth; depth++) {
    nested = [nested]
  }
  expect(parseBackup(JSON.stringify({ ...envelope(), extra: nested })).valid).toBe(false)
})

it.each(['free', 'learning'] as const)(
  'rejects duplicate %s active slots without mutating current data',
  async (mode) => {
    const { database, repository } = await setup()
    const metadata =
      mode === 'free'
        ? ({ kind: 'free' } as const)
        : ({ kind: 'learning', lessonId: 'rules' } as const)
    await database.put('sessions', {
      formatVersion: 2,
      revision: 3,
      session: makeSession({ id: 'keep-current' }),
    })
    const sessions = ['duplicate-slot-a', 'duplicate-slot-b'].map((id) => ({
      formatVersion: 2,
      revision: 1,
      session: makeSession({ id, mode, metadata }),
    }))

    expect(
      (await repository.restoreBackup(JSON.stringify({ ...envelope(), sessions }), 1)).ok,
    ).toBe(false)
    expect(await database.count('sessions')).toBe(1)
    expect(await database.get('meta', 'epoch')).toBe(1)
  },
)

it('exports committed records consistently and reports exclusions without moving them', async () => {
  const { database, repository } = await setup()
  await database.put('sessions', { formatVersion: 2, revision: 1, session: makeSession() })
  await database.put('sessions', { session: { id: 'invalid' } })
  await database.put('quarantine', { broken: true }, 'broken')
  const result = await repository.exportBackup(exportedAt)
  expect(result).toMatchObject({
    ok: true,
    value: {
      excluded: 1,
      quarantined: 1,
      backup: { sessions: [{ session: { id: makeSession().id } }] },
    },
  })
  expect(await database.count('sessions')).toBe(2)
})

it('rolls back replacement and epoch together when a transaction aborts', async () => {
  const { database, repository, reset } = await setup()
  await database.put('sessions', { formatVersion: 2, revision: 7, session: makeSession() })
  const raw = unwrap(database)
  const original = raw.transaction.bind(raw)
  const spy = vi.spyOn(raw, 'transaction').mockImplementation((...args) => {
    const transaction = original(...args)
    queueMicrotask(() => transaction.abort())
    return transaction
  })
  expect((await repository.restoreBackup(JSON.stringify(envelope()), 1)).ok).toBe(false)
  spy.mockRestore()
  expect(await database.count('sessions')).toBe(1)
  expect(await database.get('meta', 'epoch')).toBe(1)
  expect(reset).not.toHaveBeenCalled()
})

it('fences preview epochs, existing leases and queued old dataset writes', async () => {
  const { database, repository } = await setup()
  const ownership = createOwnershipCoordinator(() => Promise.resolve(database), { channel: null })
  const session = makeSession()
  const lease = await ownership.acquireOwnership(session.id, 'old-tab')
  if (!lease.ok || !lease.value) {
    throw new Error('Missing lease')
  }
  await repository.writeSession(session, 0, lease.value)
  expect((await repository.restoreBackup(JSON.stringify(envelope()), 0)).ok).toBe(false)
  expect(await repository.restoreBackup(JSON.stringify(envelope()), 1)).toMatchObject({ ok: true })
  expect(await database.count('leases')).toBe(0)
  expect((await repository.writeSession(session, 1, lease.value)).ok).toBe(false)
  expect((await repository.writeSettings(DEFAULT_SETTINGS, 1)).ok).toBe(false)
  expect(
    (await repository.writeLessonProgress({ lessonId: 'rules', completedAt: exportedAt }, 1)).ok,
  ).toBe(false)
  expect(await database.count('sessions')).toBe(0)
  ownership.dispose()
})

it('rejects a save queued before restoration but delivered after the epoch changes', async () => {
  const { database, repository } = await setup()
  const ownership = createOwnershipCoordinator(() => Promise.resolve(database), { channel: null })
  const session = makeSession()
  const lease = await ownership.acquireOwnership(session.id, 'pending-tab')
  if (!lease.ok || !lease.value) {
    throw new Error('Missing lease')
  }
  await repository.writeSession(session, 0, lease.value)
  const queue = createSaveQueue(repository, lease.value, 1)
  const gate = deferred<void>()
  const original = repository.writeSession.bind(repository)
  const spy = vi.spyOn(repository, 'writeSession').mockImplementation(async (...args) => {
    await gate.promise
    return original(...args)
  })
  const saving = queue.enqueue({ ...session, elapsedMs: 1000 })
  await vi.waitFor(() => expect(spy).toHaveBeenCalledOnce())

  await repository.restoreBackup(JSON.stringify(envelope()), 1)
  gate.resolve()
  expect((await saving).ok).toBe(false)
  expect(await database.count('sessions')).toBe(0)

  queue.dispose()
  ownership.dispose()
})
