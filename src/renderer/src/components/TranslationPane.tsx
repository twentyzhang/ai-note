import type { JSX } from 'react'
import type { Block, TranslationFile } from '../../../shared/types'

interface Props {
  blocks: Block[]
  translation: TranslationFile | null
  onRetryFailed: () => void
}

export default function TranslationPane({ blocks, translation, onRetryFailed }: Props): JSX.Element {
  const failedCount = translation
    ? Object.values(translation.blocks).filter((b) => b.status === 'failed').length
    : 0

  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        overflow: 'auto',
        padding: '12px 16px',
        borderLeft: '1px solid #e0e0e0',
        background: '#fafafa'
      }}
    >
      {failedCount > 0 && (
        <div style={{ marginBottom: 12 }}>
          <button onClick={onRetryFailed}>重试失败的段落（{failedCount}）</button>
        </div>
      )}

      {blocks.map((block) => {
        const entry = translation?.blocks[block.id]
        return (
          <div key={block.id} data-block-id={block.id} style={{ marginBottom: 14, lineHeight: 1.7 }}>
            {entry?.status === 'done' ? (
              <p style={{ margin: 0 }}>{entry.text}</p>
            ) : entry?.status === 'failed' ? (
              <p style={{ margin: 0, color: '#b3261e', fontSize: 13 }}>
                这一段翻译失败：{entry.error ?? '未知原因'}
              </p>
            ) : (
              <p style={{ margin: 0, color: '#aaa', fontSize: 13 }}>等待翻译…</p>
            )}
          </div>
        )
      })}
    </div>
  )
}