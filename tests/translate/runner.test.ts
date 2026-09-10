import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AiError } from '../../src/main/ai/errors'
import type { ChatRequest, ChatResult } from '../../src/main/ai/client'
import { createPaperDir, libraryPaths } from '../../src/main/library/store'
import { readTranslation, translationPath } from '../../src/main/translate/state'
import { translatePaper } from '../../src/main/translate/runner'
import type { AiProfile, Block, TranslateProgress } from '../../src/shared/types'

let root = ''

beforeEach(async () => {
  root = await fs.mkdtemp(join(tmpdir(), 'ai-note-translate-'))
  await createPaperDir(root, 'p1')
})

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

const profile: AiProfile = {
  id: 'prof1',
  name: '测试',
  baseUrl: 'https://example.com/v1',
  model: 'test-model',
  concurrency: 2,
  maxBatchBlocks: 2,
  maxBatchChars: 100000,
  pricePerMTokIn: 1,
  pricePerMTokOut: 2
}

function block(id: string): Block {
  return { id, page: 1, bbox: { x: 0, y: 0, w: 1, h: 1 }, type: 'paragraph', text: `text of ${id}` }
}

const blocks: Block[] = [block('p1-b00'), block('p1-b01'), block('p1-b02'), block('p1-b03')]

function idsFrom(request: ChatRequest): string[] {
  const content = request.messages[1].content
  const json = content.slice(content.indexOf('['), content.lastIndexOf(']') + 1)
  return (JSON.parse(json) as Array<{ id: string }>).map((x) => x.id)
}

function answerFor(ids: string[]): string {
  return JSON.stringify(Object.fromEntries(ids.map((id) => [id, `译:${id}`])))
}

function okResult(ids: string[]): ChatResult {
  return {
    content: answerFor(ids),
    usage: { promptTokens: 10, completionTokens: 5 },
    finishReason: 'stop'
  }
}

const fastRetry = { attempts: 3, baseDelayMs: 1, sleep: async () => {} }

describe('翻译引擎', () => {
  it('全部成功时每段都标记完成并落盘', async () => {
    const client = vi.fn(async (request: ChatRequest) => okResult(idsFrom(request)))
    const file = await translatePaper({
      root, paperId: 'p1', profile, apiKey: 'k', blocks, client, retry: fastRetry
    })

    expect(Object.keys(file.blocks)).toHaveLength(4)
    for (const b of blocks) {
      expect(file.blocks[b.id].status).toBe('done')
      expect(file.blocks[b.id].text).toBe(`译:${b.id}`)
    }
    const onDisk = await readTranslation(root, 'p1')
    expect(onDisk?.blocks['p1-b00'].text).toBe('译:p1-b00')
  })

  it('累计 token 用量', async () => {
    const client = vi.fn(async (request: ChatRequest) => okResult(idsFrom(request)))
    const file = await translatePaper({
      root, paperId: 'p1', profile, apiKey: 'k', blocks, client, retry: fastRetry
    })
    expect(file.usage.promptTokens).toBe(20)
    expect(file.usage.completionTokens).toBe(10)
  })

  it('首次返回格式错误时会重试并最终成功', async () => {
    let calls = 0
    const client = vi.fn(async (request: ChatRequest) => {
      calls += 1
      if (calls === 1) return { content: '我不是 JSON', usage: null, finishReason: 'stop' }
      return okResult(idsFrom(request))
    })
    const file = await translatePaper({
      root, paperId: 'p1', profile, apiKey: 'k', blocks, client, retry: fastRetry
    })
    expect(file.blocks['p1-b00'].status).toBe('done')
  })

  it('整批始终失败时拆成单段重试，能救回多少救多少', async () => {
    const client = vi.fn(async (request: ChatRequest) => {
      const ids = idsFrom(request)
      if (ids.length > 1) return { content: '永远不是 JSON', usage: null, finishReason: 'stop' }
      if (ids[0] === 'p1-b02') return { content: '这一段就是不行', usage: null, finishReason: 'stop' }
      return okResult(ids)
    })
    const file = await translatePaper({
      root, paperId: 'p1', profile, apiKey: 'k', blocks, client, retry: fastRetry
    })

    expect(file.blocks['p1-b00'].status).toBe('done')
    expect(file.blocks['p1-b01'].status).toBe('done')
    expect(file.blocks['p1-b02'].status).toBe('failed')
    expect(file.blocks['p1-b03'].status).toBe('done')
  })

  it('密钥无效时立即停手，不反复重试', async () => {
    const client = vi.fn(async () => {
      throw new AiError('auth', 'bad key')
    })
    const progress: TranslateProgress[] = []
    const file = await translatePaper({
      root, paperId: 'p1', profile, apiKey: 'k', blocks, client,
      retry: fastRetry,
      emit: (p) => progress.push(p)
    })

    expect(client.mock.calls.length).toBeLessThanOrEqual(2)
    expect(file.blocks['p1-b00']?.status).toBe('failed')
    expect(progress.at(-1)?.lastError).toContain('API Key')
  })

  it('限流会重试而不是立刻失败', async () => {
    let calls = 0
    const client = vi.fn(async (request: ChatRequest) => {
      calls += 1
      if (calls <= 2) throw new AiError('rate_limited', '')
      return okResult(idsFrom(request))
    })
    const file = await translatePaper({
      root, paperId: 'p1', profile, apiKey: 'k', blocks, client, retry: fastRetry
    })
    expect(file.blocks['p1-b00'].status).toBe('done')
  })

  it('已经有译文的段落不会再次请求', async () => {
    const seen: string[] = []
    const client = vi.fn(async (request: ChatRequest) => {
      seen.push(...idsFrom(request))
      return okResult(idsFrom(request))
    })
    await translatePaper({
      root, paperId: 'p1', profile, apiKey: 'k', blocks: blocks.slice(0, 2), client, retry: fastRetry
    })
    seen.length = 0

    await translatePaper({ root, paperId: 'p1', profile, apiKey: 'k', blocks, client, retry: fastRetry })
    expect(seen).not.toContain('p1-b00')
    expect(seen).not.toContain('p1-b01')
    expect(seen).toContain('p1-b02')
    expect(seen).toContain('p1-b03')
  })

  it('中断后已完成的段落保留在磁盘上', async () => {
    const controller = new AbortController()
    const client = vi.fn(async (request: ChatRequest) => {
      const ids = idsFrom(request)
      if (ids.includes('p1-b02')) controller.abort()
      return okResult(ids)
    })
    await translatePaper({
      root, paperId: 'p1', profile: { ...profile, concurrency: 1 }, apiKey: 'k',
      blocks, client, retry: fastRetry, signal: controller.signal
    })

    const onDisk = await readTranslation(root, 'p1')
    expect(onDisk?.blocks['p1-b00'].status).toBe('done')
  })

  it('进度回调会给出已完成与失败数量', async () => {
    const client = vi.fn(async (request: ChatRequest) => okResult(idsFrom(request)))
    const progress: TranslateProgress[] = []
    await translatePaper({
      root, paperId: 'p1', profile, apiKey: 'k', blocks, client,
      retry: fastRetry, emit: (p) => progress.push(p)
    })
    expect(progress.length).toBeGreaterThan(1)
    expect(progress.at(-1)).toMatchObject({ done: 4, failed: 0, total: 4, running: false })
  })

  it('翻译文件写在论文自己的目录里', async () => {
    const client = vi.fn(async (request: ChatRequest) => okResult(idsFrom(request)))
    await translatePaper({
      root, paperId: 'p1', profile, apiKey: 'k', blocks: [block('p1-b00')], client, retry: fastRetry
    })
    await fs.access(translationPath(root, 'p1'))
    expect(translationPath(root, 'p1').startsWith(libraryPaths(root, 'p1').paperDir)).toBe(true)
  })
})