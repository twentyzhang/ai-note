import { describe, expect, it } from 'vitest'
import { blockTop, pickBlockIdAt } from '../../src/renderer/src/lib/scrollSync'
import type { Block } from '../../src/shared/types'

function block(id: string, page: number, y: number, h = 40): Block {
  return { id, page, bbox: { x: 0, y, w: 100, h }, type: 'paragraph', text: id }
}

const blocks = [block('a', 1, 100), block('b', 1, 300), block('c', 2, 50)]
const offsets = [0, 900]
const scale = 1.5

describe('段落屏幕位置', () => {
  it('第一页的位置是页面偏移加缩放后的 y', () => {
    expect(blockTop(blocks[0], offsets, scale)).toBe(150)
  })

  it('第二页要加上第二页的页面偏移', () => {
    expect(blockTop(blocks[2], offsets, scale)).toBe(900 + 75)
  })

  it('页码超出偏移表时返回 0 而不是崩溃', () => {
    expect(blockTop(block('z', 9, 10), offsets, scale)).toBe(0)
  })
})

describe('按滚动位置挑选当前段落', () => {
  it('滚到最顶端时是第一段', () => {
    expect(pickBlockIdAt(blocks, offsets, scale, 0)).toBe('a')
  })

  it('滚到两段之间时取已经进入视野的那一段', () => {
    expect(pickBlockIdAt(blocks, offsets, scale, 200)).toBe('a')
    expect(pickBlockIdAt(blocks, offsets, scale, 460)).toBe('b')
  })

  it('滚到第二页时取第二页的段落', () => {
    expect(pickBlockIdAt(blocks, offsets, scale, 1000)).toBe('c')
  })

  it('没有段落时返回 null', () => {
    expect(pickBlockIdAt([], offsets, scale, 0)).toBeNull()
  })
})