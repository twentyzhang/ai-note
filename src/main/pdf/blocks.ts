import type { Block, BlockType, Line, RawPage } from '../../shared/types'
import { assignColumns, detectColumns } from './columns'
import { dropHeaderFooter } from './headerFooter'
import { buildLines } from './lines'

const HEADING_SIZE_RATIO = 1.15
const CAPTION_PATTERN = /^(figure|fig\.?|table|tab\.?)\s*\d+/i
const HEADING_PATTERN = /^(\d+(\.\d+)*|[IVX]+\.)\s+\S/

export function classifyLine(line: Line, bodyFontSize: number): BlockType {
  const text = line.text.trim()
  if (CAPTION_PATTERN.test(text)) return 'caption'
  if (line.fontSize >= bodyFontSize * HEADING_SIZE_RATIO) return 'heading'
  if (HEADING_PATTERN.test(text)) return 'heading'
  const letters = text.replace(/[^A-Za-z]/g, '')
  if (letters.length > 3 && text.length < 80 && letters === letters.toUpperCase()) return 'heading'
  return 'paragraph'
}

export function mergeIntoParagraphs(lines: Line[]): Line[][] {
  const groups: Line[][] = []
  let current: Line[] = []
  let columnRight = 0

  for (const line of lines) {
    columnRight = Math.max(columnRight, line.right)
    if (current.length === 0) {
      current = [line]
      continue
    }
    const prev = current[current.length - 1]
    const leading = Math.max(1, prev.bottom - prev.y)
    const gap = line.y - prev.bottom
    const shortPreviousLine = prev.right < columnRight - prev.fontSize * 1.5
    if (gap > leading * 0.35 || shortPreviousLine) {
      groups.push(current)
      current = [line]
    } else {
      current.push(line)
    }
  }

  if (current.length > 0) groups.push(current)
  return groups
}

function bodyFontSizeOf(lines: Line[]): number {
  if (lines.length === 0) return 10
  const sizes = lines.map((l) => l.fontSize).sort((a, b) => a - b)
  return sizes[Math.floor(sizes.length / 2)]
}

export function buildBlocks(pages: Line[][], pageWidth: number): Block[] {
  const blocks: Block[] = []

  for (const pageLines of pages) {
    if (pageLines.length === 0) continue
    const page = pageLines[0].page
    const bodyFontSize = bodyFontSizeOf(pageLines)
    const split = detectColumns(pageLines, pageWidth)
    const withColumns = assignColumns(pageLines, split)
    const ordered = [0, 1].flatMap((column) =>
      withColumns.filter((l) => l.column === column).sort((a, b) => a.y - b.y)
    )

    let sequence = 0
    for (const group of mergeIntoParagraphs(ordered)) {
      const x = Math.min(...group.map((l) => l.x))
      const right = Math.max(...group.map((l) => l.right))
      const y = Math.min(...group.map((l) => l.y))
      const bottom = Math.max(...group.map((l) => l.bottom))
      blocks.push({
        id: `p${page}-b${String(sequence).padStart(2, '0')}`,
        page,
        bbox: { x, y, w: right - x, h: bottom - y },
        type: classifyLine(group[0], bodyFontSize),
        text: group.map((l) => l.text).join(' ').replace(/\s+/g, ' ').trim()
      })
      sequence += 1
    }
  }

  return blocks
}

export function buildBlocksFromPages(pages: RawPage[]): Block[] {
  const height = pages[0]?.height ?? 842
  const width = pages[0]?.width ?? 595
  const linePages = pages.map((p) => buildLines(p))
  return buildBlocks(dropHeaderFooter(linePages, height), width)
}