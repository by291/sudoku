import { describe, expect, it } from 'vitest'
import { decodeSeed, encodeSeed, equalSeeds } from '@/sudoku/seed'

describe('binary seed metadata', () => {
  it('round_trips_every_byte_without_text_decoding', () => {
    for (let offset = 0; offset < 256; offset++) {
      const seed = Uint8Array.from({ length: 32 }, (_, index) => (offset + index) % 256)
      const encoded = encodeSeed(seed)

      expect(encoded).toMatch(/^[0-9a-f]{64}$/)
      expect(decodeSeed(encoded)).toEqual(seed)
      expect(decodeSeed(encoded)).not.toBe(seed)
    }
  })

  it('seed_hex_codec_rejects_noncanonical_input', () => {
    for (const value of [
      null,
      0,
      [],
      '00',
      '0'.repeat(63),
      '0'.repeat(65),
      'A'.repeat(64),
      'g'.repeat(64),
      `0x${'0'.repeat(64)}`,
      ` ${'0'.repeat(64)}`,
      `${'0'.repeat(64)}\n`,
    ]) {
      expect(() => decodeSeed(value)).toThrow()
    }
    expect(() => encodeSeed(new Uint8Array(31))).toThrow()
    expect(() => encodeSeed(new Uint8Array(33))).toThrow()
  })

  it('compares_owned_byte_contents', () => {
    const seed = new Uint8Array(32)
    const copied = seed.slice()

    expect(equalSeeds(seed, copied)).toBe(true)
    copied[31] = 255
    expect(equalSeeds(seed, copied)).toBe(false)
    expect(equalSeeds(seed, new Uint8Array(31))).toBe(false)
  })
})
