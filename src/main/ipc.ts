import { promises as fs } from 'node:fs'
import { BrowserWindow, dialog, ipcMain, type OpenDialogOptions } from 'electron'
import { IPC } from '../shared/ipc'
import type { BlocksFile, ImportResult, LibraryEntry } from '../shared/types'
import { importPdfs } from './library/import'
import { findEntry, libraryPaths, listEntries, readJson } from './library/store'

const PDF_FILTER = [{ name: 'PDF 文件', extensions: ['pdf'] }]

function openDialogOptions(): OpenDialogOptions {
  return {
    title: '选择论文 PDF',
    properties: ['openFile', 'multiSelections'],
    filters: PDF_FILTER
  }
}

export function registerIpc(root: string): void {
  ipcMain.handle(IPC.libraryList, async (): Promise<LibraryEntry[]> => listEntries(root))

  ipcMain.handle(IPC.libraryChooseFiles, async (event): Promise<string[]> => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const options = openDialogOptions()
    const result = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options)
    return result.canceled ? [] : result.filePaths
  })

  ipcMain.handle(IPC.libraryImport, async (_event, paths: string[]): Promise<ImportResult> => {
    return importPdfs(root, paths)
  })

  ipcMain.handle(
    IPC.libraryGetBlocks,
    async (_event, paperId: string): Promise<BlocksFile | null> => {
      const entry = await findEntry(root, paperId)
      if (!entry) return null
      return readJson<BlocksFile>(libraryPaths(root, paperId).blocks)
    }
  )

  ipcMain.handle(
    IPC.libraryReadPdf,
    async (_event, paperId: string): Promise<Uint8Array | null> => {
      const entry = await findEntry(root, paperId)
      if (!entry) return null
      return new Uint8Array(await fs.readFile(libraryPaths(root, paperId).pdf))
    }
  )
}