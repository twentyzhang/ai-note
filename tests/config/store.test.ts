import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemoryBox } from '../../src/main/config/secrets'
import {
  deleteProfile,
  getApiKey,
  listProfiles,
  loadConfig,
  saveConfig,
  setApiKey,
  upsertProfile
} from '../../src/main/config/store'
import type { AiProfile, AppConfig } from '../../src/shared/types'

let root = ''

beforeEach(async () => {
  root = await fs.mkdtemp(join(tmpdir(), 'ai-note-config-'))
})

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

function profile(id: string, name = '默认'): AiProfile {
  return {
    id,
    name,
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    concurrency: 3,
    maxBatchBlocks: 10,
    maxBatchChars: 6000,
    pricePerMTokIn: 1,
    pricePerMTokOut: 2
  }
}

describe('应用配置', () => {
  it('配置不存在时返回默认值', async () => {
    const config = await loadConfig(root)
    expect(config.version).toBe(1)
    expect(config.activeProfileId).toBeNull()
    expect(config.targetLang).toBe('zh')
    expect(config.libraryRoot.length).toBeGreaterThan(0)
  })

  it('保存后能读回', async () => {
    const config: AppConfig = {
      version: 1,
      libraryRoot: 'D:/papers',
      activeProfileId: 'p1',
      targetLang: 'zh'
    }
    await saveConfig(root, config)
    expect(await loadConfig(root)).toEqual(config)
  })

  it('配置文件损坏时回落到默认值而不是抛错', async () => {
    await fs.writeFile(join(root, 'config.json'), '{ 坏掉的 JSON', 'utf8')
    const config = await loadConfig(root)
    expect(config.version).toBe(1)
  })
})

describe('AI 配置档案', () => {
  it('新增后可查到', async () => {
    await upsertProfile(root, profile('p1', 'DeepSeek'))
    const list = await listProfiles(root)
    expect(list).toHaveLength(1)
    expect(list[0].name).toBe('DeepSeek')
  })

  it('同 id 覆盖而不是追加', async () => {
    await upsertProfile(root, profile('p1', '旧名字'))
    await upsertProfile(root, profile('p1', '新名字'))
    const list = await listProfiles(root)
    expect(list).toHaveLength(1)
    expect(list[0].name).toBe('新名字')
  })

  it('删除后同时清掉它的密钥', async () => {
    const box = createMemoryBox()
    await upsertProfile(root, profile('p1'))
    await setApiKey(root, 'p1', 'sk-secret', box)
    await deleteProfile(root, 'p1')
    expect(await listProfiles(root)).toHaveLength(0)
    expect(await getApiKey(root, 'p1', box)).toBeNull()
  })
})

describe('密钥存储', () => {
  it('存进去能取出来', async () => {
    const box = createMemoryBox()
    await setApiKey(root, 'p1', 'sk-abc123', box)
    expect(await getApiKey(root, 'p1', box)).toBe('sk-abc123')
  })

  it('密钥不以明文形式出现在任何落盘文件里', async () => {
    const box = createMemoryBox()
    await setApiKey(root, 'p1', 'sk-super-secret', box)
    const files = await fs.readdir(root)
    for (const file of files) {
      const content = await fs.readFile(join(root, file), 'utf8')
      expect(content).not.toContain('sk-super-secret')
    }
  })

  it('取不存在的密钥返回 null', async () => {
    const box = createMemoryBox()
    expect(await getApiKey(root, 'nope', box)).toBeNull()
  })

  it('密文被破坏时返回 null 而不是抛错', async () => {
    const box = createMemoryBox()
    await setApiKey(root, 'p1', 'sk-abc', box)
    await fs.writeFile(join(root, 'ai-keys.json'), JSON.stringify({ p1: '坏掉的密文' }), 'utf8')
    expect(await getApiKey(root, 'p1', box)).toBeNull()
  })
})