// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SelectionPopover from '../../src/renderer/src/components/SelectionPopover'

const mocks = vi.hoisted(() => {
  const g = globalThis as unknown as { window?: Record<string, unknown> }
  if (!g.window) g.window = {}
  const target = { translateSelection: vi.fn() }
  g.window.api = target
  return target
})

beforeEach(() => {
  vi.resetAllMocks()
  ;(globalThis as unknown as { window: { api: unknown } }).window.api = mocks
})

describe('选中即译气泡', () => {
  it('展示选中原文并自动发起翻译', async () => {
    mocks.translateSelection.mockResolvedValue('这是选中文本的译文')
    render(<SelectionPopover text="selected text" top={10} left={10} onClose={() => {}} />)
    expect(screen.getByText('selected text')).toBeInTheDocument()
    expect(await screen.findByText('这是选中文本的译文')).toBeInTheDocument()
    expect(mocks.translateSelection).toHaveBeenCalledWith('selected text')
  })

  it('翻译失败时显示中文原因而不是崩溃', async () => {
    mocks.translateSelection.mockRejectedValue(new Error('连不上 AI 服务'))
    render(<SelectionPopover text="boom" top={0} left={0} onClose={() => {}} />)
    expect(await screen.findByText(/连不上 AI 服务/)).toBeInTheDocument()
  })

  it('有关闭按钮并会回调', async () => {
    mocks.translateSelection.mockResolvedValue('x')
    const onClose = vi.fn()
    render(<SelectionPopover text="abc" top={0} left={0} onClose={onClose} />)
    await screen.findByText('x')
    fireEvent.click(screen.getByRole('button', { name: /关闭/ }))
    expect(onClose).toHaveBeenCalled()
  })
})