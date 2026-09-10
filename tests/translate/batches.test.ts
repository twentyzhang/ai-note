import { describe, expect, it } from 'vitest'
import { planBatches } from '../../src/main/translate/batches'
import type { Block } from '../../src/shared/types'

function block(id: string, textLength = 100): Block {
  return {
    id,
    page: 1,
    bbox: { x: 0, y: 0, w: 10, h: 10 },
    type: 'paragraph',
    text: 'x'.repeat(textLength)
  }
}

const options = { maxBatchBlocks: 3, maxBatchChars: 250 }

describe('分批策略', () => {
  it('按段数上限切分', () => {
    const blocks = [block('b0'), block('b1'), block('b2'), block('b3'), block('b4')]
    const batches = planBatches(blocks, { maxBatchBlocks: 2, maxBatchChars: 100000 })
    expect(batches.map((b) => b.length)).toEqual([2, 2, 1])
  })

  it('按字符数上限切分', () => {
    const blocks = [block('b0', 100), block('b1', 100), block('b2', 100)]
    const batches = planBatches(blocks, { maxBatchBlocks: 100, maxBatchChars: 150 })
    expect(batches.map((b) => b.length)).toEqual([1, 1, 1])
  })

  it('段数与字符数谁先到就按谁切', () => {
    const blocks = [block('b0', 10), block('b1', 10), block('b2', 10), block('b3', 10)]
    const batches = planBatches(blocks, { maxBatchBlocks: 3, maxBatchChars: 25 })
    expect(batches.map((b) => b.length)).toEqual([2, 2])
  })

  it('单段超过字符上限时自己独占一批而不是死循环', () => {
    const blocks = [block('b0', 9999)]
    const batches = planBatches(blocks, { maxBatchBlocks: 3, maxBatchChars: 100 })
    expect(batches).toHaveLength(1)
    expect(batches[0]).toHaveLength(1)
  })

  it('保持原始顺序', () => {
    const blocks = [block('b0'), block('b1'), block('b2')]
    const batches = planBatches(blocks, { maxBatchBlocks: 2, maxBatchChars: 100000 })
    expect(batches.flat().map((b) => b.id)).toEqual(['b0', 'b1', 'b2'])
  })

  it('空输入返回空数组', () => {
    expect(planBatches([], options)).toEqual([])
  })
})