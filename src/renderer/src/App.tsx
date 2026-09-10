import { useState, type JSX } from 'react'
import LibraryView from './views/LibraryView'
import ReaderView from './views/ReaderView'
import SettingsView from './views/SettingsView'

type View = 'library' | 'reader' | 'settings'

export default function App(): JSX.Element {
  const [view, setView] = useState<View>('library')
  const [openPaperId, setOpenPaperId] = useState<string | null>(null)

  if (view === 'settings') return <SettingsView onBack={() => setView('library')} />

  if (view === 'reader' && openPaperId) {
    return <ReaderView paperId={openPaperId} onBack={() => setView('library')} />
  }

  return (
    <LibraryView
      onOpenPaper={(id) => {
        setOpenPaperId(id)
        setView('reader')
      }}
      onOpenSettings={() => setView('settings')}
    />
  )
}