import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc'
import type { BlocksFile, ImportResult, LibraryEntry } from '../shared/types'

const api = {
  listPapers: (): Promise<LibraryEntry[]> => ipcRenderer.invoke(IPC.libraryList),
  choosePdfFiles: (): Promise<string[]> => ipcRenderer.invoke(IPC.libraryChooseFiles),
  importPdfs: (paths: string[]): Promise<ImportResult> =>
    ipcRenderer.invoke(IPC.libraryImport, paths),
  getBlocks: (paperId: string): Promise<BlocksFile | null> =>
    ipcRenderer.invoke(IPC.libraryGetBlocks, paperId),
  readPdf: (paperId: string): Promise<Uint8Array | null> =>
    ipcRenderer.invoke(IPC.libraryReadPdf, paperId)
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api