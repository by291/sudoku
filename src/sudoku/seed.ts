const SEED_BYTES = 32
const CANONICAL_SEED = /^[0-9a-f]{64}$/

/** Encode only a new binary seed. Historical metadata does not use this codec. */
export function encodeSeed(seed: Uint8Array): string {
  if (!(seed instanceof Uint8Array) || seed.length !== SEED_BYTES) {
    throw new TypeError('A seed must contain exactly 32 bytes')
  }

  return Array.from(seed, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function decodeSeed(value: unknown): Uint8Array {
  if (typeof value !== 'string' || value.length !== 64 || !CANONICAL_SEED.test(value)) {
    throw new TypeError('A seed must contain exactly 64 lowercase hexadecimal characters')
  }

  return Uint8Array.from({ length: SEED_BYTES }, (_, index) =>
    Number.parseInt(value.slice(index * 2, index * 2 + 2), 16),
  )
}

export function equalSeeds(first: Uint8Array, second: Uint8Array): boolean {
  return (
    first.length === SEED_BYTES &&
    second.length === SEED_BYTES &&
    first.every((byte, index) => byte === second[index])
  )
}
