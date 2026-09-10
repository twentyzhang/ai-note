import { useEffect, useState, type JSX } from 'react'
import { api } from '../api'

interface Props {
  text: string
  top: number
  left: number
  onClose: () => void
}

export default function SelectionPopover({ text, top, left, onClose }: Props): JSX.Element {
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setResult(null)
    setError(null)
    api
      .translateSelection(text)
      .then((value) => {
        if (!cancelled) setResult(value)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : '翻译失败')
      })
    return () => {
      cancelled = true
    }
  }, [text])

  return (
    <div
      style={{
        position: 'fixed',
        top,
        left,
        zIndex: 20,
        maxWidth: 360,
        background: '#fff',
        border: '1px solid #d0d0d0',
        borderRadius: 8,
        boxShadow: '0 4px 16px rgba(0,0,0,.15)',
        padding: 12,
        fontFamily: 'system-ui, sans-serif',
        fontSize: 14
      }}
    >
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, color: '#666', fontSize: 12 }}>{text.slice(0, 120)}</div>
        <button onClick={onClose} aria-label="关闭">
          ✕
        </button>
      </div>
      <hr style={{ border: 'none', borderTop: '1px solid #eee', margin: '8px 0' }} />
      {error ? (
        <div style={{ color: '#b3261e' }}>{error}</div>
      ) : result !== null ? (
        <div style={{ lineHeight: 1.7 }}>{result}</div>
      ) : (
        <div style={{ color: '#aaa' }}>正在翻译…</div>
      )}
    </div>
  )
}