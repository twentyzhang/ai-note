import { describe, expect, it } from 'vitest'
import { TranslationFormatError, parseTranslationResponse } from '../../src/main/ai/parse'

const ids = ['p1-b00', 'p1-b01']

describe('翻译响应解析', () => {
  it('解析裸对象', () => {
    const result = parseTranslationResponse('{"p1-b00":"甲","p1-b01":"乙"}', ids)
    expect(result.get('p1-b00')).toBe('甲')
    expect(result.get('p1-b01')).toBe('乙')
  })

  it('解析包了一层 translations 的对象', () => {
    const result = parseTranslationResponse('{"translations":{"p1-b00":"甲","p1-b01":"乙"}}', ids)
    expect(result.get('p1-b01')).toBe('乙')
  })

  it('解析数组形态', () => {
    const raw = '[{"id":"p1-b00","text":"甲"},{"id":"p1-b01","text":"乙"}]'
    expect(parseTranslationResponse(raw, ids).get('p1-b00')).toBe('甲')
  })

  it('解析带 markdown 围栏的返回', () => {
    const raw = '```json\n{"p1-b00":"甲","p1-b01":"乙"}\n```'
    expect(parseTranslationResponse(raw, ids).size).toBe(2)
  })

  it('忽略多余的键，只取要求的段落', () => {
    const raw = '{"p1-b00":"甲","p1-b01":"乙","p9-b99":"多余的"}'
    const result = parseTranslationResponse(raw, ids)
    expect(result.size).toBe(2)
    expect(result.has('p9-b99')).toBe(false)
  })

  it('缺段落时抛 TranslationFormatError', () => {
    expect(() => parseTranslationResponse('{"p1-b00":"甲"}', ids)).toThrow(TranslationFormatError)
  })

  it('完全不是 JSON 时抛 TranslationFormatError', () => {
    expect(() => parseTranslationResponse('我翻译不出来', ids)).toThrow(TranslationFormatError)
  })

  it('值不是字符串时抛 TranslationFormatError', () => {
    expect(() => parseTranslationResponse('{"p1-b00":123,"p1-b01":"乙"}', ids)).toThrow(
      TranslationFormatError
    )
  })

  it('空字符串的译文视为有效', () => {
    expect(parseTranslationResponse('{"p1-b00":"","p1-b01":"乙"}', ids).get('p1-b00')).toBe('')
  })
})