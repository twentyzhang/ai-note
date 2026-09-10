import { randomBytes } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import type { BlocksFile, ImportResult, LibraryEntry } from '../../shared/types'
import { buildBlocksFromPages } from '../pdf/blocks'
import { extractMeta, extractPdf } from '../pdf/extract'
import { createPaperDir, libraryPaths, upsertEntry, writeJson } from './store'

export function resolveLibraryRoot(): string {
  return path.join(homedir(), 'Documents', '我的论文')
}

function newPaperId(): string {
  return randomBytes(4).toString('hex')
}

function titleFromFileName(file: string): string {
  return path.basename(file).replace(/\.pdf$/i, '').trim() || '未命名论文'
}

export async function importPdf(root: string, sourcePath: string): Promise<LibraryEntry> {
  await fs.access(sourcePath)
  const bytes = new Uint8Array(await fs.readFile(sourcePath))

  const pages = await extractPdf(bytes)
  if (pages.length === 0 || pages.every((p) => p.items.length === 0)) {
    throw new Error('这篇 PDF 没有可提取的文字层，可能是扫描版，暂不支持')
  }

  const id = newPaperId()
  await createPaperDir(root, id)
  const paths = libraryPaths(root, id)
  await fs.writeFile(paths.pdf, bytes)

  const meta = await extractMeta(bytes)
  const blocks = buildBlocksFromPages(pages)
  const now = Date.now()

  const entry: LibraryEntry = {
    id,
    title: meta.title ?? titleFromFileName(sourcePath),
    authors: meta.authors,
    year: null,
    doi: null,
    sourcePath,
    importedAt: now,
    tags: [],
    status: 'imported',
    progress: 0,
    pageCount: pages.length,
    blockCount: blocks.length
  }

  await writeJson(paths.meta, entry)
  const blocksFile: BlocksFile = {
    paperId: id,
    extractedAt: now,
    pageCount: pages.length,
    blocks
  }
  await writeJson(paths.blocks, blocksFile)
  await upsertEntry(root, entry)

  return entry
}

function describeError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err)
  if (/password|encrypted/i.test(message)) return '这篇 PDF 有密码保护，无法读取'
  if (/Invalid PDF|not a PDF|Missing PDF/i.test(message)) return '文件不是有效的 PDF'
  return message
}

export async function importPdfs(root: string, sourcePaths: string[]): Promise<ImportResult> {
  const result: ImportResult = { imported: [], failed: [] }
  for (const sourcePath of sourcePaths) {
    try {
      result.imported.push(await importPdf(root, sourcePath))
    } catch (err) {
      result.failed.push({ path: sourcePath, reason: describeError(err) })
    }
  }
  return result
}