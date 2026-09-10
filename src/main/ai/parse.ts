export class TranslationFormatError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TranslationFormatError'
  }
}

function stripFence(raw: string): string {
  const trimmed = raw.trim()
  const fenced = /^```[a-zA-Z]*\s*\n([\s\S]*?)\n?```$/.exec(trimmed)
  return fenced ? fenced[1].trim() : trimmed
}

function toRecord(payload: unknown): Record<string, unknown> | null {
  if (Array.isArray(payload)) {
    const record: Record<string, unknown> = {}
    for (const item of payload) {
      if (item && typeof item === 'object') {
        const id = (item as { id?: unknown }).id
        if (typeof id === 'string') record[id] = (item as { text?: unknown }).text
      }
    }
    return record
  }
  if (payload && typeof payload === 'object') {
    const outer = payload as Record<string, unknown>
    const inner = outer.translations
    if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
      return inner as Record<string, unknown>
    }
    return outer
  }
  return null
}

export function parseTranslationResponse(raw: string, expectedIds: string[]): Map<string, string> {
  let payload: unknown
  try {
    payload = JSON.parse(stripFence(raw))
  } catch {
    throw new TranslationFormatError('AI 返回的内容不是合法 JSON')
  }

  const record = toRecord(payload)
  if (!record) throw new TranslationFormatError('AI 返回的 JSON 结构无法识别')

  const result = new Map<string, string>()
  for (const id of expectedIds) {
    const value = record[id]
    if (value === undefined) throw new TranslationFormatError(`缺少段落 ${id} 的译文`)
    if (typeof value !== 'string') throw new TranslationFormatError(`段落 ${id} 的译文不是文本`)
    result.set(id, value)
  }
  return result
}