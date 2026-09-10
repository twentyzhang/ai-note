import { describe, expect, it } from 'vitest'
import { IPC } from '../../src/shared/ipc'
import type { LibraryIndex, Line } from '../../src/shared/types'

describe('IPC 通道常量', () => {
  it('全部以命名空间开头且互不重复', () => {
    const values = Object.values(IPC)
    expect(new Set(values).size).toBe(values.length)
    for (const v of values) expect(v).toMatch(/^[a-z]+:[a-zA-Z]+$/)
  })
})

describe('库索引结构', () => {
  it('空索引的版本号是 1', () => {
    const index: LibraryIndex = { version: 1, papers: [] }
    expect(index.version).toBe(1)
  })

  it('行结构包含分栏字段', () => {
    const line: Line = {
      page: 1,
      text: 'hello',
      x: 0,
      right: 10,
      y: 0,
      bottom: 10,
      fontSize: 10,
      column: 0
    }
    expect(line.column).toBe(0)
  })
})