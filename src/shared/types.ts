export interface TextItem {
  text: string
  x: number
  y: number
  w: number
  h: number
  fontSize: number
}

export interface RawPage {
  page: number
  width: number
  height: number
  items: TextItem[]
}

export interface Line {
  page: number
  text: string
  x: number
  right: number
  y: number
  bottom: number
  fontSize: number
  column: number
}

export type BlockType = 'heading' | 'paragraph' | 'caption' | 'reference' | 'other'

export interface Block {
  id: string
  page: number
  bbox: { x: number; y: number; w: number; h: number }
  type: BlockType
  text: string
}

export interface BlocksFile {
  paperId: string
  extractedAt: number
  pageCount: number
  blocks: Block[]
}

export interface PaperMeta {
  id: string
  title: string
  authors: string[]
  year: number | null
  doi: string | null
  sourcePath: string | null
  importedAt: number
  tags: string[]
}

export type PaperStatus = 'imported' | 'translating' | 'translated' | 'failed'

export interface LibraryEntry extends PaperMeta {
  status: PaperStatus
  progress: number
  pageCount: number
  blockCount: number
}

export interface LibraryIndex {
  version: 1
  papers: LibraryEntry[]
}

export interface ImportResult {
  imported: LibraryEntry[]
  failed: { path: string; reason: string }[]
}