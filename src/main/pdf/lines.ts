import type { Line, RawPage, TextItem } from '../../shared/types'

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

export function buildLines(page: RawPage): Line[] {
  return groupByBaseline(page.items.filter((i) => i.text.trim().length > 0))
    .map((group) => {
      const x = Math.min(...group.map((i) => i.x))
      const right = Math.max(...group.map((i) => i.x + i.w))
      const y = Math.min(...group.map((i) => i.y))
      const bottom = Math.max(...group.map((i) => i.y + i.h))
      const fontSize = Math.max(...group.map((i) => i.fontSize))
      return {
        page: page.page,
        text: joinItems(group),
        x,
        right,
        y,
        bottom,
        fontSize,
        column: 0
      }
    })
    .filter((line) => line.text.length > 0)
}