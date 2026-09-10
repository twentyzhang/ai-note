import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { importPdf } from '../src/main/library/import'
import { libraryPaths, readJson } from '../src/main/library/store'
import type { BlocksFile } from '../src/shared/types'

function truncate(text: string, n = 110): string {
  const flat = text.replace(/\s+/g, ' ')
  return flat.length > n ? flat.slice(0, n) + '…' : flat
}

async function main(): Promise<void> {
  const target = process.argv[2]
  if (!target) {
    console.error('用法: npm run inspect -- "某篇论文.pdf"')
    process.exit(1)
  }

  const root = await fs.mkdtemp(join(tmpdir(), 'ai-note-inspect-'))
  const started = Date.now()
  const entry = await importPdf(root, target)
  const elapsed = Date.now() - started

  const blocksFile = await readJson<BlocksFile>(libraryPaths(root, entry.id).blocks)
  const blocks = blocksFile?.blocks ?? []

  const counts = new Map<string, number>()
  for (const b of blocks) counts.set(b.type, (counts.get(b.type) ?? 0) + 1)

  console.log('=== 导入结果 ===')
  console.log(`标题: ${entry.title}`)
  console.log(`作者: ${entry.authors.join(' / ') || '(未识别)'}`)
  console.log(`页数: ${entry.pageCount}   段落数: ${entry.blockCount}   耗时: ${elapsed} ms`)
  console.log(`每页平均段落: ${(blocks.length / entry.pageCount).toFixed(1)}`)
  console.log(`段落类型: ${[...counts.entries()].map(([k, v]) => `${k}=${v}`).join('  ')}`)

  console.log('\n=== 前 6 段 ===')
  for (const b of blocks.slice(0, 6)) {
    console.log(`[${b.id}] ${b.type} p${b.page} y=${Math.round(b.bbox.y)} :: ${truncate(b.text)}`)
  }

  console.log('\n=== 第 2 页全部段落（看双栏阅读顺序）===')
  for (const b of blocks.filter((x) => x.page === 2)) {
    console.log(`[${b.id}] ${b.type} x=${Math.round(b.bbox.x)} y=${Math.round(b.bbox.y)} :: ${truncate(b.text, 70)}`)
  }

  console.log('\n=== 最后 5 段（看参考文献区）===')
  for (const b of blocks.slice(-5)) {
    console.log(`[${b.id}] ${b.type} p${b.page} :: ${truncate(b.text)}`)
  }

  const all = blocks.map((b) => b.text).join('\n')
  console.log('\n=== 体检 ===')
  console.log(`总字符数: ${all.length}`)
  console.log(`疑似残留页码行: ${blocks.filter((b) => /^page\s*\d+$/i.test(b.text.trim())).length}`)
  console.log(`过短段落(<=2 字): ${blocks.filter((b) => b.text.length <= 2).length}`)
  console.log(`过长段落(>3000 字): ${blocks.filter((b) => b.text.length > 3000).length}`)
  console.log(`被识别为标题的段落: ${blocks.filter((b) => b.type === 'heading').length}`)

  await fs.rm(root, { recursive: true, force: true })
}

void main()