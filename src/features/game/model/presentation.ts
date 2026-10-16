import type { Difficulty } from '@/sudoku/contracts'

export const DIFFICULTY_NAMES: Record<Difficulty, string> = {
  easy: '简单',
  medium: '中等',
  hard: '困难',
  expert: '专家',
}

export function formatDuration(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1000)

  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`
}
