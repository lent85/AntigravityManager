# Model Context Protocol (MCP) Setup & Integration Guide

This guide explains how to configure and utilize [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) tools when developing in the Antigravity Manager codebase.

## 1. Overview

MCP enables AI coding agents (Antigravity, Claude Code, Cursor, Windsurf, VS Code) to interact with external tools, AST indexers, and local databases safely. Using MCP tools reduces context clutter and prevents slow, repetitive text searches.

---

## 2. Recommended MCP Servers

The repository includes a template configuration in [.mcp.json](../.mcp.json). The following MCP servers are recommended for Antigravity Manager contributors:

### 1. CodeGraph (`@sourcegraph/codegraph` or local CLI)

- **Purpose**: Deep symbol exploration, callers/callees tracking, and dynamic dispatch traversal.
- **When to Use**: When `.codegraph/` exists in the repository root, call `codegraph_explore` or use the CLI (`codegraph explore "<symbol>"`) before falling back to ripgrep or file reading.
- **Advantage**: Returns exact symbol source and call chains without reading entire large source files.

### 2. SQLite MCP (`@modelcontextprotocol/server-sqlite`)

- **Purpose**: Inspect local SQLite databases during debugging and feature implementation.
- **Target Databases**:
  - Antigravity IDE local user state: `%APPDATA%/Antigravity/User/globalStorage/state.vscdb` (Windows) or `~/Library/Application Support/Antigravity/User/globalStorage/state.vscdb` (macOS).
  - Antigravity Manager local application database.
- **Safety Rule**: Use **read-only** mode (`readonly: true`) during development to prevent accidental corruption of user state.

### 3. Fetch / API Docs MCP

- **Purpose**: Query documentation for external dependencies such as React 19, Tailwind CSS v4, TanStack Router, NestJS, and Electron.

---

## 3. Configuration

### Workspace Configuration (`.mcp.json`)

Place `.mcp.json` at the repository root or link it in your client settings:

```json
{
  "mcpServers": {
    "sqlite-antigravity": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-sqlite",
        "--db-path",
        "${APPDATA}/Antigravity/User/globalStorage/state.vscdb"
      ],
      "disabled": false
    },
    "fetch": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-fetch"],
      "disabled": false
    }
  }
}
```

> [!NOTE]
> Adjust paths according to your operating system (`%APPDATA%` on Windows, `~/Library/Application Support/` on macOS).

---

## 4. MCP Best Practices for AI Agents

1. **Symbol Search Priority**:
   - Use CodeGraph, Codanna, or Serena MCP tools to locate classes, interfaces, and function callers before grepping across the entire `src/` directory.
2. **Database Verification**:
   - When diagnosing migration or account snapshot issues, use the SQLite MCP to run `SELECT` queries on table schemas and metadata instead of writing scratch scripts.
3. **Gateway Verification**:
   - Use fetch/curl tools to verify local proxy endpoints (`http://127.0.0.1:<port>/v1/models`) during manual testing.

---

## 5. Antigravity Manager MCP Roadmap

As Antigravity Manager matures, the embedded NestJS gateway can act as an MCP Server for external agents:

- **Account & Quota Tool**: Allow IDE agents to check remaining quota before launching heavy tasks.
- **Account Switcher Tool**: Allow agents to request an automatic account rotation when rate limits are approached.
- **Proxy Diagnostic Tool**: Provide real-time health checks and latency statistics for connected AI providers.
