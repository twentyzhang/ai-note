import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { LibraryEntry, LibraryIndex } from '../../shared/types'

const INDEX_FILE = 'index.json'

export function libraryPaths(root: string, paperId: string) {
  const paperDir = path.join(root, 'papers', paperId)
  return {
    root,
    index: path.join(root, INDEX_FILE),
    paperDir,
    pdf: path.join(paperDir, 'paper.pdf'),
    meta: path.join(paperDir, 'meta.json'),
    blocks: path.join(paperDir, 'blocks.json')
  }
}

function emptyIndex(): LibraryIndex {
  return { version: 1, papers: [] }
}

export async function readIndex(root: string): Promise<LibraryIndex> {
  try {
    const raw = await fs.readFile(path.join(root, INDEX_FILE), 'utf8')
    const parsed = JSON.parse(raw) as Partial<LibraryIndex>
    if (parsed?.version !== 1 || !Array.isArray(parsed.papers)) return emptyIndex()
    return { version: 1, papers: parsed.papers as LibraryEntry[] }
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'ENOENT' || err instanceof SyntaxError) return emptyIndex()
    throw err
  }
}

export async function writeIndex(root: string, index: LibraryIndex): Promise<void> {
  await fs.mkdir(root, { recursive: true })
  const target = path.join(root, INDEX_FILE)
  const tmp = `${target}.tmp`
  await fs.writeFile(tmp, JSON.stringify(index, null, 2), 'utf8')
  await fs.rename(tmp, target)
}

export async function upsertEntry(root: string, entry: LibraryEntry): Promise<LibraryIndex> {
  const index = await readIndex(root)
  const at = index.papers.findIndex((p) => p.id === entry.id)
  if (at >= 0) index.papers[at] = entry
  else index.papers.push(entry)
  await writeIndex(root, index)
  return index
}

export async function listEntries(root: string): Promise<LibraryEntry[]> {
  const index = await readIndex(root)
  return [...index.papers].sort((a, b) => b.importedAt - a.importedAt)
}

export async function findEntry(root: string, paperId: string): Promise<LibraryEntry | null> {
  const index = await readIndex(root)
  return index.papers.find((p) => p.id === paperId) ?? null
}

export async function createPaperDir(root: string, paperId: string): Promise<void> {
  await fs.mkdir(libraryPaths(root, paperId).paperDir, { recursive: true })
}

export async function writeJson(file: string, value: unknown): Promise<void> {
  const tmp = `${file}.tmp`
  await fs.writeFile(tmp, JSON.stringify(value, null, 2), 'utf8')
  await fs.rename(tmp, file)
}

export async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8')) as T
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'ENOENT' || err instanceof SyntaxError) return null
    throw err
  }
}