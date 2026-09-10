import type { AiProfile, TokenUsage } from '../../shared/types'
import { AiError, classifyStatus } from './errors'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatRequest {
  profile: AiProfile
  apiKey: string
  messages: ChatMessage[]
  jsonMode?: boolean
  signal?: AbortSignal
}

export interface ChatResult {
  content: string
  usage: TokenUsage | null
  finishReason: string | null
}

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>

export function chatUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '')
  if (trimmed.endsWith('/chat/completions')) return trimmed
  return `${trimmed}/chat/completions`
}

export async function chatComplete(
  request: ChatRequest,
  fetchImpl: FetchLike = fetch
): Promise<ChatResult> {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (request.apiKey) headers.authorization = `Bearer ${request.apiKey}`

  const body: Record<string, unknown> = {
    model: request.profile.model,
    messages: request.messages,
    temperature: 0
  }
  if (request.jsonMode) body.response_format = { type: 'json_object' }

  let response: Response
  try {
    response = await fetchImpl(chatUrl(request.profile.baseUrl), {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: request.signal
    })
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') throw err
    throw new AiError('network', '连不上 AI 服务')
  }

  const text = await response.text()
  if (!response.ok) throw classifyStatus(response.status, text)

  let payload: unknown
  try {
    payload = JSON.parse(text)
  } catch {
    throw new AiError('bad_response', '返回的不是合法 JSON')
  }

  const choice = (payload as { choices?: Array<Record<string, unknown>> }).choices?.[0]
  const content = (choice?.message as { content?: unknown } | undefined)?.content
  if (typeof content !== 'string' || content.length === 0) {
    throw new AiError('bad_response', '返回内容为空')
  }

  const finishReason = typeof choice?.finish_reason === 'string' ? choice.finish_reason : null
  if (finishReason === 'length') throw new AiError('truncated', '输出被截断')

  const rawUsage = (payload as { usage?: Record<string, unknown> }).usage
  const usage: TokenUsage | null = rawUsage
    ? {
        promptTokens: Number(rawUsage.prompt_tokens ?? 0),
        completionTokens: Number(rawUsage.completion_tokens ?? 0)
      }
    : null

  return { content, usage, finishReason }
}