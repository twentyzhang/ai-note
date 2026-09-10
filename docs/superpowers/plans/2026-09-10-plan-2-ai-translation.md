# 计划二：AI 接入层与全文翻译

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 点一下"全文翻译"，PDF 逐段变成中文并左右对照显示；中途关掉软件再打开能接着翻，不重复花钱；选中文字能即时翻译；随时能看到花了多少。

**Architecture:** 在已有的主进程特权层里新增三块：配置存储（含密钥加密）、AI 网关（OpenAI 兼容客户端 + 错误分类 + 重试 + 费用估算）、翻译引擎（分批 → 并发调用 → 逐段落盘 → 可取消可续传）。渲染进程只负责显示进度与结果，所有网络请求与密钥都在主进程。翻译结果按段落增量落盘，因此任何中断都不会作废已完成的部分。

**Tech Stack:** 沿用计划一（Electron 33 / React 19 / TypeScript / electron-vite / Vitest）。新增依赖：无。HTTP 用 Node 内置 `fetch`，密钥用 Electron 内置 `safeStorage`。

## Global Constraints

* 平台：Windows 10/11，x64；Node v20.11.1（不可使用 Node 20.12+ 才有的 API，例如 `crypto.hash`）。
* 界面语言：全部中文。所有面向用户的文案（按钮、提示、报错）必须是中文，不得把英文错误原文直接抛给用户。
* 网络请求只在主进程发起，渲染进程不得直接调用任何 AI 服务。
* API Key 只以密文形式落盘，**不得**出现在配置文件、日志、错误信息、git 仓库中。
* 翻译结果按段落增量落盘：任何时刻中断，已完成的段落必须保留。
* 所有 JSON 落盘沿用 `writeJson`（先写临时文件再 rename）。
* 段落 ID 沿用计划一的格式 `p<页码>-b<页内序号>`，例如 `p3-b07`。
* 依赖注入优先：凡是测试里无法直接使用的环境能力（密钥加密、HTTP、计时器），一律定义接口并在测试中注入假实现。
* 提交规范：每一步完成后单独提交，提交信息用中文。
* 每条任务完成前，必须实际运行 `npm test`；涉及界面或主进程装配的任务，还必须实际运行 `npm run dev` 验证。

## 环境注意事项

* 本机沙箱辅助进程损坏，所有命令需要走沙箱外通道执行。
* 文件写入使用 PowerShell 单引号 here-string + UTF-8 无 BOM。
* **不要派发子代理**：子代理在沙箱故障下无法读写文件，授权也送不到用户侧。
* 验证纪律（来自计划一的教训）：`npm run build` 通过**不代表**能跑。动过构建配置或依赖后，`test`、`build`、`dev` 三条路径都要各跑一次。

---

## File Structure

| 文件 | 职责 |
|---|---|
| `src/shared/types.ts` | 追加 AI 相关类型（配置、消息、用量、翻译文件） |
| `src/shared/ipc.ts` | 追加配置与翻译相关的通道常量 |
| `src/main/config/store.ts` | 应用配置与多套 AI 配置的读写 |
| `src/main/config/secrets.ts` | 密钥加密接口与生产实现（safeStorage） |
| `src/main/ai/errors.ts` | AI 错误分类与中文文案 |
| `src/main/ai/client.ts` | OpenAI 兼容的 chat completions 调用 |
| `src/main/ai/retry.ts` | 重试退避与并发控制 |
| `src/main/ai/pricing.ts` | token 用量与费用估算 |
| `src/main/ai/prompts.ts` | 翻译提示词构造 |
| `src/main/ai/parse.ts` | 模型返回内容的解析与容错 |
| `src/main/translate/batches.ts` | 分批策略（跳过已完成、按字符与段数切分） |
| `src/main/translate/state.ts` | 翻译文件的状态读写 |
| `src/main/translate/runner.ts` | 翻译编排：并发、落盘、取消、失败降级、费用累计 |
| `src/main/ipc.ts` | 追加配置与翻译相关的 IPC 处理 |
| `src/preload/index.ts` | 追加配置与翻译相关接口 |
| `src/renderer/src/views/SettingsView.tsx` | 设置页（AI 配置、测试连接、并发、目标语言） |
| `src/renderer/src/views/ReaderView.tsx` | 追加译文栏、翻译按钮、进度与费用、失败重试 |
| `src/renderer/src/components/TranslationPane.tsx` | 译文栏（逐段填充、滚动同步、失败标记） |
| `src/renderer/src/components/SelectionPopover.tsx` | 选中即译气泡 |
| `scripts/translate-paper.ts` | 用真实 API 跑一篇论文的验收脚本 |
| `tests/config/store.test.ts` | 配置存储测试 |
| `tests/ai/errors.test.ts` | 错误分类测试 |
| `tests/ai/client.test.ts` | 客户端测试（本地假 HTTP 服务） |
| `tests/ai/retry.test.ts` | 重试与并发测试 |
| `tests/ai/pricing.test.ts` | 费用估算测试 |
| `tests/ai/parse.test.ts` | 响应解析容错测试 |
| `tests/translate/batches.test.ts` | 分批测试 |
| `tests/translate/runner.test.ts` | 翻译编排与断点续传测试 |
| `tests/renderer/SettingsView.test.tsx` | 设置页测试 |
| `tests/renderer/TranslationPane.test.tsx` | 译文栏测试 |

---

### Task 1: AI 配置与密钥存储

**Files:**
* Modify: `src/shared/types.ts`
* Create: `src/main/config/secrets.ts`
* Create: `src/main/config/store.ts`
* Test: `tests/config/store.test.ts`

**Interfaces:**
* Consumes: 计划一的 `writeJson` / `readJson`（来自 `src/main/library/store.ts`）
* Produces:
  * 类型 `AiProfile`、`AppConfig`
  * 接口 `SecretBox { encrypt(plain: string): string; decrypt(cipher: string): string }`
  * `createSafeStorageBox(): SecretBox`（生产实现）
  * `createMemoryBox(): SecretBox`（测试与降级实现）
  * `loadConfig(root: string): Promise<AppConfig>`
  * `saveConfig(root: string, config: AppConfig): Promise<void>`
  * `listProfiles(root: string): Promise<AiProfile[]>`
  * `upsertProfile(root: string, profile: AiProfile): Promise<void>`
  * `deleteProfile(root: string, profileId: string): Promise<void>`
  * `setApiKey(root: string, profileId: string, key: string, box: SecretBox): Promise<void>`
  * `getApiKey(root: string, profileId: string, box: SecretBox): Promise<string | null>`

应用配置目录为 `%APPDATA%\ai-paper-reader\` 下的三个文件：`config.json`、`ai-profiles.json`、`ai-keys.json`（密钥密文）。

* [ ] **Step 1: 扩展共享类型**

在 `src/shared/types.ts` 末尾追加：

```ts
export interface AiProfile {
  id: string
  name: string
  baseUrl: string
  model: string
  concurrency: number
  maxBatchBlocks: number
  maxBatchChars: number
  pricePerMTokIn: number | null
  pricePerMTokOut: number | null
}

export interface AppConfig {
  version: 1
  libraryRoot: string
  activeProfileId: string | null
  targetLang: 'zh'
}

export type TranslationStatus = 'pending' | 'streaming' | 'done' | 'failed'

export interface TranslationBlockResult {
  status: TranslationStatus
  text?: string
  error?: string
  attempts?: number
}

export interface TokenUsage {
  promptTokens: number
  completionTokens: number
}

export interface TranslationFile {
  targetLang: string
  profileId: string
  model: string
  updatedAt: number
  usage: TokenUsage
  blocks: Record<string, TranslationBlockResult>
}

export interface TranslateProgress {
  paperId: string
  done: number
  failed: number
  total: number
  running: boolean
  usage: TokenUsage
  lastError: string | null
}
```

* [ ] **Step 2: 写失败的测试**

创建 `tests/config/store.test.ts`：

```ts
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
```

* [ ] **Step 3: 运行测试，确认失败**

```bash
npx vitest run tests/config/store.test.ts
```

预期：FAIL，找不到模块 `../../src/main/config/store`。

* [ ] **Step 4: 写密钥加密层**

创建 `src/main/config/secrets.ts`：

```ts
import { safeStorage } from 'electron'

export interface SecretBox {
  encrypt(plain: string): string
  decrypt(cipher: string): string
}

/**
 * 生产实现：用操作系统提供的加密能力（Windows 上是 DPAPI）。
 * safeStorage 不可用时（例如系统未就绪）退回内存实现，保证功能不中断，
 * 但此时密钥以可逆的 base64 形式落盘，属于降级行为。
 */
export function createSafeStorageBox(): SecretBox {
  if (!safeStorage.isEncryptionAvailable()) return createMemoryBox()
  return {
    encrypt: (plain) => safeStorage.encryptString(plain).toString('base64'),
    decrypt: (cipher) => safeStorage.decryptString(Buffer.from(cipher, 'base64'))
  }
}

/**
 * 仅用于测试与降级。用固定前缀 + base64，明确不是安全加密。
 */
export function createMemoryBox(): SecretBox {
  return {
    encrypt: (plain) => 'plain64:' + Buffer.from(plain, 'utf8').toString('base64'),
    decrypt: (cipher) => {
      if (!cipher.startsWith('plain64:')) throw new Error('不是本实现产生的密文')
      return Buffer.from(cipher.slice('plain64:'.length), 'base64').toString('utf8')
    }
  }
}
```

注意：`createSafeStorageBox` 里 `safeStorage` 只在 Electron 运行时可用，因此这个文件**不要在单元测试里直接导入生产实现**；测试只导入 `createMemoryBox`。

* [ ] **Step 5: 写配置存储**

创建 `src/main/config/store.ts`：

```ts
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
```

* [ ] **Step 6: 运行测试，确认通过**

```bash
npx vitest run tests/config/store.test.ts
```

预期：10 个测试全部 PASS。

* [ ] **Step 7: 提交**

```bash
git add src/shared/types.ts src/main/config tests/config
git commit -m "feat: AI 配置存储与密钥加密"
```
---

### Task 2: AI 客户端与错误分类

**Files:**
* Create: `src/main/ai/errors.ts`
* Create: `src/main/ai/client.ts`
* Test: `tests/ai/errors.test.ts`
* Test: `tests/ai/client.test.ts`

**Interfaces:**
* Consumes: `AiProfile`、`TokenUsage`（Task 1）
* Produces:
  * 类型 `AiErrorKind`、类 `AiError { kind, status, message }`
  * `classifyStatus(status: number, body: string): AiError`
  * `isRetryable(err: unknown): boolean`
  * `toChineseMessage(err: unknown): string`
  * 类型 `ChatMessage`、`ChatRequest`、`ChatResult`、`FetchLike`
  * `chatComplete(req: ChatRequest, fetchImpl?: FetchLike): Promise<ChatResult>`

HTTP 细节：请求 `POST {baseUrl}/chat/completions`，`temperature` 固定 0，`jsonMode` 为真时附加 `response_format: { type: 'json_object' }`。`apiKey` 为空时不发送 Authorization 头（本地模型常见）。

* [ ] **Step 1: 写失败的测试（错误分类）**

创建 `tests/ai/errors.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { AiError, classifyStatus, isRetryable, toChineseMessage } from '../../src/main/ai/errors'

describe('HTTP 状态分类', () => {
  it('401 与 403 归为密钥无效', () => {
    expect(classifyStatus(401, '').kind).toBe('auth')
    expect(classifyStatus(403, '').kind).toBe('auth')
  })

  it('402 归为余额不足', () => {
    expect(classifyStatus(402, '').kind).toBe('quota')
  })

  it('429 归为限流', () => {
    expect(classifyStatus(429, '').kind).toBe('rate_limited')
  })

  it('5xx 归为服务端故障', () => {
    expect(classifyStatus(503, '').kind).toBe('server')
  })

  it('其它状态归为未知并保留响应片段', () => {
    const err = classifyStatus(418, '我是茶壶')
    expect(err.kind).toBe('unknown')
    expect(err.message).toContain('茶壶')
  })
})

describe('可重试判定', () => {
  it('网络、限流、服务端、截断可重试', () => {
    expect(isRetryable(new AiError('network', ''))).toBe(true)
    expect(isRetryable(new AiError('rate_limited', ''))).toBe(true)
    expect(isRetryable(new AiError('server', ''))).toBe(true)
    expect(isRetryable(new AiError('truncated', ''))).toBe(true)
  })

  it('密钥无效与余额不足不可重试', () => {
    expect(isRetryable(new AiError('auth', ''))).toBe(false)
    expect(isRetryable(new AiError('quota', ''))).toBe(false)
  })

  it('非 AiError 的异常按可重试处理', () => {
    expect(isRetryable(new Error('socket hang up'))).toBe(true)
  })
})

describe('中文文案', () => {
  it('每个分类都有中文说明', () => {
    const kinds = ['network', 'rate_limited', 'auth', 'quota', 'server', 'bad_response', 'truncated', 'unknown'] as const
    for (const kind of kinds) {
      const message = toChineseMessage(new AiError(kind, 'raw'))
      expect(message.length).toBeGreaterThan(0)
      expect(/[\u4e00-\u9fff]/.test(message)).toBe(true)
    }
  })

  it('未知异常也能转成中文', () => {
    expect(/[\u4e00-\u9fff]/.test(toChineseMessage(new Error('boom')))).toBe(true)
  })
})
```

* [ ] **Step 2: 运行测试，确认失败**

```bash
npx vitest run tests/ai/errors.test.ts
```

预期：FAIL，找不到模块。

* [ ] **Step 3: 写错误分类实现**

创建 `src/main/ai/errors.ts`：

```ts
export type AiErrorKind =
  | 'network'
  | 'rate_limited'
  | 'auth'
  | 'quota'
  | 'server'
  | 'bad_response'
  | 'truncated'
  | 'unknown'

export class AiError extends Error {
  readonly kind: AiErrorKind
  readonly status: number | null

  constructor(kind: AiErrorKind, message: string, status: number | null = null) {
    super(message)
    this.name = 'AiError'
    this.kind = kind
    this.status = status
  }
}

const RETRYABLE: ReadonlySet<AiErrorKind> = new Set([
  'network',
  'rate_limited',
  'server',
  'truncated'
])

const CHINESE: Record<AiErrorKind, string> = {
  network: '连不上 AI 服务，请检查网络连接或设置里的 Base URL',
  rate_limited: '请求太频繁被限流，正在自动降速重试',
  auth: 'API Key 无效或没有权限，请到设置里检查',
  quota: '账户余额不足，请先充值再继续翻译',
  server: 'AI 服务端暂时故障，稍后会自动重试',
  bad_response: 'AI 返回的内容格式不对，正在尝试其它办法',
  truncated: 'AI 输出被截断，正在缩小批次重试',
  unknown: '调用 AI 时出现未知错误'
}

export function classifyStatus(status: number, body: string): AiError {
  if (status === 401 || status === 403) return new AiError('auth', CHINESE.auth, status)
  if (status === 402) return new AiError('quota', CHINESE.quota, status)
  if (status === 429) return new AiError('rate_limited', CHINESE.rate_limited, status)
  if (status >= 500) return new AiError('server', CHINESE.server, status)
  const snippet = body.replace(/\s+/g, ' ').slice(0, 200)
  return new AiError('unknown', `请求失败（HTTP ${status}）：${snippet}`, status)
}

export function isRetryable(err: unknown): boolean {
  if (err instanceof AiError) return RETRYABLE.has(err.kind)
  return true
}

export function toChineseMessage(err: unknown): string {
  if (err instanceof AiError) return CHINESE[err.kind]
  return CHINESE.unknown
}
```

* [ ] **Step 4: 写失败的测试（客户端）**

创建 `tests/ai/client.test.ts`：

```ts
import { describe, expect, it, vi } from 'vitest'
import { AiError } from '../../src/main/ai/errors'
import { chatComplete, type FetchLike } from '../../src/main/ai/client'
import type { AiProfile } from '../../src/shared/types'

const profile: AiProfile = {
  id: 'p1',
  name: '测试',
  baseUrl: 'https://example.com/v1',
  model: 'test-model',
  concurrency: 1,
  maxBatchBlocks: 5,
  maxBatchChars: 1000,
  pricePerMTokIn: null,
  pricePerMTokOut: null
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  })
}

function okBody(content: string, extra: Record<string, unknown> = {}): unknown {
  return {
    choices: [{ message: { content }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 100, completion_tokens: 50 },
    ...extra
  }
}

describe('chatComplete', () => {
  it('正常返回时给出内容与用量', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => jsonResponse(okBody('你好')))
    const result = await chatComplete(
      { profile, apiKey: 'sk-1', messages: [{ role: 'user', content: 'hi' }] },
      fetchImpl
    )
    expect(result.content).toBe('你好')
    expect(result.usage).toEqual({ promptTokens: 100, completionTokens: 50 })
    expect(result.finishReason).toBe('stop')
  })

  it('拼出正确的 URL、模型名与鉴权头', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => jsonResponse(okBody('ok')))
    await chatComplete(
      { profile, apiKey: 'sk-secret', messages: [{ role: 'user', content: 'hi' }] },
      fetchImpl
    )
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('https://example.com/v1/chat/completions')
    expect((init?.headers as Record<string, string>).authorization).toBe('Bearer sk-secret')
    expect(JSON.parse(String(init?.body)).model).toBe('test-model')
  })

  it('Base URL 末尾多写斜杠也不会拼出双斜杠', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => jsonResponse(okBody('ok')))
    await chatComplete(
      { profile: { ...profile, baseUrl: 'https://example.com/v1/' }, apiKey: 'k', messages: [] },
      fetchImpl
    )
    expect(fetchImpl.mock.calls[0][0]).toBe('https://example.com/v1/chat/completions')
  })

  it('Base URL 已经包含 chat/completions 时不再追加', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => jsonResponse(okBody('ok')))
    await chatComplete(
      {
        profile: { ...profile, baseUrl: 'https://example.com/v1/chat/completions' },
        apiKey: 'k',
        messages: []
      },
      fetchImpl
    )
    expect(fetchImpl.mock.calls[0][0]).toBe('https://example.com/v1/chat/completions')
  })

  it('本地模型不填 key 时不发送鉴权头', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => jsonResponse(okBody('ok')))
    await chatComplete({ profile, apiKey: '', messages: [] }, fetchImpl)
    const headers = fetchImpl.mock.calls[0][1]?.headers as Record<string, string>
    expect(headers.authorization).toBeUndefined()
  })

  it('jsonMode 时带上 response_format', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => jsonResponse(okBody('{}')))
    await chatComplete({ profile, apiKey: 'k', messages: [], jsonMode: true }, fetchImpl)
    expect(JSON.parse(String(fetchImpl.mock.calls[0][1]?.body)).response_format).toEqual({
      type: 'json_object'
    })
  })

  it('401 抛出 auth 错误', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => jsonResponse({ error: 'bad key' }, 401))
    await expect(chatComplete({ profile, apiKey: 'k', messages: [] }, fetchImpl)).rejects.toMatchObject({
      kind: 'auth'
    })
  })

  it('429 抛出限流错误', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => jsonResponse({}, 429))
    await expect(chatComplete({ profile, apiKey: 'k', messages: [] }, fetchImpl)).rejects.toMatchObject({
      kind: 'rate_limited'
    })
  })

  it('响应不是 JSON 时抛 bad_response', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => new Response('<html>502</html>', { status: 200 }))
    await expect(chatComplete({ profile, apiKey: 'k', messages: [] }, fetchImpl)).rejects.toMatchObject({
      kind: 'bad_response'
    })
  })

  it('内容为空时抛 bad_response', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => jsonResponse({ choices: [{ message: {} }] }))
    await expect(chatComplete({ profile, apiKey: 'k', messages: [] }, fetchImpl)).rejects.toMatchObject({
      kind: 'bad_response'
    })
  })

  it('finish_reason 为 length 时抛 truncated', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () =>
      jsonResponse({ choices: [{ message: { content: '半截' }, finish_reason: 'length' }] })
    )
    await expect(chatComplete({ profile, apiKey: 'k', messages: [] }, fetchImpl)).rejects.toMatchObject({
      kind: 'truncated'
    })
  })

  it('缺少 usage 时返回 null 而不是崩溃', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () =>
      jsonResponse({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] })
    )
    const result = await chatComplete({ profile, apiKey: 'k', messages: [] }, fetchImpl)
    expect(result.usage).toBeNull()
  })

  it('网络异常抛 network 错误', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => {
      throw new Error('ECONNREFUSED')
    })
    await expect(chatComplete({ profile, apiKey: 'k', messages: [] }, fetchImpl)).rejects.toMatchObject({
      kind: 'network'
    })
  })
})
```

* [ ] **Step 5: 写客户端实现**

创建 `src/main/ai/client.ts`：

```ts
import type { AiProfile, TokenUsage } from '../../shared/types'
import { AiError, classifyStatus } from './errors'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatRequest {
  profile: AiProfile
  apiKey: string
  messages: ChatMessage[]
  jsonMode?: boolean
  signal?: AbortSignal
}

export interface ChatResult {
  content: string
  usage: TokenUsage | null
  finishReason: string | null
}

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>

export function chatUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '')
  if (trimmed.endsWith('/chat/completions')) return trimmed
  return `${trimmed}/chat/completions`
}

export async function chatComplete(
  request: ChatRequest,
  fetchImpl: FetchLike = fetch
): Promise<ChatResult> {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (request.apiKey) headers.authorization = `Bearer ${request.apiKey}`

  const body: Record<string, unknown> = {
    model: request.profile.model,
    messages: request.messages,
    temperature: 0
  }
  if (request.jsonMode) body.response_format = { type: 'json_object' }

  let response: Response
  try {
    response = await fetchImpl(chatUrl(request.profile.baseUrl), {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: request.signal
    })
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') throw err
    throw new AiError('network', '连不上 AI 服务')
  }

  const text = await response.text()
  if (!response.ok) throw classifyStatus(response.status, text)

  let payload: unknown
  try {
    payload = JSON.parse(text)
  } catch {
    throw new AiError('bad_response', '返回的不是合法 JSON')
  }

  const choice = (payload as { choices?: Array<Record<string, unknown>> }).choices?.[0]
  const content = (choice?.message as { content?: unknown } | undefined)?.content
  if (typeof content !== 'string' || content.length === 0) {
    throw new AiError('bad_response', '返回内容为空')
  }
  const finishReason = typeof choice?.finish_reason === 'string' ? choice.finish_reason : null
  if (finishReason === 'length') throw new AiError('truncated', '输出被截断')

  const rawUsage = (payload as { usage?: Record<string, unknown> }).usage
  const usage: TokenUsage | null = rawUsage
    ? {
        promptTokens: Number(rawUsage.prompt_tokens ?? 0),
        completionTokens: Number(rawUsage.completion_tokens ?? 0)
      }
    : null

  return { content, usage, finishReason }
}
```

* [ ] **Step 6: 运行测试，确认通过**

```bash
npx vitest run tests/ai
```

预期：errors 9 条 + client 13 条全部 PASS。测试不需要联网——客户端的所有 HTTP 行为都是通过注入假 fetch 验证的。

* [ ] **Step 7: 提交**

```bash
git add src/main/ai tests/ai
git commit -m "feat: AI 客户端与错误分类"
```

---

### Task 3: 重试、并发控制与费用估算

**Files:**
* Create: `src/main/ai/retry.ts`
* Create: `src/main/ai/pricing.ts`
* Test: `tests/ai/retry.test.ts`
* Test: `tests/ai/pricing.test.ts`

**Interfaces:**
* Consumes: `AiError`、`isRetryable`（Task 2）；`TokenUsage`（Task 1）
* Produces:
  * `withRetry<T>(task: () => Promise<T>, options: RetryOptions): Promise<T>`
  * `runWithConcurrency<T, R>(items: T[], limit: number, worker: (item: T, index: number) => Promise<R>): Promise<R[]>`
  * `estimateTokens(text: string): number`
  * `estimateCost(usage: TokenUsage, priceIn: number | null, priceOut: number | null): number | null`
  * `formatCost(cost: number | null): string`

`RetryOptions` 为 `{ attempts: number; baseDelayMs: number; maxDelayMs?: number; sleep?: (ms) => Promise<void>; onRetry?: (info: { attempt: number; delayMs: number; error: unknown }) => void }`。退避为 `baseDelayMs * 2^(attempt-1)`，不超过 `maxDelayMs`（默认 8000）。

* [ ] **Step 1: 写失败的测试**

创建 `tests/ai/retry.test.ts`：

```ts
import { describe, expect, it, vi } from 'vitest'
import { runWithConcurrency, withRetry } from '../../src/main/ai/retry'
import { AiError } from '../../src/main/ai/errors'

function fakeSleep(record: number[]): (ms: number) => Promise<void> {
  return async (ms) => {
    record.push(ms)
  }
}

describe('withRetry', () => {
  it('第一次就成功时不等待', async () => {
    const delays: number[] = []
    const task = vi.fn(async () => 'ok')
    await expect(
      withRetry(task, { attempts: 3, baseDelayMs: 100, sleep: fakeSleep(delays) })
    ).resolves.toBe('ok')
    expect(task).toHaveBeenCalledTimes(1)
    expect(delays).toEqual([])
  })

  it('可重试错误会按指数退避重试', async () => {
    const delays: number[] = []
    let calls = 0
    const task = async (): Promise<string> => {
      calls += 1
      if (calls < 3) throw new AiError('rate_limited', '')
      return 'ok'
    }
    await expect(
      withRetry(task, { attempts: 3, baseDelayMs: 100, sleep: fakeSleep(delays) })
    ).resolves.toBe('ok')
    expect(delays).toEqual([100, 200])
  })

  it('超过 maxDelayMs 时被截断', async () => {
    const delays: number[] = []
    let calls = 0
    const task = async (): Promise<string> => {
      calls += 1
      if (calls < 4) throw new AiError('server', '')
      return 'ok'
    }
    await withRetry(task, {
      attempts: 4,
      baseDelayMs: 1000,
      maxDelayMs: 2500,
      sleep: fakeSleep(delays)
    })
    expect(delays).toEqual([1000, 2000, 2500])
  })

  it('不可重试的错误立刻抛出', async () => {
    const delays: number[] = []
    const task = vi.fn(async () => {
      throw new AiError('auth', '')
    })
    await expect(
      withRetry(task, { attempts: 3, baseDelayMs: 100, sleep: fakeSleep(delays) })
    ).rejects.toMatchObject({ kind: 'auth' })
    expect(task).toHaveBeenCalledTimes(1)
    expect(delays).toEqual([])
  })

  it('用尽次数后抛出最后一次的错误', async () => {
    const delays: number[] = []
    const task = vi.fn(async () => {
      throw new AiError('server', '最后一次')
    })
    await expect(
      withRetry(task, { attempts: 2, baseDelayMs: 10, sleep: fakeSleep(delays) })
    ).rejects.toMatchObject({ message: '最后一次' })
    expect(task).toHaveBeenCalledTimes(2)
    expect(delays).toEqual([10])
  })

  it('onRetry 会收到尝试次数与延迟', async () => {
    const seen: Array<{ attempt: number; delayMs: number }> = []
    let calls = 0
    const task = async (): Promise<string> => {
      calls += 1
      if (calls < 2) throw new AiError('network', '')
      return 'ok'
    }
    await withRetry(task, {
      attempts: 2,
      baseDelayMs: 50,
      sleep: fakeSleep([]),
      onRetry: (info) => seen.push({ attempt: info.attempt, delayMs: info.delayMs })
    })
    expect(seen).toEqual([{ attempt: 1, delayMs: 50 }])
  })
})

describe('runWithConcurrency', () => {
  it('结果顺序与输入顺序一致', async () => {
    const items = [1, 2, 3, 4, 5]
    const results = await runWithConcurrency(items, 2, async (n) => n * 10)
    expect(results).toEqual([10, 20, 30, 40, 50])
  })

  it('并发数不会被突破', async () => {
    let running = 0
    let peak = 0
    await runWithConcurrency([1, 2, 3, 4, 5, 6], 2, async () => {
      running += 1
      peak = Math.max(peak, running)
      await new Promise((resolve) => setTimeout(resolve, 5))
      running -= 1
      return null
    })
    expect(peak).toBeLessThanOrEqual(2)
  })

  it('limit 大于条目数时也不会出错', async () => {
    await expect(runWithConcurrency([1, 2], 10, async (n) => n)).resolves.toEqual([1, 2])
  })

  it('空数组返回空数组', async () => {
    await expect(runWithConcurrency([], 3, async () => 1)).resolves.toEqual([])
  })

  it('工人抛错时整体失败', async () => {
    await expect(
      runWithConcurrency([1, 2, 3], 1, async (n) => {
        if (n === 2) throw new Error('炸了')
        return n
      })
    ).rejects.toThrow('炸了')
  })
})
```

创建 `tests/ai/pricing.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { estimateCost, estimateTokens, formatCost } from '../../src/main/ai/pricing'

describe('token 估算', () => {
  it('纯英文按约 4 字符 1 token', () => {
    expect(estimateTokens('a'.repeat(400))).toBe(100)
  })

  it('中文按 1 字 1 token', () => {
    expect(estimateTokens('中文十个字测试一下')).toBe(9)
  })

  it('空字符串为 0', () => {
    expect(estimateTokens('')).toBe(0)
  })

  it('中英混排按各自规则相加', () => {
    expect(estimateTokens('中文abcd')).toBeGreaterThanOrEqual(3)
    expect(estimateTokens('中文abcd')).toBeLessThanOrEqual(4)
  })
})

describe('费用估算', () => {
  it('按输入输出单价分别计算', () => {
    const cost = estimateCost({ promptTokens: 1_000_000, completionTokens: 1_000_000 }, 1, 2)
    expect(cost).toBe(3)
  })

  it('单价缺失时返回 null', () => {
    expect(estimateCost({ promptTokens: 100, completionTokens: 100 }, null, 2)).toBeNull()
    expect(estimateCost({ promptTokens: 100, completionTokens: 100 }, 1, null)).toBeNull()
  })

  it('零用量算出 0', () => {
    expect(estimateCost({ promptTokens: 0, completionTokens: 0 }, 1, 2)).toBe(0)
  })
})

describe('费用文案', () => {
  it('有钱数时带人民币符号与单位', () => {
    expect(formatCost(0.0345)).toContain('0.03')
    expect(formatCost(0.0345)).toContain('元')
  })

  it('不足一分时保留更多小数位，不显示为 0.00', () => {
    expect(formatCost(0.0004)).not.toContain('0.00')
  })

  it('未知时明确说明', () => {
    expect(formatCost(null)).toContain('未知')
  })
})
```

* [ ] **Step 2: 运行测试，确认失败**

```bash
npx vitest run tests/ai/retry.test.ts tests/ai/pricing.test.ts
```

预期：FAIL，找不到模块。

* [ ] **Step 3: 写实现**

创建 `src/main/ai/retry.ts`：

```ts
import { isRetryable } from './errors'

export interface RetryOptions {
  attempts: number
  baseDelayMs: number
  maxDelayMs?: number
  sleep?: (ms: number) => Promise<void>
  onRetry?: (info: { attempt: number; delayMs: number; error: unknown }) => void
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

export async function withRetry<T>(task: () => Promise<T>, options: RetryOptions): Promise<T> {
  const sleep = options.sleep ?? defaultSleep
  const maxDelayMs = options.maxDelayMs ?? 8000
  let lastError: unknown

  for (let attempt = 1; attempt <= options.attempts; attempt++) {
    try {
      return await task()
    } catch (err) {
      lastError = err
      if (!isRetryable(err) || attempt === options.attempts) throw err
      const delayMs = Math.min(options.baseDelayMs * 2 ** (attempt - 1), maxDelayMs)
      options.onRetry?.({ attempt, delayMs, error: err })
      await sleep(delayMs)
    }
  }

  throw lastError
}

export async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  if (items.length === 0) return results

  let cursor = 0
  const width = Math.max(1, Math.min(limit, items.length))

  const runners = Array.from({ length: width }, async () => {
    for (;;) {
      const index = cursor
      cursor += 1
      if (index >= items.length) return
      results[index] = await worker(items[index], index)
    }
  })

  await Promise.all(runners)
  return results
}
```

创建 `src/main/ai/pricing.ts`：

```ts
import type { TokenUsage } from '../../shared/types'

const CJK = /[\u3000-\u303f\u3400-\u4dbf\u4e00-\u9fff\uff00-\uffef]/

export function estimateTokens(text: string): number {
  let cjk = 0
  let other = 0
  for (const ch of text) {
    if (CJK.test(ch)) cjk += 1
    else other += 1
  }
  return Math.ceil(cjk + other / 4)
}

export function estimateCost(
  usage: TokenUsage,
  priceIn: number | null,
  priceOut: number | null
): number | null {
  if (priceIn === null || priceOut === null) return null
  return (usage.promptTokens / 1_000_000) * priceIn + (usage.completionTokens / 1_000_000) * priceOut
}

export function formatCost(cost: number | null): string {
  if (cost === null) return '费用未知（未填写单价）'
  if (cost === 0) return '0 元'
  if (cost < 0.01) return `≈ ${cost.toFixed(4)} 元`
  return `≈ ${cost.toFixed(2)} 元`
}
```

* [ ] **Step 4: 运行测试，确认通过**

```bash
npx vitest run tests/ai
```

预期：全部 PASS（retry 11 条 + pricing 10 条 + 之前的 errors 与 client）。

* [ ] **Step 5: 提交**

```bash
git add src/main/ai/retry.ts src/main/ai/pricing.ts tests/ai/retry.test.ts tests/ai/pricing.test.ts
git commit -m "feat: 重试退避、并发控制与费用估算"
```
---

### Task 4: 翻译提示词、分批策略与响应解析

**Files:**
* Create: `src/main/ai/prompts.ts`
* Create: `src/main/ai/parse.ts`
* Create: `src/main/translate/batches.ts`
* Test: `tests/ai/parse.test.ts`
* Test: `tests/translate/batches.test.ts`

**Interfaces:**
* Consumes: `Block`（计划一的 `src/shared/types.ts`）；`ChatMessage`（Task 2）
* Produces:
  * `buildTranslationMessages(blocks: Block[], targetLang: 'zh'): ChatMessage[]`
  * `class TranslationFormatError extends Error`
  * `parseTranslationResponse(raw: string, expectedIds: string[]): Map<string, string>`
  * `planBatches(blocks: Block[], options: { maxBatchBlocks: number; maxBatchChars: number }): Block[][]`

`buildTranslationMessages` 要求模型只输出 JSON、保持段落编号、不翻译公式与引用编号、术语一致。`parseTranslationResponse` 必须容忍三种返回形态：裸对象 `{ "p1-b00": "译文" }`、包一层 `{ "translations": {...} }`、数组 `[{ "id": "...", "text": "..." }]`，以及被 ` ```json ` 围栏包裹的情况；缺 id 或值不是字符串时抛 `TranslationFormatError`。

* [ ] **Step 1: 写失败的测试**

创建 `tests/ai/parse.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { TranslationFormatError, parseTranslationResponse } from '../../src/main/ai/parse'

const ids = ['p1-b00', 'p1-b01']

describe('翻译响应解析', () => {
  it('解析裸对象', () => {
    const result = parseTranslationResponse('{"p1-b00":"甲","p1-b01":"乙"}', ids)
    expect(result.get('p1-b00')).toBe('甲')
    expect(result.get('p1-b01')).toBe('乙')
  })

  it('解析包了一层 translations 的对象', () => {
    const result = parseTranslationResponse('{"translations":{"p1-b00":"甲","p1-b01":"乙"}}', ids)
    expect(result.get('p1-b01')).toBe('乙')
  })

  it('解析数组形态', () => {
    const raw = '[{"id":"p1-b00","text":"甲"},{"id":"p1-b01","text":"乙"}]'
    expect(parseTranslationResponse(raw, ids).get('p1-b00')).toBe('甲')
  })

  it('解析带 markdown 围栏的返回', () => {
    const raw = '```json\n{"p1-b00":"甲","p1-b01":"乙"}\n```'
    expect(parseTranslationResponse(raw, ids).size).toBe(2)
  })

  it('忽略多余的键，只取要求的段落', () => {
    const raw = '{"p1-b00":"甲","p1-b01":"乙","p9-b99":"多余的"}'
    const result = parseTranslationResponse(raw, ids)
    expect(result.size).toBe(2)
    expect(result.has('p9-b99')).toBe(false)
  })

  it('缺段落时抛 TranslationFormatError', () => {
    expect(() => parseTranslationResponse('{"p1-b00":"甲"}', ids)).toThrow(TranslationFormatError)
  })

  it('完全不是 JSON 时抛 TranslationFormatError', () => {
    expect(() => parseTranslationResponse('我翻译不出来', ids)).toThrow(TranslationFormatError)
  })

  it('值不是字符串时抛 TranslationFormatError', () => {
    expect(() => parseTranslationResponse('{"p1-b00":123,"p1-b01":"乙"}', ids)).toThrow(
      TranslationFormatError
    )
  })

  it('空字符串的译文视为有效', () => {
    expect(parseTranslationResponse('{"p1-b00":"","p1-b01":"乙"}', ids).get('p1-b00')).toBe('')
  })
})
```

创建 `tests/translate/batches.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { planBatches } from '../../src/main/translate/batches'
import type { Block } from '../../src/shared/types'

function block(id: string, textLength = 100): Block {
  return {
    id,
    page: 1,
    bbox: { x: 0, y: 0, w: 10, h: 10 },
    type: 'paragraph',
    text: 'x'.repeat(textLength)
  }
}

const options = { maxBatchBlocks: 3, maxBatchChars: 250 }

describe('分批策略', () => {
  it('按段数上限切分', () => {
    const blocks = [block('b0'), block('b1'), block('b2'), block('b3'), block('b4')]
    const batches = planBatches(blocks, { maxBatchBlocks: 2, maxBatchChars: 100000 })
    expect(batches.map((b) => b.length)).toEqual([2, 2, 1])
  })

  it('按字符数上限切分', () => {
    const blocks = [block('b0', 100), block('b1', 100), block('b2', 100)]
    const batches = planBatches(blocks, { maxBatchBlocks: 100, maxBatchChars: 150 })
    expect(batches.map((b) => b.length)).toEqual([1, 1, 1])
  })

  it('段数与字符数谁先到就按谁切', () => {
    const blocks = [block('b0', 10), block('b1', 10), block('b2', 10), block('b3', 10)]
    const batches = planBatches(blocks, { maxBatchBlocks: 3, maxBatchChars: 25 })
    expect(batches.map((b) => b.length)).toEqual([2, 2])
  })

  it('单段超过字符上限时自己独占一批而不是死循环', () => {
    const blocks = [block('b0', 9999)]
    const batches = planBatches(blocks, { maxBatchBlocks: 3, maxBatchChars: 100 })
    expect(batches).toHaveLength(1)
    expect(batches[0]).toHaveLength(1)
  })

  it('保持原始顺序', () => {
    const blocks = [block('b0'), block('b1'), block('b2')]
    const batches = planBatches(blocks, { maxBatchBlocks: 2, maxBatchChars: 100000 })
    expect(batches.flat().map((b) => b.id)).toEqual(['b0', 'b1', 'b2'])
  })

  it('空输入返回空数组', () => {
    expect(planBatches([], options)).toEqual([])
  })
})
```

* [ ] **Step 2: 运行测试，确认失败**

```bash
npx vitest run tests/ai/parse.test.ts tests/translate/batches.test.ts
```

预期：FAIL，找不到模块。

* [ ] **Step 3: 写提示词构造**

创建 `src/main/ai/prompts.ts`：

```ts
import type { Block } from '../../shared/types'
import type { ChatMessage } from './client'

const SYSTEM_ZH = [
  '你是一名严谨的学术论文翻译员，把英文论文段落翻译成简体中文。',
  '规则：',
  '1. 只输出 JSON，不要输出任何解释、前言或 markdown 围栏。',
  '2. JSON 的键必须与输入给出的段落编号完全一致，不得增删、不得改动大小写。',
  '3. 值是这一段的中文译文；不要输出原文，不要输出编号。',
  '4. 保留数学公式、变量名、化学式、引用编号（如 [23]）与图表编号（如 FIG. 1）原样不译。',
  '5. 术语全篇保持一致；遇到领域专有名词，首次出现时可用「中文（English）」形式。',
  '6. 若某段是纯公式、纯数字或纯符号，原样返回。'
].join('\n')

export function buildTranslationMessages(blocks: Block[], targetLang: 'zh'): ChatMessage[] {
  const payload = blocks.map((block) => ({ id: block.id, text: block.text }))
  const userContent = [
    `请翻译下面 ${blocks.length} 个段落，目标语言：${targetLang === 'zh' ? '简体中文' : targetLang}。`,
    '输入：',
    JSON.stringify(payload),
    '输出格式：{"段落编号":"译文", ...}'
  ].join('\n')

  return [
    { role: 'system', content: SYSTEM_ZH },
    { role: 'user', content: userContent }
  ]
}
```

* [ ] **Step 4: 写响应解析**

创建 `src/main/ai/parse.ts`：

```ts
export class TranslationFormatError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TranslationFormatError'
  }
}

function stripFence(raw: string): string {
  const trimmed = raw.trim()
  const fenced = /^```[a-zA-Z]*\s*\n([\s\S]*?)\n?```$/.exec(trimmed)
  return fenced ? fenced[1].trim() : trimmed
}

function toRecord(payload: unknown): Record<string, unknown> | null {
  if (Array.isArray(payload)) {
    const record: Record<string, unknown> = {}
    for (const item of payload) {
      if (item && typeof item === 'object') {
        const id = (item as { id?: unknown }).id
        const text = (item as { text?: unknown }).text
        if (typeof id === 'string') record[id] = text
      }
    }
    return record
  }
  if (payload && typeof payload === 'object') {
    const outer = payload as Record<string, unknown>
    const inner = outer.translations
    if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
      return inner as Record<string, unknown>
    }
    return outer
  }
  return null
}

export function parseTranslationResponse(raw: string, expectedIds: string[]): Map<string, string> {
  let payload: unknown
  try {
    payload = JSON.parse(stripFence(raw))
  } catch {
    throw new TranslationFormatError('AI 返回的内容不是合法 JSON')
  }

  const record = toRecord(payload)
  if (!record) throw new TranslationFormatError('AI 返回的 JSON 结构无法识别')

  const result = new Map<string, string>()
  for (const id of expectedIds) {
    const value = record[id]
    if (value === undefined) throw new TranslationFormatError(`缺少段落 ${id} 的译文`)
    if (typeof value !== 'string') throw new TranslationFormatError(`段落 ${id} 的译文不是文本`)
    result.set(id, value)
  }
  return result
}
```

* [ ] **Step 5: 写分批策略**

创建 `src/main/translate/batches.ts`：

```ts
import type { Block } from '../../shared/types'

export interface BatchOptions {
  maxBatchBlocks: number
  maxBatchChars: number
}

export function planBatches(blocks: Block[], options: BatchOptions): Block[][] {
  const maxBlocks = Math.max(1, options.maxBatchBlocks)
  const maxChars = Math.max(1, options.maxBatchChars)

  const batches: Block[][] = []
  let current: Block[] = []
  let chars = 0

  for (const block of blocks) {
    const size = block.text.length
    const wouldExceedBlocks = current.length >= maxBlocks
    const wouldExceedChars = current.length > 0 && chars + size > maxChars

    if (wouldExceedBlocks || wouldExceedChars) {
      batches.push(current)
      current = []
      chars = 0
    }

    current.push(block)
    chars += size
  }

  if (current.length > 0) batches.push(current)
  return batches
}
```

注意：**单段自身超过字符上限时不会陷入死循环**——因为判断条件里带了 `current.length > 0`，它只会在"已经有内容"时才因为超长而切分。

* [ ] **Step 6: 运行测试，确认通过**

```bash
npx vitest run tests/ai/parse.test.ts tests/translate/batches.test.ts
```

预期：parse 9 条 + batches 6 条全部 PASS。

* [ ] **Step 7: 提交**

```bash
git add src/main/ai/prompts.ts src/main/ai/parse.ts src/main/translate/batches.ts tests/ai/parse.test.ts tests/translate/batches.test.ts
git commit -m "feat: 翻译提示词、分批策略与响应解析"
```
---

### Task 5: 翻译引擎（增量落盘、失败降级、断点续传）

**Files:**
* Create: `src/main/translate/state.ts`
* Create: `src/main/translate/runner.ts`
* Test: `tests/translate/runner.test.ts`

**Interfaces:**
* Consumes: 计划一的 `libraryPaths` / `readJson` / `writeJson`、`Block`；Task 1 的 `AiProfile`、`TranslationFile`、`TranslateProgress`、`TokenUsage`；Task 2 的 `chatComplete`、`AiError`、`isRetryable`；Task 3 的 `withRetry`、`runWithConcurrency`；Task 4 的 `buildTranslationMessages`、`parseTranslationResponse`、`planBatches`
* Produces:
  * `translationPath(root: string, paperId: string): string`
  * `createTranslationFile(profileId: string, model: string): TranslationFile`
  * `readTranslation(root: string, paperId: string): Promise<TranslationFile | null>`
  * `writeTranslation(root: string, paperId: string, file: TranslationFile): Promise<void>`
  * `mergeUsage(a: TokenUsage, b: TokenUsage | null): TokenUsage`
  * `pendingBlocks(blocks: Block[], file: TranslationFile): Block[]`
  * `summarize(file: TranslationFile): { done: number; failed: number }`
  * `type ChatClient = (request: ChatRequest) => Promise<ChatResult>`
  * `translatePaper(options: TranslateOptions): Promise<TranslationFile>`

**三条必须守住的行为**（对应设计文档第 5.2 节与第 8 节）：

1. **增量落盘**：每完成一批就立刻写盘，绝不等到全部结束。
2. **失败降级**：整批失败且错误可重试时，拆成单段逐条翻译；单段仍失败才标记该段为 failed。
3. **遇不可重试错误立刻停手**：密钥无效、余额不足这类错误不能反复重试，标记失败后**停止调度后续批次**。

`TranslateOptions` 为：

```ts
interface TranslateOptions {
  root: string
  paperId: string
  profile: AiProfile
  apiKey: string
  blocks: Block[]
  client?: ChatClient
  emit?: (progress: TranslateProgress) => void
  signal?: AbortSignal
  retry?: { attempts?: number; baseDelayMs?: number; sleep?: (ms: number) => Promise<void> }
}
```

* [ ] **Step 1: 写失败的测试**

创建 `tests/translate/runner.test.ts`：

```ts
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AiError } from '../../src/main/ai/errors'
import type { ChatRequest, ChatResult } from '../../src/main/ai/client'
import { createPaperDir, libraryPaths } from '../../src/main/library/store'
import { readTranslation, translationPath } from '../../src/main/translate/state'
import { translatePaper } from '../../src/main/translate/runner'
import type { AiProfile, Block, TranslateProgress } from '../../src/shared/types'

let root = ''

beforeEach(async () => {
  root = await fs.mkdtemp(join(tmpdir(), 'ai-note-translate-'))
  await createPaperDir(root, 'p1')
})

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

const profile: AiProfile = {
  id: 'prof1',
  name: '测试',
  baseUrl: 'https://example.com/v1',
  model: 'test-model',
  concurrency: 2,
  maxBatchBlocks: 2,
  maxBatchChars: 100000,
  pricePerMTokIn: 1,
  pricePerMTokOut: 2
}

function block(id: string): Block {
  return { id, page: 1, bbox: { x: 0, y: 0, w: 1, h: 1 }, type: 'paragraph', text: `text of ${id}` }
}

const blocks: Block[] = [block('p1-b00'), block('p1-b01'), block('p1-b02'), block('p1-b03')]

function idsFrom(request: ChatRequest): string[] {
  const content = request.messages[1].content
  const json = content.slice(content.indexOf('['), content.lastIndexOf(']') + 1)
  return (JSON.parse(json) as Array<{ id: string }>).map((x) => x.id)
}

function answerFor(ids: string[]): string {
  return JSON.stringify(Object.fromEntries(ids.map((id) => [id, `译:${id}`])))
}

function okResult(ids: string[]): ChatResult {
  return { content: answerFor(ids), usage: { promptTokens: 10, completionTokens: 5 }, finishReason: 'stop' }
}

const fastRetry = { attempts: 3, baseDelayMs: 1, sleep: async () => {} }

describe('翻译引擎', () => {
  it('全部成功时每段都标记完成并落盘', async () => {
    const client = vi.fn(async (request: ChatRequest) => okResult(idsFrom(request)))
    const file = await translatePaper({ root, paperId: 'p1', profile, apiKey: 'k', blocks, client, retry: fastRetry })

    expect(Object.keys(file.blocks)).toHaveLength(4)
    for (const b of blocks) {
      expect(file.blocks[b.id].status).toBe('done')
      expect(file.blocks[b.id].text).toBe(`译:${b.id}`)
    }
    const onDisk = await readTranslation(root, 'p1')
    expect(onDisk?.blocks['p1-b00'].text).toBe('译:p1-b00')
  })

  it('累计 token 用量', async () => {
    const client = vi.fn(async (request: ChatRequest) => okResult(idsFrom(request)))
    const file = await translatePaper({ root, paperId: 'p1', profile, apiKey: 'k', blocks, client, retry: fastRetry })
    expect(file.usage.promptTokens).toBe(20)
    expect(file.usage.completionTokens).toBe(10)
  })

  it('首次返回格式错误时会重试并最终成功', async () => {
    let calls = 0
    const client = vi.fn(async (request: ChatRequest) => {
      calls += 1
      if (calls === 1) return { content: '我不是 JSON', usage: null, finishReason: 'stop' }
      return okResult(idsFrom(request))
    })
    const file = await translatePaper({ root, paperId: 'p1', profile, apiKey: 'k', blocks, client, retry: fastRetry })
    expect(file.blocks['p1-b00'].status).toBe('done')
  })

  it('整批始终失败时拆成单段重试，能救回多少救多少', async () => {
    const client = vi.fn(async (request: ChatRequest) => {
      const ids = idsFrom(request)
      if (ids.length > 1) return { content: '永远不是 JSON', usage: null, finishReason: 'stop' }
      if (ids[0] === 'p1-b02') return { content: '这一段就是不行', usage: null, finishReason: 'stop' }
      return okResult(ids)
    })
    const file = await translatePaper({ root, paperId: 'p1', profile, apiKey: 'k', blocks, client, retry: fastRetry })

    expect(file.blocks['p1-b00'].status).toBe('done')
    expect(file.blocks['p1-b01'].status).toBe('done')
    expect(file.blocks['p1-b02'].status).toBe('failed')
    expect(file.blocks['p1-b03'].status).toBe('done')
  })

  it('密钥无效时立即停手，不反复重试', async () => {
    const client = vi.fn(async () => {
      throw new AiError('auth', 'bad key')
    })
    const progress: TranslateProgress[] = []
    const file = await translatePaper({
      root, paperId: 'p1', profile, apiKey: 'k', blocks, client,
      retry: fastRetry,
      emit: (p) => progress.push(p)
    })

    expect(client.mock.calls.length).toBeLessThanOrEqual(2)
    expect(file.blocks['p1-b00']?.status).toBe('failed')
    expect(progress.at(-1)?.lastError).toContain('API Key')
  })

  it('限流会重试而不是立刻失败', async () => {
    let calls = 0
    const client = vi.fn(async (request: ChatRequest) => {
      calls += 1
      if (calls <= 2) throw new AiError('rate_limited', '')
      return okResult(idsFrom(request))
    })
    const file = await translatePaper({ root, paperId: 'p1', profile, apiKey: 'k', blocks, client, retry: fastRetry })
    expect(file.blocks['p1-b00'].status).toBe('done')
  })

  it('已经有译文的段落不会再次请求', async () => {
    const seen: string[] = []
    const client = vi.fn(async (request: ChatRequest) => {
      seen.push(...idsFrom(request))
      return okResult(idsFrom(request))
    })
    await translatePaper({ root, paperId: 'p1', profile, apiKey: 'k', blocks: blocks.slice(0, 2), client, retry: fastRetry })
    seen.length = 0

    await translatePaper({ root, paperId: 'p1', profile, apiKey: 'k', blocks, client, retry: fastRetry })
    expect(seen).not.toContain('p1-b00')
    expect(seen).not.toContain('p1-b01')
    expect(seen).toContain('p1-b02')
    expect(seen).toContain('p1-b03')
  })

  it('中断后已完成的段落保留在磁盘上', async () => {
    const controller = new AbortController()
    const client = vi.fn(async (request: ChatRequest) => {
      const ids = idsFrom(request)
      if (ids.includes('p1-b02')) controller.abort()
      return okResult(ids)
    })
    await translatePaper({
      root, paperId: 'p1', profile: { ...profile, concurrency: 1 }, apiKey: 'k',
      blocks, client, retry: fastRetry, signal: controller.signal
    })

    const onDisk = await readTranslation(root, 'p1')
    expect(onDisk?.blocks['p1-b00'].status).toBe('done')
  })

  it('进度回调会给出已完成与失败数量', async () => {
    const client = vi.fn(async (request: ChatRequest) => okResult(idsFrom(request)))
    const progress: TranslateProgress[] = []
    await translatePaper({
      root, paperId: 'p1', profile, apiKey: 'k', blocks, client,
      retry: fastRetry, emit: (p) => progress.push(p)
    })
    expect(progress.length).toBeGreaterThan(1)
    expect(progress.at(-1)).toMatchObject({ done: 4, failed: 0, total: 4, running: false })
  })

  it('翻译文件写在论文自己的目录里', async () => {
    const client = vi.fn(async (request: ChatRequest) => okResult(idsFrom(request)))
    await translatePaper({ root, paperId: 'p1', profile, apiKey: 'k', blocks: [block('p1-b00')], client, retry: fastRetry })
    await fs.access(translationPath(root, 'p1'))
    expect(translationPath(root, 'p1').startsWith(libraryPaths(root, 'p1').paperDir)).toBe(true)
  })
})
```

* [ ] **Step 2: 运行测试，确认失败**

```bash
npx vitest run tests/translate/runner.test.ts
```

预期：FAIL，找不到模块。

* [ ] **Step 3: 写状态层**

创建 `src/main/translate/state.ts`：

```ts
import path from 'node:path'
import type { Block, TokenUsage, TranslationFile } from '../../shared/types'
import { libraryPaths, readJson, writeJson } from '../library/store'

export function translationPath(root: string, paperId: string): string {
  return path.join(libraryPaths(root, paperId).paperDir, 'translation.zh.json')
}

export function createTranslationFile(profileId: string, model: string): TranslationFile {
  return {
    targetLang: 'zh',
    profileId,
    model,
    updatedAt: Date.now(),
    usage: { promptTokens: 0, completionTokens: 0 },
    blocks: {}
  }
}

export async function readTranslation(
  root: string,
  paperId: string
): Promise<TranslationFile | null> {
  const loaded = await readJson<TranslationFile>(translationPath(root, paperId))
  if (!loaded || typeof loaded !== 'object' || typeof loaded.blocks !== 'object') return null
  return {
    targetLang: typeof loaded.targetLang === 'string' ? loaded.targetLang : 'zh',
    profileId: typeof loaded.profileId === 'string' ? loaded.profileId : '',
    model: typeof loaded.model === 'string' ? loaded.model : '',
    updatedAt: typeof loaded.updatedAt === 'number' ? loaded.updatedAt : 0,
    usage: {
      promptTokens: Number(loaded.usage?.promptTokens ?? 0),
      completionTokens: Number(loaded.usage?.completionTokens ?? 0)
    },
    blocks: loaded.blocks
  }
}

export async function writeTranslation(
  root: string,
  paperId: string,
  file: TranslationFile
): Promise<void> {
  await writeJson(translationPath(root, paperId), file)
}

export function mergeUsage(a: TokenUsage, b: TokenUsage | null): TokenUsage {
  if (!b) return a
  return {
    promptTokens: a.promptTokens + b.promptTokens,
    completionTokens: a.completionTokens + b.completionTokens
  }
}

/** 未完成的段落：还没有记录，或者上一次是失败/中断状态 */
export function pendingBlocks(blocks: Block[], file: TranslationFile): Block[] {
  return blocks.filter((block) => file.blocks[block.id]?.status !== 'done')
}

export function summarize(file: TranslationFile): { done: number; failed: number } {
  let done = 0
  let failed = 0
  for (const entry of Object.values(file.blocks)) {
    if (entry.status === 'done') done += 1
    else if (entry.status === 'failed') failed += 1
  }
  return { done, failed }
}
```

* [ ] **Step 4: 写翻译编排**

创建 `src/main/translate/runner.ts`：

```ts
import type { AiProfile, Block, TranslateProgress, TranslationFile } from '../../shared/types'
import { chatComplete, type ChatRequest, type ChatResult } from '../ai/client'
import { AiError, isRetryable, toChineseMessage } from '../ai/errors'
import { parseTranslationResponse } from '../ai/parse'
import { buildTranslationMessages } from '../ai/prompts'
import { runWithConcurrency, withRetry } from '../ai/retry'
import { planBatches } from './batches'
import {
  createTranslationFile,
  mergeUsage,
  pendingBlocks,
  readTranslation,
  summarize,
  writeTranslation
} from './state'

export type ChatClient = (request: ChatRequest) => Promise<ChatResult>

export interface TranslateOptions {
  root: string
  paperId: string
  profile: AiProfile
  apiKey: string
  blocks: Block[]
  client?: ChatClient
  emit?: (progress: TranslateProgress) => void
  signal?: AbortSignal
  retry?: { attempts?: number; baseDelayMs?: number; sleep?: (ms: number) => Promise<void> }
}

export async function translatePaper(options: TranslateOptions): Promise<TranslationFile> {
  const { root, paperId, profile, signal } = options
  const client: ChatClient = options.client ?? ((request) => chatComplete(request))
  const attempts = options.retry?.attempts ?? 3
  const baseDelayMs = options.retry?.baseDelayMs ?? 1000

  const file: TranslationFile =
    (await readTranslation(root, paperId)) ??
    createTranslationFile(profile.id, profile.model)
  file.profileId = profile.id
  file.model = profile.model

  const pending = pendingBlocks(options.blocks, file)
  const batches = planBatches(pending, {
    maxBatchBlocks: profile.maxBatchBlocks,
    maxBatchChars: profile.maxBatchChars
  })

  let running = true
  let lastError: string | null = null
  let stopped = false

  // 并发批次会同时改 file，落盘必须串行化，否则会互相覆盖
  let writeChain: Promise<void> = Promise.resolve()
  const persist = (): Promise<void> => {
    writeChain = writeChain.then(() => writeTranslation(root, paperId, file))
    return writeChain
  }

  const emit = (): void => {
    const { done, failed } = summarize(file)
    options.emit?.({
      paperId,
      done,
      failed,
      total: options.blocks.length,
      running,
      usage: file.usage,
      lastError
    })
  }

  const markFailed = (blockId: string, err: unknown): void => {
    const previous = file.blocks[blockId]
    file.blocks[blockId] = {
      status: 'failed',
      error: toChineseMessage(err),
      attempts: (previous?.attempts ?? 0) + 1
    }
  }

  const translateBatch = async (batch: Block[]): Promise<void> => {
    try {
      await runOnce(batch)
      return
    } catch (err) {
      if (!isRetryable(err)) throw err
      if (batch.length === 1) {
        markFailed(batch[0].id, err)
        lastError = toChineseMessage(err)
        await persist()
        emit()
        return
      }
    }

    // 整批失败：降级为单段逐条翻译
    for (const block of batch) {
      if (stopped || signal?.aborted) return
      try {
        await runOnce([block])
      } catch (err) {
        if (!isRetryable(err)) throw err
        markFailed(block.id, err)
        lastError = toChineseMessage(err)
        await persist()
        emit()
      }
    }
  }

  const runOnce = async (batch: Block[]): Promise<void> => {
    const ids = batch.map((b) => b.id)
    for (const id of ids) {
      file.blocks[id] = { status: 'streaming', attempts: (file.blocks[id]?.attempts ?? 0) + 1 }
    }

    const result = await withRetry(
      () =>
        client({
          profile,
          apiKey: options.apiKey,
          messages: buildTranslationMessages(batch, 'zh'),
          jsonMode: true,
          signal
        }),
      {
        attempts,
        baseDelayMs,
        sleep: options.retry?.sleep,
        onRetry: (info) => {
          lastError = `第 ${info.attempt} 次失败，${Math.round(info.delayMs / 1000)} 秒后重试`
          emit()
        }
      }
    )

    file.usage = mergeUsage(file.usage, result.usage)
    const translations = parseTranslationResponse(result.content, ids)
    for (const id of ids) {
      file.blocks[id] = { status: 'done', text: translations.get(id) ?? '', attempts: file.blocks[id]?.attempts ?? 1 }
    }
    lastError = null
    await persist()
    emit()
  }

  emit()

  try {
    await runWithConcurrency(batches, Math.max(1, profile.concurrency), async (batch) => {
      if (stopped || signal?.aborted) return
      try {
        await translateBatch(batch)
      } catch (err) {
        // 不可重试的错误（密钥无效、余额不足）：标记本批全部失败并停止后续调度
        for (const block of batch) markFailed(block.id, err)
        lastError = toChineseMessage(err)
        stopped = true
        await persist()
        emit()
      }
    })
  } finally {
    running = false
    file.updatedAt = Date.now()
    await persist()
    emit()
  }

  return file
}
```

* [ ] **Step 5: 运行测试，确认通过**

```bash
npx vitest run tests/translate/runner.test.ts
```

预期：10 条全部 PASS。测试全部使用注入的假客户端，不联网、不花钱，重试延迟被 `sleep` 替身压成 0。

如果"密钥无效时立即停手"那条失败（客户端被调用次数超过 2），说明 `stopped` 标志没有阻止后续批次启动——检查 `runWithConcurrency` 的 worker 开头是否有 `if (stopped) return`。

* [ ] **Step 6: 提交**

```bash
git add src/main/translate/state.ts src/main/translate/runner.ts tests/translate/runner.test.ts
git commit -m "feat: 翻译引擎（增量落盘、失败降级、断点续传）"
```
---

### Task 6: IPC 通道、preload 接口与设置页

**Files:**
* Modify: `src/shared/ipc.ts`
* Modify: `src/main/ipc.ts`
* Modify: `src/main/index.ts`
* Modify: `src/preload/index.ts`
* Create: `src/renderer/src/views/SettingsView.tsx`
* Modify: `src/renderer/src/App.tsx`
* Test: `tests/renderer/SettingsView.test.tsx`

**Interfaces:**
* Consumes: Task 1 的配置存储与 `createSafeStorageBox`；Task 2 的 `chatComplete`；Task 5 的 `translatePaper`、`readTranslation`
* Produces: `window.api` 追加下列方法
  * `getConfig(): Promise<AppConfig>`
  * `saveConfig(config: AppConfig): Promise<void>`
  * `listProfiles(): Promise<AiProfile[]>`
  * `saveProfile(profile: AiProfile): Promise<void>`
  * `deleteProfile(profileId: string): Promise<void>`
  * `setApiKey(profileId: string, key: string): Promise<void>`
  * `testConnection(profileId: string): Promise<{ ok: boolean; message: string }>`
  * `startTranslation(paperId: string): Promise<void>`
  * `cancelTranslation(paperId: string): Promise<void>`
  * `readTranslation(paperId: string): Promise<TranslationFile | null>`
  * `translateSelection(text: string): Promise<string>`
  * `onTranslationProgress(cb: (p: TranslateProgress) => void): () => void`（返回取消订阅函数）

配置目录：`path.join(app.getPath('appData'), 'ai-paper-reader')`。

* [ ] **Step 1: 追加 IPC 通道常量**

在 `src/shared/ipc.ts` 的 `IPC` 对象里追加（保持所有键值是 `命名空间:驼峰` 格式，否则计划一的契约测试会失败）：

```ts
  configGet: 'config:get',
  configSave: 'config:save',
  profileList: 'profile:list',
  profileSave: 'profile:save',
  profileDelete: 'profile:delete',
  profileSetKey: 'profile:setKey',
  aiTest: 'ai:test',
  translateStart: 'translate:start',
  translateCancel: 'translate:cancel',
  translateRead: 'translate:read',
  translateSelection: 'translate:selection',
  translateProgressEvent: 'translate:progressEvent'
```

* [ ] **Step 2: 写失败的测试（设置页）**

创建 `tests/renderer/SettingsView.test.tsx`：

```tsx
// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SettingsView from '../../src/renderer/src/views/SettingsView'
import type { AiProfile, AppConfig } from '../../src/shared/types'

const mocks = vi.hoisted(() => {
  const g = globalThis as unknown as { window?: Record<string, unknown> }
  if (!g.window) g.window = {}
  const target = {
    getConfig: vi.fn(),
    saveConfig: vi.fn(),
    listProfiles: vi.fn(),
    saveProfile: vi.fn(),
    deleteProfile: vi.fn(),
    setApiKey: vi.fn(),
    testConnection: vi.fn(),
    startTranslation: vi.fn(),
    cancelTranslation: vi.fn(),
    readTranslation: vi.fn(),
    translateSelection: vi.fn(),
    onTranslationProgress: vi.fn(() => () => {})
  }
  g.window.api = target
  return target
})

const { getConfig, listProfiles, saveProfile, testConnection } = mocks

const profile: AiProfile = {
  id: 'p1',
  name: 'DeepSeek',
  baseUrl: 'https://api.deepseek.com/v1',
  model: 'deepseek-chat',
  concurrency: 3,
  maxBatchBlocks: 10,
  maxBatchChars: 6000,
  pricePerMTokIn: 1,
  pricePerMTokOut: 2
}

const config: AppConfig = {
  version: 1,
  libraryRoot: 'C:/papers',
  activeProfileId: 'p1',
  targetLang: 'zh'
}

beforeEach(() => {
  vi.resetAllMocks()
  ;(globalThis as unknown as { window: { api: unknown } }).window.api = mocks
  getConfig.mockResolvedValue(config)
  listProfiles.mockResolvedValue([profile])
})

describe('设置页', () => {
  it('加载后显示已有的 AI 配置', async () => {
    render(<SettingsView onBack={() => {}} />)
    expect(await screen.findByDisplayValue('DeepSeek')).toBeInTheDocument()
    expect(await screen.findByDisplayValue('deepseek-chat')).toBeInTheDocument()
  })

  it('保存时把改动写回去', async () => {
    saveProfile.mockResolvedValue(undefined)
    render(<SettingsView onBack={() => {}} />)
    const modelInput = await screen.findByDisplayValue('deepseek-chat')
    ;(modelInput as HTMLInputElement).value = 'deepseek-reasoner'
    modelInput.dispatchEvent(new Event('input', { bubbles: true }))

    ;(await screen.findByRole('button', { name: /保存/ })).click()

    await waitFor(() => expect(saveProfile).toHaveBeenCalled())
    const saved = saveProfile.mock.calls[0][0] as AiProfile
    expect(saved.model).toBe('deepseek-reasoner')
  })

  it('测试连接成功时给出中文成功提示', async () => {
    testConnection.mockResolvedValue({ ok: true, message: '连接成功，模型可用' })
    render(<SettingsView onBack={() => {}} />)
    ;(await screen.findByRole('button', { name: /测试连接/ })).click()
    expect(await screen.findByText(/连接成功/)).toBeInTheDocument()
  })

  it('测试连接失败时显示原因', async () => {
    testConnection.mockResolvedValue({ ok: false, message: 'API Key 无效或没有权限' })
    render(<SettingsView onBack={() => {}} />)
    ;(await screen.findByRole('button', { name: /测试连接/ })).click()
    expect(await screen.findByText(/API Key 无效/)).toBeInTheDocument()
  })

  it('可以填密钥，输入框类型是密码', async () => {
    render(<SettingsView onBack={() => {}} />)
    const keyInput = await screen.findByLabelText(/API Key/)
    expect(keyInput.getAttribute('type')).toBe('password')
  })
})
```

* [ ] **Step 3: 运行测试，确认失败**

```bash
npx vitest run tests/renderer/SettingsView.test.tsx
```

预期：FAIL，找不到 `SettingsView`。

* [ ] **Step 4: 扩展主进程 IPC**

在 `src/main/ipc.ts` 顶部追加导入，并在 `registerIpc` 内追加处理：

```ts
import { app, BrowserWindow, dialog, ipcMain, type OpenDialogOptions } from 'electron'
import { join } from 'node:path'
import { chatComplete } from './ai/client'
import { toChineseMessage } from './ai/errors'
import { createSafeStorageBox } from './config/secrets'
import { deleteProfile, getApiKey, listProfiles, loadConfig, saveConfig, setApiKey, upsertProfile } from './config/store'
import { translatePaper } from './translate/runner'
import { readTranslation } from './translate/state'
import type { AiProfile, AppConfig, BlocksFile, TranslateProgress, TranslationFile } from '../shared/types'

export function configRoot(): string {
  return join(app.getPath('appData'), 'ai-paper-reader')
}

const runningTranslations = new Map<string, AbortController>()

export async function testConnection(profile: AiProfile, apiKey: string): Promise<{ ok: boolean; message: string }> {
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
```

在 `registerIpc(root)` 内部追加：

```ts
  const cfgRoot = configRoot()
  const box = createSafeStorageBox()

  ipcMain.handle(IPC.configGet, async (): Promise<AppConfig> => loadConfig(cfgRoot))
  ipcMain.handle(IPC.configSave, async (_e, config: AppConfig): Promise<void> => {
    await saveConfig(cfgRoot, config)
  })
  ipcMain.handle(IPC.profileList, async (): Promise<AiProfile[]> => listProfiles(cfgRoot))
  ipcMain.handle(IPC.profileSave, async (_e, profile: AiProfile): Promise<void> => {
    await upsertProfile(cfgRoot, profile)
  })
  ipcMain.handle(IPC.profileDelete, async (_e, profileId: string): Promise<void> => {
    await deleteProfile(cfgRoot, profileId)
  })
  ipcMain.handle(IPC.profileSetKey, async (_e, profileId: string, key: string): Promise<void> => {
    await setApiKey(cfgRoot, profileId, key, box)
  })

  ipcMain.handle(IPC.aiTest, async (_e, profileId: string) => {
    const profile = (await listProfiles(cfgRoot)).find((p) => p.id === profileId)
    if (!profile) return { ok: false, message: '找不到这套配置，请先保存' }
    const key = (await getApiKey(cfgRoot, profileId, box)) ?? ''
    return testConnection(profile, key)
  })

  ipcMain.handle(IPC.translateRead, async (_e, paperId: string): Promise<TranslationFile | null> => {
    return readTranslation(root, paperId)
  })

  ipcMain.handle(IPC.translateStart, async (event, paperId: string): Promise<void> => {
    const config = await loadConfig(cfgRoot)
    const profile = (await listProfiles(cfgRoot)).find((p) => p.id === config.activeProfileId)
    if (!profile) throw new Error('还没有选择 AI 配置，请先到设置里添加')
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

  ipcMain.handle(IPC.translateCancel, async (_e, paperId: string): Promise<void> => {
    runningTranslations.get(paperId)?.abort()
  })

  ipcMain.handle(IPC.translateSelection, async (_e, text: string): Promise<string> => {
    const config = await loadConfig(cfgRoot)
    const profile = (await listProfiles(cfgRoot)).find((p) => p.id === config.activeProfileId)
    if (!profile) throw new Error('还没有选择 AI 配置，请先到设置里添加')
    const result = await chatComplete({
      profile,
      apiKey: (await getApiKey(cfgRoot, profile.id, box)) ?? '',
      messages: [
        { role: 'system', content: '把用户给出的英文片段翻译成简体中文，只输出译文，不要解释。保留公式与引用编号原样。' },
        { role: 'user', content: text }
      ]
    })
    return result.content.trim()
  })
```

同时把 `readJson`、`libraryPaths` 加进 `./library/store` 的导入列表。

* [ ] **Step 5: 扩展 preload**

在 `src/preload/index.ts` 的 `api` 对象里追加：

```ts
  getConfig: (): Promise<AppConfig> => ipcRenderer.invoke(IPC.configGet),
  saveConfig: (config: AppConfig): Promise<void> => ipcRenderer.invoke(IPC.configSave, config),
  listProfiles: (): Promise<AiProfile[]> => ipcRenderer.invoke(IPC.profileList),
  saveProfile: (profile: AiProfile): Promise<void> => ipcRenderer.invoke(IPC.profileSave, profile),
  deleteProfile: (profileId: string): Promise<void> => ipcRenderer.invoke(IPC.profileDelete, profileId),
  setApiKey: (profileId: string, key: string): Promise<void> =>
    ipcRenderer.invoke(IPC.profileSetKey, profileId, key),
  testConnection: (profileId: string): Promise<{ ok: boolean; message: string }> =>
    ipcRenderer.invoke(IPC.aiTest, profileId),
  startTranslation: (paperId: string): Promise<void> => ipcRenderer.invoke(IPC.translateStart, paperId),
  cancelTranslation: (paperId: string): Promise<void> => ipcRenderer.invoke(IPC.translateCancel, paperId),
  readTranslation: (paperId: string): Promise<TranslationFile | null> =>
    ipcRenderer.invoke(IPC.translateRead, paperId),
  translateSelection: (text: string): Promise<string> => ipcRenderer.invoke(IPC.translateSelection, text),
  onTranslationProgress: (cb: (progress: TranslateProgress) => void): (() => void) => {
    const listener = (_e: unknown, progress: TranslateProgress): void => cb(progress)
    ipcRenderer.on(IPC.translateProgressEvent, listener)
    return () => ipcRenderer.removeListener(IPC.translateProgressEvent, listener)
  }
```

并把 `AiProfile`、`AppConfig`、`TranslateProgress`、`TranslationFile` 加进类型导入。

* [ ] **Step 6: 写设置页**

创建 `src/renderer/src/views/SettingsView.tsx`：

```tsx
import { useCallback, useEffect, useState, type JSX } from 'react'
import type { AiProfile } from '../../../shared/types'
import { api } from '../api'

interface Props {
  onBack: () => void
}

const EMPTY: AiProfile = {
  id: '',
  name: '新建配置',
  baseUrl: 'https://api.deepseek.com/v1',
  model: 'deepseek-chat',
  concurrency: 3,
  maxBatchBlocks: 10,
  maxBatchChars: 6000,
  pricePerMTokIn: 1,
  pricePerMTokOut: 2
}

export default function SettingsView({ onBack }: Props): JSX.Element {
  const [profiles, setProfiles] = useState<AiProfile[]>([])
  const [draft, setDraft] = useState<AiProfile>(EMPTY)
  const [apiKey, setApiKeyDraft] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const list = await api.listProfiles()
    setProfiles(list)
    setDraft(list[0] ?? EMPTY)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const update = <K extends keyof AiProfile>(key: K, value: AiProfile[K]): void => {
    setDraft((prev) => ({ ...prev, [key]: value }))
  }

  const save = async (): Promise<void> => {
    setBusy(true)
    try {
      const id = draft.id || crypto.randomUUID().slice(0, 8)
      const next = { ...draft, id }
      await api.saveProfile(next)
      if (apiKey) await api.setApiKey(id, apiKey)
      setApiKeyDraft('')
      setDraft(next)
      await load()
      setMessage('已保存')
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '保存失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif', maxWidth: 720 }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button onClick={onBack}>← 返回</button>
        <h1 style={{ fontSize: 20, margin: 0 }}>设置</h1>
      </header>

      {profiles.length > 1 && (
        <div style={{ marginBottom: 12 }}>
          <label>
            使用哪套配置：
            <select
              value={draft.id}
              onChange={(e) => {
                const found = profiles.find((p) => p.id === e.target.value)
                if (found) setDraft(found)
              }}
            >
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      <div style={{ display: 'grid', gap: 10 }}>
        <label>
          名称
          <input value={draft.name} onChange={(e) => update('name', e.target.value)} />
        </label>
        <label>
          Base URL
          <input value={draft.baseUrl} onChange={(e) => update('baseUrl', e.target.value)} />
        </label>
        <label>
          模型名
          <input value={draft.model} onChange={(e) => update('model', e.target.value)} />
        </label>
        <label>
          API Key
          <input type="password" value={apiKey} onChange={(e) => setApiKeyDraft(e.target.value)} />
        </label>
        <label>
          并发请求数
          <input
            type="number"
            value={draft.concurrency}
            onChange={(e) => update('concurrency', Number(e.target.value))}
          />
        </label>
        <label>
          每批最多段落数
          <input
            type="number"
            value={draft.maxBatchBlocks}
            onChange={(e) => update('maxBatchBlocks', Number(e.target.value))}
          />
        </label>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button onClick={save} disabled={busy}>
          {busy ? '保存中…' : '保存'}
        </button>
        <button
          onClick={async () => setMessage((await api.testConnection(draft.id)).message)}
          disabled={!draft.id}
        >
          测试连接
        </button>
      </div>

      {message && <p style={{ marginTop: 12, color: '#333' }}>{message}</p>}
      <p style={{ color: '#666', fontSize: 13, marginTop: 16 }}>
        本地模型（如 Ollama）把 Base URL 填成 http://localhost:11434/v1，API Key 留空即可。
      </p>
    </div>
  )
}
```

在 `src/renderer/src/App.tsx` 里加一个视图开关：把 `openPaperId` 之外再加 `showSettings` 状态，为真时渲染 `SettingsView`。阅读界面的按钮将在 Task 7 接入，本任务先在库界面右上角加一个"设置"按钮。

* [ ] **Step 7: 运行测试，确认通过**

```bash
npx vitest run tests/renderer/SettingsView.test.tsx
npm test
npm run build
```

预期：设置页 5 条 PASS，全量测试无回归，构建通过。

* [ ] **Step 8: 提交**

```bash
git add src/shared/ipc.ts src/main/ipc.ts src/main/index.ts src/preload/index.ts src/renderer/src/views/SettingsView.tsx src/renderer/src/App.tsx tests/renderer/SettingsView.test.tsx
git commit -m "feat: 配置 IPC、preload 接口与设置页"
```
---

### Task 7: 译文面板与滚动同步

**Files:**
* Create: `src/renderer/src/lib/scrollSync.ts`
* Create: `src/renderer/src/components/TranslationPane.tsx`
* Modify: `src/renderer/src/views/ReaderView.tsx`
* Modify: `src/renderer/src/components/PdfPages.tsx`
* Test: `tests/renderer/scrollSync.test.ts`
* Test: `tests/renderer/TranslationPane.test.tsx`

**Interfaces:**
* Consumes: `Block`、`TranslationFile`、`TranslateProgress`；`api.readTranslation` / `api.startTranslation` / `api.cancelTranslation` / `api.onTranslationProgress`（Task 6）
* Produces:
  * `blockTop(block: Block, pageOffsets: number[], scale: number): number`
  * `pickBlockIdAt(blocks: Block[], pageOffsets: number[], scale: number, scrollTop: number): string | null`
  * 组件 `TranslationPane`，props `{ blocks: Block[]; translation: TranslationFile | null; onRetryFailed: () => void }`

渲染比例固定 `1.5`（与计划一的 `PdfPages` 一致），作为常量 `PDF_SCALE` 导出，避免两处不一致。

* [ ] **Step 1: 写失败的测试（滚动同步）**

创建 `tests/renderer/scrollSync.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { blockTop, pickBlockIdAt } from '../../src/renderer/src/lib/scrollSync'
import type { Block } from '../../src/shared/types'

function block(id: string, page: number, y: number, h = 40): Block {
  return { id, page, bbox: { x: 0, y, w: 100, h }, type: 'paragraph', text: id }
}

const blocks = [block('a', 1, 100), block('b', 1, 300), block('c', 2, 50)]
const offsets = [0, 900]
const scale = 1.5

describe('段落屏幕位置', () => {
  it('第一页的位置是页面偏移加缩放后的 y', () => {
    expect(blockTop(blocks[0], offsets, scale)).toBe(150)
  })

  it('第二页要加上第二页的页面偏移', () => {
    expect(blockTop(blocks[2], offsets, scale)).toBe(900 + 75)
  })

  it('页码超出偏移表时返回 0 而不是崩溃', () => {
    expect(blockTop(block('z', 9, 10), offsets, scale)).toBe(0)
  })
})

describe('按滚动位置挑选当前段落', () => {
  it('滚到最顶端时是第一段', () => {
    expect(pickBlockIdAt(blocks, offsets, scale, 0)).toBe('a')
  })

  it('滚到两段之间时取已经进入视野的那一段', () => {
    expect(pickBlockIdAt(blocks, offsets, scale, 200)).toBe('a')
    expect(pickBlockIdAt(blocks, offsets, scale, 460)).toBe('b')
  })

  it('滚到第二页时取第二页的段落', () => {
    expect(pickBlockIdAt(blocks, offsets, scale, 1000)).toBe('c')
  })

  it('没有段落时返回 null', () => {
    expect(pickBlockIdAt([], offsets, scale, 0)).toBeNull()
  })
})
```

* [ ] **Step 2: 运行测试，确认失败**

```bash
npx vitest run tests/renderer/scrollSync.test.ts
```

预期：FAIL，找不到模块。

* [ ] **Step 3: 写滚动同步**

创建 `src/renderer/src/lib/scrollSync.ts`：

```ts
import type { Block } from '../../../shared/types'

export const PDF_SCALE = 1.5

export function blockTop(block: Block, pageOffsets: number[], scale: number): number {
  const offset = pageOffsets[block.page - 1]
  if (offset === undefined) return 0
  return offset + block.bbox.y * scale
}

export function pickBlockIdAt(
  blocks: Block[],
  pageOffsets: number[],
  scale: number,
  scrollTop: number
): string | null {
  let best: string | null = null
  let bestTop = -Infinity
  for (const block of blocks) {
    const top = blockTop(block, pageOffsets, scale)
    if (top <= scrollTop + 8 && top > bestTop) {
      bestTop = top
      best = block.id
    }
  }
  if (best) return best
  return blocks.length > 0 ? blocks[0].id : null
}
```

* [ ] **Step 4: 写失败的测试（译文面板）**

创建 `tests/renderer/TranslationPane.test.tsx`：

```tsx
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import TranslationPane from '../../src/renderer/src/components/TranslationPane'
import type { Block, TranslationFile } from '../../src/shared/types'

function block(id: string, text = `原文 ${id}`): Block {
  return { id, page: 1, bbox: { x: 0, y: 0, w: 1, h: 1 }, type: 'paragraph', text }
}

const blocks = [block('b0'), block('b1'), block('b2')]

function translation(): TranslationFile {
  return {
    targetLang: 'zh',
    profileId: 'p1',
    model: 'm',
    updatedAt: 0,
    usage: { promptTokens: 0, completionTokens: 0 },
    blocks: {
      'b0': { status: 'done', text: '这是第一段译文' },
      'b1': { status: 'pending' },
      'b2': { status: 'failed', error: 'AI 服务端暂时故障，稍后会自动重试' }
    }
  }
}

describe('译文面板', () => {
  it('已完成的段落显示译文', () => {
    render(<TranslationPane blocks={blocks} translation={translation()} onRetryFailed={() => {}} />)
    expect(screen.getByText('这是第一段译文')).toBeInTheDocument()
  })

  it('未完成的段落显示等待提示', () => {
    render(<TranslationPane blocks={blocks} translation={translation()} onRetryFailed={() => {}} />)
    expect(screen.getAllByText(/等待翻译/).length).toBeGreaterThan(0)
  })

  it('失败的段落显示中文原因并给出重试按钮', () => {
    render(<TranslationPane blocks={blocks} translation={translation()} onRetryFailed={() => {}} />)
    expect(screen.getByText(/AI 服务端暂时故障/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /重试失败的段落/ })).toBeInTheDocument()
  })

  it('点重试会回调', () => {
    const onRetryFailed = vi.fn()
    render(<TranslationPane blocks={blocks} translation={translation()} onRetryFailed={onRetryFailed} />)
    screen.getByRole('button', { name: /重试失败的段落/ }).click()
    expect(onRetryFailed).toHaveBeenCalled()
  })

  it('还没有翻译文件时全部显示等待', () => {
    render(<TranslationPane blocks={blocks} translation={null} onRetryFailed={() => {}} />)
    expect(screen.getAllByText(/等待翻译/)).toHaveLength(3)
  })

  it('每个段落带 data-block-id，供滚动同步定位', () => {
    const { container } = render(
      <TranslationPane blocks={blocks} translation={translation()} onRetryFailed={() => {}} />
    )
    expect(container.querySelector('[data-block-id="b1"]')).not.toBeNull()
  })
})
```

* [ ] **Step 5: 写译文面板**

创建 `src/renderer/src/components/TranslationPane.tsx`：

```tsx
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
```

* [ ] **Step 6: 接入阅读界面**

修改 `src/renderer/src/components/PdfPages.tsx`：把写死的 `const scale = 1.5` 换成从 `../lib/scrollSync` 导入的 `PDF_SCALE`，并在容器上保留 `data-page-offsets` 无关；页面偏移由 ReaderView 从 DOM 里测量。

修改 `src/renderer/src/views/ReaderView.tsx`：在原有基础上增加

* 顶部按钮：`全文翻译`、`取消`（翻译中才显示）、`设置`
* 右侧 `TranslationPane`
* 底部一条进度栏：`已完成 12 / 89 · 失败 2 · ≈ 0.03 元`
* 打开时读取已有译文；若存在未完成段落，显示横幅"这篇论文还有 N 段没翻完，继续？"
* 订阅 `api.onTranslationProgress`，组件卸载时取消订阅
* 左栏滚动时驱动右栏同步（带 rAF 节流）：

```tsx
const syncScroll = (): void => {
  if (syncing.current) return
  syncing.current = true
  requestAnimationFrame(() => {
    syncing.current = false
    const scroll = mainRef.current
    const pane = paneRef.current
    if (!scroll || !pane) return
    const offsets = Array.from(scroll.querySelectorAll('canvas[data-page]')).map(
      (el) => (el as HTMLElement).offsetTop
    )
    const id = pickBlockIdAt(blocks, offsets, PDF_SCALE, scroll.scrollTop)
    if (!id) return
    const node = pane.querySelector(`[data-block-id="${id}"]`)
    if (node instanceof HTMLElement) pane.scrollTop = node.offsetTop - 8
  })
}
```

* [ ] **Step 7: 运行测试**

```bash
npx vitest run tests/renderer
npm test
npm run build
npm run dev
```

预期：滚动同步 7 条 + 译文面板 6 条 PASS；全量无回归；构建通过。`npm run dev` 能起来，打开一篇论文能看到左右两栏与"全文翻译"按钮。

* [ ] **Step 8: 提交**

```bash
git add src/renderer/src/lib src/renderer/src/components src/renderer/src/views/ReaderView.tsx tests/renderer
git commit -m "feat: 左右对照译文面板与滚动同步"
```

---

### Task 8: 选中即译

**Files:**
* Create: `src/renderer/src/components/SelectionPopover.tsx`
* Modify: `src/renderer/src/views/ReaderView.tsx`
* Test: `tests/renderer/SelectionPopover.test.tsx`

**Interfaces:**
* Consumes: `api.translateSelection(text)`（Task 6）
* Produces: 组件 `SelectionPopover`，props `{ text: string; top: number; left: number; onClose: () => void }`

* [ ] **Step 1: 写失败的测试**

创建 `tests/renderer/SelectionPopover.test.tsx`：

```tsx
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SelectionPopover from '../../src/renderer/src/components/SelectionPopover'

const mocks = vi.hoisted(() => {
  const g = globalThis as unknown as { window?: Record<string, unknown> }
  if (!g.window) g.window = {}
  const target = { translateSelection: vi.fn() }
  g.window.api = target
  return target
})

beforeEach(() => {
  vi.resetAllMocks()
  ;(globalThis as unknown as { window: { api: unknown } }).window.api = mocks
})

describe('选中即译气泡', () => {
  it('展示选中原文并自动发起翻译', async () => {
    mocks.translateSelection.mockResolvedValue('这是选中文本的译文')
    render(<SelectionPopover text="selected text" top={10} left={10} onClose={() => {}} />)
    expect(screen.getByText('selected text')).toBeInTheDocument()
    expect(await screen.findByText('这是选中文本的译文')).toBeInTheDocument()
    expect(mocks.translateSelection).toHaveBeenCalledWith('selected text')
  })

  it('翻译失败时显示中文原因而不是崩溃', async () => {
    mocks.translateSelection.mockRejectedValue(new Error('连不上 AI 服务'))
    render(<SelectionPopover text="boom" top={0} left={0} onClose={() => {}} />)
    expect(await screen.findByText(/连不上 AI 服务/)).toBeInTheDocument()
  })

  it('有关闭按钮并会回调', () => {
    mocks.translateSelection.mockResolvedValue('x')
    const onClose = vi.fn()
    render(<SelectionPopover text="abc" top={0} left={0} onClose={onClose} />)
    screen.getByRole('button', { name: /关闭/ }).click()
    expect(onClose).toHaveBeenCalled()
  })
})
```

* [ ] **Step 2: 运行测试，确认失败**

```bash
npx vitest run tests/renderer/SelectionPopover.test.tsx
```

预期：FAIL，找不到模块。

* [ ] **Step 3: 写实现**

创建 `src/renderer/src/components/SelectionPopover.tsx`：

```tsx
import { useEffect, useState, type JSX } from 'react'
import { api } from '../api'

interface Props {
  text: string
  top: number
  left: number
  onClose: () => void
}

export default function SelectionPopover({ text, top, left, onClose }: Props): JSX.Element {
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setResult(null)
    setError(null)
    api
      .translateSelection(text)
      .then((value) => {
        if (!cancelled) setResult(value)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : '翻译失败')
      })
    return () => {
      cancelled = true
    }
  }, [text])

  return (
    <div
      style={{
        position: 'fixed',
        top,
        left,
        zIndex: 20,
        maxWidth: 360,
        background: '#fff',
        border: '1px solid #d0d0d0',
        borderRadius: 8,
        boxShadow: '0 4px 16px rgba(0,0,0,.15)',
        padding: 12,
        fontFamily: 'system-ui, sans-serif',
        fontSize: 14
      }}
    >
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, color: '#666', fontSize: 12 }}>{text.slice(0, 120)}</div>
        <button onClick={onClose} aria-label="关闭">
          ✕
        </button>
      </div>
      <hr style={{ border: 'none', borderTop: '1px solid #eee', margin: '8px 0' }} />
      {error ? (
        <div style={{ color: '#b3261e' }}>{error}</div>
      ) : result ? (
        <div style={{ lineHeight: 1.7 }}>{result}</div>
      ) : (
        <div style={{ color: '#aaa' }}>正在翻译…</div>
      )}
    </div>
  )
}
```

在 `ReaderView` 的原文容器上监听 `mouseup`：取 `window.getSelection()`，若文本长度大于 1 且非纯空白，则用 `selection.getRangeAt(0).getBoundingClientRect()` 定位气泡并把文本塞进 state；点击别处或关闭按钮时清空。

* [ ] **Step 4: 运行测试**

```bash
npx vitest run tests/renderer/SelectionPopover.test.tsx
npm test
npm run build
```

预期：3 条 PASS，全量无回归，构建通过。

* [ ] **Step 5: 提交**

```bash
git add src/renderer/src/components/SelectionPopover.tsx src/renderer/src/views/ReaderView.tsx tests/renderer/SelectionPopover.test.tsx
git commit -m "feat: 选中即译气泡"
```
---

### Task 9: 真实 API 端到端验收

**Files:**
* Create: `scripts/translate-paper.ts`
* Modify: `package.json`（新增 `translate` 脚本）
* Modify: `docs/troubleshooting.md`（把本轮新踩到的坑补进去）

**Interfaces:**
* Consumes: 计划一的 `importPdf`；Task 5 的 `translatePaper`、`readTranslation`
* Produces: `npm run translate -- <pdf路径> --base-url <url> --model <名字> [--key <key>] [--concurrency 3]`

这个脚本**不依赖 Electron**，因此不能用应用里加密保存的密钥——密钥通过 `--key` 参数或环境变量 `AI_NOTE_API_KEY` 传入。它把 PDF 导入一个临时库然后翻译，用来在没有界面的情况下验证整条链路。

* [ ] **Step 1: 写验收脚本**

创建 `scripts/translate-paper.ts`：

```ts
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { estimateCost, formatCost } from '../src/main/ai/pricing'
import { importPdf } from '../src/main/library/import'
import { translatePaper } from '../src/main/translate/runner'
import { readTranslation } from '../src/main/translate/state'
import type { AiProfile, BlocksFile, TranslateProgress } from '../src/shared/types'

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] : undefined
}

async function main(): Promise<void> {
  const pdf = process.argv[2]
  const baseUrl = arg('base-url')
  const model = arg('model')
  const apiKey = arg('key') ?? process.env.AI_NOTE_API_KEY ?? ''
  const concurrency = Number(arg('concurrency') ?? '3')

  if (!pdf || !baseUrl || !model) {
    console.error('用法: npm run translate -- "论文.pdf" --base-url https://api.deepseek.com/v1 --model deepseek-chat')
    console.error('密钥用 --key 传入，或设置环境变量 AI_NOTE_API_KEY（本地模型可留空）')
    process.exit(1)
  }

  const root = await fs.mkdtemp(join(tmpdir(), 'ai-note-translate-e2e-'))
  console.log(`临时库目录: ${root}`)

  const entry = await importPdf(root, pdf)
  console.log(`导入完成: ${entry.title} — ${entry.pageCount} 页 / ${entry.blockCount} 段`)

  const blocksFile = await readJson<BlocksFile>(libraryPaths(root, entry.id).blocks)
  const blocks = blocksFile?.blocks ?? []
  if (blocks.length === 0) {
    console.error('这篇论文没有解析出任何段落，先检查计划一的解析结果')
    process.exit(1)
  }

  const profile: AiProfile = {
    id: 'cli',
    name: 'CLI',
    baseUrl,
    model,
    concurrency,
    maxBatchBlocks: 10,
    maxBatchChars: 6000,
    pricePerMTokIn: null,
    pricePerMTokOut: null
  }

  const started = Date.now()
  let lastLine = ''
  const file = await translatePaper({
    root,
    paperId: entry.id,
    profile,
    apiKey,
    blocks,
    emit: (progress: TranslateProgress) => {
      const cost = formatCost(
        estimateCost(progress.usage, profile.pricePerMTokIn, profile.pricePerMTokOut)
      )
      const line = `进度 ${progress.done}/${progress.total}  失败 ${progress.failed}  ${cost}`
      if (line !== lastLine) {
        lastLine = line
        console.log(line)
      }
    }
  })

  const elapsed = Math.round((Date.now() - started) / 1000)
  const onDisk = await readTranslation(root, entry.id)
  const done = Object.values(onDisk?.blocks ?? {}).filter((b) => b.status === 'done').length
  const failed = Object.values(onDisk?.blocks ?? {}).filter((b) => b.status === 'failed').length

  console.log('---')
  console.log(`耗时 ${elapsed} 秒`)
  console.log(`已完成 ${done} 段，失败 ${failed} 段`)
  console.log(`token 用量 输入 ${file.usage.promptTokens} / 输出 ${file.usage.completionTokens}`)
  console.log('---')
  console.log('前 3 段译文：')
  for (const block of Object.entries(onDisk?.blocks ?? {}).slice(0, 3)) {
    console.log(`[${block[0]}] ${(block[1].text ?? '').slice(0, 100)}`)
  }
}

void main()
```

在 `package.json` 的 scripts 里追加：

```json
"translate": "tsx scripts/translate-paper.ts"
```

* [ ] **Step 2: 用假服务做一次端到端演练（不花钱）**

先不接真实 API，用一个本地假服务验证脚本本身能跑通。新建 `scripts/fake-ai.mjs`：

```js
import { createServer } from 'node:http'

createServer((req, res) => {
  let body = ''
  req.on('data', (chunk) => {
    body += chunk
  })
  req.on('end', () => {
    const payload = JSON.parse(body)
    const content = payload.messages[1].content
    const json = content.slice(content.indexOf('['), content.lastIndexOf(']') + 1)
    const items = JSON.parse(json)
    const translations = Object.fromEntries(items.map((item) => [item.id, `【假译文】${item.text.slice(0, 20)}`]))
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(
      JSON.stringify({
        choices: [{ message: { content: JSON.stringify(translations) }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 100, completion_tokens: 80 }
      })
    )
  })
}).listen(8799, () => console.log('假 AI 服务已启动: http://localhost:8799/v1'))
```

另开一个终端跑 `node scripts/fake-ai.mjs`，然后：

```bash
npm run translate -- "Kagomelike Bands in GrapheneWSe2 Heterostructure Realized by Strong Interlayer Hybridization.pdf" --base-url http://localhost:8799/v1 --model fake
```

预期：进度条逐批推进到 `89/89 失败 0`，最后打印前 3 段"【假译文】…"。这一步验证的是编排、落盘、进度、汇总，全程零成本。

* [ ] **Step 3: 用真实 API 验收**

需要一套可用的凭据（云端 API Key，或本机已运行的 Ollama）。云端示例：

```bash
npm run translate -- "某篇论文.pdf" --base-url https://api.deepseek.com/v1 --model deepseek-chat --key sk-xxxx
```

本地 Ollama 示例（无需密钥）：

```bash
ollama pull qwen2.5:7b
npm run translate -- "某篇论文.pdf" --base-url http://localhost:11434/v1 --model qwen2.5:7b --concurrency 1
```

逐项确认：

1. 进度能推进到全部完成，失败数为 0（小模型可能有少数失败，属正常）
2. 前 3 段译文是通顺的中文，公式与 `[23]` 这类引用编号保持原样
3. 中途 `Ctrl+C` 打断，再跑同一条命令：**第二次只补没翻完的段落**，已完成的不会重翻（观察进度条的起始值不是 0）

* [ ] **Step 4: 界面端到端验收**

```bash
npm run dev
```

逐项确认：

1. 右上角"设置"→ 填入 Base URL、模型名、API Key → 点"测试连接"出现中文成功提示
2. 故意把 Key 改错 → 点"测试连接"出现"API Key 无效或没有权限"
3. 打开一篇论文 → 点"全文翻译" → 右侧译文逐段浮现，进度条推进，费用数字增长
4. 翻译到一半直接关掉窗口 → 重新 `npm run dev` → 打开同一篇 → **顶部出现"还有 N 段没翻完"**，右栏保留已翻好的内容
5. 在原文里选中一句英文 → 弹出气泡 → 气泡里出现译文
6. 左侧滚动时右侧译文跟随定位

* [ ] **Step 5: 把本轮新踩的坑补进排查手册**

`docs/troubleshooting.md` 追加一节（编号接在 6 之后），记录实际遇到的问题：症状原文、根因、修复、验证方式。至少覆盖本轮出现的每一类问题——例如模型返回格式不符合预期、真实论文上批次过大导致截断、密钥错误时的表现等。**写不出问题的可能不是没踩坑，而是没认真看输出。**

* [ ] **Step 6: 提交**

```bash
git add scripts package.json docs/troubleshooting.md
git commit -m "feat: 真实 API 端到端验收脚本与排查手册更新"
```

---

## 验收标准

本计划完成时，下面每一条都必须成立：

* `npm test` 全绿（计划一的 64 条 + 本计划新增的全部），`npm run build` 无错误
* `npm run dev` 能真实启动（不是只看构建通过）
* 用假 AI 服务跑 `npm run translate` 能完成全篇，进度推进到 100%，零成本
* 用真实 API（云端或本地模型）翻译一篇真实论文，译文通顺、公式与引用编号保持原样
* 中途中断后重新运行，**只补未完成的段落**（进度起始值不为 0）
* 界面上点"全文翻译"能看到译文逐段浮现、进度与费用实时更新
* 关掉软件重开，已翻译的内容还在，顶部提示还有多少段未完成
* 选中原文任意片段能弹出中文译文
* API Key 错误时给中文提示且不反复重试、不刷爆额度
* 磁盘上任何文件都搜不到 API Key 明文

## 后续计划

* 计划三：结构化总结（一句话 + 六张卡片）、参考文献反查与概述、Markdown 导出
* 计划四：打包为 portable exe、首次使用引导、README、干净 Windows 上的交付验证