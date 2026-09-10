# 计划一：本地论文库与 PDF 解析管线

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 做出一个能双击运行的桌面应用：拖入 PDF 即导入本地论文库，列表里能看到它，点开能用原版排版阅读。

**Architecture:** Electron 三层结构（渲染进程无权限、preload 窄接口、主进程掌握全部文件能力）。PDF 的文字抽取与段落重建全部在主进程完成，产出 `blocks.json` 作为后续翻译与对齐的地基。本计划不涉及任何 AI 调用与网络请求。

**Tech Stack:** Electron、electron-vite、React、TypeScript、pdfjs-dist、Vitest、pdfkit（仅用于生成测试夹具）

## Global Constraints

* 平台：Windows 10/11，x64。
* 界面语言：全部中文。所有面向用户的文案（按钮、提示、报错）必须是中文，不得出现英文错误原文。
* 数据格式：库文件为纯 JSON，`index.json` 必须带 `version: 1` 字段，便于将来迁移。
* 路径处理：一律使用 `node:path`，禁止手写路径分隔符。
* 文件写入：所有 JSON 落盘必须先写临时文件再 `rename`，避免中途崩溃产生半截文件。
* 进程安全：渲染进程必须开启 `contextIsolation`，关闭 `nodeIntegration`，不得直接访问 `fs` 或 `path`。
* 段落 ID 格式：`p<页码>-b<页内序号>`，页码从 1 开始，序号从 0 开始（例：`p3-b07`）。
* 论文 ID 格式：8 位十六进制随机字符串。
* 提交规范：每一步完成后单独提交，提交信息用中文。

## 环境注意事项

本机沙箱辅助进程不稳定，`npm install` 等命令可能需要以沙箱外权限执行。若命令报 `windows sandbox failed: setup refresh had errors`，改用沙箱外权限重跑同一条命令即可，不是命令本身有问题。

---

## File Structure

| 文件 | 职责 |
|---|---|
| `package.json` | 依赖与脚本 |
| `electron.vite.config.ts` | 三端构建配置 |
| `tsconfig.json` / `tsconfig.node.json` | TypeScript 配置 |
| `src/shared/types.ts` | 主进程与渲染进程共用的类型定义 |
| `src/shared/ipc.ts` | IPC 通道名常量 |
| `src/main/index.ts` | 主进程入口，创建窗口、注册 IPC |
| `src/main/ipc.ts` | IPC 处理器注册 |
| `src/main/library/store.ts` | 库目录与索引的读写 |
| `src/main/library/import.ts` | 导入流水线（复制、抽取、重建、落盘） |
| `src/main/pdf/extract.ts` | 用 pdf.js 抽取原始文本片段 |
| `src/main/pdf/lines.ts` | 文本片段合并成行 |
| `src/main/pdf/columns.ts` | 分栏检测与栏归属 |
| `src/main/pdf/headerFooter.ts` | 页眉页脚剔除 |
| `src/main/pdf/blocks.ts` | 行合并成段落、类型判定、编号 |
| `src/preload/index.ts` | contextBridge 接口 |
| `src/renderer/index.html` | 渲染进程入口 HTML |
| `src/renderer/src/main.tsx` | React 挂载 |
| `src/renderer/src/App.tsx` | 顶层路由（库 / 阅读器） |
| `src/renderer/src/api.ts` | `window.api` 的类型化封装 |
| `src/renderer/src/views/LibraryView.tsx` | 论文库界面 |
| `src/renderer/src/views/ReaderView.tsx` | 阅读界面 |
| `src/renderer/src/components/PdfPages.tsx` | PDF 页面渲染 |
| `tests/fixtures/make-fixtures.ts` | 生成测试用 PDF |
| `tests/library/store.test.ts` | 存储层测试 |
| `tests/pdf/extract.test.ts` | 抽取测试 |
| `tests/pdf/lines.test.ts` | 行合并测试 |
| `tests/pdf/columns.test.ts` | 分栏测试 |
| `tests/pdf/headerFooter.test.ts` | 页眉页脚测试 |
| `tests/pdf/blocks.test.ts` | 段落重建测试 |
| `tests/library/import.test.ts` | 导入端到端测试 |
| `tests/renderer/LibraryView.test.tsx` | 论文库界面测试 |
| `vitest.config.ts` | 测试配置 |

---

### Task 1: 工程骨架与最小窗口

**Files:**
* Create: `package.json`
* Create: `electron.vite.config.ts`
* Create: `tsconfig.json`
* Create: `tsconfig.node.json`
* Create: `vitest.config.ts`
* Create: `src/shared/types.ts`
* Create: `src/shared/ipc.ts`
* Create: `src/main/index.ts`
* Create: `src/preload/index.ts`
* Create: `src/renderer/index.html`
* Create: `src/renderer/src/main.tsx`
* Create: `src/renderer/src/App.tsx`
* Create: `tests/shared/types.test.ts`

**Interfaces:**
* Consumes: 无（首个任务）
* Produces: `src/shared/types.ts` 中的 `PaperMeta`、`LibraryEntry`、`LibraryIndex`、`TextItem`、`Line`、`Block`、`BlockType`、`BlocksFile`、`RawPage`；`src/shared/ipc.ts` 中的 `IPC` 常量对象

* [ ] **Step 1: 初始化 package.json 并安装依赖**

在项目根目录 `F:\demos\ai-note` 执行：

```bash
npm init -y
npm i react react-dom pdfjs-dist
npm i -D electron electron-vite vite @vitejs/plugin-react typescript @types/react @types/react-dom @types/node vitest jsdom @testing-library/react @testing-library/jest-dom pdfkit @types/pdfkit tsx
```

然后手工把 `package.json` 改成下面这样（`main` 字段与 scripts 必须完全一致）：

```json
{
  "name": "ai-note",
  "version": "0.1.0",
  "private": true,
  "description": "AI 论文阅读助手",
  "main": "out/main/index.js",
  "type": "module",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "tsc --noEmit && electron-vite build",
    "test": "vitest run",
    "test:watch": "vitest",
    "fixtures": "tsx tests/fixtures/make-fixtures.ts"
  }
}
```

* [ ] **Step 2: 写共享类型定义**

创建 `src/shared/types.ts`：

```ts
export interface TextItem {
  text: string
  x: number
  y: number
  w: number
  h: number
  fontSize: number
}

export interface RawPage {
  page: number
  width: number
  height: number
  items: TextItem[]
}

export interface Line {
  page: number
  text: string
  x: number
  right: number
  y: number
  bottom: number
  fontSize: number
  column: number
}

export type BlockType = 'heading' | 'paragraph' | 'caption' | 'reference' | 'other'

export interface Block {
  id: string
  page: number
  bbox: { x: number; y: number; w: number; h: number }
  type: BlockType
  text: string
}

export interface BlocksFile {
  paperId: string
  extractedAt: number
  pageCount: number
  blocks: Block[]
}

export interface PaperMeta {
  id: string
  title: string
  authors: string[]
  year: number | null
  doi: string | null
  sourcePath: string | null
  importedAt: number
  tags: string[]
}

export type PaperStatus = 'imported' | 'translating' | 'translated' | 'failed'

export interface LibraryEntry extends PaperMeta {
  status: PaperStatus
  progress: number
  pageCount: number
  blockCount: number
}

export interface LibraryIndex {
  version: 1
  papers: LibraryEntry[]
}

export interface ImportResult {
  imported: LibraryEntry[]
  failed: { path: string; reason: string }[]
}
```

* [ ] **Step 3: 写 IPC 通道常量**

创建 `src/shared/ipc.ts`：

```ts
export const IPC = {
  libraryList: 'library:list',
  libraryImport: 'library:import',
  libraryGetBlocks: 'library:getBlocks',
  libraryReadPdf: 'library:readPdf',
  libraryChooseFiles: 'library:chooseFiles'
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]
```

* [ ] **Step 4: 写构建配置**

创建 `electron.vite.config.ts`：

```ts
import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: ['pdfjs-dist'] })],
    build: { rollupOptions: { input: { index: resolve('src/main/index.ts') } } }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: { rollupOptions: { input: { index: resolve('src/preload/index.ts') } } }
  },
  renderer: {
    root: 'src/renderer',
    plugins: [react()],
    build: {
      rollupOptions: { input: { index: resolve('src/renderer/index.html') } }
    }
  }
})
```

创建 `tsconfig.json`：

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "jsx": "react-jsx",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "noEmit": true,
    "types": ["node", "vitest/globals"]
  },
  "include": ["src", "tests", "vitest.setup.ts"]
}
```

创建 `tsconfig.node.json`：

```json
{
  "extends": "./tsconfig.json",
  "include": ["electron.vite.config.ts", "vitest.config.ts"]
}
```

创建 `vitest.config.ts`：

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    environmentMatchGlobs: [['tests/renderer/**', 'jsdom']],
    testTimeout: 20000
  }
})
```

* [ ] **Step 5: 写主进程、preload 与渲染进程的最小实现**

创建 `src/main/index.ts`：

```ts
import { app, BrowserWindow, shell } from 'electron'
import { join } from 'node:path'

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    title: 'AI 论文阅读助手',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    win.loadURL(devUrl)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
```

创建 `src/preload/index.ts`（本任务先只暴露一个占位方法，后续任务逐步补齐）：

```ts
import { contextBridge } from 'electron'

const api = {
  ping: (): string => 'pong'
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
```

创建 `src/renderer/index.html`：

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <title>AI 论文阅读助手</title>
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; worker-src 'self' blob:"
    />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

创建 `src/renderer/src/main.tsx`：

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
```

创建 `src/renderer/src/App.tsx`：

```tsx
export default function App(): JSX.Element {
  return (
    <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <h1>AI 论文阅读助手</h1>
      <p>工程骨架已就绪。</p>
    </div>
  )
}
```

* [ ] **Step 6: 写一个契约测试，确认类型与通道常量可用**

创建 `tests/shared/types.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { IPC } from '../../src/shared/ipc'
import type { LibraryIndex, Line } from '../../src/shared/types'

describe('IPC 通道常量', () => {
  it('全部以命名空间开头且互不重复', () => {
    const values = Object.values(IPC)
    expect(new Set(values).size).toBe(values.length)
    for (const v of values) expect(v).toMatch(/^[a-z]+:[a-zA-Z]+$/)
  })
})

describe('库索引结构', () => {
  it('空索引的版本号是 1', () => {
    const index: LibraryIndex = { version: 1, papers: [] }
    expect(index.version).toBe(1)
  })

  it('行结构包含分栏字段', () => {
    const line: Line = {
      page: 1,
      text: 'hello',
      x: 0,
      right: 10,
      y: 0,
      bottom: 10,
      fontSize: 10,
      column: 0
    }
    expect(line.column).toBe(0)
  })
})
```

* [ ] **Step 7: 运行测试与构建**

```bash
npm test
npm run build
```

预期：测试全部通过；构建产出 `out/main/index.js`、`out/preload/index.js`、`out/renderer/index.html`。

* [ ] **Step 8: 手动验证窗口**

```bash
npm run dev
```

预期：弹出一个 1440×900 的窗口，标题栏显示"AI 论文阅读助手"，页面显示同样标题。按 `Ctrl+C` 关闭。

* [ ] **Step 9: 提交**

```bash
git add package.json package-lock.json electron.vite.config.ts tsconfig.json tsconfig.node.json vitest.config.ts src tests
git commit -m "chore: 搭建 Electron + React 工程骨架"
```

---

### Task 2: 论文库存储层

**Files:**
* Create: `src/main/library/store.ts`
* Test: `tests/library/store.test.ts`

**Interfaces:**
* Consumes: `src/shared/types.ts` 的 `LibraryIndex`、`LibraryEntry`
* Produces:
  * `libraryPaths(root, paperId)` 返回 `{ root, index, paperDir, pdf, meta, blocks }`，全部为绝对路径字符串
  * `readIndex(root: string): Promise<LibraryIndex>`
  * `writeIndex(root: string, index: LibraryIndex): Promise<void>`
  * `upsertEntry(root: string, entry: LibraryEntry): Promise<LibraryIndex>`
  * `listEntries(root: string): Promise<LibraryEntry[]>`
  * `findEntry(root: string, paperId: string): Promise<LibraryEntry | null>`
  * `createPaperDir(root: string, paperId: string): Promise<void>`
  * `writeJson(file: string, value: unknown): Promise<void>`
  * `readJson<T>(file: string): Promise<T | null>`

* [ ] **Step 1: 写失败的测试**

创建 `tests/library/store.test.ts`：

```ts
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createPaperDir,
  findEntry,
  libraryPaths,
  listEntries,
  readIndex,
  upsertEntry,
  writeIndex
} from '../../src/main/library/store'
import type { LibraryEntry } from '../../src/shared/types'

let root = ''

beforeEach(async () => {
  root = await fs.mkdtemp(join(tmpdir(), 'ai-note-lib-'))
})

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

function entry(id: string, title: string): LibraryEntry {
  return {
    id,
    title,
    authors: [],
    year: null,
    doi: null,
    sourcePath: null,
    importedAt: 1,
    tags: [],
    status: 'imported',
    progress: 0,
    pageCount: 3,
    blockCount: 12
  }
}

describe('库索引读写', () => {
  it('目录不存在时返回空索引', async () => {
    await expect(readIndex(root)).resolves.toEqual({ version: 1, papers: [] })
  })

  it('写入后能读回', async () => {
    await writeIndex(root, { version: 1, papers: [entry('aaaa1111', '论文甲')] })
    const index = await readIndex(root)
    expect(index.papers).toHaveLength(1)
    expect(index.papers[0].title).toBe('论文甲')
  })

  it('索引文件损坏时返回空索引而不是抛错', async () => {
    await fs.writeFile(join(root, 'index.json'), '{ 这不是 JSON', 'utf8')
    await expect(readIndex(root)).resolves.toEqual({ version: 1, papers: [] })
  })

  it('版本号不符时返回空索引', async () => {
    await fs.writeFile(join(root, 'index.json'), JSON.stringify({ version: 2, papers: [] }), 'utf8')
    await expect(readIndex(root)).resolves.toEqual({ version: 1, papers: [] })
  })
})

describe('论文条目增改查', () => {
  it('新增后再查得到', async () => {
    await upsertEntry(root, entry('aaaa1111', '论文甲'))
    expect((await findEntry(root, 'aaaa1111'))?.title).toBe('论文甲')
  })

  it('同 id 重复写入是覆盖而不是追加', async () => {
    await upsertEntry(root, entry('aaaa1111', '论文甲'))
    await upsertEntry(root, entry('aaaa1111', '论文甲修订'))
    const list = await listEntries(root)
    expect(list).toHaveLength(1)
    expect(list[0].title).toBe('论文甲修订')
  })

  it('列表按导入时间倒序排列', async () => {
    await upsertEntry(root, { ...entry('aaaa1111', '旧'), importedAt: 1 })
    await upsertEntry(root, { ...entry('bbbb2222', '新'), importedAt: 2 })
    expect((await listEntries(root)).map((p) => p.title)).toEqual(['新', '旧'])
  })

  it('查不到的 id 返回 null', async () => {
    await expect(findEntry(root, 'zzzz9999')).resolves.toBeNull()
  })
})

describe('论文目录', () => {
  it('创建目录并返回正确的文件路径', async () => {
    await createPaperDir(root, 'aaaa1111')
    const paths = libraryPaths(root, 'aaaa1111')
    expect(paths.pdf.endsWith(join('papers', 'aaaa1111', 'paper.pdf'))).toBe(true)
    await fs.access(paths.paperDir)
  })
})
```

* [ ] **Step 2: 运行测试，确认失败**

```bash
npx vitest run tests/library/store.test.ts
```

预期：FAIL，报 `Failed to resolve import "../../src/main/library/store"`。

* [ ] **Step 3: 写实现**

创建 `src/main/library/store.ts`：

```ts
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { LibraryEntry, LibraryIndex } from '../../shared/types'

const INDEX_FILE = 'index.json'

export function libraryPaths(root: string, paperId: string) {
  const paperDir = path.join(root, 'papers', paperId)
  return {
    root,
    index: path.join(root, INDEX_FILE),
    paperDir,
    pdf: path.join(paperDir, 'paper.pdf'),
    meta: path.join(paperDir, 'meta.json'),
    blocks: path.join(paperDir, 'blocks.json')
  }
}

function emptyIndex(): LibraryIndex {
  return { version: 1, papers: [] }
}

export async function readIndex(root: string): Promise<LibraryIndex> {
  try {
    const raw = await fs.readFile(path.join(root, INDEX_FILE), 'utf8')
    const parsed = JSON.parse(raw) as Partial<LibraryIndex>
    if (parsed?.version !== 1 || !Array.isArray(parsed.papers)) return emptyIndex()
    return { version: 1, papers: parsed.papers as LibraryEntry[] }
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'ENOENT' || err instanceof SyntaxError) return emptyIndex()
    throw err
  }
}

export async function writeIndex(root: string, index: LibraryIndex): Promise<void> {
  await fs.mkdir(root, { recursive: true })
  const target = path.join(root, INDEX_FILE)
  const tmp = `${target}.tmp`
  await fs.writeFile(tmp, JSON.stringify(index, null, 2), 'utf8')
  await fs.rename(tmp, target)
}

export async function upsertEntry(root: string, entry: LibraryEntry): Promise<LibraryIndex> {
  const index = await readIndex(root)
  const at = index.papers.findIndex((p) => p.id === entry.id)
  if (at >= 0) index.papers[at] = entry
  else index.papers.push(entry)
  await writeIndex(root, index)
  return index
}

export async function listEntries(root: string): Promise<LibraryEntry[]> {
  const index = await readIndex(root)
  return [...index.papers].sort((a, b) => b.importedAt - a.importedAt)
}

export async function findEntry(root: string, paperId: string): Promise<LibraryEntry | null> {
  const index = await readIndex(root)
  return index.papers.find((p) => p.id === paperId) ?? null
}

export async function createPaperDir(root: string, paperId: string): Promise<void> {
  await fs.mkdir(libraryPaths(root, paperId).paperDir, { recursive: true })
}

export async function writeJson(file: string, value: unknown): Promise<void> {
  const tmp = `${file}.tmp`
  await fs.writeFile(tmp, JSON.stringify(value, null, 2), 'utf8')
  await fs.rename(tmp, file)
}

export async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8')) as T
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'ENOENT' || err instanceof SyntaxError) return null
    throw err
  }
}
```

* [ ] **Step 4: 运行测试，确认通过**

```bash
npx vitest run tests/library/store.test.ts
```

预期：9 个测试全部 PASS。

* [ ] **Step 5: 提交**

```bash
git add src/main/library/store.ts tests/library/store.test.ts
git commit -m "feat: 论文库存储层与索引读写"
```

---

### Task 3: PDF 文本抽取与测试夹具

**Files:**
* Create: `tests/fixtures/make-fixtures.ts`
* Create: `src/main/pdf/extract.ts`
* Test: `tests/pdf/extract.test.ts`

**Interfaces:**
* Consumes: `src/shared/types.ts` 的 `RawPage`、`TextItem`
* Produces:
  * `makeSingleColumnPdf(): Promise<Uint8Array>`、`makeTwoColumnPdf(): Promise<Uint8Array>`（导出自 `tests/fixtures/make-fixtures.ts`）
  * `extractPdf(data: Uint8Array): Promise<RawPage[]>`
  * `extractMeta(data: Uint8Array): Promise<{ title: string | null; authors: string[] }>`

坐标约定：`x` 为距页面左边距离，`y` 为**距页面顶部**距离（pdf.js 原生给的是距底部，必须转换）。单位与 PDF 用户空间一致（1/72 英寸）。

* [ ] **Step 1: 写测试夹具生成器**

创建 `tests/fixtures/make-fixtures.ts`：

```ts
import PDFDocument from 'pdfkit'

const BODY = 'This is a sample paragraph written for layout testing purposes only. '
const HEADER = 'Journal of Testing Vol. 12'

function render(doc: PDFKit.PDFDocument, draw: (d: PDFKit.PDFDocument) => void): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    doc.on('data', (c: Buffer) => chunks.push(c))
    doc.on('end', () => resolve(new Uint8Array(Buffer.concat(chunks))))
    doc.on('error', reject)
    draw(doc)
    doc.end()
  })
}

export function makeSingleColumnPdf(): Promise<Uint8Array> {
  const doc = new PDFDocument({ size: 'A4', margin: 0 })
  return render(doc, (d) => {
    for (let page = 0; page < 3; page++) {
      if (page > 0) d.addPage()
      d.fontSize(9).text(HEADER, 60, 30)
      d.fontSize(9).text(`Page ${page + 1}`, 500, 800)
      d.fontSize(16).text('A Study of Something', 60, 90)
      let y = 130
      for (let i = 0; i < 12; i++) {
        d.fontSize(10).text(BODY.repeat(2), 60, y, { width: 470, lineGap: 2 })
        y += 46
      }
    }
  })
}

export function makeTwoColumnPdf(): Promise<Uint8Array> {
  const doc = new PDFDocument({ size: 'A4', margin: 0 })
  return render(doc, (d) => {
    for (let page = 0; page < 3; page++) {
      if (page > 0) d.addPage()
      d.fontSize(9).text(HEADER, 60, 30)
      d.fontSize(9).text(`Page ${page + 1}`, 500, 800)
      d.fontSize(16).text('Two Column Study', 60, 80)
      let y = 120
      for (let i = 0; i < 10; i++) {
        d.fontSize(10).text(`LEFT ${i} ` + BODY, 60, y, { width: 220, lineGap: 2 })
        y += 52
      }
      y = 120
      for (let i = 0; i < 10; i++) {
        d.fontSize(10).text(`RIGHT ${i} ` + BODY, 310, y, { width: 220, lineGap: 2 })
        y += 52
      }
    }
  })
}
```

* [ ] **Step 2: 写失败的测试**

创建 `tests/pdf/extract.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { extractMeta, extractPdf } from '../../src/main/pdf/extract'
import { makeSingleColumnPdf, makeTwoColumnPdf } from '../fixtures/make-fixtures'

describe('PDF 文本抽取', () => {
  it('单栏三页文档能抽出三页且文本非空', async () => {
    const pages = await extractPdf(await makeSingleColumnPdf())
    expect(pages).toHaveLength(3)
    expect(pages[0].items.length).toBeGreaterThan(0)
    expect(pages[0].width).toBeGreaterThan(500)
  })

  it('坐标以页面顶部为原点', async () => {
    const pages = await extractPdf(await makeSingleColumnPdf())
    const header = pages[0].items.find((i) => i.text.includes('Journal of Testing'))
    expect(header).toBeDefined()
    expect(header!.y).toBeLessThan(80)
  })

  it('完全不改变传入的字节数组', async () => {
    const bytes = await makeSingleColumnPdf()
    const copy = new Uint8Array(bytes)
    await extractPdf(bytes)
    expect(Array.from(bytes)).toEqual(Array.from(copy))
  })

  it('两栏文档里左右两栏文本都被抽出', async () => {
    const pages = await extractPdf(await makeTwoColumnPdf())
    const text = pages[0].items.map((i) => i.text).join('')
    expect(text).toContain('LEFT 0')
    expect(text).toContain('RIGHT 0')
  })

  it('元数据缺失时返回空标题而不是抛错', async () => {
    const meta = await extractMeta(await makeSingleColumnPdf())
    expect(meta.title === null || typeof meta.title === 'string').toBe(true)
    expect(Array.isArray(meta.authors)).toBe(true)
  })
})
```

* [ ] **Step 3: 运行测试，确认失败**

```bash
npx vitest run tests/pdf/extract.test.ts
```

预期：FAIL，报找不到 `../../src/main/pdf/extract`。

* [ ] **Step 4: 写实现**

创建 `src/main/pdf/extract.ts`：

```ts
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import type { RawPage, TextItem } from '../../shared/types'

async function open(data: Uint8Array) {
  return getDocument({
    data: new Uint8Array(data),
    isEvalSupported: false,
    useSystemFonts: true
  }).promise
}

export async function extractPdf(data: Uint8Array): Promise<RawPage[]> {
  const doc = await open(data)
  const pages: RawPage[] = []

  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
    const page = await doc.getPage(pageNumber)
    const viewport = page.getViewport({ scale: 1 })
    const content = await page.getTextContent()
    const items: TextItem[] = []

    for (const raw of content.items) {
      if (!('str' in raw) || !raw.str.trim()) continue
      const t = raw.transform as number[]
      const fontSize = Math.hypot(t[2], t[3]) || Math.abs(t[3]) || 10
      const x = t[4]
      const y = viewport.height - t[5] - fontSize
      items.push({
        text: raw.str,
        x,
        y: Math.max(0, y),
        w: raw.width,
        h: raw.height || fontSize,
        fontSize
      })
    }

    pages.push({ page: pageNumber, width: viewport.width, height: viewport.height, items })
    page.cleanup()
  }

  await doc.destroy()
  return pages
}

export async function extractMeta(
  data: Uint8Array
): Promise<{ title: string | null; authors: string[] }> {
  const doc = await open(data)
  try {
    const info = await doc.getMetadata()
    const raw = (info.info ?? {}) as Record<string, unknown>
    const title = typeof raw.Title === 'string' && raw.Title.trim() ? raw.Title.trim() : null
    const authorText = typeof raw.Author === 'string' ? raw.Author : ''
    const authors = authorText
      .split(/[,;、]|\band\b/i)
      .map((s) => s.trim())
      .filter(Boolean)
    return { title, authors }
  } catch {
    return { title: null, authors: [] }
  } finally {
    await doc.destroy()
  }
}
```

* [ ] **Step 5: 运行测试，确认通过**

```bash
npx vitest run tests/pdf/extract.test.ts
```

预期：5 个测试 PASS。

如果报错提示找不到 `pdfjs-dist/legacy/build/pdf.mjs`，先查看 `node_modules/pdfjs-dist/legacy/build/` 的实际文件名再改导入路径。若 pdf.js 与 electron-vite 打包冲突导致运行期报错，退一步把依赖降到 `pdfjs-dist@3.11.174` 并改用 `pdfjs-dist/legacy/build/pdf.js`，把结论写进提交信息。

* [ ] **Step 6: 提交**

```bash
git add src/main/pdf/extract.ts tests/pdf/extract.test.ts tests/fixtures/make-fixtures.ts
git commit -m "feat: PDF 文本抽取与测试夹具生成"
```

---

### Task 4: 文本片段合并成行

**Files:**
* Create: `src/main/pdf/lines.ts`
* Test: `tests/pdf/lines.test.ts`

**Interfaces:**
* Consumes: `RawPage`、`TextItem`、`Line`
* Produces: `buildLines(page: RawPage): Line[]`

同一行的判定：与行内首个片段的 `y` 差值不超过 `max(2, fontSize * 0.5)`。行内片段按 `x` 升序拼接；片段间距大于 `fontSize * 0.25` 时补一个空格。

* [ ] **Step 1: 写失败的测试**

创建 `tests/pdf/lines.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { buildLines } from '../../src/main/pdf/lines'
import type { RawPage, TextItem } from '../../src/shared/types'

function item(partial: Partial<TextItem>): TextItem {
  return { text: 'x', x: 0, y: 0, w: 10, h: 10, fontSize: 10, ...partial }
}

function page(items: TextItem[]): RawPage {
  return { page: 1, width: 595, height: 842, items }
}

describe('文本片段合并成行', () => {
  it('同一 y 的多个片段合成一行', () => {
    const lines = buildLines(
      page([
        item({ text: 'Hello', x: 60, y: 100, w: 30 }),
        item({ text: 'world', x: 200, y: 101, w: 30 })
      ])
    )
    expect(lines).toHaveLength(1)
    expect(lines[0].text).toBe('Hello world')
  })

  it('y 差值超过容差的分成两行并按 y 排序', () => {
    const lines = buildLines(
      page([
        item({ text: '第二行', x: 60, y: 130 }),
        item({ text: '第一行', x: 60, y: 100 })
      ])
    )
    expect(lines.map((l) => l.text)).toEqual(['第一行', '第二行'])
  })

  it('紧挨着的片段之间不加空格', () => {
    const lines = buildLines(
      page([
        item({ text: '前', x: 60, y: 100, w: 10 }),
        item({ text: '后', x: 70, y: 100, w: 10 })
      ])
    )
    expect(lines[0].text).toBe('前后')
  })

  it('行的包围盒取所有片段的并集', () => {
    const lines = buildLines(
      page([
        item({ text: 'a', x: 60, y: 100, w: 20, h: 12 }),
        item({ text: 'b', x: 120, y: 100, w: 30, h: 12 })
      ])
    )
    expect(lines[0].x).toBe(60)
    expect(lines[0].right).toBe(150)
    expect(lines[0].bottom).toBe(112)
  })

  it('空白片段被忽略', () => {
    const lines = buildLines(page([item({ text: '   ', x: 60, y: 100 })]))
    expect(lines).toHaveLength(0)
  })

  it('列的初始值都是 0', () => {
    const lines = buildLines(page([item({ text: 'a', x: 60, y: 100 })]))
    expect(lines[0].column).toBe(0)
  })
})
```

* [ ] **Step 2: 运行测试，确认失败**

```bash
npx vitest run tests/pdf/lines.test.ts
```

预期：FAIL，找不到模块。

* [ ] **Step 3: 写实现**

创建 `src/main/pdf/lines.ts`：

```ts
import type { Line, RawPage, TextItem } from '../../shared/types'

function groupByBaseline(items: TextItem[]): TextItem[][] {
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x)
  const groups: TextItem[][] = []
  for (const item of sorted) {
    const current = groups[groups.length - 1]
    if (!current) {
      groups.push([item])
      continue
    }
    const tolerance = Math.max(2, current[0].fontSize * 0.5)
    if (Math.abs(item.y - current[0].y) <= tolerance) current.push(item)
    else groups.push([item])
  }
  return groups
}

function joinItems(items: TextItem[]): string {
  const sorted = [...items].sort((a, b) => a.x - b.x)
  let text = ''
  for (let i = 0; i < sorted.length; i++) {
    const current = sorted[i]
    if (i > 0) {
      const prev = sorted[i - 1]
      const gap = current.x - (prev.x + prev.w)
      if (gap > current.fontSize * 0.25) text += ' '
    }
    text += current.text
  }
  return text.replace(/\s+/g, ' ').trim()
}

export function buildLines(page: RawPage): Line[] {
  return groupByBaseline(page.items.filter((i) => i.text.trim().length > 0))
    .map((group) => {
      const x = Math.min(...group.map((i) => i.x))
      const right = Math.max(...group.map((i) => i.x + i.w))
      const y = Math.min(...group.map((i) => i.y))
      const bottom = Math.max(...group.map((i) => i.y + i.h))
      const fontSize = Math.max(...group.map((i) => i.fontSize))
      return {
        page: page.page,
        text: joinItems(group),
        x,
        right,
        y,
        bottom,
        fontSize,
        column: 0
      }
    })
    .filter((line) => line.text.length > 0)
}
```

* [ ] **Step 4: 运行测试，确认通过**

```bash
npx vitest run tests/pdf/lines.test.ts
```

预期：6 个测试 PASS。

* [ ] **Step 5: 提交**

```bash
git add src/main/pdf/lines.ts tests/pdf/lines.test.ts
git commit -m "feat: 文本片段按基线合并为行"
```

---

### Task 5: 分栏检测

**Files:**
* Create: `src/main/pdf/columns.ts`
* Test: `tests/pdf/columns.test.ts`

**Interfaces:**
* Consumes: `Line`
* Produces:
  * `detectColumns(lines: Line[], pageWidth: number): number | null`，返回分栏的 x 分界点；单栏返回 `null`
  * `assignColumns(lines: Line[], split: number | null): Line[]`，返回新数组，`column` 字段已填好

检测规则：把所有行的左边界 `x` 去重排序，取相邻差值最大的一处作为候选分界。候选必须同时满足：间隙 ≥ `pageWidth * 0.15`，分界两侧行数各 ≥ 总行数的 20%，且每侧至少 3 行。否则判为单栏。

* [ ] **Step 1: 写失败的测试**

创建 `tests/pdf/columns.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { assignColumns, detectColumns } from '../../src/main/pdf/columns'
import type { Line } from '../../src/shared/types'

function line(x: number, y: number, text = 'text'): Line {
  return { page: 1, text, x, right: x + 200, y, bottom: y + 12, fontSize: 10, column: 0 }
}

function twoColumnLines(): Line[] {
  const lines: Line[] = []
  for (let i = 0; i < 20; i++) lines.push(line(60, 100 + i * 14, `left ${i}`))
  for (let i = 0; i < 20; i++) lines.push(line(310, 100 + i * 14, `right ${i}`))
  return lines
}

describe('分栏检测', () => {
  it('左右两簇的文档能检测出分界点', () => {
    const split = detectColumns(twoColumnLines(), 595)
    expect(split).not.toBeNull()
    expect(split!).toBeGreaterThan(200)
    expect(split!).toBeLessThan(310)
  })

  it('单栏文档返回 null', () => {
    const lines: Line[] = []
    for (let i = 0; i < 30; i++) lines.push(line(60, 100 + i * 14))
    expect(detectColumns(lines, 595)).toBeNull()
  })

  it('行数太少时不判为分栏', () => {
    expect(detectColumns([line(60, 100), line(310, 120)], 595)).toBeNull()
  })

  it('一侧行数占比过低时不判为分栏', () => {
    const lines: Line[] = []
    for (let i = 0; i < 30; i++) lines.push(line(60, 100 + i * 14))
    lines.push(line(310, 100), line(310, 120), line(310, 140))
    expect(detectColumns(lines, 595)).toBeNull()
  })
})

describe('栏归属', () => {
  it('按分界点把行分到两栏', () => {
    const lines = assignColumns(twoColumnLines(), 285)
    expect(lines.filter((l) => l.column === 0)).toHaveLength(20)
    expect(lines.filter((l) => l.column === 1)).toHaveLength(20)
  })

  it('单栏时所有行的 column 都是 0', () => {
    const lines = assignColumns([line(60, 100), line(70, 120)], null)
    expect(lines.every((l) => l.column === 0)).toBe(true)
  })

  it('不修改传入的数组', () => {
    const input = twoColumnLines()
    assignColumns(input, 285)
    expect(input.every((l) => l.column === 0)).toBe(true)
  })
})
```

* [ ] **Step 2: 运行测试，确认失败**

```bash
npx vitest run tests/pdf/columns.test.ts
```

预期：FAIL，找不到模块。

* [ ] **Step 3: 写实现**

创建 `src/main/pdf/columns.ts`：

```ts
import type { Line } from '../../shared/types'

const MIN_GAP_RATIO = 0.15
const MIN_SIDE_RATIO = 0.2
const MIN_SIDE_LINES = 3

export function detectColumns(lines: Line[], pageWidth: number): number | null {
  if (lines.length < MIN_SIDE_LINES * 2) return null

  const lefts = [...new Set(lines.map((l) => Math.round(l.x)))].sort((a, b) => a - b)
  let bestGap = 0
  let bestSplit = 0

  for (let i = 1; i < lefts.length; i++) {
    const gap = lefts[i] - lefts[i - 1]
    if (gap > bestGap) {
      bestGap = gap
      bestSplit = (lefts[i] + lefts[i - 1]) / 2
    }
  }

  if (bestGap < pageWidth * MIN_GAP_RATIO) return null

  const leftCount = lines.filter((l) => l.x < bestSplit).length
  const rightCount = lines.length - leftCount
  if (leftCount < MIN_SIDE_LINES || rightCount < MIN_SIDE_LINES) return null
  if (leftCount / lines.length < MIN_SIDE_RATIO) return null
  if (rightCount / lines.length < MIN_SIDE_RATIO) return null

  return bestSplit
}

export function assignColumns(lines: Line[], split: number | null): Line[] {
  if (split === null) return lines.map((l) => ({ ...l, column: 0 }))
  return lines.map((l) => ({ ...l, column: l.x < split ? 0 : 1 }))
}
```

* [ ] **Step 4: 运行测试，确认通过**

```bash
npx vitest run tests/pdf/columns.test.ts
```

预期：7 个测试 PASS。

* [ ] **Step 5: 提交**

```bash
git add src/main/pdf/columns.ts tests/pdf/columns.test.ts
git commit -m "feat: 双栏 PDF 分栏检测与栏归属"
```
---

### Task 6: 页眉页脚剔除

**Files:**
* Create: `src/main/pdf/headerFooter.ts`
* Test: `tests/pdf/headerFooter.test.ts`

**Interfaces:**
* Consumes: `Line`
* Produces: `dropHeaderFooter(pages: Line[][], pageHeight: number): Line[][]`

判断规则：位于页面顶部 9% 或底部 9% 区域内的行，把文本归一化（转小写、把所有数字替换成 `#`、压缩连续空白），若同一归一化文本出现在超过 50% 的页面上，且总页数 ≥ 3，则从所有页面中删除该行。

* [ ] **Step 1: 写失败的测试**

创建 `tests/pdf/headerFooter.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { dropHeaderFooter } from '../../src/main/pdf/headerFooter'
import type { Line } from '../../src/shared/types'

const PAGE_HEIGHT = 842

function line(text: string, y: number, page: number): Line {
  return { page, text, x: 60, right: 300, y, bottom: y + 12, fontSize: 9, column: 0 }
}

describe('页眉页脚剔除', () => {
  it('每页重复的页眉被删掉', () => {
    const pages = Array.from({ length: 4 }, (_, i) => [
      line('Journal of Testing Vol. 12', 30, i + 1),
      line(`这是第 ${i + 1} 页的正文内容`, 400, i + 1)
    ])
    const result = dropHeaderFooter(pages, PAGE_HEIGHT)
    expect(result.flat().some((l) => l.text.includes('Journal of Testing'))).toBe(false)
    expect(result.flat()).toHaveLength(4)
  })

  it('页码数字不同也算同一页脚', () => {
    const pages = Array.from({ length: 4 }, (_, i) => [
      line(`Page ${i + 1}`, 810, i + 1),
      line('正文', 400, i + 1)
    ])
    expect(dropHeaderFooter(pages, PAGE_HEIGHT).flat().every((l) => l.text === '正文')).toBe(true)
  })

  it('只出现在少数页面的页眉保留', () => {
    const pages = [
      [line('会议名称 A', 30, 1), line('正文', 400, 1)],
      [line('正文', 400, 2)],
      [line('正文', 400, 3)],
      [line('正文', 400, 4)]
    ]
    const result = dropHeaderFooter(pages, PAGE_HEIGHT)
    expect(result[0].some((l) => l.text === '会议名称 A')).toBe(true)
  })

  it('页面中间的重复内容不会被误删', () => {
    const pages = Array.from({ length: 4 }, (_, i) => [line('重复的小标题', 400, i + 1)])
    expect(dropHeaderFooter(pages, PAGE_HEIGHT).flat()).toHaveLength(4)
  })

  it('只有两页时不做任何删除', () => {
    const pages = [
      [line('Journal of Testing', 30, 1)],
      [line('Journal of Testing', 30, 2)]
    ]
    expect(dropHeaderFooter(pages, PAGE_HEIGHT).flat()).toHaveLength(2)
  })

  it('不修改传入的数据', () => {
    const pages = Array.from({ length: 4 }, (_, i) => [line('Page 1', 30, i + 1)])
    dropHeaderFooter(pages, PAGE_HEIGHT)
    expect(pages[0]).toHaveLength(1)
  })
})
```

* [ ] **Step 2: 运行测试，确认失败**

```bash
npx vitest run tests/pdf/headerFooter.test.ts
```

预期：FAIL，找不到模块。

* [ ] **Step 3: 写实现**

创建 `src/main/pdf/headerFooter.ts`：

```ts
import type { Line } from '../../shared/types'

const EDGE_RATIO = 0.09
const REPEAT_RATIO = 0.5
const MIN_PAGES = 3

function normalize(text: string): string {
  return text.toLowerCase().replace(/\d+/g, '#').replace(/\s+/g, ' ').trim()
}

export function dropHeaderFooter(pages: Line[][], pageHeight: number): Line[][] {
  if (pages.length < MIN_PAGES) return pages.map((p) => [...p])

  const topEdge = pageHeight * EDGE_RATIO
  const bottomEdge = pageHeight * (1 - EDGE_RATIO)
  const hits = new Map<string, number>()

  for (const page of pages) {
    const seen = new Set<string>()
    for (const line of page) {
      if (line.y > topEdge && line.bottom < bottomEdge) continue
      const key = normalize(line.text)
      if (key) seen.add(key)
    }
    for (const key of seen) hits.set(key, (hits.get(key) ?? 0) + 1)
  }

  const threshold = pages.length * REPEAT_RATIO
  const repeated = new Set(
    [...hits.entries()].filter(([, count]) => count > threshold).map(([key]) => key)
  )
  if (repeated.size === 0) return pages.map((p) => [...p])

  return pages.map((page) =>
    page.filter((line) => {
      const inEdge = line.y <= topEdge || line.bottom >= bottomEdge
      if (!inEdge) return true
      return !repeated.has(normalize(line.text))
    })
  )
}
```

* [ ] **Step 4: 运行测试，确认通过**

```bash
npx vitest run tests/pdf/headerFooter.test.ts
```

预期：6 个测试 PASS。

* [ ] **Step 5: 提交**

```bash
git add src/main/pdf/headerFooter.ts tests/pdf/headerFooter.test.ts
git commit -m "feat: 跨页重复的页眉页脚剔除"
```

---

### Task 7: 段落重建

**Files:**
* Create: `src/main/pdf/blocks.ts`
* Test: `tests/pdf/blocks.test.ts`

**Interfaces:**
* Consumes: `Line`、`Block`、`BlockType`、`RawPage`；Task 4 的 `buildLines`；Task 5 的 `detectColumns`、`assignColumns`；Task 6 的 `dropHeaderFooter`
* Produces:
  * `classifyLine(line: Line, bodyFontSize: number): BlockType`
  * `mergeIntoParagraphs(lines: Line[]): Line[][]`
  * `buildBlocks(pages: Line[][], pageWidth: number): Block[]`
  * `buildBlocksFromPages(pages: RawPage[]): Block[]`

规则：

1. 每页先做分栏检测，再按"栏 0 全部行 → 栏 1 全部行"的顺序输出，保证阅读顺序正确。
2. 栏内按 `y` 排序，逐行判断是否并入上一段：垂直间隙 > `行高 * 0.35` 时开新段；或上一行的右边界比本栏最宽行短 `fontSize * 1.5` 以上（段末短行）时开新段。
3. 行高用 `bottom - y` 计算。
4. 段落 ID 为 `p<页码>-b<页内序号>`，序号在页面内连续递增，从 0 开始。

* [ ] **Step 1: 写失败的测试**

创建 `tests/pdf/blocks.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { buildBlocks, classifyLine, mergeIntoParagraphs } from '../../src/main/pdf/blocks'
import type { Line } from '../../src/shared/types'

const PAGE_WIDTH = 595

function line(partial: Partial<Line> & { text: string; y: number }): Line {
  const { text, y, ...rest } = partial
  return {
    page: 1,
    text,
    x: 60,
    right: 500,
    y,
    bottom: y + 12,
    fontSize: 10,
    column: 0,
    ...rest
  }
}

describe('行类型判定', () => {
  it('字号明显更大的行判为标题', () => {
    expect(classifyLine(line({ text: 'Introduction', y: 100, fontSize: 16 }), 10)).toBe('heading')
  })

  it('以编号开头的行判为标题', () => {
    expect(classifyLine(line({ text: '3.2 Model Architecture', y: 100 }), 10)).toBe('heading')
  })

  it('普通正文行判为段落', () => {
    expect(classifyLine(line({ text: 'We propose a method', y: 100 }), 10)).toBe('paragraph')
  })

  it('以图字开头的行判为图注', () => {
    expect(classifyLine(line({ text: 'Figure 3: Results on WMT', y: 100 }), 10)).toBe('caption')
  })
})

describe('行合并成段落', () => {
  it('行距连续的若干行合并成一段', () => {
    const merged = mergeIntoParagraphs([
      line({ text: '第一行内容，', y: 100, right: 500 }),
      line({ text: '第二行内容，', y: 114, right: 500 }),
      line({ text: '第三行内容。', y: 128, right: 300 })
    ])
    expect(merged).toHaveLength(1)
  })

  it('段末是短行时下一行开新段', () => {
    const merged = mergeIntoParagraphs([
      line({ text: '这是上一段的结尾。', y: 100, right: 300 }),
      line({ text: '这是新一段的开始。', y: 116, right: 500 })
    ])
    expect(merged).toHaveLength(2)
  })

  it('明显的段间距会断开', () => {
    const merged = mergeIntoParagraphs([
      line({ text: '上一段。', y: 100, right: 500 }),
      line({ text: '下一段。', y: 160, right: 500 })
    ])
    expect(merged).toHaveLength(2)
  })
})

describe('整页段落重建', () => {
  it('双栏页面的阅读顺序是先左栏再右栏', () => {
    const lines: Line[] = []
    for (let i = 0; i < 10; i++) {
      lines.push(line({ text: `LEFT ${i}`, x: 60, y: 120 + i * 14, right: 280 }))
    }
    for (let i = 0; i < 10; i++) {
      lines.push(line({ text: `RIGHT ${i}`, x: 310, y: 120 + i * 14, right: 530 }))
    }
    const blocks = buildBlocks([lines], PAGE_WIDTH)
    const text = blocks.map((b) => b.text).join('|')
    expect(text.indexOf('LEFT 0')).toBeLessThan(text.indexOf('RIGHT 0'))
    expect(text).toContain('LEFT 9')
    expect(text).toContain('RIGHT 9')
  })

  it('段落 ID 按页码与页内序号生成', () => {
    const blocks = buildBlocks(
      [
        [line({ text: 'a', y: 100, page: 1 })],
        [line({ text: 'b', y: 100, page: 2 })]
      ],
      PAGE_WIDTH
    )
    expect(blocks[0].id).toBe('p1-b00')
    expect(blocks[1].id).toBe('p2-b00')
  })

  it('块的包围盒覆盖段内所有行', () => {
    const blocks = buildBlocks(
      [[line({ text: 'a', y: 100, right: 500 }), line({ text: 'b', y: 114, right: 500 })]],
      PAGE_WIDTH
    )
    expect(blocks[0].bbox.y).toBe(100)
    expect(blocks[0].bbox.h).toBe(26)
  })
})
```

* [ ] **Step 2: 运行测试，确认失败**

```bash
npx vitest run tests/pdf/blocks.test.ts
```

预期：FAIL，找不到模块。

* [ ] **Step 3: 写实现**

创建 `src/main/pdf/blocks.ts`：

```ts
import type { Block, BlockType, Line, RawPage } from '../../shared/types'
import { assignColumns, detectColumns } from './columns'
import { dropHeaderFooter } from './headerFooter'
import { buildLines } from './lines'

const HEADING_SIZE_RATIO = 1.15
const CAPTION_PATTERN = /^(figure|fig\.?|table|tab\.?)\s*\d+/i
const HEADING_PATTERN = /^(\d+(\.\d+)*|[IVX]+\.)\s+\S/

export function classifyLine(line: Line, bodyFontSize: number): BlockType {
  const text = line.text.trim()
  if (CAPTION_PATTERN.test(text)) return 'caption'
  if (line.fontSize >= bodyFontSize * HEADING_SIZE_RATIO) return 'heading'
  if (HEADING_PATTERN.test(text)) return 'heading'
  const letters = text.replace(/[^A-Za-z]/g, '')
  if (letters.length > 3 && text.length < 80 && letters === letters.toUpperCase()) return 'heading'
  return 'paragraph'
}

export function mergeIntoParagraphs(lines: Line[]): Line[][] {
  const groups: Line[][] = []
  let current: Line[] = []
  let columnRight = 0

  for (const line of lines) {
    columnRight = Math.max(columnRight, line.right)
    if (current.length === 0) {
      current = [line]
      continue
    }
    const prev = current[current.length - 1]
    const leading = Math.max(1, prev.bottom - prev.y)
    const gap = line.y - prev.bottom
    const shortPreviousLine = prev.right < columnRight - prev.fontSize * 1.5
    if (gap > leading * 0.35 || shortPreviousLine) {
      groups.push(current)
      current = [line]
    } else {
      current.push(line)
    }
  }

  if (current.length > 0) groups.push(current)
  return groups
}

function bodyFontSizeOf(lines: Line[]): number {
  if (lines.length === 0) return 10
  const sizes = lines.map((l) => l.fontSize).sort((a, b) => a - b)
  return sizes[Math.floor(sizes.length / 2)]
}

export function buildBlocks(pages: Line[][], pageWidth: number): Block[] {
  const blocks: Block[] = []

  for (const pageLines of pages) {
    if (pageLines.length === 0) continue
    const page = pageLines[0].page
    const bodyFontSize = bodyFontSizeOf(pageLines)
    const split = detectColumns(pageLines, pageWidth)
    const withColumns = assignColumns(pageLines, split)
    const ordered = [0, 1].flatMap((column) =>
      withColumns.filter((l) => l.column === column).sort((a, b) => a.y - b.y)
    )

    let sequence = 0
    for (const group of mergeIntoParagraphs(ordered)) {
      const x = Math.min(...group.map((l) => l.x))
      const right = Math.max(...group.map((l) => l.right))
      const y = Math.min(...group.map((l) => l.y))
      const bottom = Math.max(...group.map((l) => l.bottom))
      blocks.push({
        id: `p${page}-b${String(sequence).padStart(2, '0')}`,
        page,
        bbox: { x, y, w: right - x, h: bottom - y },
        type: classifyLine(group[0], bodyFontSize),
        text: group.map((l) => l.text).join(' ').replace(/\s+/g, ' ').trim()
      })
      sequence += 1
    }
  }

  return blocks
}

export function buildBlocksFromPages(pages: RawPage[]): Block[] {
  const height = pages[0]?.height ?? 842
  const width = pages[0]?.width ?? 595
  const linePages = pages.map((p) => buildLines(p))
  return buildBlocks(dropHeaderFooter(linePages, height), width)
}
```

* [ ] **Step 4: 运行测试，确认通过**

```bash
npx vitest run tests/pdf/blocks.test.ts
```

预期：10 个测试 PASS。

若"双栏页面的阅读顺序"用例失败，先打印 `detectColumns` 的返回值，确认测试数据的左栏 `x=60`、右栏 `x=310` 之间 250 的间隙大于 595 × 0.15 = 89.25 的阈值。若返回值正确而顺序仍错，问题一定出在排序上。

* [ ] **Step 5: 提交**

```bash
git add src/main/pdf/blocks.ts tests/pdf/blocks.test.ts
git commit -m "feat: 行合并成段落并生成块编号"
```
---

### Task 8: 导入流水线与 IPC 打通

**Files:**
* Create: `src/main/library/import.ts`
* Create: `src/main/ipc.ts`
* Modify: `src/main/index.ts`
* Modify: `src/preload/index.ts`
* Create: `src/renderer/src/api.ts`
* Test: `tests/library/import.test.ts`

**Interfaces:**
* Consumes: Task 2 的 `libraryPaths`、`createPaperDir`、`upsertEntry`、`writeJson`、`readJson`、`listEntries`、`findEntry`；Task 3 的 `extractPdf`、`extractMeta`；Task 7 的 `buildBlocksFromPages`
* Produces:
  * `resolveLibraryRoot(): string`，返回 `%USERPROFILE%\Documents\我的论文`
  * `importPdf(root: string, sourcePath: string): Promise<LibraryEntry>`
  * `importPdfs(root: string, sourcePaths: string[]): Promise<ImportResult>`
  * `registerIpc(root: string): void`
  * 渲染进程的 `window.api`，含 `listPapers()`、`choosePdfFiles()`、`importPdfs(paths)`、`getBlocks(paperId)`、`readPdf(paperId)`

* [ ] **Step 1: 写失败的测试**

创建 `tests/library/import.test.ts`：

```ts
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { importPdf, importPdfs } from '../../src/main/library/import'
import { libraryPaths, listEntries, readJson } from '../../src/main/library/store'
import type { BlocksFile } from '../../src/shared/types'
import { makeSingleColumnPdf, makeTwoColumnPdf } from '../fixtures/make-fixtures'

let root = ''
let source = ''

beforeEach(async () => {
  root = await fs.mkdtemp(join(tmpdir(), 'ai-note-import-'))
  source = await fs.mkdtemp(join(tmpdir(), 'ai-note-src-'))
})

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true })
  await fs.rm(source, { recursive: true, force: true })
})

async function writeFixture(name: string, bytes: Uint8Array): Promise<string> {
  const file = join(source, name)
  await fs.writeFile(file, bytes)
  return file
}

describe('导入单篇论文', () => {
  it('复制 PDF、写出数据文件并登记到索引', async () => {
    const file = await writeFixture('paper.pdf', await makeSingleColumnPdf())
    const entry = await importPdf(root, file)

    await fs.access(libraryPaths(root, entry.id).pdf)
    const blocks = await readJson<BlocksFile>(libraryPaths(root, entry.id).blocks)
    expect(blocks).not.toBeNull()
    expect(blocks!.paperId).toBe(entry.id)
    expect(blocks!.pageCount).toBe(3)
    expect(blocks!.blocks.length).toBeGreaterThan(0)
    expect((await listEntries(root)).map((p) => p.id)).toEqual([entry.id])
  })

  it('论文 ID 是 8 位十六进制', async () => {
    const entry = await importPdf(root, await writeFixture('a.pdf', await makeSingleColumnPdf()))
    expect(entry.id).toMatch(/^[0-9a-f]{8}$/)
  })

  it('标题在元数据缺失时退回文件名', async () => {
    const file = await writeFixture('我的论文文件.pdf', await makeSingleColumnPdf())
    const entry = await importPdf(root, file)
    expect(entry.title).toBe('我的论文文件')
  })

  it('页眉页脚不出现在结果里', async () => {
    const entry = await importPdf(root, await writeFixture('b.pdf', await makeTwoColumnPdf()))
    const blocks = await readJson<BlocksFile>(libraryPaths(root, entry.id).blocks)
    expect(blocks!.blocks.map((b) => b.text).join('\n')).not.toContain('Journal of Testing')
  })

  it('双栏论文的阅读顺序正确', async () => {
    const entry = await importPdf(root, await writeFixture('c.pdf', await makeTwoColumnPdf()))
    const blocks = await readJson<BlocksFile>(libraryPaths(root, entry.id).blocks)
    const text = blocks!.blocks.map((b) => b.text).join('|')
    expect(text.indexOf('LEFT 0')).toBeLessThan(text.indexOf('RIGHT 0'))
  })

  it('没有文字层的 PDF 被拒绝并给出中文原因', async () => {
    const doc = new Uint8Array(await makeSingleColumnPdf())
    const broken = await writeFixture('broken.pdf', doc.slice(0, 40))
    await expect(importPdf(root, broken)).rejects.toThrow()
  })
})

describe('批量导入', () => {
  it('一篇成功一篇损坏时报出失败原因且不中断', async () => {
    const good = await writeFixture('good.pdf', await makeSingleColumnPdf())
    const bad = join(source, 'broken.pdf')
    await fs.writeFile(bad, Buffer.from('这不是一个 PDF 文件'))

    const result = await importPdfs(root, [good, bad])
    expect(result.imported).toHaveLength(1)
    expect(result.failed).toHaveLength(1)
    expect(result.failed[0].path).toBe(bad)
    expect(result.failed[0].reason.length).toBeGreaterThan(0)
  })

  it('不存在的路径被记为失败', async () => {
    const result = await importPdfs(root, [join(source, 'missing.pdf')])
    expect(result.imported).toHaveLength(0)
    expect(result.failed).toHaveLength(1)
  })
})
```

* [ ] **Step 2: 运行测试，确认失败**

```bash
npx vitest run tests/library/import.test.ts
```

预期：FAIL，找不到 `../../src/main/library/import`。

* [ ] **Step 3: 写导入实现**

创建 `src/main/library/import.ts`：

```ts
import { randomBytes } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import type { BlocksFile, ImportResult, LibraryEntry } from '../../shared/types'
import { buildBlocksFromPages } from '../pdf/blocks'
import { extractMeta, extractPdf } from '../pdf/extract'
import { createPaperDir, libraryPaths, upsertEntry, writeJson } from './store'

export function resolveLibraryRoot(): string {
  return path.join(homedir(), 'Documents', '我的论文')
}

function newPaperId(): string {
  return randomBytes(4).toString('hex')
}

function titleFromFileName(file: string): string {
  return path.basename(file).replace(/\.pdf$/i, '').trim() || '未命名论文'
}

export async function importPdf(root: string, sourcePath: string): Promise<LibraryEntry> {
  await fs.access(sourcePath)
  const bytes = new Uint8Array(await fs.readFile(sourcePath))

  const pages = await extractPdf(bytes)
  if (pages.length === 0 || pages.every((p) => p.items.length === 0)) {
    throw new Error('这篇 PDF 没有可提取的文字层，可能是扫描版，暂不支持')
  }

  const id = newPaperId()
  await createPaperDir(root, id)
  const paths = libraryPaths(root, id)
  await fs.writeFile(paths.pdf, bytes)

  const meta = await extractMeta(bytes)
  const blocks = buildBlocksFromPages(pages)
  const now = Date.now()

  const entry: LibraryEntry = {
    id,
    title: meta.title ?? titleFromFileName(sourcePath),
    authors: meta.authors,
    year: null,
    doi: null,
    sourcePath,
    importedAt: now,
    tags: [],
    status: 'imported',
    progress: 0,
    pageCount: pages.length,
    blockCount: blocks.length
  }

  await writeJson(paths.meta, entry)
  const blocksFile: BlocksFile = {
    paperId: id,
    extractedAt: now,
    pageCount: pages.length,
    blocks
  }
  await writeJson(paths.blocks, blocksFile)
  await upsertEntry(root, entry)

  return entry
}

function describeError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err)
  if (/password|encrypted/i.test(message)) return '这篇 PDF 有密码保护，无法读取'
  if (/Invalid PDF|not a PDF|Missing PDF/i.test(message)) return '文件不是有效的 PDF'
  return message
}

export async function importPdfs(root: string, sourcePaths: string[]): Promise<ImportResult> {
  const result: ImportResult = { imported: [], failed: [] }
  for (const sourcePath of sourcePaths) {
    try {
      result.imported.push(await importPdf(root, sourcePath))
    } catch (err) {
      result.failed.push({ path: sourcePath, reason: describeError(err) })
    }
  }
  return result
}
```

* [ ] **Step 4: 运行测试，确认通过**

```bash
npx vitest run tests/library/import.test.ts
```

预期：8 个测试 PASS。

* [ ] **Step 5: 写 IPC 层**

创建 `src/main/ipc.ts`：

```ts
import { promises as fs } from 'node:fs'
import { BrowserWindow, dialog, ipcMain } from 'electron'
import { IPC } from '../shared/ipc'
import type { BlocksFile, ImportResult, LibraryEntry } from '../shared/types'
import { importPdfs } from './library/import'
import { findEntry, libraryPaths, listEntries, readJson } from './library/store'

const PDF_FILTER = [{ name: 'PDF 文件', extensions: ['pdf'] }]

export function registerIpc(root: string): void {
  ipcMain.handle(IPC.libraryList, async (): Promise<LibraryEntry[]> => listEntries(root))

  ipcMain.handle(IPC.libraryChooseFiles, async (event): Promise<string[]> => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const options = {
      title: '选择论文 PDF',
      properties: ['openFile', 'multiSelections'] as const,
      filters: PDF_FILTER
    }
    const result = win
      ? await dialog.showOpenDialog(win, { ...options, properties: [...options.properties] })
      : await dialog.showOpenDialog({ ...options, properties: [...options.properties] })
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
```

修改 `src/main/index.ts`，在文件顶部增加两行导入，并在 `app.whenReady()` 内先注册 IPC（`createWindow` 函数体保持 Task 1 的实现不变）：

```ts
import { resolveLibraryRoot } from './library/import'
import { registerIpc } from './ipc'

app.whenReady().then(() => {
  registerIpc(resolveLibraryRoot())
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})
```

把 `src/preload/index.ts` 整体替换为：

```ts
import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc'
import type { BlocksFile, ImportResult, LibraryEntry } from '../shared/types'

const api = {
  listPapers: (): Promise<LibraryEntry[]> => ipcRenderer.invoke(IPC.libraryList),
  choosePdfFiles: (): Promise<string[]> => ipcRenderer.invoke(IPC.libraryChooseFiles),
  importPdfs: (paths: string[]): Promise<ImportResult> => ipcRenderer.invoke(IPC.libraryImport, paths),
  getBlocks: (paperId: string): Promise<BlocksFile | null> =>
    ipcRenderer.invoke(IPC.libraryGetBlocks, paperId),
  readPdf: (paperId: string): Promise<Uint8Array | null> =>
    ipcRenderer.invoke(IPC.libraryReadPdf, paperId)
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
```

创建 `src/renderer/src/api.ts`：

```ts
import type { Api } from '../../preload'

declare global {
  interface Window {
    api: Api
  }
}

export const api = window.api
```

* [ ] **Step 6: 全量测试与构建**

```bash
npm test
npm run build
```

预期：全部通过。

* [ ] **Step 7: 提交**

```bash
git add src/main/ipc.ts src/main/index.ts src/main/library/import.ts src/preload/index.ts src/renderer/src/api.ts tests/library/import.test.ts
git commit -m "feat: PDF 导入流水线与 IPC 打通"
```
---

### Task 9: 论文库界面

**Files:**
* Create: `src/renderer/src/views/LibraryView.tsx`
* Modify: `src/renderer/src/App.tsx`
* Create: `vitest.setup.ts`
* Modify: `vitest.config.ts`
* Test: `tests/renderer/LibraryView.test.tsx`

**Interfaces:**
* Consumes: `src/renderer/src/api.ts` 的 `api`；`LibraryEntry`
* Produces: `LibraryView` 组件，props 为 `{ onOpenPaper?: (paperId: string) => void }`

* [ ] **Step 1: 给测试环境加上 jest-dom 断言**

创建 `vitest.setup.ts`：

```ts
import '@testing-library/jest-dom/vitest'
```

在 `vitest.config.ts` 的 `test` 字段里补一行：

```ts
setupFiles: ['vitest.setup.ts'],
```

* [ ] **Step 2: 写失败的测试**

创建 `tests/renderer/LibraryView.test.tsx`：

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import LibraryView from '../../src/renderer/src/views/LibraryView'
import type { LibraryEntry } from '../../src/shared/types'

function entry(over: Partial<LibraryEntry> = {}): LibraryEntry {
  return {
    id: 'aaaa1111',
    title: '注意力就是全部',
    authors: ['张三'],
    year: 2017,
    doi: null,
    sourcePath: null,
    importedAt: 1,
    tags: [],
    status: 'imported',
    progress: 0,
    pageCount: 11,
    blockCount: 220,
    ...over
  }
}

const listPapers = vi.fn()
const importPdfs = vi.fn()
const choosePdfFiles = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  ;(window as unknown as { api: unknown }).api = {
    listPapers,
    importPdfs,
    choosePdfFiles,
    getBlocks: vi.fn(),
    readPdf: vi.fn()
  }
})

describe('论文库界面', () => {
  it('加载后展示论文标题', async () => {
    listPapers.mockResolvedValue([entry()])
    render(<LibraryView />)
    expect(await screen.findByText('注意力就是全部')).toBeInTheDocument()
  })

  it('空库时显示引导文案', async () => {
    listPapers.mockResolvedValue([])
    render(<LibraryView />)
    expect(await screen.findByText(/把 PDF 拖进来/)).toBeInTheDocument()
  })

  it('显示页数与段落数', async () => {
    listPapers.mockResolvedValue([entry()])
    render(<LibraryView />)
    expect(await screen.findByText(/11 页/)).toBeInTheDocument()
    expect(await screen.findByText(/220 段/)).toBeInTheDocument()
  })

  it('点导入按钮会拉起文件选择并刷新列表', async () => {
    listPapers.mockResolvedValueOnce([]).mockResolvedValueOnce([entry()])
    choosePdfFiles.mockResolvedValue(['C:/papers/a.pdf'])
    importPdfs.mockResolvedValue({ imported: [entry()], failed: [] })

    render(<LibraryView />)
    const button = await screen.findByRole('button', { name: /导入 PDF/ })
    button.click()

    await waitFor(() => expect(choosePdfFiles).toHaveBeenCalled())
    expect(await screen.findByText('注意力就是全部')).toBeInTheDocument()
  })

  it('导入失败时用中文说明原因', async () => {
    listPapers.mockResolvedValue([])
    choosePdfFiles.mockResolvedValue(['C:/papers/bad.pdf'])
    importPdfs.mockResolvedValue({
      imported: [],
      failed: [{ path: 'C:/papers/bad.pdf', reason: '文件不是有效的 PDF' }]
    })

    render(<LibraryView />)
    ;(await screen.findByRole('button', { name: /导入 PDF/ })).click()

    expect(await screen.findByText(/文件不是有效的 PDF/)).toBeInTheDocument()
  })
})
```

* [ ] **Step 3: 运行测试，确认失败**

```bash
npx vitest run tests/renderer/LibraryView.test.tsx
```

预期：FAIL，找不到 `LibraryView`。

* [ ] **Step 4: 写实现**

创建 `src/renderer/src/views/LibraryView.tsx`：

```tsx
import { useCallback, useEffect, useState } from 'react'
import type { LibraryEntry } from '../../../shared/types'
import { api } from '../api'

interface Props {
  onOpenPaper?: (paperId: string) => void
}

const STATUS_TEXT: Record<LibraryEntry['status'], string> = {
  imported: '未翻译',
  translating: '翻译中',
  translated: '已完成',
  failed: '有失败段落'
}

export default function LibraryView({ onOpenPaper }: Props): JSX.Element {
  const [papers, setPapers] = useState<LibraryEntry[]>([])
  const [problems, setProblems] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    setPapers(await api.listPapers())
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const importPaths = useCallback(
    async (paths: string[]) => {
      if (paths.length === 0) return
      setBusy(true)
      try {
        const result = await api.importPdfs(paths)
        setProblems(result.failed.map((f) => `${f.path}：${f.reason}`))
        await refresh()
      } finally {
        setBusy(false)
      }
    },
    [refresh]
  )

  return (
    <div
      style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        const paths = Array.from(e.dataTransfer.files)
          .map((f) => (f as File & { path?: string }).path)
          .filter((p): p is string => Boolean(p))
        void importPaths(paths)
      }}
    >
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, margin: 0 }}>我的论文</h1>
        <button disabled={busy} onClick={async () => importPaths(await api.choosePdfFiles())}>
          {busy ? '正在导入…' : '导入 PDF'}
        </button>
      </header>

      {problems.length > 0 && (
        <ul style={{ color: '#b3261e', marginBottom: 16 }}>
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}

      {papers.length === 0 ? (
        <p style={{ color: '#666' }}>还没有论文。把 PDF 拖进来，或者点上面的"导入 PDF"。</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {papers.map((paper) => (
            <li
              key={paper.id}
              onClick={() => onOpenPaper?.(paper.id)}
              style={{
                padding: '12px 14px',
                border: '1px solid #e0e0e0',
                borderRadius: 8,
                marginBottom: 8,
                cursor: 'pointer'
              }}
            >
              <div style={{ fontWeight: 600 }}>{paper.title}</div>
              <div style={{ color: '#666', fontSize: 13, marginTop: 4 }}>
                {paper.pageCount} 页 · {paper.blockCount} 段 · {STATUS_TEXT[paper.status]}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

把 `src/renderer/src/App.tsx` 替换为：

```tsx
import { useState } from 'react'
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
```

* [ ] **Step 5: 运行测试，确认通过**

```bash
npx vitest run tests/renderer/LibraryView.test.tsx
```

预期：5 个测试 PASS。

* [ ] **Step 6: 手动验证**

```bash
npm run dev
```

预期：窗口里显示"我的论文"，点"导入 PDF"能选文件并出现在列表里，重启软件后列表仍在。

* [ ] **Step 7: 提交**

```bash
git add src/renderer/src/views/LibraryView.tsx src/renderer/src/App.tsx tests/renderer/LibraryView.test.tsx vitest.config.ts vitest.setup.ts tsconfig.json
git commit -m "feat: 论文库界面与导入交互"
```

---

### Task 10: 原版排版阅读器

**Files:**
* Create: `src/renderer/src/components/PdfPages.tsx`
* Create: `src/renderer/src/views/ReaderView.tsx`
* Modify: `src/renderer/src/App.tsx`
* Test: `tests/renderer/ReaderView.test.tsx`

**Interfaces:**
* Consumes: `api.readPdf(paperId)`、`api.getBlocks(paperId)`
* Produces: `ReaderView` 组件，props 为 `{ paperId: string; onBack: () => void }`

* [ ] **Step 1: 写失败的测试**

创建 `tests/renderer/ReaderView.test.tsx`：

```tsx
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ReaderView from '../../src/renderer/src/views/ReaderView'

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument: () => ({ promise: Promise.reject(new Error('测试中不解析真实 PDF')) })
}))

vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: '' }))

const readPdf = vi.fn()
const getBlocks = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  ;(window as unknown as { api: unknown }).api = {
    listPapers: vi.fn(),
    importPdfs: vi.fn(),
    choosePdfFiles: vi.fn(),
    getBlocks,
    readPdf
  }
})

describe('阅读界面', () => {
  it('读取失败时给出中文提示而不是崩溃', async () => {
    readPdf.mockResolvedValue(null)
    getBlocks.mockResolvedValue(null)
    render(<ReaderView paperId="aaaa1111" onBack={() => {}} />)
    expect(await screen.findByText(/找不到这篇论文/)).toBeInTheDocument()
  })

  it('加载中显示提示文案', () => {
    readPdf.mockReturnValue(new Promise(() => {}))
    getBlocks.mockReturnValue(new Promise(() => {}))
    render(<ReaderView paperId="aaaa1111" onBack={() => {}} />)
    expect(screen.getByText(/正在打开/)).toBeInTheDocument()
  })
})
```

* [ ] **Step 2: 运行测试，确认失败**

```bash
npx vitest run tests/renderer/ReaderView.test.tsx
```

预期：FAIL，找不到 `ReaderView`。

* [ ] **Step 3: 写实现**

创建 `src/renderer/src/components/PdfPages.tsx`：

```tsx
import { useEffect, useRef, useState } from 'react'
import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

interface Props {
  data: Uint8Array
}

export default function PdfPages({ data }: Props): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const container = containerRef.current
    if (!container) return
    container.replaceChildren()

    const task = pdfjs.getDocument({ data: new Uint8Array(data) })
    task.promise
      .then(async (doc) => {
        if (cancelled) return
        const scale = 1.5
        for (let n = 1; n <= doc.numPages; n++) {
          const page = await doc.getPage(n)
          const viewport = page.getViewport({ scale })
          const canvas = document.createElement('canvas')
          canvas.width = viewport.width
          canvas.height = viewport.height
          canvas.style.display = 'block'
          canvas.style.margin = '0 auto 16px'
          canvas.style.boxShadow = '0 1px 6px rgba(0,0,0,.15)'
          canvas.dataset.page = String(n)
          container.appendChild(canvas)
          const context = canvas.getContext('2d')
          if (!context) continue
          await page.render({ canvasContext: context, viewport }).promise
        }
      })
      .catch(() => {
        if (!cancelled) setError('这篇 PDF 无法渲染，文件可能已损坏')
      })

    return () => {
      cancelled = true
      void task.destroy()
    }
  }, [data])

  if (error) return <p style={{ color: '#b3261e', padding: 24 }}>{error}</p>
  return <div ref={containerRef} style={{ background: '#f0f0f2', padding: 16 }} />
}
```

创建 `src/renderer/src/views/ReaderView.tsx`：

```tsx
import { useEffect, useState } from 'react'
import PdfPages from '../components/PdfPages'
import { api } from '../api'

interface Props {
  paperId: string
  onBack: () => void
}

export default function ReaderView({ paperId, onBack }: Props): JSX.Element {
  const [data, setData] = useState<Uint8Array | null>(null)
  const [missing, setMissing] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([api.readPdf(paperId), api.getBlocks(paperId)])
      .then(([bytes]) => {
        if (cancelled) return
        if (!bytes) {
          setMissing(true)
          return
        }
        setData(bytes)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [paperId])

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '10px 16px',
          borderBottom: '1px solid #e0e0e0'
        }}
      >
        <button onClick={onBack}>← 返回论文库</button>
        <span style={{ flex: 1 }} />
        <span style={{ color: '#666', fontSize: 13 }}>
          全文翻译 · 总结 · 参考文献（下一个计划接入）
        </span>
      </header>
      <main style={{ flex: 1, overflow: 'auto' }}>
        {loading && <p style={{ padding: 24 }}>正在打开论文…</p>}
        {missing && (
          <p style={{ padding: 24, color: '#b3261e' }}>
            找不到这篇论文的文件，它可能已被移走或删除。
          </p>
        )}
        {data && <PdfPages data={data} />}
      </main>
    </div>
  )
}
```

把 `src/renderer/src/App.tsx` 替换为：

```tsx
import { useState } from 'react'
import LibraryView from './views/LibraryView'
import ReaderView from './views/ReaderView'

export default function App(): JSX.Element {
  const [openPaperId, setOpenPaperId] = useState<string | null>(null)

  if (!openPaperId) return <LibraryView onOpenPaper={setOpenPaperId} />
  return <ReaderView paperId={openPaperId} onBack={() => setOpenPaperId(null)} />
}
```

* [ ] **Step 4: 运行测试，确认通过**

```bash
npx vitest run tests/renderer/ReaderView.test.tsx
```

预期：2 个测试 PASS。

* [ ] **Step 5: 手动验收（本计划的最终验收）**

```bash
npm test
npm run build
npm run dev
```

逐项确认：

1. 窗口打开，显示"我的论文"
2. 导入一篇真实的英文论文 PDF（从期刊或 arXiv 下载），列表里出现它，页数与段落数是合理数字
3. 点开它，PDF 按原版排版渲染，双栏论文的左右两栏都正常显示，图和公式位置正确
4. 返回论文库，关闭软件，重新 `npm run dev`，论文仍在列表里，点开立即显示，不需要重新解析
5. 把任意 `.txt` 文件改名成 `.pdf` 再导入，界面用中文报错且不崩溃

* [ ] **Step 6: 提交**

```bash
git add src/renderer/src/components/PdfPages.tsx src/renderer/src/views/ReaderView.tsx src/renderer/src/App.tsx tests/renderer/ReaderView.test.tsx
git commit -m "feat: 原版排版 PDF 阅读器"
```

---

## 验收标准

本计划完成时，下面每一条都必须成立：

* `npm test` 全绿，`npm run build` 无错误
* 能导入单栏与双栏两种真实英文论文，段落数合理
* 段落重建对双栏论文的阅读顺序正确（左栏读完再读右栏）
* 跨页重复的页眉页脚被干净剔除
* 论文库重启后仍在，重复打开不需要重新解析
* 导入损坏文件、非 PDF 文件、扫描版 PDF 时都有中文提示且不崩溃
* 阅读器按原版排版渲染，图表与公式位置正确

## 后续计划

本计划完成后，依次进入：

* 计划二：AI 接入层、全文翻译、断点续传、选中即译
* 计划三：结构化总结、参考文献反查与概述、Markdown 导出
* 计划四：打包为 portable exe、首次使用引导、真实论文回归测试
---

## 执行期已知需要确认的点

* `vitest.config.ts` 里的 `environmentMatchGlobs` 在较新的 Vitest 版本中已被移除。若启动测试时报该配置无效，改成在 `tests/renderer/` 下每个测试文件顶部加一行注释 `// @vitest-environment jsdom`，并删除该配置项。
* `pdfjs-dist` 的主版本差异会影响导入路径与打包方式。Task 3 的 Step 5 已经写明排查顺序，不要跳过。
* 渲染进程里 `pdfjs-dist/build/pdf.worker.min.mjs` 这份 worker 文件在部分版本中叫 `pdf.worker.mjs`，以 `node_modules/pdfjs-dist/build/` 里的实际文件名为准。
* 本机沙箱辅助进程存在闪断，命令报 `windows sandbox failed` 时用沙箱外权限重跑同一条命令即可。