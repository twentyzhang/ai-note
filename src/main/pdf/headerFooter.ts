import type { Line } from '../../shared/types'

const EDGE_RATIO = 0.09
const REPEAT_RATIO = 0.5
const MIN_PAGES = 3

function normalize(text: string): string {
  return text.toLowerCase().replace(/\d+/g, '#').replace(/\s+/g, ' ').trim()
}

export function dropHeaderFooter(pages: Line[][], pageHeight: number): Line[][] {
  if (pages.length < MIN_PAGES) return pages.map((p) => [...p])

  const topEdge = pageHeight * EDGE_RATIO
  const bottomEdge = pageHeight * (1 - EDGE_RATIO)
  const hits = new Map<string, number>()

  for (const page of pages) {
    const seen = new Set<string>()
    for (const line of page) {
      if (line.y > topEdge && line.bottom < bottomEdge) continue
      const key = normalize(line.text)
      if (key) seen.add(key)
    }
    for (const key of seen) hits.set(key, (hits.get(key) ?? 0) + 1)
  }

  const threshold = pages.length * REPEAT_RATIO
  const repeated = new Set(
    [...hits.entries()].filter(([, count]) => count > threshold).map(([key]) => key)
  )
  if (repeated.size === 0) return pages.map((p) => [...p])

  return pages.map((page) =>
    page.filter((line) => {
      const inEdge = line.y <= topEdge || line.bottom >= bottomEdge
      if (!inEdge) return true
      return !repeated.has(normalize(line.text))
    })
  )
}