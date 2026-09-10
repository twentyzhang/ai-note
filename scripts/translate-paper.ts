import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import path, { join } from 'node:path'
import { estimateCost, formatCost } from '../src/shared/pricing'
import type { AiProfile, BlocksFile, TranslateProgress } from '../src/shared/types'
import { importPdf } from '../src/main/library/import'
import { libraryPaths, readJson } from '../src/main/library/store'
import { translatePaper } from '../src/main/translate/runner'
import { readTranslation } from '../src/main/translate/state'

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] : undefined
}

function fail(...lines: string[]): never {
  for (const line of lines) console.error(line)
  process.exit(1)
}

async function main(): Promise<void> {
  const pdf = process.argv[2]
  const baseUrl = arg('base-url')
  const model = arg('model')
  const apiKey = arg('key') ?? process.env.AI_NOTE_API_KEY ?? ''
  const concurrency = Number(arg('concurrency') ?? '3')
  const keep = process.argv.includes('--keep')

  if (!pdf || !baseUrl || !model) {
    fail(
      '用法: npm run translate -- "论文.pdf" --base-url https://api.deepseek.com/v1 --model deepseek-chat',
      '密钥用 --key 传入，或设置环境变量 AI_NOTE_API_KEY（本地模型可留空）'
    )
  }

  if (baseUrl === undefined || !/^https?:\/\//i.test(baseUrl) || /[[\]()\s]/.test(baseUrl)) {
    fail(
      `Base URL 看起来不对：${baseUrl}`,
      '它应当是纯文本地址，例如 https://api.deepseek.com/v1',
      '不要带方括号或 Markdown 链接格式——聊天窗口常把网址自动加壳，粘贴命令时要留意'
    )
  }

  try {
    await fs.access(pdf)
  } catch {
    const lines = [
      `找不到文件：${pdf}`,
      '请检查路径与文件名；路径里有空格时要用英文双引号把整条路径包起来。'
    ]
    try {
      const siblings = (await fs.readdir(path.dirname(pdf))).filter((f) =>
        f.toLowerCase().endsWith('.pdf')
      )
      if (siblings.length > 0) {
        lines.push('该目录下的 PDF 有：')
        for (const name of siblings) lines.push(`  ${name}`)
      }
    } catch {
      // 目录本身读不到就不列候选了
    }
    fail(...lines)
  }

  const root = await fs.mkdtemp(join(tmpdir(), 'ai-note-translate-e2e-'))
  console.log(`临时库目录: ${root}`)

  const entry = await importPdf(root, pdf)
  console.log(`导入完成: ${entry.title} — ${entry.pageCount} 页 / ${entry.blockCount} 段`)

  const blocksFile = await readJson<BlocksFile>(libraryPaths(root, entry.id).blocks)
  const blocks = blocksFile?.blocks ?? []
  if (blocks.length === 0) {
    fail('这篇论文没有解析出任何段落，先检查计划一的解析结果')
  }

  const profile: AiProfile = {
    id: 'cli',
    name: 'CLI',
    baseUrl,
    model,
    concurrency,
    maxBatchBlocks: 10,
    maxBatchChars: 6000,
    pricePerMTokIn: null,
    pricePerMTokOut: null
  }

  const started = Date.now()
  let lastLine = ''
  const file = await translatePaper({
    root,
    paperId: entry.id,
    profile,
    apiKey,
    blocks,
    emit: (progress: TranslateProgress) => {
      const cost = formatCost(
        estimateCost(progress.usage, profile.pricePerMTokIn, profile.pricePerMTokOut)
      )
      const line = `进度 ${progress.done}/${progress.total}  失败 ${progress.failed}  ${cost}`
      if (line !== lastLine) {
        lastLine = line
        console.log(line)
      }
    }
  })

  const elapsed = Math.round((Date.now() - started) / 1000)
  const onDisk = await readTranslation(root, entry.id)
  const entries = Object.entries(onDisk?.blocks ?? {})
  const done = entries.filter(([, value]) => value.status === 'done').length
  const failed = entries.filter(([, value]) => value.status === 'failed').length

  console.log('---')
  console.log(`耗时 ${elapsed} 秒`)
  console.log(`已完成 ${done} 段，失败 ${failed} 段`)
  console.log(`token 用量 输入 ${file.usage.promptTokens} / 输出 ${file.usage.completionTokens}`)
  console.log('---')
  console.log('前 3 段译文：')
  for (const [id, value] of entries.slice(0, 3)) {
    console.log(`[${id}] ${(value.text ?? '').slice(0, 100)}`)
  }

  if (!keep) await fs.rm(root, { recursive: true, force: true })
}

void main().catch((err: unknown) => {
  console.error(`运行失败：${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
})