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
export interface AiProfile {
  id: string
  name: string
  baseUrl: string
  model: string
  concurrency: number
  maxBatchBlocks: number
  maxBatchChars: number
  pricePerMTokIn: number | null
  pricePerMTokOut: number | null
}

export interface AppConfig {
  version: 1
  libraryRoot: string
  activeProfileId: string | null
  targetLang: 'zh'
}

export type TranslationStatus = 'pending' | 'streaming' | 'done' | 'failed'

export interface TranslationBlockResult {
  status: TranslationStatus
  text?: string
  error?: string
  attempts?: number
}

export interface TokenUsage {
  promptTokens: number
  completionTokens: number
}

export interface TranslationFile {
  targetLang: string
  profileId: string
  model: string
  updatedAt: number
  usage: TokenUsage
  blocks: Record<string, TranslationBlockResult>
}

export interface TranslateProgress {
  paperId: string
  done: number
  failed: number
  total: number
  running: boolean
  usage: TokenUsage
  lastError: string | null
}
