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

describe('双栏页面', () => {
  function twoColumnPage(): RawPage {
    const items: TextItem[] = []
    for (let i = 0; i < 30; i++) {
      items.push(item({ text: `LEFT ${i}`, x: 60, y: 100 + i * 14, w: 200 }))
    }
    for (let i = 0; i < 30; i++) {
      items.push(item({ text: `RIGHT ${i}`, x: 310, y: 100 + i * 14, w: 200 }))
    }
    return page(items)
  }

  it('同一基线上的左右栏文字不会被拼成同一行', () => {
    const lines = buildLines(twoColumnPage())
    expect(lines).toHaveLength(60)
    for (const line of lines) {
      expect(line.text.startsWith('LEFT')).toBe(line.column === 0)
      expect(line.text.startsWith('RIGHT')).toBe(line.column === 1)
    }
  })

  it('输出顺序是先左栏读完再读右栏', () => {
    const lines = buildLines(twoColumnPage())
    const lastLeft = lines.findIndex((l) => l.text === 'LEFT 29')
    const firstRight = lines.findIndex((l) => l.text === 'RIGHT 0')
    expect(lastLeft).toBeGreaterThanOrEqual(0)
    expect(firstRight).toBeGreaterThan(lastLeft)
  })

  it('每个片段保留自己的完整文本，不与其他栏混合', () => {
    const lines = buildLines(twoColumnPage())
    const leftZero = lines.find((l) => l.text.startsWith('LEFT 0'))
    expect(leftZero?.text).toBe('LEFT 0')
    expect(leftZero?.text).not.toContain('RIGHT')
  })
})