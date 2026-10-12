import type { GameSession } from '@/features/game/model/session'
import {
  createGenerationInput,
  PUZZLE_VERSION,
  VARIANT_PUZZLE_VERSION,
} from '@/core/sudoku/generation'
import type { GenerationInput } from '@/core/sudoku/generation'
import type { SudokuVariant } from '@/core/sudoku/rules'
import { SUDOKU_VARIANTS } from '@/core/sudoku/rules'
export function isChallengeDate(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(`${value}T00:00:00.000Z`)) &&
    new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value
  )
}
const beijingCalendar = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})
export function getChallengeDate(now: Date): string {
  const parts = beijingCalendar.formatToParts(now)
  const date = ['year', 'month', 'day']
    .map((kind) => parts.find((part) => part.type === kind)?.value)
    .join('-')
  if (!isChallengeDate(date)) throw new TypeError('Invalid challenge date')
  return date
}
export function getDailySeed(date: string, puzzleVersion: string): string {
  if (!isChallengeDate(date) || !puzzleVersion.trim()) throw new TypeError('Invalid daily seed')
  return `daily:${puzzleVersion}:${date}`
}
export function getDailyIdentity(
  date: string,
  variant: SudokuVariant,
): { seed: string; formalId: string; input: GenerationInput } {
  if (!isChallengeDate(date)) throw new TypeError('Invalid challenge date')
  const seed =
    variant === 'classic'
      ? getDailySeed(date, PUZZLE_VERSION)
      : `daily:${VARIANT_PUZZLE_VERSION}:${variant}:${date}`
  const formalId =
    variant === 'classic' ? `daily:${date}:formal` : `daily:${variant}:${date}:formal`
  return { seed, formalId, input: createGenerationInput(variant, 'medium', seed) }
}
export function restartDailySession(session: GameSession): GameSession {
  if (session.mode !== 'daily')
    throw new TypeError('Only daily sessions retain their accumulated time')
  if (session.completion) return session
  return {
    ...session,
    entries: Array(81).fill(0),
    notes: Array(81).fill(0),
    undoStack: [],
    redoStack: [],
  }
}
export type DailyVariantStatus = {
  variant: SudokuVariant
  state: 'available' | 'in-progress' | 'completed'
}
export function getDailyStatuses(
  sessions: readonly { session: GameSession }[],
  results: readonly { session: GameSession }[],
  date: string,
): readonly DailyVariantStatus[] {
  return SUDOKU_VARIANTS.map((variant) => {
    const { formalId } = getDailyIdentity(date, variant)
    const saved = sessions.find((record) => record.session.id === formalId)?.session
    const completed =
      saved?.completion ||
      results.some((record) => record.session.id === formalId && record.session.completion)
    return { variant, state: completed ? 'completed' : saved ? 'in-progress' : 'available' }
  })
}
