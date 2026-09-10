import { describe, expect, it } from 'vitest'
import { AiError, classifyStatus, isRetryable, toChineseMessage } from '../../src/main/ai/errors'

describe('HTTP 状态分类', () => {
  it('401 与 403 归为密钥无效', () => {
    expect(classifyStatus(401, '').kind).toBe('auth')
    expect(classifyStatus(403, '').kind).toBe('auth')
  })

  it('402 归为余额不足', () => {
    expect(classifyStatus(402, '').kind).toBe('quota')
  })

  it('429 归为限流', () => {
    expect(classifyStatus(429, '').kind).toBe('rate_limited')
  })

  it('5xx 归为服务端故障', () => {
    expect(classifyStatus(503, '').kind).toBe('server')
  })

  it('其它状态归为未知并保留响应片段', () => {
    const err = classifyStatus(418, '我是茶壶')
    expect(err.kind).toBe('unknown')
    expect(err.message).toContain('茶壶')
  })
})

describe('可重试判定', () => {
  it('网络、限流、服务端、截断可重试', () => {
    expect(isRetryable(new AiError('network', ''))).toBe(true)
    expect(isRetryable(new AiError('rate_limited', ''))).toBe(true)
    expect(isRetryable(new AiError('server', ''))).toBe(true)
    expect(isRetryable(new AiError('truncated', ''))).toBe(true)
  })

  it('密钥无效与余额不足不可重试', () => {
    expect(isRetryable(new AiError('auth', ''))).toBe(false)
    expect(isRetryable(new AiError('quota', ''))).toBe(false)
  })

  it('非 AiError 的异常按可重试处理', () => {
    expect(isRetryable(new Error('socket hang up'))).toBe(true)
  })
})

describe('中文文案', () => {
  it('每个分类都有中文说明', () => {
    const kinds = ['network', 'rate_limited', 'auth', 'quota', 'server', 'bad_response', 'truncated', 'unknown'] as const
    for (const kind of kinds) {
      const message = toChineseMessage(new AiError(kind, 'raw'))
      expect(message.length).toBeGreaterThan(0)
      expect(/[\u4e00-\u9fff]/.test(message)).toBe(true)
    }
  })

  it('未知异常也能转成中文', () => {
    expect(/[\u4e00-\u9fff]/.test(toChineseMessage(new Error('boom')))).toBe(true)
  })
})