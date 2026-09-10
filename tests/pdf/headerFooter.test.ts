import { describe, expect, it } from 'vitest'
import { dropHeaderFooter } from '../../src/main/pdf/headerFooter'
import type { Line } from '../../src/shared/types'

const PAGE_HEIGHT = 842

function line(text: string, y: number, page: number): Line {
  return { page, text, x: 60, right: 300, y, bottom: y + 12, fontSize: 9, column: 0 }
}

describe('页眉页脚剔除', () => {
  it('每页重复的页眉被删掉', () => {
    const pages = Array.from({ length: 4 }, (_, i) => [
      line('Journal of Testing Vol. 12', 30, i + 1),
      line(`这是第 ${i + 1} 页的正文内容`, 400, i + 1)
    ])
    const result = dropHeaderFooter(pages, PAGE_HEIGHT)
    expect(result.flat().some((l) => l.text.includes('Journal of Testing'))).toBe(false)
    expect(result.flat()).toHaveLength(4)
  })

  it('页码数字不同也算同一页脚', () => {
    const pages = Array.from({ length: 4 }, (_, i) => [
      line(`Page ${i + 1}`, 810, i + 1),
      line('正文', 400, i + 1)
    ])
    expect(dropHeaderFooter(pages, PAGE_HEIGHT).flat().every((l) => l.text === '正文')).toBe(true)
  })

  it('只出现在少数页面的页眉保留', () => {
    const pages = [
      [line('会议名称 A', 30, 1), line('正文', 400, 1)],
      [line('正文', 400, 2)],
      [line('正文', 400, 3)],
      [line('正文', 400, 4)]
    ]
    const result = dropHeaderFooter(pages, PAGE_HEIGHT)
    expect(result[0].some((l) => l.text === '会议名称 A')).toBe(true)
  })

  it('页面中间的重复内容不会被误删', () => {
    const pages = Array.from({ length: 4 }, (_, i) => [line('重复的小标题', 400, i + 1)])
    expect(dropHeaderFooter(pages, PAGE_HEIGHT).flat()).toHaveLength(4)
  })

  it('只有两页时不做任何删除', () => {
    const pages = [
      [line('Journal of Testing', 30, 1)],
      [line('Journal of Testing', 30, 2)]
    ]
    expect(dropHeaderFooter(pages, PAGE_HEIGHT).flat()).toHaveLength(2)
  })

  it('不修改传入的数据', () => {
    const pages = Array.from({ length: 4 }, (_, i) => [line('Page 1', 30, i + 1)])
    dropHeaderFooter(pages, PAGE_HEIGHT)
    expect(pages[0]).toHaveLength(1)
  })
})