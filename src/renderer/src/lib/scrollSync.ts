import type { Block } from '../../../shared/types'

export const PDF_SCALE = 1.5

export function blockTop(block: Block, pageOffsets: number[], scale: number): number {
  const offset = pageOffsets[block.page - 1]
  if (offset === undefined) return 0
  return offset + block.bbox.y * scale
}

export function pickBlockIdAt(
  blocks: Block[],
  pageOffsets: number[],
  scale: number,
  scrollTop: number
): string | null {
  let best: string | null = null
  let bestTop = -Infinity
  for (const block of blocks) {
    const top = blockTop(block, pageOffsets, scale)
    if (top <= scrollTop + 8 && top > bestTop) {
      bestTop = top
      best = block.id
    }
  }
  if (best) return best
  return blocks.length > 0 ? blocks[0].id : null
}