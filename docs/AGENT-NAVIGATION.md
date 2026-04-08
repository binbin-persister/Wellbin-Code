# Wellbin Code — Agent 代码定位手册

本文档面向自动化 Agent 与人类维护者，目标是在 **不先通读数千个文件** 的前提下，快速判断「该改哪里、先读哪条链路」。下文路径均相对于 **CLI 源码仓库根目录**（本文件位于 `docs/AGENT-NAVIGATION.md`）。本地克隆目录名可能是 `claude-code`、`wellbin-code` 等，阅读时将路径接到你的实际根目录之后即可。

---

## 1. 建议阅读顺序（首次上手）

| 顺序 | 路径 | 说明 |
|------|------|------|
| 1 | `README.md` / `README_EN.md` | 项目定位、安装、`bun run dev` / `build` |
| 2 | `docs/introduction/architecture-overview.mdx` | 五层架构与主数据流（与下文第 3 节一致） |
| 3 | `src/entrypoints/cli.tsx` | CLI 入口：各类 **fast-path** 子命令后再进入 `main` |
| 4 | `src/main.tsx` | 完整 CLI：`commander`、初始化、`export async function main()` |
| 5 | `src/entrypoints/init.ts` | 启动初始化：配置、遥测、OAuth、策略等 |
| 6 | `src/query.ts` | Agentic 循环（单轮请求 → 工具 → 跟进） |
| 7 | `src/QueryEngine.ts` | 会话编排、transcript、与 `query()` 的衔接 |
| 8 | `src/tools.ts` + `src/Tool.ts` | 工具注册与 `Tool` 接口 |
| 9 | `src/services/api/` | 与各 Provider 的通信层 |

---

## 2. 启动链路（从进程到 TUI）

```
Bun 执行
  → src/entrypoints/cli.tsx
       • 仅 --version 等极轻路径
       • 多种子命令 / MCP / bridge / daemon / bg session 等 fast-path（动态 import）
       • 默认路径：import ../main.jsx（解析为 main.tsx）→ main()
  → src/main.tsx
       • Commander 解析、信任/登录、GrowthBook、策略、MCP 预取等
       • 交互 UI、REPL 等（与 Ink/React 相关模块）
  → src/entrypoints/init.ts（被 main 侧拉起的初始化逻辑）
```

**定位技巧**：在 `cli.tsx` 里搜 `import(` 可列出所有 **按需加载** 的模块边界；搜 `profileCheckpoint` 可对齐启动阶段。

---

## 3. 分层与核心文件（与官方文档对齐）

下列与 `docs/introduction/architecture-overview.mdx` 中的「五层架构」一致，并标注 **仓库内主路径**（优先读 `src/` 根下文件，而非嵌套副本）。

| 层次 | 职责 | 主入口文件 |
|------|------|------------|
| 交互层 | 终端 UI、输入、消息展示 | `src/screens/REPL.tsx`，输入处理 `src/utils/processUserInput/` |
| 编排层 | 多轮会话、transcript、成本 | `src/QueryEngine.ts` |
| 核心循环 | 单轮：模型 → 工具 → 是否继续 | `src/query.ts` |
| 工具层 | 工具列表与权限 | `src/tools.ts`，接口 `src/Tool.ts`，实现 `src/tools/<Name>Tool/` |
| 通信层 | 流式 API、多 Provider | `src/services/api/`（如 `client.ts`、各 provider 子目录） |

**注意**：`src/cli/src/QueryEngine.ts` 等路径可能是历史/嵌套副本；**优先以 `src/` 根下同名文件为准**，除非任务明确针对 `cli` 子树。

---

## 4. `src/` 一级目录速查

以下为 `src/` 下 **第一层目录** 的职责摘要（按字母相关度分组）。

| 目录 | 用途 |
|------|------|
| `assistant/` | KAIROS 等助理模式（受 `feature('KAIROS')` 等控制） |
| `bootstrap/` | 全局状态、会话入口相关状态机 |
| `bridge/` | Remote control / bridge 模式 |
| `buddy/` | Buddy 相关 UI/逻辑 |
| `cli/` | CLI 子模块、部分与主流程重复的嵌套源码（见第 10 节） |
| `commands/` | 各子命令实现（`login`、`mcp`、`plugin`、`resume` 等），体量较大 |
| `components/` | 可复用 Ink/React 组件 |
| `constants/` | 产品名、OAuth、提示词片段等 |
| `context/` | 上下文与统计等 |
| `coordinator/` | Coordinator 模式（`feature('COORDINATOR_MODE')`） |
| `daemon/` | `wellbin daemon` 与子进程 worker |
| `entrypoints/` | `cli.tsx`、`init.ts`、`mcp.ts` 等入口 |
| `environment-runner/` | BYOC `environment-runner` 子命令 |
| `hooks/` | 用户 hooks 集成 |
| `ink/` | 终端底层、termio、主题与 Ink 扩展 |
| `jobs/` | 任务/作业相关 |
| `keybindings/` | 快捷键 |
| `memdir/` | Memory 目录与持久化相关 |
| `migrations/` | 数据/配置迁移 |
| `moreright/` | 项目内特定功能模块 |
| `native-ts/` | 与 native 交互的 TS 封装 |
| `outputStyles/` | 输出样式 |
| `plugins/` | 插件系统与内置插件 |
| `proactive/` | 主动式任务相关 |
| `query/` | 查询管线辅助（如 stop hooks） |
| `remote/` | 远程会话相关 |
| `schemas/` | JSON Schema / 校验 |
| `screens/` | 大屏/流程屏（含 `REPL.tsx`） |
| `self-hosted-runner/` | self-hosted runner 子命令 |
| `server/` | 本地 server、连接 URL 解析（如 `parseConnectUrl`） |
| `services/` | **业务服务层**：API、MCP、OAuth、策略、LSP、分析等 |
| `skills/` | Skills 内置与加载 |
| `ssh/` | `wellbin ssh` 远程会话 |
| `state/` | 全局/会话状态 |
| `tasks/` | Task 子系统与 UI 部分 |
| `tools/` | **各 Tool 实现目录**（每工具一子文件夹居多） |
| `types/` | 共享类型 |
| `upstreamproxy/` | 上游代理 |
| `utils/` | **最大目录**：配置、终端、遥测、模型、权限、工具辅助等 |
| `vim/` | Vim 模式 |
| `voice/` | `/voice` 相关 |
| `__tests__/` | 源码旁测试（若有） |

---

## 5. 工具（Tools）如何定位

- **注册与组装**：`src/tools.ts`（含 `getTools` / `getAllBaseTools` 等，以及大量条件 `require` + `feature()`）。
- **接口与结果类型**：`src/Tool.ts`。
- **单个工具实现**：`src/tools/<ToolName>/`（例如 `BashTool/`、`FileReadTool/`、`WebSearchTool/`）。
- **与架构文档配套**：`docs/tools/*.mdx`（按场景分类）。

新增或修改工具时：**先改 `Tool` 实现目录，再在 `tools.ts` 中注册**，并检查是否受 `feature('...')` 或 `USER_TYPE === 'ant'` 等条件限制。

---

## 6. 服务层 `src/services/` 子目录

| 子目录 | 说明 |
|--------|------|
| `api/` | HTTP/流式客户端、各云厂商与 OpenAI 兼容等 |
| `mcp/` | MCP 客户端、官方 registry、工具/命令聚合 |
| `oauth/` | 登录与 token |
| `policyLimits/` | 组织策略与远程控制开关 |
| `remoteManagedSettings/` | 远程托管设置 |
| `lsp/` | LSP 管理 |
| `analytics/` | GrowthBook、事件上报 |
| `plugins/` | 与服务端插件相关的逻辑 |
| `SessionMemory` / `sessionTranscript` / `compact` 等 | 会话记忆与压缩 |

**搜索提示**：`services/mcp/client.ts` 与 MCP 工具暴露、权限相关条目常被引用。

---

## 7. 配置、环境变量与特性开关

| 机制 | 位置 |
|------|------|
| 构建入口 | `build.ts`：入口 `src/entrypoints/cli.tsx`，`Bun.build` + `splitting`，`FEATURE_*` 环境变量合并进 `features` |
| 构建期宏 | `scripts/defines.ts`：`MACRO.VERSION` 等，`getMacroDefines()` |
| 开发启动 | `scripts/dev.ts`：带 `-d MACRO_*` 与默认 `--feature` 列表启动 `cli.tsx` |
| 运行时特性 | `bun:bundle` 的 `feature('NAME')` 在源码中广泛使用；与 `FEATURE_NAME=1` 联动 |

修改默认启用功能：**对比 `build.ts` 的 `DEFAULT_BUILD_FEATURES` 与 `scripts/dev.ts` 的 `DEFAULT_FEATURES`**。

---

## 8. Monorepo 包（`packages/`）

| 路径 | 说明 |
|------|------|
| `packages/*-napi` | 原生 NAPI：`audio-capture`、`color-diff`、`image-processor`、`modifiers`、`url-handler` |
| `packages/@ant/*` | Chrome MCP、Computer Use MCP/输入/Swift 等 |

根 `package.json` 的 `workspaces` 指向 `packages/*` 与 `packages/@ant/*`。

---

## 9. 测试与质量

| 位置 | 说明 |
|------|------|
| `tests/integration/` | 集成测试（如 `tool-chain`、`message-pipeline`、`context-build`、`cli-arguments`） |
| `tests/mocks/` | 文件系统与 API mock |
| `src/**/__tests__/` | 部分模块旁单元测试（分散） |
| `bun test` | `package.json` scripts |

专项测试计划：`docs/test-plans/`。

---

## 10. 重复与嵌套源码（避免改错文件）

仓库中存在 **多份同名或镜像目录**（历史与打包结构导致），例如：

- 多处 `**/src/entrypoints/agentSdkTypes.ts`
- `src/cli/src/` 下与顶层 `src/` 部分重复

**默认原则**：以 **`src/` 根目录下、被 `main.tsx` / `cli.tsx` / `build.ts` 直接 import 的文件** 为准；若发现两处逻辑不一致，以入口链路上实际加载的为准。

---

## 11. 路径别名

`tsconfig.json`：

```json
"paths": { "src/*": ["./src/*"] }
```

因此 import 中常见 `src/services/...` 与相对路径 `../services/...` 混用，**指向同一套 `src/` 树**。

---

## 12. 常见任务 → 建议检索路径

| 任务 | 先去 |
|------|------|
| 新子命令或修改 CLI 参数 | `src/main.tsx`（Commander）、`src/commands/` |
| 改一轮对话与工具循环 | `src/query.ts`、`src/QueryEngine.ts` |
| 新工具或工具权限 | `src/tools/<Name>/`、`src/tools.ts`、`src/Tool.ts` |
| 改模型路由 / API | `src/services/api/`、`src/utils/model/` |
| MCP 连接与工具注入 | `src/services/mcp/`、`src/tools/MCPTool/` |
| 终端 UI / 渲染 | `src/screens/`、`src/components/`、`src/ink/` |
| 登录与 OAuth | `src/services/oauth/`、`src/utils/auth.ts` |
| 遥测 / Sentry / OTEL | `src/utils/telemetry/`、`src/utils/sentry.ts` |
| Bridge / 远程控制 | `src/bridge/`、`cli.tsx` 中 `remote-control` 分支 |
| Daemon / 后台会话 | `src/daemon/`、`cli.tsx` 中 `daemon` / `--daemon-worker` |
| 文档站点（Mintlify） | `docs/`、`mint.json` |

---

## 13. 相关文档（站内）

- 架构：`docs/introduction/architecture-overview.mdx`
- 对话循环：`docs/conversation/*.mdx`
- 工具总览：`docs/tools/*.mdx`
- 特性说明：`docs/features/*.md` / `*.mdx`
- 内部机制：`docs/internals/*.mdx`

---

## 14. 版本与元数据

- 包版本见根目录 `package.json` 的 `version`。
- `MACRO.VERSION` 在 `scripts/defines.ts` 中维护（与 README 中「开发模式看到 888」等说明一致）。

---

*文档生成说明：本文件依据仓库目录结构与入口文件分析整理；若重构移动了入口，请同步更新第 2 节与第 12 节中的路径。*
