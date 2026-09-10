import { useCallback, useEffect, useRef, useState, type JSX } from 'react'
import { estimateCost, formatCost } from '../../../shared/pricing'
import type { Block, TranslateProgress, TranslationFile } from '../../../shared/types'
import { api } from '../api'
import PdfPages from '../components/PdfPages'
import SelectionPopover from '../components/SelectionPopover'
import TranslationPane from '../components/TranslationPane'
import { PDF_SCALE, pickBlockIdAt } from '../lib/scrollSync'

interface Props {
  paperId: string
  onBack: () => void
  onOpenSettings: () => void
}

function countDone(translation: TranslationFile | null): number {
  if (!translation) return 0
  return Object.values(translation.blocks).filter((b) => b.status === 'done').length
}

function countFailed(translation: TranslationFile | null): number {
  if (!translation) return 0
  return Object.values(translation.blocks).filter((b) => b.status === 'failed').length
}

export default function ReaderView({ paperId, onBack, onOpenSettings }: Props): JSX.Element {
  const [data, setData] = useState<Uint8Array | null>(null)
  const [blocks, setBlocks] = useState<Block[]>([])
  const [translation, setTranslation] = useState<TranslationFile | null>(null)
  const [progress, setProgress] = useState<TranslateProgress | null>(null)
  const [prices, setPrices] = useState<{ in: number | null; out: number | null }>({
    in: null,
    out: null
  })
  const [missing, setMissing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState<string | null>(null)
  const [selection, setSelection] = useState<{ text: string; top: number; left: number } | null>(null)

  const scrollRef = useRef<HTMLElement | null>(null)
  const paneRef = useRef<HTMLDivElement | null>(null)
  const syncing = useRef(false)

  const refreshTranslation = useCallback(async () => {
    setTranslation(await api.readTranslation(paperId))
  }, [paperId])

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    void (async () => {
      const [bytes, blocksFile] = await Promise.all([api.readPdf(paperId), api.getBlocks(paperId)])
      if (cancelled) return
      if (!bytes) {
        setMissing(true)
        setLoading(false)
        return
      }
      setData(bytes)
      setBlocks(blocksFile?.blocks ?? [])
      await refreshTranslation()
      if (!cancelled) setLoading(false)
    })()

    void (async () => {
      const config = await api.getConfig()
      const profiles = await api.listProfiles()
      const active = profiles.find((p) => p.id === config.activeProfileId) ?? profiles[0]
      if (!cancelled && active) {
        setPrices({ in: active.pricePerMTokIn, out: active.pricePerMTokOut })
      }
    })()

    const unsubscribe = api.onTranslationProgress((update) => {
      if (update.paperId === paperId) setProgress(update)
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [paperId, refreshTranslation])

  const startTranslation = async (): Promise<void> => {
    setNotice(null)
    try {
      await api.startTranslation(paperId)
    } catch (err) {
      setNotice(err instanceof Error ? err.message : '翻译启动失败')
    } finally {
      await refreshTranslation()
    }
  }

  const handleMouseUp = (): void => {
    const selected = window.getSelection()
    const text = selected?.toString().trim() ?? ''
    if (!selected || text.length <= 1 || selected.rangeCount === 0) return
    const rect = selected.getRangeAt(0).getBoundingClientRect()
    setSelection({
      text,
      top: Math.min(rect.bottom + 8, Math.max(0, window.innerHeight - 220)),
      left: Math.min(rect.left, Math.max(0, window.innerWidth - 380))
    })
  }

  const handleScroll = (): void => {
    if (syncing.current || blocks.length === 0) return
    syncing.current = true
    requestAnimationFrame(() => {
      syncing.current = false
      const scroll = scrollRef.current
      const pane = paneRef.current
      if (!scroll || !pane) return
      const offsets = Array.from(scroll.querySelectorAll('canvas[data-page]')).map(
        (el) => (el as HTMLElement).offsetTop
      )
      const id = pickBlockIdAt(blocks, offsets, PDF_SCALE, scroll.scrollTop)
      if (!id) return
      const node = pane.querySelector(`[data-block-id="${id}"]`)
      if (node instanceof HTMLElement) pane.scrollTop = node.offsetTop - 8
    })
  }

  const usage = progress?.usage ?? translation?.usage ?? { promptTokens: 0, completionTokens: 0 }
  const done = progress?.done ?? countDone(translation)
  const failed = progress?.failed ?? countFailed(translation)
  const total = blocks.length
  const running = progress?.running ?? false
  const unfinished = Math.max(0, total - done)

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '10px 16px',
          borderBottom: '1px solid #e0e0e0'
        }}
      >
        <button onClick={onBack}>← 返回论文库</button>
        <button onClick={startTranslation} disabled={loading || running}>
          {running ? '翻译中…' : done > 0 ? '继续翻译' : '全文翻译'}
        </button>
        {running && <button onClick={() => api.cancelTranslation(paperId)}>取消</button>}
        <span style={{ flex: 1 }} />
        <span style={{ color: '#666', fontSize: 13 }}>{formatCost(estimateCost(usage, prices.in, prices.out))}</span>
        <button onClick={onOpenSettings}>设置</button>
      </header>

      {notice && <p style={{ margin: 0, padding: '8px 16px', color: '#b3261e' }}>{notice}</p>}

      {!running && unfinished > 0 && done > 0 && (
        <p style={{ margin: 0, padding: '8px 16px', background: '#fff8e1', color: '#7a5b00' }}>
          这篇论文还有 {unfinished} 段没翻完，点"继续翻译"接着翻。
        </p>
      )}

      <main style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <section
          ref={scrollRef}
          onScroll={handleScroll}
          onMouseUp={handleMouseUp}
          style={{ flex: 1, minWidth: 0, overflow: 'auto' }}
        >
          {loading && <p style={{ padding: 24 }}>正在打开论文…</p>}
          {missing && (
            <p style={{ padding: 24, color: '#b3261e' }}>
              找不到这篇论文的文件，它可能已被移走或删除。
            </p>
          )}
          {data && <PdfPages data={data} />}
        </section>

        <div ref={paneRef} style={{ flex: 1, minWidth: 0, display: 'flex', overflow: 'hidden' }}>
          <TranslationPane
            blocks={blocks}
            translation={translation}
            onRetryFailed={startTranslation}
          />
        </div>
      </main>

      <footer
        style={{
          borderTop: '1px solid #e0e0e0',
          padding: '6px 16px',
          fontSize: 13,
          color: '#666',
          display: 'flex',
          gap: 16
        }}
      >
        <span>
          已完成 {done} / {total}
        </span>
        <span>失败 {failed}</span>
        <span>
          token 输入 {usage.promptTokens} / 输出 {usage.completionTokens}
        </span>
      </footer>

      {selection && (
        <SelectionPopover
          text={selection.text}
          top={selection.top}
          left={selection.left}
          onClose={() => setSelection(null)}
        />
      )}
    </div>
  )
}
