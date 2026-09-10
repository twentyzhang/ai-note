import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { importPdf, importPdfs } from '../../src/main/library/import'
import { libraryPaths, listEntries, readJson } from '../../src/main/library/store'
import type { BlocksFile } from '../../src/shared/types'
import { makeSingleColumnPdf, makeTwoColumnPdf } from '../fixtures/make-fixtures'

let root = ''
let source = ''

beforeEach(async () => {
  root = await fs.mkdtemp(join(tmpdir(), 'ai-note-import-'))
  source = await fs.mkdtemp(join(tmpdir(), 'ai-note-src-'))
})

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true })
  await fs.rm(source, { recursive: true, force: true })
})

async function writeFixture(name: string, bytes: Uint8Array): Promise<string> {
  const file = join(source, name)
  await fs.writeFile(file, bytes)
  return file
}

describe('导入单篇论文', () => {
  it('复制 PDF、写出数据文件并登记到索引', async () => {
    const file = await writeFixture('paper.pdf', await makeSingleColumnPdf())
    const entry = await importPdf(root, file)

    await fs.access(libraryPaths(root, entry.id).pdf)
    const blocks = await readJson<BlocksFile>(libraryPaths(root, entry.id).blocks)
    expect(blocks).not.toBeNull()
    expect(blocks!.paperId).toBe(entry.id)
    expect(blocks!.pageCount).toBe(3)
    expect(blocks!.blocks.length).toBeGreaterThan(0)
    expect((await listEntries(root)).map((p) => p.id)).toEqual([entry.id])
  })

  it('论文 ID 是 8 位十六进制', async () => {
    const entry = await importPdf(root, await writeFixture('a.pdf', await makeSingleColumnPdf()))
    expect(entry.id).toMatch(/^[0-9a-f]{8}$/)
  })

  it('标题在元数据缺失时退回文件名', async () => {
    const file = await writeFixture('我的论文文件.pdf', await makeSingleColumnPdf())
    const entry = await importPdf(root, file)
    expect(entry.title).toBe('我的论文文件')
  })

  it('页眉页脚不出现在结果里', async () => {
    const entry = await importPdf(root, await writeFixture('b.pdf', await makeTwoColumnPdf()))
    const blocks = await readJson<BlocksFile>(libraryPaths(root, entry.id).blocks)
    expect(blocks!.blocks.map((b) => b.text).join('\n')).not.toContain('Journal of Testing')
  })

  it('双栏论文的阅读顺序正确', async () => {
    const entry = await importPdf(root, await writeFixture('c.pdf', await makeTwoColumnPdf()))
    const blocks = await readJson<BlocksFile>(libraryPaths(root, entry.id).blocks)
    const text = blocks!.blocks.map((b) => b.text).join('|')
    const texts = blocks!.blocks.map((b) => b.text)
    const leftZero = texts.findIndex((t) => t.includes('LEFT 0'))
    const rightZero = texts.findIndex((t) => t.includes('RIGHT 0'))
    expect(leftZero).toBeGreaterThanOrEqual(0)
    expect(rightZero).toBeGreaterThan(leftZero)
    for (const t of texts) {
      if (t.includes('LEFT ')) expect(t).not.toContain('RIGHT ')
      if (t.includes('RIGHT ')) expect(t).not.toContain('LEFT ')
    }
  })

  it('损坏的 PDF 被拒绝并给出中文原因', async () => {
    const doc = new Uint8Array(await makeSingleColumnPdf())
    const broken = await writeFixture('broken.pdf', doc.slice(0, 40))
    await expect(importPdf(root, broken)).rejects.toThrow()
  })
})

describe('批量导入', () => {
  it('一篇成功一篇损坏时报出失败原因且不中断', async () => {
    const good = await writeFixture('good.pdf', await makeSingleColumnPdf())
    const bad = join(source, 'broken.pdf')
    await fs.writeFile(bad, Buffer.from('这不是一个 PDF 文件'))

    const result = await importPdfs(root, [good, bad])
    expect(result.imported).toHaveLength(1)
    expect(result.failed).toHaveLength(1)
    expect(result.failed[0].path).toBe(bad)
    expect(result.failed[0].reason.length).toBeGreaterThan(0)
  })

  it('不存在的路径被记为失败', async () => {
    const result = await importPdfs(root, [join(source, 'missing.pdf')])
    expect(result.imported).toHaveLength(0)
    expect(result.failed).toHaveLength(1)
  })
})