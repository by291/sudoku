export function deferred<T>() {
  let resolve: (value: T | PromiseLike<T>) => void = () => {
    throw new Error('Deferred promise not initialized')
  }
  const promise = new Promise<T>((complete) => {
    resolve = complete
  })

  return { promise, resolve }
}
