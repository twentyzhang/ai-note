import type { Line, RawPage, TextItem } from '../../shared/types'
import { columnOf, detectGutter } from './columns'

function groupByBaseline(items: TextItem[]): TextItem[][] {
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x)
  const groups: TextItem[][] = []
  for (const item of sorted) {
    const current = groups[groups.length - 1]
    if (!current) {
      groups.push([item])
      continue
    }
    const tolerance = Math.max(2, current[0].fontSize * 0.5)
    if (Math.abs(item.y - current[0].y) <= tolerance) current.push(item)
    else groups.push([item])
  }
  return groups
}

function joinItems(items: TextItem[]): string {
  const sorted = [...items].sort((a, b) => a.x - b.x)
  let text = ''
  for (let i = 0; i < sorted.length; i++) {
    const current = sorted[i]
    if (i > 0) {
      const prev = sorted[i - 1]
      const gap = current.x - (prev.x + prev.w)
      if (gap > current.fontSize * 0.25) text += ' '
    }
    text += current.text
  }
  return text.replace(/\s+/g, ' ').trim()
}

function makeLine(page: number, group: TextItem[], column: number): Line {
  return {
    page,
    text: joinItems(group),
    x: Math.min(...group.map((i) => i.x)),
    right: Math.max(...group.map((i) => i.x + i.w)),
    y: Math.min(...group.map((i) => i.y)),
    bottom: Math.max(...group.map((i) => i.y + i.h)),
    fontSize: Math.max(...group.map((i) => i.fontSize)),
    column
  }
}

/**
 * 先分栏，再在各栏内部按基线合并成行，最后按「左栏读完再读右栏」的顺序输出。
 */
export function buildLines(page: RawPage): Line[] {
  const items = page.items.filter((i) => i.text.trim().length > 0)
  if (items.length === 0) return []

  const split = detectGutter(items, page.width)
  const buckets: TextItem[][] = [[], []]
  for (const item of items) buckets[columnOf(item, split)].push(item)

  const lines: Line[] = []
  for (let column = 0; column < buckets.length; column++) {
    if (split === null && column === 1) break
    for (const group of groupByBaseline(buckets[column])) {
      lines.push(makeLine(page.page, group, column))
    }
  }
  return lines
}