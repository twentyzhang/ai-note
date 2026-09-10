import path from 'node:path'
import type { Block, TokenUsage, TranslationFile } from '../../shared/types'
import { libraryPaths, readJson, writeJson } from '../library/store'

export function translationPath(root: string, paperId: string): string {
  return path.join(libraryPaths(root, paperId).paperDir, 'translation.zh.json')
}

export function createTranslationFile(profileId: string, model: string): TranslationFile {
  return {
    targetLang: 'zh',
    profileId,
    model,
    updatedAt: Date.now(),
    usage: { promptTokens: 0, completionTokens: 0 },
    blocks: {}
  }
}

export async function readTranslation(
  root: string,
  paperId: string
): Promise<TranslationFile | null> {
  const loaded = await readJson<TranslationFile>(translationPath(root, paperId))
  if (!loaded || typeof loaded !== 'object' || typeof loaded.blocks !== 'object') return null
  return {
    targetLang: typeof loaded.targetLang === 'string' ? loaded.targetLang : 'zh',
    profileId: typeof loaded.profileId === 'string' ? loaded.profileId : '',
    model: typeof loaded.model === 'string' ? loaded.model : '',
    updatedAt: typeof loaded.updatedAt === 'number' ? loaded.updatedAt : 0,
    usage: {
      promptTokens: Number(loaded.usage?.promptTokens ?? 0),
      completionTokens: Number(loaded.usage?.completionTokens ?? 0)
    },
    blocks: loaded.blocks
  }
}

export async function writeTranslation(
  root: string,
  paperId: string,
  file: TranslationFile
): Promise<void> {
  await writeJson(translationPath(root, paperId), file)
}

export function mergeUsage(a: TokenUsage, b: TokenUsage | null): TokenUsage {
  if (!b) return a
  return {
    promptTokens: a.promptTokens + b.promptTokens,
    completionTokens: a.completionTokens + b.completionTokens
  }
}

/** 未完成的段落：还没有记录，或者上一次是失败/中断状态 */
export function pendingBlocks(blocks: Block[], file: TranslationFile): Block[] {
  return blocks.filter((block) => file.blocks[block.id]?.status !== 'done')
}

export function summarize(file: TranslationFile): { done: number; failed: number } {
  let done = 0
  let failed = 0
  for (const entry of Object.values(file.blocks)) {
    if (entry.status === 'done') done += 1
    else if (entry.status === 'failed') failed += 1
  }
  return { done, failed }
}