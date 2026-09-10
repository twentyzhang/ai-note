import { describe, expect, it } from 'vitest'
import { columnOf, detectGutter } from '../../src/main/pdf/columns'
import type { TextItem } from '../../src/shared/types'

const PAGE_WIDTH = 595

function item(x: number, y: number, w = 200): TextItem {
  return { text: 'x', x, y, w, h: 12, fontSize: 10 }
}

function twoColumnItems(): TextItem[] {
  const items: TextItem[] = []
  for (let i = 0; i < 30; i++) items.push(item(60, 100 + i * 14))
  for (let i = 0; i < 30; i++) items.push(item(310, 100 + i * 14))
  return items
}

describe('栏缝检测', () => {
  it('双栏页面能检测出中间的竖直空白带', () => {
    const split = detectGutter(twoColumnItems(), PAGE_WIDTH)
    expect(split).not.toBeNull()
    expect(split!).toBeGreaterThan(260)
    expect(split!).toBeLessThan(310)
  })

  it('单栏页面返回 null', () => {
    const items: TextItem[] = []
    for (let i = 0; i < 30; i++) items.push(item(60, 100 + i * 14))
    expect(detectGutter(items, PAGE_WIDTH)).toBeNull()
  })

  it('右侧几乎没内容时不判为双栏', () => {
    const items: TextItem[] = []
    for (let i = 0; i < 100; i++) items.push(item(60, 100 + i * 12))
    items.push(item(310, 100), item(310, 120), item(310, 140))
    expect(detectGutter(items, PAGE_WIDTH)).toBeNull()
  })

  it('条目太少时不做判断', () => {
    expect(detectGutter([item(60, 100), item(310, 120)], PAGE_WIDTH)).toBeNull()
  })
})

describe('栏归属', () => {
  it('按栏缝把片段分到左右栏', () => {
    expect(columnOf(item(60, 100), 285)).toBe(0)
    expect(columnOf(item(310, 100), 285)).toBe(1)
  })

  it('单栏时全部归到第 0 栏', () => {
    expect(columnOf(item(60, 100), null)).toBe(0)
    expect(columnOf(item(310, 100), null)).toBe(0)
  })
})