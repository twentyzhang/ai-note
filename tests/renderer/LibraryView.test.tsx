// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import LibraryView from '../../src/renderer/src/views/LibraryView'
import type { LibraryEntry } from '../../src/shared/types'

// api.ts 在模块加载时就会读取 window.api，所以 mock 必须在导入之前就位
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

const { listPapers, importPdfs, choosePdfFiles } = mocks

function entry(over: Partial<LibraryEntry> = {}): LibraryEntry {
  return {
    id: 'aaaa1111',
    title: '注意力就是全部',
    authors: ['张三'],
    year: 2017,
    doi: null,
    sourcePath: null,
    importedAt: 1,
    tags: [],
    status: 'imported',
    progress: 0,
    pageCount: 11,
    blockCount: 220,
    ...over
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  ;(globalThis as unknown as { window: { api: unknown } }).window.api = mocks
})

describe('论文库界面', () => {
  it('加载后展示论文标题', async () => {
    listPapers.mockResolvedValue([entry()])
    render(<LibraryView />)
    expect(await screen.findByText('注意力就是全部')).toBeInTheDocument()
  })

  it('空库时显示引导文案', async () => {
    listPapers.mockResolvedValue([])
    render(<LibraryView />)
    expect(await screen.findByText(/把 PDF 拖进来/)).toBeInTheDocument()
  })

  it('显示页数与段落数', async () => {
    listPapers.mockResolvedValue([entry()])
    render(<LibraryView />)
    expect(await screen.findByText(/11 页/)).toBeInTheDocument()
    expect(await screen.findByText(/220 段/)).toBeInTheDocument()
  })

  it('点导入按钮会拉起文件选择并刷新列表', async () => {
    listPapers.mockResolvedValueOnce([]).mockResolvedValueOnce([entry()])
    choosePdfFiles.mockResolvedValue(['C:/papers/a.pdf'])
    importPdfs.mockResolvedValue({ imported: [entry()], failed: [] })

    render(<LibraryView />)
    const button = await screen.findByRole('button', { name: /导入 PDF/ })
    fireEvent.click(button)

    await waitFor(() => expect(choosePdfFiles).toHaveBeenCalled())
    expect(await screen.findByText('注意力就是全部')).toBeInTheDocument()
  })

  it('导入失败时用中文说明原因', async () => {
    listPapers.mockResolvedValue([])
    choosePdfFiles.mockResolvedValue(['C:/papers/bad.pdf'])
    importPdfs.mockResolvedValue({
      imported: [],
      failed: [{ path: 'C:/papers/bad.pdf', reason: '文件不是有效的 PDF' }]
    })

    render(<LibraryView />)
    fireEvent.click(await screen.findByRole('button', { name: /导入 PDF/ }))

    expect(await screen.findByText(/文件不是有效的 PDF/)).toBeInTheDocument()
  })
})