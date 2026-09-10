import { describe, expect, it } from 'vitest'
import { estimateCost, estimateTokens, formatCost } from '../../src/main/ai/pricing'

describe('token 估算', () => {
  it('纯英文按约 4 字符 1 token', () => {
    expect(estimateTokens('a'.repeat(400))).toBe(100)
  })

  it('中文按 1 字 1 token', () => {
    expect(estimateTokens('中文十个字测试一下')).toBe(9)
  })

  it('空字符串为 0', () => {
    expect(estimateTokens('')).toBe(0)
  })

  it('中英混排按各自规则相加', () => {
    const value = estimateTokens('中文abcd')
    expect(value).toBeGreaterThanOrEqual(3)
    expect(value).toBeLessThanOrEqual(4)
  })
})

describe('费用估算', () => {
  it('按输入输出单价分别计算', () => {
    const cost = estimateCost({ promptTokens: 1_000_000, completionTokens: 1_000_000 }, 1, 2)
    expect(cost).toBe(3)
  })

  it('单价缺失时返回 null', () => {
    expect(estimateCost({ promptTokens: 100, completionTokens: 100 }, null, 2)).toBeNull()
    expect(estimateCost({ promptTokens: 100, completionTokens: 100 }, 1, null)).toBeNull()
  })

  it('零用量算出 0', () => {
    expect(estimateCost({ promptTokens: 0, completionTokens: 0 }, 1, 2)).toBe(0)
  })
})

describe('费用文案', () => {
  it('有钱数时带人民币符号与单位', () => {
    expect(formatCost(0.0345)).toContain('0.03')
    expect(formatCost(0.0345)).toContain('元')
  })

  it('不足一分时保留更多小数位，不会显示成 0.00 元', () => {
    expect(formatCost(0.0004)).toBe('≈ 0.0004 元')
  })

  it('未知时明确说明', () => {
    expect(formatCost(null)).toContain('未知')
  })
})