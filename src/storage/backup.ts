import type { IDBPDatabase } from 'idb'
import type { SudokuDatabase } from '@/storage/database'
import { commitTransaction } from '@/storage/database'
import { StorageConflict } from '@/storage/ownership'
import { isRecord } from '@/core/sudoku/types'
import type { ParseResult } from '@/core/sudoku/types'
import { SUDOKU_VARIANTS } from '@/core/sudoku/rules'
import type { SudokuVariant } from '@/core/sudoku/rules'
import {
  isIsoInstant,
  isNonnegativeInteger,
  parseLessonProgress,
  parseResultRecord,
  parseSessionRecord,
  parseSettings,
} from '@/storage/records'
import type { LessonProgress, ResultRecord, SessionRecord } from '@/storage/records'
import type { Settings } from '@/features/settings/model/preferences'
import { DEFAULT_SETTINGS } from '@/features/settings/model/preferences'

export const BACKUP_LIMITS = {
  bytes: 25 * 1024 * 1024,
  records: 10000,
  historyPerSession: 2000,
  historyTotal: 10000,
  nodes: 2000000,
  depth: 32,
} as const

export type LocalBackup = {
  backupVersion: 1
  exportedAt: string
  sessions: readonly SessionRecord[]
  results: readonly ResultRecord[]
  lessons: readonly LessonProgress[]
  settings: Settings
}
export type BackupExport = { backup: LocalBackup; excluded: number; quarantined: number }
export type BackupPreview = {
  exportedAt: string
  sessions: number
  results: number
  lessons: number
  variants: readonly { variant: SudokuVariant; sessions: number; results: number }[]
}

function resourceIssues(value: unknown): string | null {
  let nodes = 0
  function visit(current: unknown, depth: number): boolean {
    if (++nodes > BACKUP_LIMITS.nodes || depth > BACKUP_LIMITS.depth) {
      return false
    }
    if (Array.isArray(current)) {
      return (
        current.length <= BACKUP_LIMITS.nodes &&
        current.every((item: unknown) => visit(item, depth + 1))
      )
    }
    if (isRecord(current)) {
      return Object.values(current).every((item) => visit(item, depth + 1))
    }
    return true
  }
  if (!visit(value, 0)) {
    return 'Backup exceeds parser work or nesting limits'
  }
  if (
    !isRecord(value) ||
    !Array.isArray(value.sessions) ||
    !Array.isArray(value.results) ||
    !Array.isArray(value.lessons)
  ) {
    return 'Backup collections are required'
  }
  if (value.sessions.length + value.results.length + value.lessons.length > BACKUP_LIMITS.records) {
    return 'Backup exceeds record limits'
  }

  let history = 0
  for (const raw of [...value.sessions, ...value.results]) {
    if (!isRecord(raw) || !isRecord(raw.session)) {
      continue
    }
    const stacks = [raw.session.undoStack, raw.session.redoStack]
    const count = stacks.reduce<number>(
      (sum, stack) => sum + (Array.isArray(stack) ? stack.length : 0),
      0,
    )
    history += count
    if (count > BACKUP_LIMITS.historyPerSession || history > BACKUP_LIMITS.historyTotal) {
      return 'Backup exceeds history limits'
    }
  }
  return null
}

function parseCollection<T>(
  raw: readonly unknown[],
  decode: (value: unknown) => ParseResult<T>,
  identity: (value: T) => string,
): T[] {
  const ids = new Set<string>()
  const records: T[] = []
  for (const value of raw) {
    const parsed = decode(value)
    if (!parsed.valid) {
      throw new TypeError(parsed.issues.join('; '))
    }
    const id = identity(parsed.value)
    if (ids.has(id)) {
      throw new TypeError('Duplicate collection identity')
    }
    ids.add(id)
    records.push(parsed.value)
  }
  return records
}

function validateBackup(value: unknown): LocalBackup {
  const issue = resourceIssues(value)
  if (issue) {
    throw new TypeError(issue)
  }
  if (
    !isRecord(value) ||
    value.backupVersion !== 1 ||
    !isIsoInstant(value.exportedAt) ||
    !Array.isArray(value.sessions) ||
    !Array.isArray(value.results) ||
    !Array.isArray(value.lessons)
  ) {
    throw new TypeError('Unsupported backup version or invalid export time')
  }
  const sessions = parseCollection(
    value.sessions,
    parseSessionRecord,
    (record) => record.session.id,
  )
  const results = parseCollection(value.results, parseResultRecord, (record) => record.session.id)
  const lessons = parseCollection(value.lessons, parseLessonProgress, (record) => record.lessonId)
  const activeSlots = new Set<string>()
  for (const { session } of sessions) {
    if (session.mode === 'daily') {
      continue
    }
    const slot = session.mode === 'free' ? `free:${session.puzzle.rules.kind}` : 'learning'
    if (activeSlots.has(slot)) {
      throw new TypeError('Multiple sessions occupy one active game slot')
    }
    activeSlots.add(slot)
  }
  const settings = parseSettings(value.settings)
  if (!settings.valid) {
    throw new TypeError(settings.issues.join('; '))
  }
  const resultById = new Map(results.map((record) => [record.session.id, record.session]))
  for (const { session } of sessions) {
    const completed = resultById.get(session.id)
    if (!completed) {
      continue
    }
    // Results retain the first completion. An unfinished snapshot may coexist with that
    // result, but the identity/puzzle cannot change and two completion facts must agree.
    if (
      session.mode !== completed.mode ||
      session.startedAt !== completed.startedAt ||
      JSON.stringify(session.metadata) !== JSON.stringify(completed.metadata) ||
      JSON.stringify(session.puzzle) !== JSON.stringify(completed.puzzle) ||
      (session.completion &&
        JSON.stringify(session.completion) !== JSON.stringify(completed.completion))
    ) {
      throw new TypeError('Inconsistent session and result facts')
    }
  }
  return {
    backupVersion: 1,
    exportedAt: value.exportedAt,
    sessions,
    results,
    lessons,
    settings: settings.value,
  }
}

/** Validates the entire bounded file before returning any domain data; never writes storage. */
export function parseBackup(text: string): ParseResult<LocalBackup> {
  if (new TextEncoder().encode(text).byteLength > BACKUP_LIMITS.bytes) {
    return { valid: false, issues: ['Backup exceeds the 25 MiB file limit'] }
  }
  try {
    return { valid: true, value: validateBackup(JSON.parse(text)) }
  } catch (error) {
    return { valid: false, issues: [error instanceof Error ? error.message : 'Invalid backup'] }
  }
}

export function previewBackup(backup: LocalBackup): BackupPreview {
  return {
    exportedAt: backup.exportedAt,
    sessions: backup.sessions.length,
    results: backup.results.length,
    lessons: backup.lessons.length,
    variants: SUDOKU_VARIANTS.map((variant) => ({
      variant,
      sessions: backup.sessions.filter((record) => record.session.puzzle.rules.kind === variant)
        .length,
      results: backup.results.filter((record) => record.session.puzzle.rules.kind === variant)
        .length,
    })),
  }
}

/** Captures one committed readonly transaction. Invalid records are counted, never silently exported. */
export async function readBackupSnapshot(
  db: IDBPDatabase<SudokuDatabase>,
  exportedAt: string,
): Promise<BackupExport> {
  const transaction = db.transaction(
    ['sessions', 'results', 'lessons', 'settings', 'quarantine'],
    'readonly',
  )
  const [rawSessions, rawResults, rawLessons, rawSettings, quarantined] = await Promise.all([
    transaction.objectStore('sessions').getAll(),
    transaction.objectStore('results').getAll(),
    transaction.objectStore('lessons').getAll(),
    transaction.objectStore('settings').get('preferences'),
    transaction.objectStore('quarantine').count(),
    transaction.done,
  ])
  const issue = resourceIssues({
    sessions: rawSessions,
    results: rawResults,
    lessons: rawLessons,
    settings: rawSettings,
  })
  if (issue) {
    throw new TypeError(issue)
  }
  let excluded = 0
  function validRecords<T>(
    raw: readonly unknown[],
    parse: (value: unknown) => ParseResult<T>,
  ): T[] {
    const records: T[] = []
    for (const value of raw) {
      const parsed = parse(value)
      if (parsed.valid) {
        records.push(parsed.value)
      } else {
        excluded++
      }
    }
    return records
  }
  const settings = parseSettings(rawSettings ?? DEFAULT_SETTINGS)
  if (!settings.valid) {
    excluded++
  }
  const backup = validateBackup({
    backupVersion: 1,
    exportedAt,
    sessions: validRecords(rawSessions, parseSessionRecord),
    results: validRecords(rawResults, parseResultRecord),
    lessons: validRecords(rawLessons, parseLessonProgress),
    settings: settings.valid ? settings.value : DEFAULT_SETTINGS,
  })
  if (new TextEncoder().encode(JSON.stringify(backup)).byteLength > BACKUP_LIMITS.bytes) {
    throw new TypeError('Committed dataset exceeds backup limits')
  }
  return { backup, excluded, quarantined }
}

/** Replaces all player collections and their epoch atomically; the input must be fully decoded. */
export async function replaceBackupSnapshot(
  db: IDBPDatabase<SudokuDatabase>,
  backup: LocalBackup,
  expectedEpoch: number,
): Promise<void> {
  const transaction = db.transaction(
    ['sessions', 'results', 'lessons', 'settings', 'quarantine', 'leases', 'meta'],
    'readwrite',
  )
  await commitTransaction(transaction, async () => {
    const epoch = await transaction.objectStore('meta').get('epoch')
    if (
      !isNonnegativeInteger(epoch) ||
      !isNonnegativeInteger(expectedEpoch) ||
      epoch !== expectedEpoch ||
      !Number.isSafeInteger(epoch + 1)
    ) {
      throw new StorageConflict('revision-conflict', 'Local data changed after backup preview')
    }
    for (const store of [
      'sessions',
      'results',
      'lessons',
      'settings',
      'quarantine',
      'leases',
    ] as const) {
      await transaction.objectStore(store).clear()
    }
    for (const record of backup.sessions) {
      await transaction.objectStore('sessions').put({ ...record, revision: 1 })
    }
    for (const record of backup.results) {
      await transaction.objectStore('results').put(record)
    }
    for (const record of backup.lessons) {
      await transaction.objectStore('lessons').put({ formatVersion: 1, ...record })
    }
    await transaction
      .objectStore('settings')
      .put({ formatVersion: 1, ...backup.settings }, 'preferences')
    await transaction.objectStore('meta').put(epoch + 1, 'epoch')
  })
}
