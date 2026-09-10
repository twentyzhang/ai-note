import type { TextItem } from '../../shared/types'

const MIN_ITEMS = 20
const SEARCH_FROM = 0.3
const SEARCH_TO = 0.7
const STEP = 2
const MIN_SIDE_RATIO = 0.2
const SIGNIFICANCE = 0.5

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

/**
 * 找出双栏排版中间的栏缝。
 *
 * 必须在合并成行之前调用：一旦左右两栏同基线的文字被并进同一行，就再也分不开了。
 *
 * 判据不是"存在一条完全没有文字的竖直空白带"——真实论文的标题、跨栏大图和图注
 * 都会横穿栏缝，那里永远有几条内容。可靠的信号是：在栏缝附近，跨越该竖直线的
 * 文本片段数量会从"几乎每一行都跨越"骤降到"只有那几条跨栏元素"。因此这里对页面
 * 中段逐点统计跨越数，取最小值所在的平台，并要求这个凹陷足够显著。
 *
 * 返回分界点的 x 坐标；单栏返回 null。
 */
export function detectGutter(items: TextItem[], pageWidth: number): number | null {
  if (items.length < MIN_ITEMS) return null

  const from = Math.floor(pageWidth * SEARCH_FROM)
  const to = Math.ceil(pageWidth * SEARCH_TO)
  const scores: { split: number; score: number }[] = []

  for (let split = from; split <= to; split += STEP) {
    const score = items.filter((i) => i.x < split && i.x + i.w > split).length
    scores.push({ split, score })
  }
  if (scores.length === 0) return null

  const minScore = Math.min(...scores.map((s) => s.score))
  const typicalScore = median(scores.map((s) => s.score))

  // 没有明显的凹陷就说明是单栏：跨栏文字量处处相当
  if (minScore > typicalScore * SIGNIFICANCE) return null

  const plateau = scores.filter((s) => s.score <= minScore * 1.25 + 1)
  const split = plateau[Math.floor(plateau.length / 2)].split

  const leftCount = items.filter((i) => i.x + i.w <= split).length
  const rightCount = items.filter((i) => i.x >= split).length
  if (leftCount / items.length < MIN_SIDE_RATIO) return null
  if (rightCount / items.length < MIN_SIDE_RATIO) return null

  return split
}

export function columnOf(item: TextItem, split: number | null): number {
  if (split === null) return 0
  return item.x + item.w <= split ? 0 : item.x >= split ? 1 : item.x < split ? 0 : 1
}