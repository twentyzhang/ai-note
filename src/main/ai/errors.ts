export type AiErrorKind =
  | 'network'
  | 'rate_limited'
  | 'auth'
  | 'quota'
  | 'server'
  | 'bad_response'
  | 'truncated'
  | 'unknown'

export class AiError extends Error {
  readonly kind: AiErrorKind
  readonly status: number | null

  constructor(kind: AiErrorKind, message: string, status: number | null = null) {
    super(message)
    this.name = 'AiError'
    this.kind = kind
    this.status = status
  }
}

const RETRYABLE: ReadonlySet<AiErrorKind> = new Set([
  'network',
  'rate_limited',
  'server',
  'truncated'
])

const CHINESE: Record<AiErrorKind, string> = {
  network: '连不上 AI 服务，请检查网络连接或设置里的 Base URL',
  rate_limited: '请求太频繁被限流，正在自动降速重试',
  auth: 'API Key 无效或没有权限，请到设置里检查',
  quota: '账户余额不足，请先充值再继续翻译',
  server: 'AI 服务端暂时故障，稍后会自动重试',
  bad_response: 'AI 返回的内容格式不对，正在尝试其它办法',
  truncated: 'AI 输出被截断，正在缩小批次重试',
  unknown: '调用 AI 时出现未知错误'
}

export function classifyStatus(status: number, body: string): AiError {
  if (status === 401 || status === 403) return new AiError('auth', CHINESE.auth, status)
  if (status === 402) return new AiError('quota', CHINESE.quota, status)
  if (status === 429) return new AiError('rate_limited', CHINESE.rate_limited, status)
  if (status >= 500) return new AiError('server', CHINESE.server, status)

  const snippet = body.replace(/\s+/g, ' ').slice(0, 200)
  return new AiError('unknown', `请求失败（HTTP ${status}）：${snippet}`, status)
}

export function isRetryable(err: unknown): boolean {
  if (err instanceof AiError) return RETRYABLE.has(err.kind)
  return true
}

export function toChineseMessage(err: unknown): string {
  if (err instanceof AiError) return CHINESE[err.kind]
  return CHINESE.unknown
}