import { describe, expect, it } from 'vitest'
import { extractMeta, extractPdf } from '../../src/main/pdf/extract'
import { makeSingleColumnPdf, makeTwoColumnPdf } from '../fixtures/make-fixtures'

describe('PDF 文本抽取', () => {
  it('单栏三页文档能抽出三页且文本非空', async () => {
    const pages = await extractPdf(await makeSingleColumnPdf())
    expect(pages).toHaveLength(3)
    expect(pages[0].items.length).toBeGreaterThan(0)
    expect(pages[0].width).toBeGreaterThan(500)
  })

  it('坐标以页面顶部为原点', async () => {
    const pages = await extractPdf(await makeSingleColumnPdf())
    const header = pages[0].items.find((i) => i.text.includes('Journal of Testing'))
    expect(header).toBeDefined()
    expect(header!.y).toBeLessThan(80)
  })

  it('完全不改变传入的字节数组', async () => {
    const bytes = await makeSingleColumnPdf()
    const copy = new Uint8Array(bytes)
    await extractPdf(bytes)
    expect(Array.from(bytes)).toEqual(Array.from(copy))
  })

  it('两栏文档里左右两栏文本都被抽出', async () => {
    const pages = await extractPdf(await makeTwoColumnPdf())
    const text = pages[0].items.map((i) => i.text).join('')
    expect(text).toContain('LEFT 0')
    expect(text).toContain('RIGHT 0')
  })

  it('元数据缺失时返回空标题而不是抛错', async () => {
    const meta = await extractMeta(await makeSingleColumnPdf())
    expect(meta.title === null || typeof meta.title === 'string').toBe(true)
    expect(Array.isArray(meta.authors)).toBe(true)
  })
})