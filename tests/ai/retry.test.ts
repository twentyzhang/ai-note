import { describe, expect, it, vi } from 'vitest'
import { runWithConcurrency, withRetry } from '../../src/main/ai/retry'
import { AiError } from '../../src/main/ai/errors'

function fakeSleep(record: number[]): (ms: number) => Promise<void> {
  return async (ms) => {
    record.push(ms)
  }
}

describe('withRetry', () => {
  it('第一次就成功时不等待', async () => {
    const delays: number[] = []
    const task = vi.fn(async () => 'ok')
    await expect(
      withRetry(task, { attempts: 3, baseDelayMs: 100, sleep: fakeSleep(delays) })
    ).resolves.toBe('ok')
    expect(task).toHaveBeenCalledTimes(1)
    expect(delays).toEqual([])
  })

  it('可重试错误会按指数退避重试', async () => {
    const delays: number[] = []
    let calls = 0
    const task = async (): Promise<string> => {
      calls += 1
      if (calls < 3) throw new AiError('rate_limited', '')
      return 'ok'
    }
    await expect(
      withRetry(task, { attempts: 3, baseDelayMs: 100, sleep: fakeSleep(delays) })
    ).resolves.toBe('ok')
    expect(delays).toEqual([100, 200])
  })

  it('超过 maxDelayMs 时被截断', async () => {
    const delays: number[] = []
    let calls = 0
    const task = async (): Promise<string> => {
      calls += 1
      if (calls < 4) throw new AiError('server', '')
      return 'ok'
    }
    await withRetry(task, {
      attempts: 4,
      baseDelayMs: 1000,
      maxDelayMs: 2500,
      sleep: fakeSleep(delays)
    })
    expect(delays).toEqual([1000, 2000, 2500])
  })

  it('不可重试的错误立刻抛出', async () => {
    const delays: number[] = []
    const task = vi.fn(async () => {
      throw new AiError('auth', '')
    })
    await expect(
      withRetry(task, { attempts: 3, baseDelayMs: 100, sleep: fakeSleep(delays) })
    ).rejects.toMatchObject({ kind: 'auth' })
    expect(task).toHaveBeenCalledTimes(1)
    expect(delays).toEqual([])
  })

  it('用尽次数后抛出最后一次的错误', async () => {
    const delays: number[] = []
    const task = vi.fn(async () => {
      throw new AiError('server', '最后一次')
    })
    await expect(
      withRetry(task, { attempts: 2, baseDelayMs: 10, sleep: fakeSleep(delays) })
    ).rejects.toMatchObject({ message: '最后一次' })
    expect(task).toHaveBeenCalledTimes(2)
    expect(delays).toEqual([10])
  })

  it('onRetry 会收到尝试次数与延迟', async () => {
    const seen: Array<{ attempt: number; delayMs: number }> = []
    let calls = 0
    const task = async (): Promise<string> => {
      calls += 1
      if (calls < 2) throw new AiError('network', '')
      return 'ok'
    }
    await withRetry(task, {
      attempts: 2,
      baseDelayMs: 50,
      sleep: fakeSleep([]),
      onRetry: (info) => seen.push({ attempt: info.attempt, delayMs: info.delayMs })
    })
    expect(seen).toEqual([{ attempt: 1, delayMs: 50 }])
  })
})

describe('runWithConcurrency', () => {
  it('结果顺序与输入顺序一致', async () => {
    const results = await runWithConcurrency([1, 2, 3, 4, 5], 2, async (n) => n * 10)
    expect(results).toEqual([10, 20, 30, 40, 50])
  })

  it('并发数不会被突破', async () => {
    let running = 0
    let peak = 0
    await runWithConcurrency([1, 2, 3, 4, 5, 6], 2, async () => {
      running += 1
      peak = Math.max(peak, running)
      await new Promise((resolve) => setTimeout(resolve, 5))
      running -= 1
      return null
    })
    expect(peak).toBeLessThanOrEqual(2)
  })

  it('limit 大于条目数时也不会出错', async () => {
    await expect(runWithConcurrency([1, 2], 10, async (n) => n)).resolves.toEqual([1, 2])
  })

  it('空数组返回空数组', async () => {
    await expect(runWithConcurrency([], 3, async () => 1)).resolves.toEqual([])
  })

  it('工人抛错时整体失败', async () => {
    await expect(
      runWithConcurrency([1, 2, 3], 1, async (n) => {
        if (n === 2) throw new Error('炸了')
        return n
      })
    ).rejects.toThrow('炸了')
  })
})