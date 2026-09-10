import { describe, expect, it } from 'vitest'
import { assignColumns, detectColumns } from '../../src/main/pdf/columns'
import type { Line } from '../../src/shared/types'

function line(x: number, y: number, text = 'text'): Line {
  return { page: 1, text, x, right: x + 200, y, bottom: y + 12, fontSize: 10, column: 0 }
}

function twoColumnLines(): Line[] {
  const lines: Line[] = []
  for (let i = 0; i < 20; i++) lines.push(line(60, 100 + i * 14, `left ${i}`))
  for (let i = 0; i < 20; i++) lines.push(line(310, 100 + i * 14, `right ${i}`))
  return lines
}

describe('分栏检测', () => {
  it('左右两簇的文档能检测出分界点', () => {
    const split = detectColumns(twoColumnLines(), 595)
    expect(split).not.toBeNull()
    expect(split!).toBeGreaterThan(60)
    expect(split!).toBeLessThan(310)
  })

  it('单栏文档返回 null', () => {
    const lines: Line[] = []
    for (let i = 0; i < 30; i++) lines.push(line(60, 100 + i * 14))
    expect(detectColumns(lines, 595)).toBeNull()
  })

  it('行数太少时不判为分栏', () => {
    expect(detectColumns([line(60, 100), line(310, 120)], 595)).toBeNull()
  })

  it('一侧行数占比过低时不判为分栏', () => {
    const lines: Line[] = []
    for (let i = 0; i < 30; i++) lines.push(line(60, 100 + i * 14))
    lines.push(line(310, 100), line(310, 120), line(310, 140))
    expect(detectColumns(lines, 595)).toBeNull()
  })
})

describe('栏归属', () => {
  it('按分界点把行分到两栏', () => {
    const lines = assignColumns(twoColumnLines(), 285)
    expect(lines.filter((l) => l.column === 0)).toHaveLength(20)
    expect(lines.filter((l) => l.column === 1)).toHaveLength(20)
  })

  it('单栏时所有行的 column 都是 0', () => {
    const lines = assignColumns([line(60, 100), line(70, 120)], null)
    expect(lines.every((l) => l.column === 0)).toBe(true)
  })

  it('不修改传入的数组', () => {
    const input = twoColumnLines()
    assignColumns(input, 285)
    expect(input.every((l) => l.column === 0)).toBe(true)
  })
})