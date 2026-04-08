# Wellbin Code

[![GitHub](https://img.shields.io/badge/GitHub-binbin--persister%2FWellbin--Code-181717?style=flat-square&logo=github)](https://github.com/binbin-persister/Wellbin-Code)
[![Bun](https://img.shields.io/badge/runtime-Bun-000000?style=flat-square&logo=bun)](https://bun.sh/)

**Wellbin Code** is a terminal‑native AI coding assistant CLI: REPL, tools, MCP, sessions, and supporting infrastructure. Configure models and extensions in your own environment.

| Resource | Link |
|----------|------|
| Source | [github.com/binbin-persister/Wellbin-Code](https://github.com/binbin-persister/Wellbin-Code) |
| Docs site | [ccb.agent-aura.top](https://ccb.agent-aura.top/) — sources under [`docs/`](docs/) |

---

## Highlights

- **Build & run**: Bun‑based dev workflow; chunked build; runs on Bun and Node.js.
- **Auth & models**: `/login` for custom endpoints; config via env and `~/.claude/settings.json`.
- **Feature flags**: `FEATURE_<NAME>=1` — see [`docs/features/`](docs/features/).
- **Tests & scripts**: see `tests/` and `package.json`.

---

## Prerequisites

- **[Bun](https://bun.sh/)** ≥ 1.3.11 (prefer latest stable; run `bun upgrade`).
- You supply model endpoints, keys, and network access; comply with your provider’s terms.

---

## Quick start

```bash
bun install
```

```bash
bun run dev
bun run build
```

Artifacts are written under `dist/` (`dist/cli.js` plus chunks). See the docs site for build details.

---

## First-time setup: `/login`

Run `/login` in the REPL and fill in API base URLs and model IDs. Example `env` keys (names follow common compatible conventions):

| Field | Description | Example |
|-------|-------------|---------|
| Base URL | API root | `https://api.example.com/v1` |
| API Key | Secret | `sk-xxx` |
| Model IDs | Per tier | Per your provider |

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

## Feature flags

```bash
FEATURE_BUDDY=1 FEATURE_FORK_SUBAGENT=1 bun run dev
```

See [`docs/features/`](docs/features/) and the [docs site](https://ccb.agent-aura.top/).

---

## VS Code debugging (attach)

1. Run `bun run dev:inspect` in a terminal.
2. Set breakpoints under `src/`, press **F5**, choose **Attach to Bun (TUI debug)**.

---

## Issues & security

- **Issues**: [github.com/binbin-persister/Wellbin-Code/issues](https://github.com/binbin-persister/Wellbin-Code/issues)
- **Security**: [`SECURITY.md`](SECURITY.md)

---

## License

See [`LICENSE`](LICENSE) in this repository (if present).
