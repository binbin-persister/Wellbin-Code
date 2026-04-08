# Wellbin Code

[![GitHub](https://img.shields.io/badge/GitHub-binbin--persister%2FWellbin--Code-181717?style=flat-square&logo=github)](https://github.com/binbin-persister/Wellbin-Code)
[![Bun](https://img.shields.io/badge/runtime-Bun-000000?style=flat-square&logo=bun)](https://bun.sh/)

**Wellbin Code** 是面向终端的智能编程助手 CLI：提供 REPL、工具调用、MCP、会话与工程化能力，可在本地或自建环境中配置模型与扩展。

| 资源 | 链接 |
|------|------|
| 源码 | [github.com/binbin-persister/Wellbin-Code](https://github.com/binbin-persister/Wellbin-Code) |
| 文档站点 | [ccb.agent-aura.top](https://ccb.agent-aura.top/)（内容位于 [`docs/`](docs/)） |

---

## 功能概览

- **构建与运行**：Bun 开发、分块构建；产物可在 Bun / Node 下运行。
- **登录与模型**：`/login` 支持自定义平台与兼容接口；配置见环境变量与 `~/.claude/settings.json`。
- **特性开关**：`FEATURE_<NAME>=1`（详见 [`docs/features/`](docs/features/)）。
- **测试与脚本**：见 `tests/` 与 `package.json` 中的脚本。

---

## 环境要求

- **[Bun](https://bun.sh/)** ≥ 1.3.11（建议使用最新稳定版并执行 `bun upgrade`）。
- 模型服务、API 密钥与网络由你自行准备；请遵守所使用服务端点的条款。

---

## 快速开始

```bash
bun install
```

```bash
bun run dev
bun run build
```

构建输出位于 `dist/`（入口 `dist/cli.js` 及 chunk）。详见文档站点中的构建说明。

---

## 首次配置：`/login`

在 REPL 中执行 `/login`，按界面填写 API 地址与模型 ID。以下为配置文件中常见字段示例（名称与兼容实现保持一致即可）：

| 字段 | 说明 | 示例 |
|------|------|------|
| Base URL | API 根地址 | `https://api.example.com/v1` |
| API Key | 密钥 | `sk-xxx` |
| 模型 ID | 各档位模型 | 以服务商文档为准 |

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "https://api.example.com/v1",
    "ANTHROPIC_AUTH_TOKEN": "sk-xxx",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL": "claude-haiku-4-5-20251001",
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "claude-sonnet-4-6",
    "ANTHROPIC_DEFAULT_OPUS_MODEL": "claude-opus-4-6"
  }
}
```

---

## Feature Flags

```bash
FEATURE_BUDDY=1 FEATURE_FORK_SUBAGENT=1 bun run dev
```

说明见 [`docs/features/`](docs/features/) 与[文档站点](https://ccb.agent-aura.top/)。

---

## VS Code 调试（Attach）

1. 终端执行：`bun run dev:inspect`
2. VS Code 对 `src/` 断点，**F5** → **Attach to Bun (TUI debug)**

---

## 问题与安全

- **Issue**：[github.com/binbin-persister/Wellbin-Code/issues](https://github.com/binbin-persister/Wellbin-Code/issues)
- **安全策略**：见 [`SECURITY.md`](SECURITY.md)

---

## 许可证

以仓库内 [`LICENSE`](LICENSE) 为准（若存在）。
