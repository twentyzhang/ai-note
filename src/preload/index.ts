import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc'
import type {
  AiProfile,
  AppConfig,
  BlocksFile,
  ImportResult,
  LibraryEntry,
  TranslateProgress,
  TranslationFile
} from '../shared/types'

const api = {
  listPapers: (): Promise<LibraryEntry[]> => ipcRenderer.invoke(IPC.libraryList),
  choosePdfFiles: (): Promise<string[]> => ipcRenderer.invoke(IPC.libraryChooseFiles),
  importPdfs: (paths: string[]): Promise<ImportResult> =>
    ipcRenderer.invoke(IPC.libraryImport, paths),
  getBlocks: (paperId: string): Promise<BlocksFile | null> =>
    ipcRenderer.invoke(IPC.libraryGetBlocks, paperId),
  readPdf: (paperId: string): Promise<Uint8Array | null> =>
    ipcRenderer.invoke(IPC.libraryReadPdf, paperId),

  getConfig: (): Promise<AppConfig> => ipcRenderer.invoke(IPC.configGet),
  saveConfig: (config: AppConfig): Promise<void> => ipcRenderer.invoke(IPC.configSave, config),
  listProfiles: (): Promise<AiProfile[]> => ipcRenderer.invoke(IPC.profileList),
  saveProfile: (profile: AiProfile): Promise<void> => ipcRenderer.invoke(IPC.profileSave, profile),
  deleteProfile: (profileId: string): Promise<void> =>
    ipcRenderer.invoke(IPC.profileDelete, profileId),
  setApiKey: (profileId: string, key: string): Promise<void> =>
    ipcRenderer.invoke(IPC.profileSetKey, profileId, key),
  testConnection: (profileId: string): Promise<{ ok: boolean; message: string }> =>
    ipcRenderer.invoke(IPC.aiTest, profileId),

  startTranslation: (paperId: string): Promise<void> =>
    ipcRenderer.invoke(IPC.translateStart, paperId),
  cancelTranslation: (paperId: string): Promise<void> =>
    ipcRenderer.invoke(IPC.translateCancel, paperId),
  readTranslation: (paperId: string): Promise<TranslationFile | null> =>
    ipcRenderer.invoke(IPC.translateRead, paperId),
  translateSelection: (text: string): Promise<string> =>
    ipcRenderer.invoke(IPC.translateSelection, text),
  onTranslationProgress: (cb: (progress: TranslateProgress) => void): (() => void) => {
    const listener = (_event: unknown, progress: TranslateProgress): void => cb(progress)
    ipcRenderer.on(IPC.translateProgressEvent, listener)
    return () => {
      ipcRenderer.removeListener(IPC.translateProgressEvent, listener)
    }
  }
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api