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
    readPdf: vi.fn()
  }
  g.window.api = target
  return target
})

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument: () => ({ promise: Promise.reject(new Error('测试中不解析真实 PDF')) })
}))

vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: '' }))

const { readPdf, getBlocks } = mocks

beforeEach(() => {
  vi.resetAllMocks()
  ;(globalThis as unknown as { window: { api: unknown } }).window.api = mocks
})

describe('阅读界面', () => {
  it('读取失败时给出中文提示而不是崩溃', async () => {
    readPdf.mockResolvedValue(null)
    getBlocks.mockResolvedValue(null)
    render(<ReaderView paperId="aaaa1111" onBack={() => {}} />)
    expect(await screen.findByText(/找不到这篇论文/)).toBeInTheDocument()
  })

  it('加载中显示提示文案', () => {
    readPdf.mockReturnValue(new Promise(() => {}))
    getBlocks.mockReturnValue(new Promise(() => {}))
    render(<ReaderView paperId="aaaa1111" onBack={() => {}} />)
    expect(screen.getByText(/正在打开/)).toBeInTheDocument()
  })
})