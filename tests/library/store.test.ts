import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createPaperDir,
  findEntry,
  libraryPaths,
  listEntries,
  readIndex,
  upsertEntry,
  writeIndex
} from '../../src/main/library/store'
import type { LibraryEntry } from '../../src/shared/types'

let root = ''

beforeEach(async () => {
  root = await fs.mkdtemp(join(tmpdir(), 'ai-note-lib-'))
})

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

function entry(id: string, title: string): LibraryEntry {
  return {
    id,
    title,
    authors: [],
    year: null,
    doi: null,
    sourcePath: null,
    importedAt: 1,
    tags: [],
    status: 'imported',
    progress: 0,
    pageCount: 3,
    blockCount: 12
  }
}

describe('库索引读写', () => {
  it('目录不存在时返回空索引', async () => {
    await expect(readIndex(root)).resolves.toEqual({ version: 1, papers: [] })
  })

  it('写入后能读回', async () => {
    await writeIndex(root, { version: 1, papers: [entry('aaaa1111', '论文甲')] })
    const index = await readIndex(root)
    expect(index.papers).toHaveLength(1)
    expect(index.papers[0].title).toBe('论文甲')
  })

  it('索引文件损坏时返回空索引而不是抛错', async () => {
    await fs.writeFile(join(root, 'index.json'), '{ 这不是 JSON', 'utf8')
    await expect(readIndex(root)).resolves.toEqual({ version: 1, papers: [] })
  })

  it('版本号不符时返回空索引', async () => {
    await fs.writeFile(join(root, 'index.json'), JSON.stringify({ version: 2, papers: [] }), 'utf8')
    await expect(readIndex(root)).resolves.toEqual({ version: 1, papers: [] })
  })
})

describe('论文条目增改查', () => {
  it('新增后再查得到', async () => {
    await upsertEntry(root, entry('aaaa1111', '论文甲'))
    expect((await findEntry(root, 'aaaa1111'))?.title).toBe('论文甲')
  })

  it('同 id 重复写入是覆盖而不是追加', async () => {
    await upsertEntry(root, entry('aaaa1111', '论文甲'))
    await upsertEntry(root, entry('aaaa1111', '论文甲修订'))
    const list = await listEntries(root)
    expect(list).toHaveLength(1)
    expect(list[0].title).toBe('论文甲修订')
  })

  it('列表按导入时间倒序排列', async () => {
    await upsertEntry(root, { ...entry('aaaa1111', '旧'), importedAt: 1 })
    await upsertEntry(root, { ...entry('bbbb2222', '新'), importedAt: 2 })
    expect((await listEntries(root)).map((p) => p.title)).toEqual(['新', '旧'])
  })

  it('查不到的 id 返回 null', async () => {
    await expect(findEntry(root, 'zzzz9999')).resolves.toBeNull()
  })
})

describe('论文目录', () => {
  it('创建目录并返回正确的文件路径', async () => {
    await createPaperDir(root, 'aaaa1111')
    const paths = libraryPaths(root, 'aaaa1111')
    expect(paths.pdf.endsWith(join('papers', 'aaaa1111', 'paper.pdf'))).toBe(true)
    await fs.access(paths.paperDir)
  })
})