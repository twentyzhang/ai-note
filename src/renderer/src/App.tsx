import { useState, type JSX } from 'react'
import LibraryView from './views/LibraryView'

export default function App(): JSX.Element {
  const [openPaperId, setOpenPaperId] = useState<string | null>(null)

  if (!openPaperId) return <LibraryView onOpenPaper={setOpenPaperId} />
  return (
    <div style={{ padding: 24 }}>
      <button onClick={() => setOpenPaperId(null)}>← 返回论文库</button>
      <p style={{ color: '#666' }}>阅读器将在下一个任务中接入。</p>
    </div>
  )
}