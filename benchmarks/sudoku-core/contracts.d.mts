export function canonical(value: unknown): unknown
export function verifyPayload(actual: unknown, expected: unknown): void
export function verifyThenMeasure<Value>(
  operation: () => Value,
  expected: Value,
  clock?: () => number,
): { result: Value; durationMs: number }
export class BenchmarkPhases {
  externalCheck<Value>(operation: () => Promise<Value>): Promise<Value>
  ready(): void
  measure<Value>(operation: () => Value): Value
}
export function requireEmittedWasm(asset: string, bytes: Uint8Array, base: string): true
export function statistics(values: readonly number[]): {
  samples: number
  totalMs: number
  meanMs: number
  p95Ms: number
  maxMs: number
}

export function requireInteractiveCoverage(
  rows: readonly { operation: string; status?: string }[],
): void
export function requireLifecycleEvidence(value: unknown): void
