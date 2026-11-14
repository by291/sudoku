export const REQUEST_TIMEOUT_MILLISECONDS = 3000
const WASM_TIMEOUT_MESSAGE = 'Computation timed out'

const requestDeadlines = new WeakMap<AbortSignal, number>()

/** Associate an internal request signal with the deadline established before initialization. */
export function setRequestDeadline(signal: AbortSignal, deadline: number): void {
  requestDeadlines.set(signal, deadline)
}

/** Reuse the original deadline or start one for a request made directly to the client. */
export function getRequestDeadline(signal: AbortSignal | undefined): number {
  const deadline = signal && requestDeadlines.get(signal)

  return deadline ?? performance.now() + REQUEST_TIMEOUT_MILLISECONDS
}

/** Recognize the timeout error raised by synchronous WASM operations. */
export function isWasmTimeout(error: unknown): boolean {
  return error instanceof Error && error.message === WASM_TIMEOUT_MESSAGE
}
