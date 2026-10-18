import { blake3 } from '@noble/hashes/blake3.js'
import { chacha8 } from '@noble/ciphers/chacha.js'

export const ROOT_CONTEXT = 'sudoku 2026-10-16 root seed v1'
export const VARIANTS = ['classic', 'diagonal', 'jigsaw', 'killer', 'thermo', 'arrow'] as const
export const DIFFICULTIES = ['easy', 'medium', 'hard', 'expert'] as const
export const PHASES = ['terminal', 'geometry', 'candidate'] as const

export type ByteGenerationInput = {
  seed: Uint8Array
  variant: string
  difficulty: string
  puzzleVersion: string
}

function seedBytes(seed: Uint8Array): Uint8Array {
  if (!(seed instanceof Uint8Array) || seed.length !== 32) {
    throw new TypeError('A seed must contain exactly 32 bytes')
  }

  return new Uint8Array(seed)
}

export function deriveSeed(material: Uint8Array): Uint8Array {
  return blake3(material, { context: new TextEncoder().encode(ROOT_CONTEXT) })
}

export function phaseMaterial(
  input: ByteGenerationInput,
  phase: string,
  layoutIndex: number,
  proposalIndex = 0,
): Uint8Array {
  const seed = seedBytes(input.seed)
  const variant = VARIANTS.findIndex((value) => value === input.variant)
  const difficulty = DIFFICULTIES.findIndex((value) => value === input.difficulty)
  const phaseTag = PHASES.findIndex((value) => value === phase)
  const expectedVersion = variant === 0 ? 'sudoku-v11' : 'sudoku-variants-v11'
  if (input.puzzleVersion !== expectedVersion) {
    throw new TypeError('Unsupported generation version')
  }
  if (variant < 0 || difficulty < 0 || phaseTag < 0 || (variant !== 0 && difficulty === 3)) {
    throw new TypeError('Unsupported generation stream tags')
  }
  for (const index of [layoutIndex, proposalIndex]) {
    if (!Number.isInteger(index) || index < 0 || index > 0xffffffff) {
      throw new TypeError('Stream index must be a u32')
    }
  }

  const material = new Uint8Array(43)
  material.set(seed)
  material.set([variant, difficulty, phaseTag], 32)
  const view = new DataView(material.buffer)
  view.setUint32(35, layoutIndex, true)
  view.setUint32(39, proposalIndex, true)

  return material
}

export function phaseSeed(
  input: ByteGenerationInput,
  phase: string,
  layoutIndex: number,
  proposalIndex = 0,
) {
  const material = phaseMaterial(input, phase, layoutIndex, proposalIndex)
  const context = `sudoku 2026-10-16 streams ${input.puzzleVersion}`

  return blake3(material, { context: new TextEncoder().encode(context) })
}

/** Independent test-only stream; words match Rust's zero-stream ChaCha8 below the IETF counter limit. */
export function createRandom(seed: Uint8Array) {
  const key = seedBytes(seed)
  const nonce = new Uint8Array(12)
  const zeros = new Uint8Array(1024)
  let blockCounter = 0
  let words = new DataView(new ArrayBuffer(0))
  let offset = 0

  function nextU32(): number {
    if (offset === words.byteLength) {
      if (blockCounter > 0xffffffff - 16) {
        throw new RangeError('Reference stream exceeds the IETF block counter')
      }

      const bytes = chacha8(key, nonce, zeros, undefined, blockCounter)
      words = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
      blockCounter += 16
      offset = 0
    }

    const value = words.getUint32(offset, true)
    offset += 4

    return value
  }

  return { nextU32, nextFloat: () => nextU32() / 4294967296 }
}
