import { describe, expect, it } from 'vitest'
import { buildBlocks, classifyLine, mergeIntoParagraphs } from '../../src/main/pdf/blocks'
import type { Line } from '../../src/shared/types'

function line(partial: Partial<Line> & { text: string; y: number }): Line {
  const { text, y, ...rest } = partial
  return {
    page: 1,
    text,
    x: 60,
    right: 500,
    y,
    bottom: y + 12,
    fontSize: 10,
    column: 0,
    ...rest
  }
}

describe('行类型判定', () => {
  it('字号明显更大的行判为标题', () => {
    expect(classifyLine(line({ text: 'Introduction', y: 100, fontSize: 16 }), 10)).toBe('heading')
  })

  it('以编号开头的行判为标题', () => {
    expect(classifyLine(line({ text: '3.2 Model Architecture', y: 100 }), 10)).toBe('heading')
  })

  it('普通正文行判为段落', () => {
    expect(classifyLine(line({ text: 'We propose a method', y: 100 }), 10)).toBe('paragraph')
  })

  it('以图字开头的行判为图注', () => {
    expect(classifyLine(line({ text: 'Figure 3: Results on WMT', y: 100 }), 10)).toBe('caption')
  })
})

describe('行合并成段落', () => {
  it('行距连续的若干行合并成一段', () => {
    const merged = mergeIntoParagraphs([
      line({ text: '第一行内容，', y: 100, right: 500 }),
      line({ text: '第二行内容，', y: 114, right: 500 }),
      line({ text: '第三行内容。', y: 128, right: 300 })
    ])
    expect(merged).toHaveLength(1)
  })

  it('段末是短行时下一行开新段', () => {
    const merged = mergeIntoParagraphs([
      line({ text: '这是上一段的结尾。', y: 100, right: 300 }),
      line({ text: '这是新一段的开始。', y: 116, right: 500 })
    ])
    expect(merged).toHaveLength(2)
  })

  it('明显的段间距会断开', () => {
    const merged = mergeIntoParagraphs([
      line({ text: '上一段。', y: 100, right: 500 }),
      line({ text: '下一段。', y: 160, right: 500 })
    ])
    expect(merged).toHaveLength(2)
  })
})

describe('整页段落重建', () => {
  function twoColumnLines(): Line[] {
    const lines: Line[] = []
    for (let i = 0; i < 10; i++) {
      lines.push(line({ text: `LEFT ${i}`, x: 60, y: 120 + i * 14, right: 280, column: 0 }))
    }
    for (let i = 0; i < 10; i++) {
      lines.push(line({ text: `RIGHT ${i}`, x: 310, y: 120 + i * 14, right: 530, column: 1 }))
    }
    return lines
  }

  it('先输出左栏的全部段落，再输出右栏的', () => {
    const blocks = buildBlocks([twoColumnLines()])
    const text = blocks.map((b) => b.text).join('|')
    expect(text.indexOf('LEFT 0')).toBeLessThan(text.indexOf('RIGHT 0'))
    expect(text.indexOf('LEFT 9')).toBeLessThan(text.indexOf('RIGHT 0'))
    expect(text).toContain('RIGHT 9')
  })

  it('左右两栏的段落不会被合并到一起', () => {
    const blocks = buildBlocks([twoColumnLines()])
    for (const block of blocks) {
      if (block.text.includes('LEFT')) expect(block.text).not.toContain('RIGHT')
      if (block.text.includes('RIGHT')) expect(block.text).not.toContain('LEFT')
    }
  })

  it('段落 ID 按页码与页内序号生成', () => {
    const blocks = buildBlocks([
      [line({ text: 'a', y: 100, page: 1 })],
      [line({ text: 'b', y: 100, page: 2 })]
    ])
    expect(blocks[0].id).toBe('p1-b00')
    expect(blocks[1].id).toBe('p2-b00')
  })

  it('块的包围盒覆盖段内所有行', () => {
    const blocks = buildBlocks([
      [line({ text: 'a', y: 100, right: 500 }), line({ text: 'b', y: 114, right: 500 })]
    ])
    expect(blocks[0].bbox.y).toBe(100)
    expect(blocks[0].bbox.h).toBe(26)
  })
})