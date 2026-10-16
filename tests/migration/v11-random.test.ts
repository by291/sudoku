// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { blake3 } from '@noble/hashes/blake3.js'
import { createRandom, deriveSeed, phaseMaterial, phaseSeed } from './v11-random'

const ascendingSeed = Uint8Array.from({ length: 32 }, (_, index) => index)
const input = {
  seed: ascendingSeed,
  variant: 'arrow',
  difficulty: 'hard',
  puzzleVersion: 'sudoku-variants-v11',
}

describe('independent v11 byte streams', () => {
  it('matches upstream BLAKE3 derive-key and ChaCha8 zero-key vectors', () => {
    const context = new TextEncoder().encode('BLAKE3 2019-12-27 16:29:52 test vectors context')

    expect(Buffer.from(blake3(new Uint8Array(), { context })).toString('hex')).toBe(
      '2cc39783c223154fea8dfb7c1b1660f2ac2dcbd1c1de8277b0b0dd39b7e50d7d',
    )
    const random = createRandom(new Uint8Array(32))
    expect(random.nextU32()).toBe(0x2fef003e)
    expect(random.nextU32()).toBe(0xd6405f89)
  })

  it('frames phase material with explicit tags and little-endian indices', () => {
    const material = phaseMaterial(input, 'candidate', 0x01020304, 0x05060708)

    expect([...material]).toEqual([...ascendingSeed, 5, 2, 2, 4, 3, 2, 1, 8, 7, 6, 5])
    expect(phaseSeed(input, 'candidate', 1, 2)).not.toEqual(phaseSeed(input, 'geometry', 1, 2))
  })

  it('accepts arbitrary 32-byte seeds and rejects other lengths and old versions', () => {
    for (const length of [0, 31, 33]) {
      expect(() => createRandom(new Uint8Array(length))).toThrow('32 bytes')
    }

    expect(() => createRandom(new Uint8Array(32).fill(255))).not.toThrow()
    expect(() =>
      phaseSeed({ ...input, puzzleVersion: 'sudoku-variants-v10' }, 'terminal', 1, 0),
    ).toThrow('generation version')
  })

  it('owns seed bytes and maps each u32 to exactly one float draw', () => {
    const seed = deriveSeed(new TextEncoder().encode('daily:2026-10-16'))
    const floats = createRandom(seed)
    const words = createRandom(seed)
    const untouched = createRandom(seed)
    seed.fill(0)

    for (let index = 0; index < 300; index++) {
      expect(floats.nextFloat()).toBe(words.nextU32() / 4294967296)
      expect(untouched.nextU32()).toBe(createWordAt(index))
    }

    function createWordAt(index: number) {
      const expected = createRandom(deriveSeed(new TextEncoder().encode('daily:2026-10-16')))
      let word = 0
      for (let count = 0; count <= index; count++) {
        word = expected.nextU32()
      }
      return word
    }
  })
})
