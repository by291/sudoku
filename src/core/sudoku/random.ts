// sudoku-v1 hashes UTF-16 code units using FNV-1a, then uses Mulberry32.
// Preserve its stream consumption when changing Classic generation.
export function seededRandom(seed: string): () => number {
  let state = 2166136261
  for (let index = 0; index < seed.length; index++)
    state = Math.imul(state ^ seed.charCodeAt(index), 16777619) >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = Math.imul(state ^ (state >>> 15), state | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}
export function shuffle<T>(values: readonly T[], random: () => number): T[] {
  const result = [...values]
  for (let index = result.length - 1; index > 0; index--) {
    const partner = Math.floor(random() * (index + 1))
    ;[result[index], result[partner]] = [result[partner], result[index]]
  }
  return result
}
