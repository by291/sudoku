export const SEED_BYTE_LENGTH = 32
const HEX_DIGITS_PER_BYTE = 2
const HEX_SEED_LENGTH = SEED_BYTE_LENGTH * HEX_DIGITS_PER_BYTE
const CANONICAL_SEED = /^[0-9a-f]{64}$/

/** Encode only a new binary seed. Historical metadata does not use this codec. */
export function encodeSeed(seed: Uint8Array): string {
  if (!(seed instanceof Uint8Array) || seed.length !== SEED_BYTE_LENGTH) {
    throw new TypeError('A seed must contain exactly 32 bytes')
  }

  return Array.from(seed, (byte) => byte.toString(16).padStart(HEX_DIGITS_PER_BYTE, '0')).join('')
}

/** Decode canonical lowercase text into an owned 32-byte seed. */
export function decodeSeed(value: unknown): Uint8Array {
  if (
    typeof value !== 'string' ||
    value.length !== HEX_SEED_LENGTH ||
    !CANONICAL_SEED.test(value)
  ) {
    throw new TypeError('A seed must contain exactly 64 lowercase hexadecimal characters')
  }

  return Uint8Array.from({ length: SEED_BYTE_LENGTH }, (_, index) => {
    const start = index * HEX_DIGITS_PER_BYTE
    return Number.parseInt(value.slice(start, start + HEX_DIGITS_PER_BYTE), 16)
  })
}

/** Compare the byte identity of two complete seeds. */
export function equalSeeds(first: Uint8Array, second: Uint8Array): boolean {
  return (
    first.length === SEED_BYTE_LENGTH &&
    second.length === SEED_BYTE_LENGTH &&
    first.every((byte, index) => byte === second[index])
  )
}
