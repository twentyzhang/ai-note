import type { Block } from '../../shared/types'

export interface BatchOptions {
  maxBatchBlocks: number
  maxBatchChars: number
}

export function planBatches(blocks: Block[], options: BatchOptions): Block[][] {
  const maxBlocks = Math.max(1, options.maxBatchBlocks)
  const maxChars = Math.max(1, options.maxBatchChars)

  const batches: Block[][] = []
  let current: Block[] = []
  let chars = 0

  for (const block of blocks) {
    const size = block.text.length
    const wouldExceedBlocks = current.length >= maxBlocks
    const wouldExceedChars = current.length > 0 && chars + size > maxChars

    if (wouldExceedBlocks || wouldExceedChars) {
      batches.push(current)
      current = []
      chars = 0
    }

    current.push(block)
    chars += size
  }

  if (current.length > 0) batches.push(current)
  return batches
}