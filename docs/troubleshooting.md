# 疑难问题排查手册

> 用法：遇到问题时，先按**报错原文的关键词**在下面的速查索引里找，再跳到对应小节。
> 每一条都按「症状 → 根因 → 修复 → 验证 → 预防」写全，尽量把**原始报错文本**保留下来，方便直接搜索。

## 速查索引

| 报错 / 症状关键词 | 小节 |
|---|---|
| `windows sandbox failed: setup refresh had errors` | 1.1 |
| `EBADENGINE ... required: { node: '>=22.13.0' }` | 1.2 |
| `Could not resolve dependency ... peer vite@` | 1.3 |
| `electron.exe 不存在` / `path.txt 不存在` | 1.4 |
| `ERR_REQUIRE_ESM ... html-encoding-sniffer` | 1.5 |
| `crypto.hash is not a function` | 1.6 |
| `error TS2503: Cannot find namespace 'JSX'` | 2.1 |
| `error TS2307: Cannot find module '...?url'` | 2.2 |
| preload 静默不执行、界面里 `window.api` 是 undefined | 2.3 |
| `Setting up fake worker failed` / `Cannot find module ... pdf.worker.mjs` | 2.4 |
| `environmentMatchGlobs is deprecated` | 3.1 |
| 测试里 `window.api` 是 undefined | 3.2 |
| `Cannot polyfill DOMMatrix / ImageData / Path2D` | 3.3 |
| **双栏论文的左右栏文字被拼进同一行** | 4.1 |
| **分栏检测在真实论文上完全不生效** | 4.2 |
| 测试全绿但真实数据一跑就错 | 4.3 |
| 大文件被误提交进 git | 5.1 |
| 沙箱坏了怎么办 | 5.2 |

## 当前依赖基线

本机是 **Node v20.11.1 / npm 10.5**。这是所有版本选择的约束来源：**Node 20.11 不支持 `require()` 一个 ESM 模块**（该能力从 Node 20.19 / 22.12 才有），很多新版本依赖因此在本机直接崩。锁定版本如下：

| 依赖 | 版本 | 为什么不能用更新版 |
|---|---|---|
| electron | 33.x | 44.x 声明 `engines.node >= 22.12`，安装脚本直接失败 |
| vite | 6.x | 7.x 的 dev server 调用了 Node 20.12 才有的 `crypto.hash`；8.x 与 electron-vite 5 的 peer 依赖冲突 |
| vitest | 3.x | 4.x 需要 vite 8 |
| pdfjs-dist | 4.x | 6.x 声明 `engines.node >= 22.13` |
| jsdom | 24.x | 30.x 的传递依赖在 Node 20.11 下 `ERR_REQUIRE_ESM` |

**把 Node 升到 22 LTS 之后，这张表里的多数限制会自动消失**，届时可以统一升级并重跑一次全量测试。

---

## 一、环境与依赖

### 1.1 windows sandbox failed: helper_unknown_error: setup refresh had errors

**症状**

本会话里，**所有在沙箱内执行的命令**（不加升级权限的命令、以及文件编辑工具）全部失败，报错固定为上面这一行。重启 Codex 应用无效。**但同一时刻、同一条命令加上"沙箱外执行"权限就能正常跑完。**

**根因（未完全确认）**

触发点非常可疑地落在 `git init` 之后。权限清单里 `F:\demos\ai-note\.git` 被显式声明为**只读路径**，而它在 `git init` 之前并不存在。创建出真实仓库后，沙箱每次初始化都要处理这个路径。旁证：在沙箱外执行 `Rename-Item .git` 也会被拒绝（`Access to the path ... is denied`），说明该目录被某种机制持有。

**修复 / 绕过**

1. 所有命令显式加"沙箱外执行"权限。
2. 文件写入改用 PowerShell 的**单引号字面 here-string**（不做变量插值）配合 `[System.IO.File]::WriteAllText` 与 `New-Object System.Text.UTF8Encoding($false)`，保证 **UTF-8 无 BOM**——有 BOM 会让 `package.json`、`tsconfig.json` 解析失败。
3. 已经批准过的命令前缀（例如 git 相关）会自动走沙箱外通道，无需重复授权。

**坑中坑**：单引号 here-string 的**结束标记必须独占一行**（内容为：单引号紧跟 @ 两个字符）。如果你的文档或代码里要原样收录这个语法，**它会把外层 here-string 提前截断**，导致 PowerShell 报 `ParserError`。解决办法是在内容里写一个占位符（如 `__END__`），写完之后再做一次字符串替换把占位符换成真正的结束标记。

**重要副作用：子代理完全不可用。** 子代理连读取任务简报都会失败，授权请求也传不到用户那里。表现为"子代理一直在运行，但十几分钟一个文件都没产生"。此时必须改为**控制者在会话内联执行**，不要再派子代理，否则纯属浪费。

**预防**

* 在这个工作区里默认所有命令都走沙箱外通道，不要浪费时间先试沙箱内执行。
* 写文件一律用上面的方式，不要用 `cat`、重定向之类的写文件技巧（既不符合工具规范，也容易出编码问题）。

### 1.2 pdfjs-dist 要求 Node 22

**症状**

```
npm WARN EBADENGINE   package: 'pdfjs-dist@6.3.289',
npm WARN EBADENGINE   required: { node: '>=22.13.0 || >=24' },
npm WARN EBADENGINE   current: { node: 'v20.11.1', npm: '10.5.0' }
```

**根因**：pdfjs-dist 6.x 要求 Node ≥ 22.13。

**修复**：`npm i pdfjs-dist@4`

**验证**：确认 `node_modules/pdfjs-dist/legacy/build/pdf.mjs` 和 `node_modules/pdfjs-dist/build/pdf.worker.min.mjs` 都存在——主进程与渲染进程各用其中一个。

### 1.3 vite 8 与 electron-vite 5 的 peer 冲突

**症状**

```
npm ERR! Could not resolve dependency:
npm ERR! dev electron-vite@"*" from the root project
npm ERR! Conflicting peer dependency: vite@6.4.3
npm ERR!   peer vite@"^5.0.0 || ^6.0.0 || ^7.0.0" from electron-vite@5.0.0
```

**根因**：npm 默认装最新版 vite（8.x），超出 electron-vite 5 支持的 peer 范围。

**修复**：把版本钉死，不要依赖通配符：

```bash
npm i -D electron electron-vite vite@7 @vitejs/plugin-react@5 vitest@3 typescript ...
```

**预防**：electron 生态的依赖一律显式指定主版本后再装。

### 1.4 Electron 二进制没有下载下来

**症状**

`npm i -D electron` 显示安装成功，但 `node_modules/electron/dist` 目录和 `path.txt` 都不存在；一旦启动就报"系统找不到指定的文件"。

**根因（两层）**

1. Electron 的运行时二进制由 postinstall 脚本另外下载（约 100MB），默认从 GitHub 拉取，国内网络容易失败。
2. 手动补跑该脚本时又报：

```
Error [ERR_REQUIRE_ESM]: require() of ES Module .../@electron/get/dist/index.js from electron/install.js not supported
```

因为 electron@44 要求 `engines.node >= 22.12`，它的 `install.js` 用 `require()` 加载 ESM 版的 `@electron/get@5`，而 Node 20.11 不支持 `require(ESM)`。

**修复**

```powershell
$env:ELECTRON_MIRROR='https://npmmirror.com/mirrors/electron/'
npm i -D electron@33
```

**验证**

```
Test-Path 'F:\demos\ai-note\node_modules\electron\dist\electron.exe'   # 必须为 True
npx electron --version                                                 # 应输出 v33.x
```

### 1.5 jsdom 30 在 Node 20 下崩溃

**症状**

前端测试报未处理错误：

```
Error: require() of ES Module .../@exodus/bytes/encoding-lite.js from .../html-encoding-sniffer/lib/html-encoding-sniffer.js not supported.
```

**根因**：jsdom 30 的传递依赖要求 Node ≥ 20.19，同样是 `require(ESM)` 的限制。

**修复**：`npm i -D jsdom@24`
---

### 1.6 Vite 7 的 dev server 要 Node 20.12（crypto.hash is not a function）

**症状**

`npm run build` 一切正常，但 `npm run dev` 直接崩：

```
error during start dev server and electron app:
TypeError: crypto.hash is not a function
    at getHash (file:///.../node_modules/vite/dist/node/chunks/config.js:2444:19)
    at getLockfileHash (...)
    at getDepHash (...)
    at initDepsOptimizerMetadata (...)
    at createDepsOptimizer (...)
    at new DevEnvironment (...)
```

**根因**：Vite 7 的依赖预打包与 dev server 用到了 `crypto.hash`，这个 API **Node 20.12 才有**。本机是 20.11.1，所以它是 undefined：

```
node -e "console.log(typeof require('node:crypto').hash)"   # 输出 undefined
```

`npm run build` 走的是另一条代码路径，不碰这个 API——**所以"构建通过"完全不能说明 dev 能跑**。

**修复**

```bash
npm i -D vite@6
```

Vite 6 对 Node 的要求是 18 / 20 / 22 通用，不依赖该 API，且仍在 electron-vite 5 支持的 peer 范围内。装完确认：

```
node -e "console.log(require('vite/package.json').version)"   # 应为 6.x
```

**验证**：必须实际跑一次 `npm run dev`，看到 `dev server running ... ➜ Local: http://localhost:5173/` 与 `starting electron app...`，窗口能起来，且 stderr 为空。**不要用 `npm run build` 代替这一步。**

**预防**：动过 Node 或构建工具版本之后，`build`、`test`、`dev` **三条路径都要各跑一次**——它们依赖的 Node API 并不相同。
---

## 二、构建与类型

### 2.1 React 19 没有全局 JSX 命名空间

**症状**

```
src/renderer/src/App.tsx(1,32): error TS2503: Cannot find namespace 'JSX'.
```

**根因**：React 19 移除了全局 `JSX` 命名空间，不再能直接写 `: JSX.Element`。

**修复**：每个用到该类型标注的 `.tsx` 文件顶部显式导入：

```tsx
import type { JSX } from 'react'

export default function App(): JSX.Element { ... }
```

**预防**：新写 React 组件时直接带上这行导入，别等构建报错。

### 2.2 ?url 导入缺少类型声明

**症状**

```
src/renderer/src/components/PdfPages.tsx(3,23): error TS2307: Cannot find module
'pdfjs-dist/build/pdf.worker.min.mjs?url' or its corresponding type declarations.
```

**根因**：`?url` 是 Vite 提供的导入后缀，类型声明来自 `vite/client`，而 `tsconfig.json` 里的 `types` 只列了 `node` 和 `vitest/globals`。

**修复**：新建 `src/renderer/src/vite-env.d.ts`，内容一行：

```ts
/// <reference types="vite/client" />
```

### 2.3 preload 产物扩展名与主进程写的不一致

**症状**

应用能启动、窗口能显示，但界面里 `window.api` 是 undefined，所有 IPC 调用全部失败。**没有任何报错**——preload 脚本静默地没有执行。

**根因**：`package.json` 里声明了 `"type": "module"` 之后，electron-vite 输出的 preload 文件是 `out/preload/index.mjs`，而主进程里写的是：

```ts
preload: join(__dirname, '../preload/index.mjs')   // 正确
preload: join(__dirname, '../preload/index.js')    // 错误：文件不存在，静默失败
```

**修复**：把主进程里的 `index.js` 改成 `index.mjs`。

**验证方式（重要）**：这类"静默失败"最阴险，光看应用能不能启动是发现不了的。可靠的验证是**启动应用并检查退出状态与 stderr**：

```powershell
$p = Start-Process -FilePath 'node_modules\electron\dist\electron.exe' -ArgumentList '.' `
     -WorkingDirectory $repo -PassThru -RedirectStandardError $errLog
Start-Sleep -Seconds 12
(-not $p.HasExited)     # 进程应当仍然存活
Get-Content $errLog     # 应当是空
```

**预防**：改动了构建产物路径或 `type` 字段后，务必回头核对主进程里所有 `join(__dirname, ...)` 的引用。

---

### 2.4 打包后 pdf.js 找不到自己的 worker

**症状**

点"导入 PDF"并选中论文后，界面上出现：

```
F:\...\某论文.pdf：Setting up fake worker failed: "Cannot find module
'F:\demos\ai-note\out\main\pdf.worker.mjs' imported from F:\demos\ai-note\out\main\index.js".
```

**根因：把 pdf.js 内联进了主进程包。**

`electron.vite.config.ts` 里原本写的是：

```ts
main: { plugins: [externalizeDepsPlugin({ exclude: ['pdfjs-dist'] })] }
```

`exclude` 的意思是"不要外部化它"，即**把 pdf.js 整个打包进主进程产物**——产物因此从 16KB 涨到 802KB。而 pdf.js 在 Node 环境下会**动态 import 自己的 worker 文件**；Rollup 处理这个动态导入时，把它改写成相对于打包输出目录的 `./pdf.worker.mjs`，可 `out/main/` 里只有 `index.js`，于是运行时报找不到模块。

**为什么单元测试发现不了**：vitest 直接从 `node_modules` 解析模块，路径天然是对的；**只有打包产物才会走错路径**。所以这一类问题必须在"真实启动应用"这一层验证。

**修复**

```ts
main: { plugins: [externalizeDepsPlugin()] }
```

保持 pdfjs-dist 为外部依赖，运行时从 `node_modules` 解析。产物体积回落到 16KB，里面保留的是：

```js
import { getDocument, VerbosityLevel } from "pdfjs-dist/legacy/build/pdf.mjs";
```

这样 pdf.js 从 node_modules 里加载，就能在同目录找到自己的 `pdf.worker.mjs`。

**验证**：单元测试和构建都**证明不了**这个修复。要在真实 Electron 运行时里跑一个临时探针——写一个 CJS 文件放在项目根目录（放根目录是为了让模块解析能找到 node_modules），内容大致是：

```js
const { app } = require('electron')
const fs = require('node:fs')
app.whenReady().then(async () => {
  try {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const data = new Uint8Array(fs.readFileSync(process.argv[2]))
    const doc = await pdfjs.getDocument({ data }).promise
    const page = await doc.getPage(1)
    const content = await page.getTextContent()
    console.log('PROBE-OK pages=' + doc.numPages + ' page1Items=' + content.items.length)
    await doc.destroy()
  } catch (e) {
    console.log('PROBE-FAIL ' + e.message)
  }
  app.quit()
})
```

然后用 Electron 直接跑它（而不是用 node），跑完删掉探针文件：

```powershell
& node_modules\electron\dist\electron.exe probe-pdf.cjs "某篇论文.pdf"
```

期望输出 `PROBE-OK pages=... page1Items=...`。本次修复后的实测结果是 `PROBE-OK pages=6 page1Items=268`。

**预防**：凡是**在运行时动态加载自己附属文件**的库（worker、wasm、字体、字典、模型文件），一律不要内联进 bundle，必须保持外部依赖。判断信号有两个：产物体积相对该库的大小暴涨；产物里出现该库的资源文件名（如 `pdf.worker.mjs`）却被改写成相对路径。
---

## 三、测试

### 3.1 vitest 的 environmentMatchGlobs 已废弃

**症状**

```
DEPRECATED  "environmentMatchGlobs" is deprecated. Use `test.projects` to define different configurations instead.
```

**修复**（本项目采用最轻量的做法）：从 `vitest.config.ts` 删掉该项，改为在需要 jsdom 的测试文件**第一行**加注释：

```ts
// @vitest-environment jsdom
```

**理由**：只有 `tests/renderer/**` 需要 jsdom，用一个文件级注释比配置 `test.projects` 简单得多，也避免了配置写错时的隐式降级。

### 3.2 测试里 window.api 是 undefined

**症状**

组件测试全部失败，或者报 `api.listPapers is not a function`。明明测试里给 `window.api` 赋了值。

**根因**：`src/renderer/src/api.ts` 里是

```ts
export const api = window.api
```

**在模块加载时就已经求值完毕**。而 ESM 的 import 会被提升到文件顶部，`beforeEach` 里注入 mock 的时机太晚——组件拿到的永远是加载那一刻的 `window.api`（undefined）。这是计划里的设计与测试写法自相矛盾的地方。

**修复**：把 mock 提到模块导入之前，用 `vi.hoisted`：

```ts
const mocks = vi.hoisted(() => {
  const g = globalThis as unknown as { window?: Record<string, unknown> }
  if (!g.window) g.window = {}
  const target = {
    listPapers: vi.fn(), importPdfs: vi.fn(), choosePdfFiles: vi.fn(),
    getBlocks: vi.fn(), readPdf: vi.fn()
  }
  g.window.api = target
  return target
})

// 之后才 import 被测组件
```

`beforeEach` 里只做 `vi.resetAllMocks()`，并重新把 `window.api` 指回同一个 mocks 对象即可。

**预防**：任何"模块顶层就把全局对象抓走"的胶水文件（api 封装、配置读取），写测试时都要意识到加载时序问题。

### 3.3 pdf.js 在 Node 下的环境警告

**症状**

每次跑涉及 PDF 解析的测试，stdout 里固定出现三行：

```
Warning: Cannot access the `require` function: "TypeError: process.getBuiltinModule is not a function".
Warning: Cannot polyfill `DOMMatrix`, rendering may be broken.
Warning: Cannot polyfill `ImageData`, rendering may be broken.
Warning: Cannot polyfill `Path2D`, rendering may be broken.
```

**根因**：pdf.js 在 Node 环境初始化时会尝试加载可选的原生 canvas 依赖（未安装），并且它的 `require` 探测依赖 `process.getBuiltinModule`（Node 20.16 才有）。这些警告在**模块初始化阶段**就打印了，所以给 `getDocument` 传 `verbosity: VerbosityLevel.ERRORS` **无效**——那时还没轮到读参数。

**现状**：**已知且接受**。它只影响渲染相关的兜底路径，而我们主进程只做文本抽取，功能不受影响。

**如果以后一定要消除**：升级 Node 到 ≥ 20.16，或安装可选依赖 `@napi-rs/canvas`（会引入约 10-20MB 的原生二进制，仅为了让日志变干净，不划算）。

**注意**：`pdfjs-dist` 并没有导出 `setVerbosityLevel`，别去找这个函数（试过，报 `(0 , setVerbosityLevel) is not a function`）。
---

## 四、PDF 解析（本项目的重灾区）

这一节记录的问题最值得反复阅读：它们**全部通过了单元测试**，是拿一篇真实论文跑验收时才暴露出来的。

### 4.1 双栏论文的左右栏文字被拼进同一行

**症状**

导入一篇双栏排版的真实论文后，段落文本出现两栏内容交替的乱码。最典型的证据在参考文献区：

```
[p6-b10] ... layer with atomic scale precision for interface engineering in [41] P. Xu, M. Neek-Amal, ...
                    ↑左栏正文的结尾                              ↑右栏参考文献的开头
```

以及 6 个参考文献编号被打乱混排：`[41] ... [42] ... [43] ... [44] ... [30] ... [45]`。

**辅助判据**：检查输出段落里 `bbox.x` 的分布。如果**整页所有段落的 x 都相同**，基本可以断定分栏失败。

**根因：算法顺序错了。**

```
错误：整页文本片段  →  按 y 合并成行  →  检测分栏
正确：整页文本片段  →  检测分栏  →  各栏内部按 y 合并成行
```

先按 y 合并，会把左右两栏**同一基线的文字焊进同一行**；此后分栏检测看到的每一行都从左边距开始，永远只能判成单栏。信息在第一步就已经丢了，后面无法挽回。

**修复**（涉及三个文件）

* `src/main/pdf/columns.ts`：新增 `detectGutter(items, pageWidth)`，**基于文本片段（而不是行）**找出栏缝；`columnOf(item, split)` 判定单个片段属于哪一栏。
* `src/main/pdf/lines.ts`：`buildLines` 改为先分栏、再在每栏内部按基线合并，输出顺序固定为"左栏读完再读右栏"，每行带上 `column` 标记。
* `src/main/pdf/blocks.ts`：`buildBlocks` 不再自己检测分栏，改为信任 `Line.column`，**每栏单独合并段落**，栏间按列号排序输出。

**验证**

```bash
npm run inspect -- "某篇论文.pdf"
```

盯着两处：第 2 页的段落是否出现两种不同的 x（左栏、右栏各一组），以及文末参考文献是否每条独立成段、编号连续。

修复前后对比（同一篇论文）：

```
修复前： [p6-b10] ... in [41] P. Xu, ...
修复后： [p6-b25] [41] P. Xu, M. Neek-Amal, S. D. Barber, ...
         [p6-b26] [42] F. Ling, W. Kang, H. Jing, ...
```

**预防**：任何"先做 A 再做 B"的管线，都要问一句——**A 会不会把 B 需要的信息破坏掉**。

### 4.2 分栏判据不能用"完全空白带"

**症状**

即使把顺序改对了，真实论文上分栏依然不生效（所有段落 x 仍相同）。原因是 `detectGutter` 返回 `null`。

**根因**：最初的判据是"在页面中段找一条**完全没有文字**的竖直空白带"。这在合成夹具上成立，在真实论文上**根本不成立**——标题、跨栏的大图、跨栏图注都会横穿栏缝，那条带子里永远有几条内容。

**关键动作：不要改阈值，先去测量真实数据。** 写一个临时脚本，对页面中段逐点统计"跨越该竖直线的文本片段数量"：

```
候选分界 x   跨越条目数
   296          37        ← 栏内（词与词之间也是空白，但文字本身跨越）
   300           8   ←── 栏缝
   304           8   ←──
   308           8   ←──
   312           8   ←──
   316          37        ← 栏内
```

**真正的信号是跨越数的骤降（37 → 8），不是"归零"。** 剩下那 8 条正是横跨两栏的标题和图。

**修复**：判据改成——在页面 30%~70% 的水平范围内逐点统计跨越数，取最小值所在的平台作为分界点；并要求①相对典型值有显著凹陷（最小值 < 中位数 × 0.5，否则判为单栏），②分界点左右两侧各至少包含 20% 的文本片段（否则判为单栏）。

**验证**：`tests/pdf/columns.test.ts` 覆盖了双栏、单栏、条目过少、一侧内容过少四种情况。

**预防**：**阈值必须由真实数据推导，不能拍脑袋。** 拍出来的阈值在合成数据上永远成立，在真实数据上永远可疑。

### 4.3 测试断言太弱导致缺陷逃逸

**症状**

64 个测试全部通过，但真实论文一跑就暴露出 4.1 的严重缺陷。

**根因**：那条测试的断言是

```ts
const text = blocks.map((b) => b.text).join('|')
expect(text.indexOf('LEFT 0')).toBeLessThan(text.indexOf('RIGHT 0'))
```

**在错误实现下这句话也成立**——因为左右栏被拼接进同一行后，"LEFT 0" 依然排在 "RIGHT 0" 前面。断言测不出想测的东西。

**修复**：断言必须能**区分正确实现与错误实现**。改成检查真正的性质：

```ts
// 1. 左右栏的内容不能出现在同一个段落里
for (const block of blocks) {
  if (block.text.includes('LEFT ')) expect(block.text).not.toContain('RIGHT ')
  if (block.text.includes('RIGHT ')) expect(block.text).not.toContain('LEFT ')
}

// 2. 左栏全部段落必须排在右栏之前
expect(Math.max(...leftIndexes)).toBeLessThan(Math.min(...rightIndexes))

// 3. 行数必须等于两栏行数之和（拼接会少一半）
expect(lines).toHaveLength(60)
```

新增的回归测试放在 `tests/pdf/lines.test.ts` 的「双栏页面」描述块里，共 3 条。

**预防**：写完一条断言，反问自己——**如果实现是错的，这条断言还会通过吗？** 如果答案是"会"，这条断言就是装饰品。这个坏味道在跨栏拼接、顺序、去重、分组这类场景里最容易出现。

---

## 五、提交与工作区卫生

### 5.1 大文件被误提交进 git

**症状**

`git commit` 的输出里出现了：

```
create mode 100644 Kagomelike Bands in GrapheneWSe2 ... .pdf
```

一次提交凭空多了 14MB，而且那是**已发表的论文原文**，不应该进入版本库。

**根因**：测试用的 PDF 直接放在仓库根目录，`.gitignore` 里没有任何 PDF 规则。用了 `git add -A` 就会一并纳入。

**修复**

```powershell
git rm --cached "某个论文.pdf"        # 从索引移除，磁盘文件保留
# 在 .gitignore 追加：*.pdf
git add -A
git commit --amend --no-edit          # 尚未推送，直接修正那次提交
```

**验证**：`git show --stat --oneline HEAD` 的清单里不应出现 `.pdf`；同时 `Test-Path` 确认磁盘上的文件还在。

**预防**：`git add -A` 之前先跑一次 `git status --short` 看一眼。项目里的 `*.pdf` 已经在 `.gitignore` 中。

### 5.2 沙箱不可用时的替代路径

见 1.1。要点三条：所有命令走沙箱外通道、文件用 here-string + UTF-8 无 BOM 写入、不要派子代理。

---

## 六、这套流程里真正管用的排查方法

按有用程度排序：

1. **先把真实数据量出来，再改代码。** 4.2 那次，我按"空白带"的直觉改了两轮阈值都没用；写出跨越数分布表、看到 37→8 的骤降之后，正确的判据一眼就出来了。**直觉在数值证据面前必须先让路。**

2. **拿真实文档做验收，不要只用合成夹具。** 合成 PDF 是按我的假设生成的，只能验证"我想到的情况"。真实论文的排版特性（跨栏标题、跨栏大图、多子图图注）系统性地位于假设之外。本次 4.1 和 4.2 两个缺陷，合成测试全绿。

3. **断言要能区分正确与错误实现。** 见 4.3。测试全绿不等于功能正确，只等于"没测到点子上"。

4. **警惕静默失败。** preload 路径写错（2.3）不会有任何报错，只是 `window.api` 变成 undefined。凡是"某个能力整体消失了但没报错"，先怀疑加载路径、构建产物名、模块解析。

5. **区分"已知可接受"与"待修问题"。** 3.3 那三条 pdf.js 警告是第三方库在旧 Node 上的环境噪音，功能无影响——把它记成已知问题并写清触发条件，比为了"日志干净"引入 20MB 原生依赖划算。但**必须记录下来**，否则下次会有人重新查一遍。

6. **修复要留证据和留测试。** 每次修完，在 `npm run inspect` 的输出里留一段前后对比，并补一条能抓住它的回归测试。没有回归测试的修复，下次会原样复发。