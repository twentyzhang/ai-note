import type { Block } from '../../shared/types'
import type { ChatMessage } from './client'

const SYSTEM_ZH = [
  '你是一名严谨的学术论文翻译员，把英文论文段落翻译成简体中文。',
  '规则：',
  '1. 只输出 JSON，不要输出任何解释、前言或 markdown 围栏。',
  '2. JSON 的键必须与输入给出的段落编号完全一致，不得增删、不得改动大小写。',
  '3. 值是这一段的中文译文；不要输出原文，不要输出编号。',
  '4. 保留数学公式、变量名、化学式、引用编号（如 [23]）与图表编号（如 FIG. 1）原样不译。',
  '5. 术语全篇保持一致；遇到领域专有名词，首次出现时可用「中文（English）」形式。',
  '6. 若某段是纯公式、纯数字或纯符号，原样返回。'
].join('\n')

export function buildTranslationMessages(blocks: Block[], targetLang: 'zh'): ChatMessage[] {
  const payload = blocks.map((block) => ({ id: block.id, text: block.text }))
  const userContent = [
    `请翻译下面 ${blocks.length} 个段落，目标语言：${targetLang === 'zh' ? '简体中文' : targetLang}。`,
    '输入：',
    JSON.stringify(payload),
    '输出格式：{"段落编号":"译文", ...}'
  ].join('\n')

  return [
    { role: 'system', content: SYSTEM_ZH },
    { role: 'user', content: userContent }
  ]
}