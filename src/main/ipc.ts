import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { app, BrowserWindow, dialog, ipcMain, type OpenDialogOptions } from 'electron'
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
import { chatComplete } from './ai/client'
import { toChineseMessage } from './ai/errors'
import { createSafeStorageBox } from './config/safeStorageBox'
import {
  deleteProfile,
  getApiKey,
  listProfiles,
  loadConfig,
  resolveActiveProfile,
  saveConfig,
  setApiKey,
  upsertProfile
} from './config/store'
import { importPdfs } from './library/import'
import { findEntry, libraryPaths, listEntries, readJson } from './library/store'
import { translatePaper } from './translate/runner'
import { readTranslation } from './translate/state'

const PDF_FILTER = [{ name: 'PDF 文件', extensions: ['pdf'] }]

const runningTranslations = new Map<string, AbortController>()

export function configRoot(): string {
  return join(app.getPath('appData'), 'ai-paper-reader')
}

export async function testConnection(
  profile: AiProfile,
  apiKey: string
): Promise<{ ok: boolean; message: string }> {
  try {
    const result = await chatComplete({
      profile,
      apiKey,
      messages: [{ role: 'user', content: '请只回复两个字：可用' }]
    })
    return { ok: true, message: `连接成功，模型返回：${result.content.slice(0, 40)}` }
  } catch (err) {
    return { ok: false, message: toChineseMessage(err) }
  }
}

function openDialogOptions(): OpenDialogOptions {
  return {
    title: '选择论文 PDF',
    properties: ['openFile', 'multiSelections'],
    filters: PDF_FILTER
  }
}

export function registerIpc(root: string): void {
  const cfgRoot = configRoot()
  const box = createSafeStorageBox()

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

  ipcMain.handle(IPC.configGet, async (): Promise<AppConfig> => loadConfig(cfgRoot))

  ipcMain.handle(IPC.configSave, async (_event, config: AppConfig): Promise<void> => {
    await saveConfig(cfgRoot, config)
  })

  ipcMain.handle(IPC.profileList, async (): Promise<AiProfile[]> => listProfiles(cfgRoot))

  ipcMain.handle(IPC.profileSave, async (_event, profile: AiProfile): Promise<void> => {
    await upsertProfile(cfgRoot, profile)
  })

  ipcMain.handle(IPC.profileDelete, async (_event, profileId: string): Promise<void> => {
    await deleteProfile(cfgRoot, profileId)
  })

  ipcMain.handle(IPC.profileSetKey, async (_event, profileId: string, key: string): Promise<void> => {
    await setApiKey(cfgRoot, profileId, key, box)
  })

  ipcMain.handle(
    IPC.aiTest,
    async (_event, profileId: string): Promise<{ ok: boolean; message: string }> => {
      const profile = (await listProfiles(cfgRoot)).find((p) => p.id === profileId)
      if (!profile) return { ok: false, message: '找不到这套配置，请先保存' }
      const key = (await getApiKey(cfgRoot, profileId, box)) ?? ''
      return testConnection(profile, key)
    }
  )

  ipcMain.handle(IPC.translateRead, async (_event, paperId: string): Promise<TranslationFile | null> => {
    return readTranslation(root, paperId)
  })

  ipcMain.handle(IPC.translateStart, async (event, paperId: string): Promise<void> => {
    const profile = await resolveActiveProfile(cfgRoot)
    if (!profile) throw new Error('还没有添加 AI 配置，请先到设置里添加')

    const blocksFile = await readJson<BlocksFile>(libraryPaths(root, paperId).blocks)
    if (!blocksFile) throw new Error('找不到这篇论文的段落数据')

    const controller = new AbortController()
    runningTranslations.set(paperId, controller)

    await translatePaper({
      root,
      paperId,
      profile,
      apiKey: (await getApiKey(cfgRoot, profile.id, box)) ?? '',
      blocks: blocksFile.blocks,
      signal: controller.signal,
      emit: (progress: TranslateProgress) => {
        if (!event.sender.isDestroyed()) event.sender.send(IPC.translateProgressEvent, progress)
      }
    }).finally(() => runningTranslations.delete(paperId))
  })

  ipcMain.handle(IPC.translateCancel, async (_event, paperId: string): Promise<void> => {
    runningTranslations.get(paperId)?.abort()
  })

  ipcMain.handle(IPC.translateSelection, async (_event, text: string): Promise<string> => {
    const profile = await resolveActiveProfile(cfgRoot)
    if (!profile) throw new Error('还没有添加 AI 配置，请先到设置里添加')

    const result = await chatComplete({
      profile,
      apiKey: (await getApiKey(cfgRoot, profile.id, box)) ?? '',
      messages: [
        {
          role: 'system',
          content:
            '把用户给出的英文片段翻译成简体中文，只输出译文，不要解释。保留公式与引用编号原样。'
        },
        { role: 'user', content: text }
      ]
    })
    return result.content.trim()
  })
}