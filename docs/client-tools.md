# Client Tools Sandbox Guide

This document describes the Client Tools sandbox module (`src/modules/client-tools`) in Antigravity Manager. It provides an interactive testing, evaluation, and execution workbench for Large Language Model (LLM) function calling and client-side tool execution against local proxy endpoints or remote AI providers.

## 1. Overview and Purpose

When building agentic workflows or integrating applications with LLMs that support function calling (e.g., OpenAI Function Calling, Anthropic Tool Use, Gemini Function Declarations), developers frequently need to:

- Author and validate JSON Schema tool parameter definitions.
- Inspect the exact wire payloads sent to and returned by the model.
- Test multi-turn conversational tool execution (User -> Assistant tool call -> Client execution -> Tool result -> Assistant final response).
- Measure request latency, Time To First Token (TTFT), and token consumption.
- Reproduce requests directly via generated `cURL` commands.

The Client Tools module provides a dedicated UI view (`/client-tools`) and execution engine inside Antigravity Manager to fulfill these needs.

## 2. Architecture & Components

```plaintext
Renderer UI (/client-tools)
   │
   ├── ClientToolsConfigPanel    (Model, endpoint, temperature, protocol, tool selection)
   ├── ClientToolsChatArea       (Multi-turn messages, reasoning blocks, tool call cards)
   │     └── ToolCallCard        (Argument display, status indicators, execution output)
   ├── ClientToolsInspector      (Request/response payload tree, headers, curl export)
   └── ToolDefinitionDialog      (JSON Schema editor and validation)
   │
   ▼
Client Tools Runner (src/modules/client-tools/services/client-tools-runner.ts)
   │
   ├── Protocol Normalizer (OpenAI / Anthropic / Gemini tool formatting)
   ├── HTTP/SSE Client (Streaming delta accumulator, timing tracker)
   └── Tool Execution Dispatcher (Mock handlers for preset and custom functions)
```

### Component Distribution

| Component                | Path                                                             | Responsibility                                                                                                                 |
| :----------------------- | :--------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------- |
| `ClientToolsPage`        | `src/modules/client-tools/components/ClientToolsPage.tsx`        | Main split-pane workspace layout coordinating chat, inspector, and config state.                                               |
| `ClientToolsConfigPanel` | `src/modules/client-tools/components/ClientToolsConfigPanel.tsx` | Target gateway URL, API key selection, model identifier, protocol selector, and temperature controls.                          |
| `ClientToolsChatArea`    | `src/modules/client-tools/components/ClientToolsChatArea.tsx`    | Chat timeline rendering user prompts, assistant reasoning, and interactive tool call executions.                               |
| `ToolCallCard`           | `src/modules/client-tools/components/ToolCallCard.tsx`           | Collapsible card showing tool call status (`pending`, `executing`, `success`, `error`), JSON arguments, and execution outputs. |
| `ToolDefinitionDialog`   | `src/modules/client-tools/components/ToolDefinitionDialog.tsx`   | Modal dialog for authoring new tool declarations with real-time JSON Schema validation.                                        |
| `ClientToolsInspector`   | `src/modules/client-tools/components/ClientToolsInspector.tsx`   | Tabbed raw payload viewer, HTTP response headers, metrics overview, and one-click cURL export.                                 |
| `client-tools-runner`    | `src/modules/client-tools/services/client-tools-runner.ts`       | Execution runner dispatching requests to proxy gateway and handling client execution loop.                                     |

## 3. Supported Protocols

The runner automatically transforms tool definitions and chat histories into protocol-compliant shapes:

1. **OpenAI (`protocol: 'openai'`)**:
   - Tools mapped to `tools: [{ type: "function", function: { name, description, parameters } }]`.
   - Tool calls received as `tool_calls: [{ id, type: "function", function: { name, arguments } }]`.
   - Tool results sent with `role: "tool"`, `tool_call_id: id`, `content: string`.

2. **Anthropic (`protocol: 'anthropic'`)**:
   - Tools mapped to `tools: [{ name, description, input_schema }]`.
   - Tool calls received as content blocks of type `tool_use`.
   - Tool results returned as content blocks of type `tool_result`.

3. **Gemini (`protocol: 'gemini'`)**:
   - Tools mapped to `functionDeclarations`.
   - Tool calls handled via `functionCall` parts.
   - Tool responses returned via `functionResponse` parts.

## 4. Built-in Preset Tools

The module includes standard tool definitions in `src/modules/client-tools/presets/default-tools.ts`:

- **`get_current_weather`**: Simulates weather queries for specified cities, supporting temperature unit preference.
- **`calculator`**: Safely evaluates mathematical arithmetic expressions.
- **`search_web`**: Demonstrates simulated search results with title, URL, and snippet outputs.

Users can add custom tools through the `ToolDefinitionDialog`, which validates that the parameters conform to valid JSON Schema objects.

## 5. Metrics and Diagnostics

Each interaction tracks and displays:

- **Status Code & Message**: HTTP status returned by the target gateway.
- **Duration**: Total round-trip time in milliseconds.
- **Time To First Token (TTFT)**: Latency until the first SSE chunk arrives during streaming.
- **Token Usage**: Prompt tokens, completion tokens, reasoning tokens (if present), and total token count.
- **cURL Reproduction**: Complete, copyable cURL command matching the exact wire payload.
