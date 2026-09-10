import type { TokenUsage } from './types'

const CJK = /[\u3000-\u303f\u3400-\u4dbf\u4e00-\u9fff\uff00-\uffef]/

export function estimateTokens(text: string): number {
  let cjk = 0
  let other = 0
  for (const ch of text) {
    if (CJK.test(ch)) cjk += 1
    else other += 1
  }
  return Math.ceil(cjk + other / 4)
}

export function estimateCost(
  usage: TokenUsage,
  priceIn: number | null,
  priceOut: number | null
): number | null {
  if (priceIn === null || priceOut === null) return null
  return (usage.promptTokens / 1_000_000) * priceIn + (usage.completionTokens / 1_000_000) * priceOut
}

export function formatCost(cost: number | null): string {
  if (cost === null) return '费用未知（未填写单价）'
  if (cost === 0) return '0 元'
  if (cost < 0.01) return `≈ ${cost.toFixed(4)} 元`
  return `≈ ${cost.toFixed(2)} 元`
}