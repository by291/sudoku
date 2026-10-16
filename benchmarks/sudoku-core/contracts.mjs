// Shared by the Node orchestrator and the isolated browser benchmark page.
export function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    )
  }
  return value
}

export function verifyPayload(actual, expected) {
  if (JSON.stringify(canonical(actual)) !== JSON.stringify(canonical(expected))) {
    throw new Error('Benchmark payload mismatch')
  }
}

/** Verify an untimed operation first; result verification stays outside the measured interval. */
export function verifyThenMeasure(operation, expected, clock = () => performance.now()) {
  verifyPayload(operation(), expected)
  const started = clock()
  const result = operation()
  const durationMs = clock() - started
  verifyPayload(result, expected)
  return { result, durationMs }
}

/** One orchestrator owns setup and measurement; no build or external check can run during timing. */
export class BenchmarkPhases {
  phase = 'setup'
  pending = 0

  externalCheck(operation) {
    if (this.phase === 'measurement') throw new Error('External checks cannot overlap measurement')
    if (this.phase !== 'setup') throw new Error('External checks must finish during setup')
    this.pending++
    return Promise.resolve()
      .then(operation)
      .finally(() => {
        this.pending--
      })
  }

  ready() {
    if (this.phase !== 'setup' || this.pending) throw new Error('Setup checks are still pending')
    this.phase = 'ready'
  }

  measure(operation) {
    if (this.phase !== 'ready') throw new Error('Measurement requires completed setup')
    this.phase = 'measurement'
    const finish = () => {
      this.phase = 'ready'
    }
    try {
      const result = operation()
      if (result && typeof result.then === 'function') return result.finally(finish)
      finish()
      return result
    } catch (error) {
      finish()
      throw error
    }
  }
}

export function requireEmittedWasm(asset, bytes, base) {
  if (!asset.startsWith(`${base}assets/`) || !asset.endsWith('.wasm')) {
    throw new Error('Benchmark requires an emitted WASM asset at the requested deployment root')
  }
  if (!WebAssembly.validate(bytes)) throw new Error('The emitted asset is not a valid WASM module')
  return true
}

export function statistics(values) {
  const sorted = [...values].sort((a, b) => a - b)
  const totalMs = values.reduce((sum, value) => sum + value, 0)
  return {
    samples: values.length,
    totalMs,
    meanMs: totalMs / values.length,
    p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1],
    maxMs: sorted.at(-1),
  }
}

export function requireInteractiveCoverage(rows) {
  const required = [
    'enter',
    'erase',
    'toggle-note',
    'review-entries',
    'hint-parse',
    'hint-validation',
  ]
  if (
    !required.every((operation) => rows.some((row) => row.operation === operation)) ||
    !rows.some((row) => row.operation === 'commit-generated-notes' && row.status === 'complete')
  ) {
    throw new Error('Incomplete interactive operation coverage')
  }
}

export function requireLifecycleEvidence(value) {
  if (
    !value?.observation?.available ||
    !Array.isArray(value.observation.snapshots) ||
    value.observation.snapshots.length < 3 ||
    value.cycles?.length !== 2 ||
    !value.cycles.every(
      (cycle) =>
        cycle.mainInstances === 20 &&
        cycle.workersCreated > 0 &&
        cycle.workersCreated === cycle.workersTerminated &&
        cycle.activeWorkers === 0,
    )
  ) {
    throw new Error('Missing independent instance lifecycle evidence')
  }
}
