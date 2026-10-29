// Shares work only while it is pending. Finished or failed requests are never
// cached, and a different session always starts its own authenticated request.
export function createInFlight<T>() {
  let current: { key: string; promise: Promise<T> } | undefined
  return {
    run(key: string, load: () => Promise<T>): Promise<T> {
      if (current?.key === key) return current.promise
      const promise = Promise.resolve().then(load)
      current = { key, promise }
      const release = () => { if (current?.promise === promise) current = undefined }
      void promise.then(release, release)
      return promise
    },
    clear() { current = undefined },
  }
}
