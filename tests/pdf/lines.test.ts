import { describe, expect, it } from 'vitest'
import { buildLines } from '../../src/main/pdf/lines'
import type { RawPage, TextItem } from '../../src/shared/types'

function item(partial: Partial<TextItem>): TextItem {
  return { text: 'x', x: 0, y: 0, w: 10, h: 10, fontSize: 10, ...partial }
}

function page(items: TextItem[]): RawPage {
  return { page: 1, width: 595, height: 842, items }
}

describe('文本片段合并成行', () => {
  it('同一 y 的多个片段合成一行', () => {
    const lines = buildLines(
      page([
        item({ text: 'Hello', x: 60, y: 100, w: 30 }),
        item({ text: 'world', x: 200, y: 101, w: 30 })
      ])
    )
    expect(lines).toHaveLength(1)
    expect(lines[0].text).toBe('Hello world')
  })

  it('y 差值超过容差的分成两行并按 y 排序', () => {
    const lines = buildLines(
      page([
        item({ text: '第二行', x: 60, y: 130 }),
        item({ text: '第一行', x: 60, y: 100 })
      ])
    )
    expect(lines.map((l) => l.text)).toEqual(['第一行', '第二行'])
  })

  it('紧挨着的片段之间不加空格', () => {
    const lines = buildLines(
      page([
        item({ text: '前', x: 60, y: 100, w: 10 }),
        item({ text: '后', x: 70, y: 100, w: 10 })
      ])
    )
    expect(lines[0].text).toBe('前后')
  })

  it('行的包围盒取所有片段的并集', () => {
    const lines = buildLines(
      page([
        item({ text: 'a', x: 60, y: 100, w: 20, h: 12 }),
        item({ text: 'b', x: 120, y: 100, w: 30, h: 12 })
      ])
    )
    expect(lines[0].x).toBe(60)
    expect(lines[0].right).toBe(150)
    expect(lines[0].bottom).toBe(112)
  })

  it('空白片段被忽略', () => {
    const lines = buildLines(page([item({ text: '   ', x: 60, y: 100 })]))
    expect(lines).toHaveLength(0)
  })

  it('列的初始值都是 0', () => {
    const lines = buildLines(page([item({ text: 'a', x: 60, y: 100 })]))
    expect(lines[0].column).toBe(0)
  })
})