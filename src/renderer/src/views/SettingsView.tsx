import { useCallback, useEffect, useState, type JSX } from 'react'
import type { AiProfile } from '../../../shared/types'
import { api } from '../api'

interface Props {
  onBack: () => void
}

const EMPTY: AiProfile = {
  id: '',
  name: '新建配置',
  baseUrl: 'https://api.deepseek.com/v1',
  model: 'deepseek-chat',
  concurrency: 3,
  maxBatchBlocks: 10,
  maxBatchChars: 6000,
  pricePerMTokIn: 1,
  pricePerMTokOut: 2
}

function newProfileId(): string {
  return Math.random().toString(16).slice(2, 10)
}

export default function SettingsView({ onBack }: Props): JSX.Element {
  const [profiles, setProfiles] = useState<AiProfile[]>([])
  const [draft, setDraft] = useState<AiProfile>(EMPTY)
  const [apiKey, setApiKeyDraft] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const list = await api.listProfiles()
    setProfiles(list)
    setDraft((prev) => list.find((p) => p.id === prev.id) ?? list[0] ?? EMPTY)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const update = <K extends keyof AiProfile>(key: K, value: AiProfile[K]): void => {
    setDraft((prev) => ({ ...prev, [key]: value }))
  }

  const save = async (): Promise<void> => {
    setBusy(true)
    try {
      const next = { ...draft, id: draft.id || newProfileId() }
      await api.saveProfile(next)
      if (apiKey) await api.setApiKey(next.id, apiKey)
      setApiKeyDraft('')
      setDraft(next)
      await load()
      setMessage('已保存')
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '保存失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif', maxWidth: 720 }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button onClick={onBack}>← 返回</button>
        <h1 style={{ fontSize: 20, margin: 0 }}>设置</h1>
      </header>

      {profiles.length > 1 && (
        <div style={{ marginBottom: 12 }}>
          <label>
            使用哪套配置：
            <select
              value={draft.id}
              onChange={(event) => {
                const found = profiles.find((p) => p.id === event.target.value)
                if (found) setDraft(found)
              }}
            >
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      <div style={{ display: 'grid', gap: 10 }}>
        <label>
          名称
          <input value={draft.name} onChange={(event) => update('name', event.target.value)} />
        </label>
        <label>
          Base URL
          <input value={draft.baseUrl} onChange={(event) => update('baseUrl', event.target.value)} />
        </label>
        <label>
          模型名
          <input value={draft.model} onChange={(event) => update('model', event.target.value)} />
        </label>
        <label>
          API Key
          <input
            type="password"
            value={apiKey}
            onChange={(event) => setApiKeyDraft(event.target.value)}
          />
        </label>
        <label>
          并发请求数
          <input
            type="number"
            value={draft.concurrency}
            onChange={(event) => update('concurrency', Number(event.target.value))}
          />
        </label>
        <label>
          每批最多段落数
          <input
            type="number"
            value={draft.maxBatchBlocks}
            onChange={(event) => update('maxBatchBlocks', Number(event.target.value))}
          />
        </label>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button onClick={save} disabled={busy}>
          {busy ? '保存中…' : '保存'}
        </button>
        <button
          onClick={async () => {
            const result = await api.testConnection(draft.id)
            setMessage(result.message)
          }}
          disabled={!draft.id}
        >
          测试连接
        </button>
      </div>

      {message && <p style={{ marginTop: 12, color: '#333' }}>{message}</p>}

      <p style={{ color: '#666', fontSize: 13, marginTop: 16 }}>
        本地模型（如 Ollama）把 Base URL 填成 http://localhost:11434/v1，API Key 留空即可。
      </p>
    </div>
  )
}