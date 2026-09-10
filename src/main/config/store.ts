import { promises as fs } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import type { AiProfile, AppConfig } from '../../shared/types'
import { readJson, writeJson } from '../library/store'
import type { SecretBox } from './secrets'

const CONFIG_FILE = 'config.json'
const PROFILES_FILE = 'ai-profiles.json'
const KEYS_FILE = 'ai-keys.json'

export function defaultLibraryRoot(): string {
  return path.join(homedir(), 'Documents', '我的论文')
}

function defaultConfig(): AppConfig {
  return { version: 1, libraryRoot: defaultLibraryRoot(), activeProfileId: null, targetLang: 'zh' }
}

export async function loadConfig(root: string): Promise<AppConfig> {
  const loaded = await readJson<Partial<AppConfig>>(path.join(root, CONFIG_FILE))
  if (!loaded || loaded.version !== 1) return defaultConfig()
  return {
    version: 1,
    libraryRoot: typeof loaded.libraryRoot === 'string' ? loaded.libraryRoot : defaultLibraryRoot(),
    activeProfileId: typeof loaded.activeProfileId === 'string' ? loaded.activeProfileId : null,
    targetLang: 'zh'
  }
}

export async function saveConfig(root: string, config: AppConfig): Promise<void> {
  await fs.mkdir(root, { recursive: true })
  await writeJson(path.join(root, CONFIG_FILE), config)
}

export async function listProfiles(root: string): Promise<AiProfile[]> {
  const loaded = await readJson<AiProfile[]>(path.join(root, PROFILES_FILE))
  return Array.isArray(loaded) ? loaded : []
}

export async function upsertProfile(root: string, profile: AiProfile): Promise<void> {
  const list = await listProfiles(root)
  const at = list.findIndex((p) => p.id === profile.id)
  if (at >= 0) list[at] = profile
  else list.push(profile)
  await fs.mkdir(root, { recursive: true })
  await writeJson(path.join(root, PROFILES_FILE), list)
}

export async function deleteProfile(root: string, profileId: string): Promise<void> {
  const list = (await listProfiles(root)).filter((p) => p.id !== profileId)
  await fs.mkdir(root, { recursive: true })
  await writeJson(path.join(root, PROFILES_FILE), list)

  const keys = await readKeys(root)
  if (keys[profileId] !== undefined) {
    delete keys[profileId]
    await writeJson(path.join(root, KEYS_FILE), keys)
  }
}

async function readKeys(root: string): Promise<Record<string, string>> {
  const loaded = await readJson<Record<string, string>>(path.join(root, KEYS_FILE))
  return loaded && typeof loaded === 'object' ? loaded : {}
}

export async function setApiKey(
  root: string,
  profileId: string,
  key: string,
  box: SecretBox
): Promise<void> {
  const keys = await readKeys(root)
  keys[profileId] = box.encrypt(key)
  await fs.mkdir(root, { recursive: true })
  await writeJson(path.join(root, KEYS_FILE), keys)
}

export async function getApiKey(
  root: string,
  profileId: string,
  box: SecretBox
): Promise<string | null> {
  const keys = await readKeys(root)
  const cipher = keys[profileId]
  if (typeof cipher !== 'string') return null
  try {
    return box.decrypt(cipher)
  } catch {
    return null
  }
}
/**
 * 找出"当前该用哪套配置"。
 * 优先按 config.activeProfileId 找；找不到（没设置、或那套已被删除）就退回第一套。
 * 之所以要兜底：用户刚添加完配置就去点翻译，是最常见的路径，
 * 这里必须给出一个可用的结果，而不是让功能直接报错。
 */
export async function resolveActiveProfile(root: string): Promise<AiProfile | null> {
  const [config, profiles] = await Promise.all([loadConfig(root), listProfiles(root)])
  if (profiles.length === 0) return null
  return profiles.find((p) => p.id === config.activeProfileId) ?? profiles[0]
}
