import { createRequire } from 'node:module'
import 'fake-indexeddb/auto'
import { readFileSync, writeFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { format } from 'prettier'
import { openSudokuDatabase } from '@/storage/database'
import { readBackupSnapshot, parseBackup, replaceBackupSnapshot } from '@/storage/backup'
import { createMainEngine } from '@/sudoku/mainEngine'
import { createSession, commitBoardEdit, applySessionAction } from '@/features/game/model/session'
import { getDailyFormalId } from '@/features/game/model/daily'
import type { Puzzle, PuzzleAssessment } from '@/sudoku/contracts'
import type { SessionMetadata } from '@/features/game/model/session'

const fixturePath = 'android/core/domain/src/test/resources/interop/web-backup-v1.json'
const androidPath = 'android/core/domain/build/interop/android-backup-v1.json'

describe('portable Android backup interoperability', () => {
  test('exports the actual committed Web format with all nineteen identities', async () => {
    // Literal sealed-reference fixtures are reused as shared input, not new mathematical oracles.
    const corpus: unknown[] = JSON.parse(
      readFileSync('tests/fixtures/engine-contracts/generation.json', 'utf8'),
    )
    const selected = new Map<string, { puzzle: Puzzle; assessment: PuzzleAssessment }>()
    for (const raw of corpus) {
      const record = raw as {
        expected: {
          status: string
          puzzle?: Puzzle
          assessment?: Extract<PuzzleAssessment, { status: 'rated' }>['summary']
        }
      }
      const result = record.expected
      if (result.status === 'ready' && result.puzzle && result.assessment) {
        const key = `${result.puzzle.rules.kind}:${result.puzzle.difficulty}`
        if (!selected.has(key))
          selected.set(key, {
            puzzle: result.puzzle,
            assessment: { status: 'rated', summary: result.assessment },
          })
      }
    }
    expect(selected.size).toBe(19)
    const engine = await createMainEngine(
      new WebAssembly.Module(
        readFileSync(createRequire(import.meta.url).resolve('@sudoku/wasm/binary')),
      ),
    )
    const database = await openSudokuDatabase('android-interop-export')
    try {
      let index = 0
      for (const { puzzle, assessment } of selected.values()) {
        const date = `2026-10-${String(index + 1).padStart(2, '0')}`
        const metadata: SessionMetadata =
          index === 0
            ? { kind: 'free' }
            : index === 1
              ? { kind: 'learning', lessonId: 'rules' }
              : { kind: 'daily', challengeDate: date, formalAttempt: true }
        const id =
          metadata.kind === 'daily' ? getDailyFormalId(date, puzzle.rules.kind) : `interop:${index}`
        let session = createSession(puzzle, metadata, id, '2026-10-16T01:02:03.004Z', assessment)
        const cell = puzzle.givens.findIndex((value) => value === 0)
        const prepared = engine.prepare(puzzle.rules)
        try {
          const note = { kind: 'toggle-note', cell, digit: puzzle.solution[cell] } as const
          session = commitBoardEdit(
            session,
            prepared.edit({
              givens: [...puzzle.givens],
              entries: [...session.entries],
              notes: [...session.notes],
              action: note,
            }).result,
            note,
          ).session
          const entry = { kind: 'enter', cell, digit: puzzle.solution[cell] } as const
          session = commitBoardEdit(
            session,
            prepared.edit({
              givens: [...puzzle.givens],
              entries: [...session.entries],
              notes: [...session.notes],
              action: entry,
            }).result,
            entry,
          ).session
          session = applySessionAction(session, { kind: 'undo' }).session
        } finally {
          prepared.dispose()
        }
        await database.put('sessions', { formatVersion: 2, revision: index + 1, session })
        const completed = {
          ...session,
          entries: puzzle.solution.map((digit, cell) => (puzzle.givens[cell] === 0 ? digit : 0)),
          notes: Array(81).fill(0),
          undoStack: [],
          redoStack: [],
          elapsedMs: index + 123,
          completion: { elapsedMs: index + 123, completedAt: '2026-10-16T01:02:04.005Z' },
        }
        await database.put('results', { formatVersion: 2, session: completed })
        index++
      }
      const original = (await database.getAll('results')).find(
        (raw) => (raw as { session: { mode: string } }).session.mode === 'free',
      ) as { formatVersion: number; session: ReturnType<typeof createSession> }
      await database.put('results', {
        ...original,
        session: {
          ...original.session,
          id: 'legacy-surrogate-result',
          puzzle: {
            ...original.session.puzzle,
            seed: 'old\uD800seed',
            puzzleVersion: 'legacy\uDC00version',
          },
        },
      })
      await database.put('lessons', {
        formatVersion: 1,
        lessonId: 'retired-historical-course',
        completedAt: '2026-10-16T01:02:03.004Z',
      })
      await database.put(
        'settings',
        {
          formatVersion: 1,
          theme: 'dark',
          showTimer: false,
          highlightConflicts: true,
          currentLessonId: 'killer-combined',
          lessonStages: { rules: 1, 'killer-combined': 5 },
        },
        'preferences',
      )
      const exported = await readBackupSnapshot(database, '2026-10-16T01:02:05.006Z', engine)
      expect(exported.excluded).toBe(0)
      expect(exported.backup.sessions).toHaveLength(19)
      if (process.env.WRITE_WEB_BACKUP_FIXTURE === '1') {
        writeFileSync(
          fixturePath,
          await format(JSON.stringify(exported.backup), { parser: 'json' }),
        )
      } else {
        expect(exported.backup).toEqual(JSON.parse(readFileSync(fixturePath, 'utf8')))
      }
    } finally {
      database.close()
      engine.dispose()
    }
  })

  test.runIf(process.env.ANDROID_INTEROP_REIMPORT === '1')(
    'restores the actual Android export through the Web transaction',
    async () => {
      const engine = await createMainEngine(
        new WebAssembly.Module(
          readFileSync(createRequire(import.meta.url).resolve('@sudoku/wasm/binary')),
        ),
      )
      const database = await openSudokuDatabase('android-interop-import')
      try {
        const parsed = parseBackup(readFileSync(androidPath, 'utf8'), engine)
        expect(parsed.valid).toBe(true)
        if (!parsed.valid) throw new Error(parsed.issues.join('; '))
        await replaceBackupSnapshot(database, parsed.value, 1)
        const exported = await readBackupSnapshot(database, parsed.value.exportedAt, engine)
        const expected = JSON.parse(readFileSync(fixturePath, 'utf8'))
        expected.sessions = expected.sessions.map((record: { revision: number }) => ({
          ...record,
          revision: 1,
        }))
        expect(exported.backup).toEqual(expected)
        expect(await database.get('meta', 'epoch')).toBe(2)
      } finally {
        database.close()
        engine.dispose()
      }
    },
  )
})
