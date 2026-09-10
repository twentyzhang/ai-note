import type { AiProfile, Block, TranslateProgress, TranslationFile } from '../../shared/types'
import { chatComplete, type ChatRequest, type ChatResult } from '../ai/client'
import { isRetryable, toChineseMessage } from '../ai/errors'
import { parseTranslationResponse } from '../ai/parse'
import { buildTranslationMessages } from '../ai/prompts'
import { runWithConcurrency, withRetry } from '../ai/retry'
import { planBatches } from './batches'
import {
  createTranslationFile,
  mergeUsage,
  pendingBlocks,
  readTranslation,
  summarize,
  writeTranslation
} from './state'

export type ChatClient = (request: ChatRequest) => Promise<ChatResult>

export interface TranslateOptions {
  root: string
  paperId: string
  profile: AiProfile
  apiKey: string
  blocks: Block[]
  client?: ChatClient
  emit?: (progress: TranslateProgress) => void
  signal?: AbortSignal
  retry?: { attempts?: number; baseDelayMs?: number; sleep?: (ms: number) => Promise<void> }
}

export async function translatePaper(options: TranslateOptions): Promise<TranslationFile> {
  const { root, paperId, profile, signal } = options
  const client: ChatClient = options.client ?? ((request) => chatComplete(request))
  const attempts = options.retry?.attempts ?? 3
  const baseDelayMs = options.retry?.baseDelayMs ?? 1000

  const file: TranslationFile =
    (await readTranslation(root, paperId)) ?? createTranslationFile(profile.id, profile.model)
  file.profileId = profile.id
  file.model = profile.model

  const batches = planBatches(pendingBlocks(options.blocks, file), {
    maxBatchBlocks: profile.maxBatchBlocks,
    maxBatchChars: profile.maxBatchChars
  })

  let running = true
  let lastError: string | null = null
  let stopped = false

  // 并发批次会同时改 file，落盘必须串行化，否则会互相覆盖
  let writeChain: Promise<void> = Promise.resolve()
  const persist = (): Promise<void> => {
    writeChain = writeChain.then(() => writeTranslation(root, paperId, file))
    return writeChain
  }

  const emit = (): void => {
    const { done, failed } = summarize(file)
    options.emit?.({
      paperId,
      done,
      failed,
      total: options.blocks.length,
      running,
      usage: file.usage,
      lastError
    })
  }

  const markFailed = (blockId: string, err: unknown): void => {
    file.blocks[blockId] = {
      status: 'failed',
      error: toChineseMessage(err),
      attempts: (file.blocks[blockId]?.attempts ?? 0) + 1
    }
  }

  const runOnce = async (batch: Block[]): Promise<void> => {
    const ids = batch.map((b) => b.id)
    for (const id of ids) {
      file.blocks[id] = { status: 'streaming', attempts: (file.blocks[id]?.attempts ?? 0) + 1 }
    }

    const result = await withRetry(
      () =>
        client({
          profile,
          apiKey: options.apiKey,
          messages: buildTranslationMessages(batch, 'zh'),
          jsonMode: true,
          signal
        }),
      {
        attempts,
        baseDelayMs,
        sleep: options.retry?.sleep,
        onRetry: (info) => {
          lastError = `第 ${info.attempt} 次失败，约 ${Math.round(info.delayMs / 1000)} 秒后重试`
          emit()
        }
      }
    )

    file.usage = mergeUsage(file.usage, result.usage)
    const translations = parseTranslationResponse(result.content, ids)
    for (const id of ids) {
      file.blocks[id] = {
        status: 'done',
        text: translations.get(id) ?? '',
        attempts: file.blocks[id]?.attempts ?? 1
      }
    }
    lastError = null
    await persist()
    emit()
  }

  const translateBatch = async (batch: Block[]): Promise<void> => {
    try {
      await runOnce(batch)
      return
    } catch (err) {
      if (!isRetryable(err)) throw err
      if (batch.length === 1) {
        markFailed(batch[0].id, err)
        lastError = toChineseMessage(err)
        await persist()
        emit()
        return
      }
    }

    // 整批失败：降级为单段逐条翻译，能救回多少救多少
    for (const block of batch) {
      if (stopped || signal?.aborted) return
      try {
        await runOnce([block])
      } catch (err) {
        if (!isRetryable(err)) throw err
        markFailed(block.id, err)
        lastError = toChineseMessage(err)
        await persist()
        emit()
      }
    }
  }

  emit()

  try {
    await runWithConcurrency(batches, Math.max(1, profile.concurrency), async (batch) => {
      if (stopped || signal?.aborted) return
      try {
        await translateBatch(batch)
      } catch (err) {
        // 不可重试的错误（密钥无效、余额不足）：标记本批全部失败并停止后续调度
        for (const block of batch) markFailed(block.id, err)
        lastError = toChineseMessage(err)
        stopped = true
        await persist()
        emit()
      }
    })
  } finally {
    running = false
    file.updatedAt = Date.now()
    await persist()
    emit()
  }

  return file
}