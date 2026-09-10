// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import TranslationPane from '../../src/renderer/src/components/TranslationPane'
import type { Block, TranslationFile } from '../../src/shared/types'

function block(id: string): Block {
  return { id, page: 1, bbox: { x: 0, y: 0, w: 1, h: 1 }, type: 'paragraph', text: `原文 ${id}` }
}

const blocks = [block('b0'), block('b1'), block('b2')]

function translation(): TranslationFile {
  return {
    targetLang: 'zh',
    profileId: 'p1',
    model: 'm',
    updatedAt: 0,
    usage: { promptTokens: 0, completionTokens: 0 },
    blocks: {
      b0: { status: 'done', text: '这是第一段译文' },
      b1: { status: 'pending' },
      b2: { status: 'failed', error: 'AI 服务端暂时故障，稍后会自动重试' }
    }
  }
}

describe('译文面板', () => {
  it('已完成的段落显示译文', () => {
    render(<TranslationPane blocks={blocks} translation={translation()} onRetryFailed={() => {}} />)
    expect(screen.getByText('这是第一段译文')).toBeInTheDocument()
  })

  it('未完成的段落显示等待提示', () => {
    render(<TranslationPane blocks={blocks} translation={translation()} onRetryFailed={() => {}} />)
    expect(screen.getAllByText(/等待翻译/).length).toBeGreaterThan(0)
  })

  it('失败的段落显示中文原因并给出重试按钮', () => {
    render(<TranslationPane blocks={blocks} translation={translation()} onRetryFailed={() => {}} />)
    expect(screen.getByText(/AI 服务端暂时故障/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /重试失败的段落/ })).toBeInTheDocument()
  })

  it('点重试会回调', () => {
    const onRetryFailed = vi.fn()
    render(
      <TranslationPane blocks={blocks} translation={translation()} onRetryFailed={onRetryFailed} />
    )
    screen.getByRole('button', { name: /重试失败的段落/ }).click()
    expect(onRetryFailed).toHaveBeenCalled()
  })

  it('还没有翻译文件时全部显示等待', () => {
    render(<TranslationPane blocks={blocks} translation={null} onRetryFailed={() => {}} />)
    expect(screen.getAllByText(/等待翻译/)).toHaveLength(3)
  })

  it('每个段落带 data-block-id，供滚动同步定位', () => {
    const { container } = render(
      <TranslationPane blocks={blocks} translation={translation()} onRetryFailed={() => {}} />
    )
    expect(container.querySelector('[data-block-id="b1"]')).not.toBeNull()
  })
})