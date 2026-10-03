# Antigravity Manager Documentation

Antigravity Manager is an Electron desktop application with a React renderer and an embedded NestJS/Fastify proxy gateway that provides unified account switching, quota monitoring, and AI protocol routing for Antigravity IDE and cloud providers.

This directory contains authoritative technical documentation for contributors and AI agents.

## Documentation Index

### Core Architecture & Strategy

| Document | Purpose | Audience |
| --- | --- | --- |
| [architecture.md](architecture.md) | Authoritative runtime topology, process boundaries, IPC model, and dependency directions | All contributors & agents |
| [development.md](development.md) | Contributor setup, build prerequisites, environment rules, and routine commands | New contributors |
| [testing.md](testing.md) | Test strategy, change-to-evidence selection matrix, focused commands, and full rehearsals | All contributors |
| [security.md](security.md) | Security zones, credential handling, keyring storage, SQLite safety, and high-risk boundaries | Backend & persistence work |
| [AGENTS.md](AGENTS.md) | Documentation governance, placement rules, and writing constraints | Writers & agents |

### Developer Guides

| Document | Purpose |
| --- | --- |
| [client-tools.md](client-tools.md) | Interactive developer sandbox for LLM function calling, JSON-schema inspection, and chat simulation |
| [feature-development-guide.md](feature-development-guide.md) | End-to-end recipe for creating or extending a feature module in `src/modules/` |
| [proxy-gateway-guide.md](proxy-gateway-guide.md) | Architecture, protocol mappers (OpenAI, Anthropic, Gemini), streaming, context caching, and testing for the embedded proxy gateway |
| [openai-api-compatibility.md](openai-api-compatibility.md) | Dated OpenAI route matrix, authentication scopes, deviations, extensions, retention, and client examples |
| [mcp-setup.md](mcp-setup.md) | Setup and usage instructions for Model Context Protocol (MCP) servers with Antigravity, Claude, and Cursor |

### Feature & Subsystem References

| Document | Description |
| --- | --- |
| [cloud_features.md](cloud_features.md) | Cloud account pools, quota monitoring, family groups, auto-switching, emulation, and weekly warmup |
| [memory-leak-performance-audit.md](memory-leak-performance-audit.md) | Memory leak audit findings, renderer/main process resource profiles, and leak prevention patterns |
| [proxy-compatibility.md](proxy-compatibility.md) | Protocol compatibility edge-cases, Responses history normalization, tool configs, and context caching |
| [proxyman-debugging.md](proxyman-debugging.md) | Troubleshooting proxy traffic with Proxyman on Windows and macOS |
| [proxyman-install.md](proxyman-install.md) | Installation and certificate setup for local Proxyman interception |

## Quick Navigation: "What Are You Doing?"

- **Adding a new UI view or IPC capability?** Read [architecture.md](architecture.md) and follow [feature-development-guide.md](feature-development-guide.md).
- **Adding or modifying AI model routing, tool calling, or streaming in the proxy?** Read [proxy-compatibility.md](proxy-compatibility.md) and [proxy-gateway-guide.md](proxy-gateway-guide.md).
- **Modifying database schemas, keyring secrets, or auth tokens?** Read [security.md](security.md) and [architecture.md](architecture.md).
- **Verifying changes?** Use the matrix in [testing.md](testing.md) and run `npm run check:governance`.
- **Configuring MCP tools for faster coding and symbol lookup?** Read [mcp-setup.md](mcp-setup.md).
