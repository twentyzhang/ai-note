// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ReaderView from '../../src/renderer/src/views/ReaderView'

const mocks = vi.hoisted(() => {
  const g = globalThis as unknown as { window?: Record<string, unknown> }
  if (!g.window) g.window = {}
  const target = {
    listPapers: vi.fn(),
    importPdfs: vi.fn(),
    choosePdfFiles: vi.fn(),
    getBlocks: vi.fn(),
    readPdf: vi.fn(),
    getConfig: vi.fn(),
    saveConfig: vi.fn(),
    listProfiles: vi.fn(),
    saveProfile: vi.fn(),
    deleteProfile: vi.fn(),
    setApiKey: vi.fn(),
    testConnection: vi.fn(),
    startTranslation: vi.fn(),
    cancelTranslation: vi.fn(),
    readTranslation: vi.fn(),
    translateSelection: vi.fn(),
    onTranslationProgress: vi.fn(() => () => {})
  }
  g.window.api = target
  return target
})

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument: () => ({
    promise: Promise.reject(new Error('测试中不解析真实 PDF')),
    destroy: () => Promise.resolve()
  })
}))

vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: '' }))

const { readPdf, getBlocks, getConfig, listProfiles, readTranslation } = mocks

beforeEach(() => {
  vi.resetAllMocks()
  ;(globalThis as unknown as { window: { api: unknown } }).window.api = mocks
  getConfig.mockResolvedValue({
    version: 1,
    libraryRoot: 'C:/papers',
    activeProfileId: null,
    targetLang: 'zh'
  })
  listProfiles.mockResolvedValue([])
  readTranslation.mockResolvedValue(null)
  mocks.onTranslationProgress.mockReturnValue(() => {})
})

describe('阅读界面', () => {
  it('读取失败时给出中文提示而不是崩溃', async () => {
    readPdf.mockResolvedValue(null)
    getBlocks.mockResolvedValue(null)
    render(<ReaderView paperId="aaaa1111" onBack={() => {}} onOpenSettings={() => {}} />)
    expect(await screen.findByText(/找不到这篇论文/)).toBeInTheDocument()
  })

  it('加载中显示提示文案', () => {
    readPdf.mockReturnValue(new Promise(() => {}))
    getBlocks.mockReturnValue(new Promise(() => {}))
    render(<ReaderView paperId="aaaa1111" onBack={() => {}} onOpenSettings={() => {}} />)
    expect(screen.getByText(/正在打开/)).toBeInTheDocument()
  })

  it('加载完成后显示全文翻译按钮与进度栏', async () => {
    readPdf.mockResolvedValue(new Uint8Array([1, 2, 3]))
    getBlocks.mockResolvedValue({ paperId: 'aaaa1111', extractedAt: 0, pageCount: 1, blocks: [] })
    render(<ReaderView paperId="aaaa1111" onBack={() => {}} onOpenSettings={() => {}} />)
    expect(await screen.findByRole('button', { name: /全文翻译/ })).toBeInTheDocument()
    expect(screen.getByText(/已完成 0 \/ 0/)).toBeInTheDocument()
  })
})