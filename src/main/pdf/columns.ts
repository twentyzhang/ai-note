import type { Line } from '../../shared/types'

const MIN_GAP_RATIO = 0.15
const MIN_SIDE_RATIO = 0.2
const MIN_SIDE_LINES = 3

export function detectColumns(lines: Line[], pageWidth: number): number | null {
  if (lines.length < MIN_SIDE_LINES * 2) return null

  const lefts = [...new Set(lines.map((l) => Math.round(l.x)))].sort((a, b) => a - b)
  let bestGap = 0
  let bestSplit = 0

  for (let i = 1; i < lefts.length; i++) {
    const gap = lefts[i] - lefts[i - 1]
    if (gap > bestGap) {
      bestGap = gap
      bestSplit = (lefts[i] + lefts[i - 1]) / 2
    }
  }

  if (bestGap < pageWidth * MIN_GAP_RATIO) return null

  const leftCount = lines.filter((l) => l.x < bestSplit).length
  const rightCount = lines.length - leftCount
  if (leftCount < MIN_SIDE_LINES || rightCount < MIN_SIDE_LINES) return null
  if (leftCount / lines.length < MIN_SIDE_RATIO) return null
  if (rightCount / lines.length < MIN_SIDE_RATIO) return null

  return bestSplit
}

export function assignColumns(lines: Line[], split: number | null): Line[] {
  if (split === null) return lines.map((l) => ({ ...l, column: 0 }))
  return lines.map((l) => ({ ...l, column: l.x < split ? 0 : 1 }))
}