import { describe, expect, it, vi } from 'vitest'
import { chatComplete, type FetchLike } from '../../src/main/ai/client'
import type { AiProfile } from '../../src/shared/types'

const profile: AiProfile = {
  id: 'p1',
  name: '测试',
  baseUrl: 'https://example.com/v1',
  model: 'test-model',
  concurrency: 1,
  maxBatchBlocks: 5,
  maxBatchChars: 1000,
  pricePerMTokIn: null,
  pricePerMTokOut: null
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  })
}

function okBody(content: string): unknown {
  return {
    choices: [{ message: { content }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 100, completion_tokens: 50 }
  }
}

describe('chatComplete', () => {
  it('正常返回时给出内容与用量', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => jsonResponse(okBody('你好')))
    const result = await chatComplete(
      { profile, apiKey: 'sk-1', messages: [{ role: 'user', content: 'hi' }] },
      fetchImpl
    )
    expect(result.content).toBe('你好')
    expect(result.usage).toEqual({ promptTokens: 100, completionTokens: 50 })
    expect(result.finishReason).toBe('stop')
  })

  it('拼出正确的 URL、模型名与鉴权头', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => jsonResponse(okBody('ok')))
    await chatComplete(
      { profile, apiKey: 'sk-secret', messages: [{ role: 'user', content: 'hi' }] },
      fetchImpl
    )
    const call = fetchImpl.mock.calls[0]
    expect(call[0]).toBe('https://example.com/v1/chat/completions')
    const headers = call[1]?.headers as Record<string, string>
    expect(headers.authorization).toBe('Bearer sk-secret')
    expect(JSON.parse(String(call[1]?.body)).model).toBe('test-model')
  })

  it('Base URL 末尾多写斜杠也不会拼出双斜杠', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => jsonResponse(okBody('ok')))
    await chatComplete(
      { profile: { ...profile, baseUrl: 'https://example.com/v1/' }, apiKey: 'k', messages: [] },
      fetchImpl
    )
    expect(fetchImpl.mock.calls[0][0]).toBe('https://example.com/v1/chat/completions')
  })

  it('Base URL 已经包含 chat/completions 时不再追加', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => jsonResponse(okBody('ok')))
    await chatComplete(
      {
        profile: { ...profile, baseUrl: 'https://example.com/v1/chat/completions' },
        apiKey: 'k',
        messages: []
      },
      fetchImpl
    )
    expect(fetchImpl.mock.calls[0][0]).toBe('https://example.com/v1/chat/completions')
  })

  it('本地模型不填 key 时不发送鉴权头', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => jsonResponse(okBody('ok')))
    await chatComplete({ profile, apiKey: '', messages: [] }, fetchImpl)
    const headers = fetchImpl.mock.calls[0][1]?.headers as Record<string, string>
    expect(headers.authorization).toBeUndefined()
  })

  it('jsonMode 时带上 response_format', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => jsonResponse(okBody('{}')))
    await chatComplete({ profile, apiKey: 'k', messages: [], jsonMode: true }, fetchImpl)
    expect(JSON.parse(String(fetchImpl.mock.calls[0][1]?.body)).response_format).toEqual({
      type: 'json_object'
    })
  })

  it('401 抛出 auth 错误', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => jsonResponse({ error: 'bad key' }, 401))
    await expect(
      chatComplete({ profile, apiKey: 'k', messages: [] }, fetchImpl)
    ).rejects.toMatchObject({ kind: 'auth' })
  })

  it('429 抛出限流错误', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => jsonResponse({}, 429))
    await expect(
      chatComplete({ profile, apiKey: 'k', messages: [] }, fetchImpl)
    ).rejects.toMatchObject({ kind: 'rate_limited' })
  })

  it('响应不是 JSON 时抛 bad_response', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => new Response('<html>502</html>', { status: 200 }))
    await expect(
      chatComplete({ profile, apiKey: 'k', messages: [] }, fetchImpl)
    ).rejects.toMatchObject({ kind: 'bad_response' })
  })

  it('内容为空时抛 bad_response', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => jsonResponse({ choices: [{ message: {} }] }))
    await expect(
      chatComplete({ profile, apiKey: 'k', messages: [] }, fetchImpl)
    ).rejects.toMatchObject({ kind: 'bad_response' })
  })

  it('finish_reason 为 length 时抛 truncated', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () =>
      jsonResponse({ choices: [{ message: { content: '半截' }, finish_reason: 'length' }] })
    )
    await expect(
      chatComplete({ profile, apiKey: 'k', messages: [] }, fetchImpl)
    ).rejects.toMatchObject({ kind: 'truncated' })
  })

  it('缺少 usage 时返回 null 而不是崩溃', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () =>
      jsonResponse({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] })
    )
    const result = await chatComplete({ profile, apiKey: 'k', messages: [] }, fetchImpl)
    expect(result.usage).toBeNull()
  })

  it('网络异常抛 network 错误', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => {
      throw new Error('ECONNREFUSED')
    })
    await expect(
      chatComplete({ profile, apiKey: 'k', messages: [] }, fetchImpl)
    ).rejects.toMatchObject({ kind: 'network' })
  })
})