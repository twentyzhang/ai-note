import { useCallback, useEffect, useState, type JSX } from 'react'
import type { LibraryEntry } from '../../../shared/types'
import { api } from '../api'

interface Props {
  onOpenPaper?: (paperId: string) => void
}

const STATUS_TEXT: Record<LibraryEntry['status'], string> = {
  imported: '未翻译',
  translating: '翻译中',
  translated: '已完成',
  failed: '有失败段落'
}

export default function LibraryView({ onOpenPaper }: Props): JSX.Element {
  const [papers, setPapers] = useState<LibraryEntry[]>([])
  const [problems, setProblems] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    setPapers(await api.listPapers())
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const importPaths = useCallback(
    async (paths: string[]) => {
      if (paths.length === 0) return
      setBusy(true)
      try {
        const result = await api.importPdfs(paths)
        setProblems(result.failed.map((f) => `${f.path}：${f.reason}`))
        await refresh()
      } finally {
        setBusy(false)
      }
    },
    [refresh]
  )

  return (
    <div
      style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        const paths = Array.from(e.dataTransfer.files)
          .map((f) => (f as File & { path?: string }).path)
          .filter((p): p is string => Boolean(p))
        void importPaths(paths)
      }}
    >
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, margin: 0 }}>我的论文</h1>
        <button disabled={busy} onClick={async () => importPaths(await api.choosePdfFiles())}>
          {busy ? '正在导入…' : '导入 PDF'}
        </button>
      </header>

      {problems.length > 0 && (
        <ul style={{ color: '#b3261e', marginBottom: 16 }}>
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}

      {papers.length === 0 ? (
        <p style={{ color: '#666' }}>还没有论文。把 PDF 拖进来，或者点上面的"导入 PDF"。</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {papers.map((paper) => (
            <li
              key={paper.id}
              onClick={() => onOpenPaper?.(paper.id)}
              style={{
                padding: '12px 14px',
                border: '1px solid #e0e0e0',
                borderRadius: 8,
                marginBottom: 8,
                cursor: 'pointer'
              }}
            >
              <div style={{ fontWeight: 600 }}>{paper.title}</div>
              <div style={{ color: '#666', fontSize: 13, marginTop: 4 }}>
                {paper.pageCount} 页 · {paper.blockCount} 段 · {STATUS_TEXT[paper.status]}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}