import { useEffect, useState, type JSX } from 'react'
import PdfPages from '../components/PdfPages'
import { api } from '../api'

interface Props {
  paperId: string
  onBack: () => void
}

export default function ReaderView({ paperId, onBack }: Props): JSX.Element {
  const [data, setData] = useState<Uint8Array | null>(null)
  const [missing, setMissing] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([api.readPdf(paperId), api.getBlocks(paperId)])
      .then(([bytes]) => {
        if (cancelled) return
        if (!bytes) {
          setMissing(true)
          return
        }
        setData(bytes)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [paperId])

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
        <span style={{ flex: 1 }} />
        <span style={{ color: '#666', fontSize: 13 }}>
          全文翻译 · 总结 · 参考文献（下一个计划接入）
        </span>
      </header>
      <main style={{ flex: 1, overflow: 'auto' }}>
        {loading && <p style={{ padding: 24 }}>正在打开论文…</p>}
        {missing && (
          <p style={{ padding: 24, color: '#b3261e' }}>
            找不到这篇论文的文件，它可能已被移走或删除。
          </p>
        )}
        {data && <PdfPages data={data} />}
      </main>
    </div>
  )
}