import { useState, type JSX } from 'react'
import LibraryView from './views/LibraryView'
import ReaderView from './views/ReaderView'

export default function App(): JSX.Element {
  const [openPaperId, setOpenPaperId] = useState<string | null>(null)

  if (!openPaperId) return <LibraryView onOpenPaper={setOpenPaperId} />
  return <ReaderView paperId={openPaperId} onBack={() => setOpenPaperId(null)} />
}