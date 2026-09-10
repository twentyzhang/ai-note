import { isRetryable } from './errors'

export interface RetryOptions {
  attempts: number
  baseDelayMs: number
  maxDelayMs?: number
  sleep?: (ms: number) => Promise<void>
  onRetry?: (info: { attempt: number; delayMs: number; error: unknown }) => void
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

export async function withRetry<T>(task: () => Promise<T>, options: RetryOptions): Promise<T> {
  const sleep = options.sleep ?? defaultSleep
  const maxDelayMs = options.maxDelayMs ?? 8000
  let lastError: unknown

  for (let attempt = 1; attempt <= options.attempts; attempt++) {
    try {
      return await task()
    } catch (err) {
      lastError = err
      if (!isRetryable(err) || attempt === options.attempts) throw err
      const delayMs = Math.min(options.baseDelayMs * 2 ** (attempt - 1), maxDelayMs)
      options.onRetry?.({ attempt, delayMs, error: err })
      await sleep(delayMs)
    }
  }

  throw lastError
}

export async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  if (items.length === 0) return results

  let cursor = 0
  const width = Math.max(1, Math.min(limit, items.length))

  const runners = Array.from({ length: width }, async () => {
    for (;;) {
      const index = cursor
      cursor += 1
      if (index >= items.length) return
      results[index] = await worker(items[index], index)
    }
  })

  await Promise.all(runners)
  return results
}