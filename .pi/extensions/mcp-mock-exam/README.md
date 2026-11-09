# Mock Exam MCP Client Extension (for pi)

Connects pi to the local [`mock-exam` MCP server](../../../mcp-server) and
exposes its `get_random_question` tool as a native pi tool named
`mock_exam_question`.

pi has no built-in MCP client, so this extension is a small, purpose-built
MCP HTTP client using the official `@modelcontextprotocol/sdk` TypeScript
client. It connects lazily on first tool call, reuses the connection, and
reports a clear error if the server isn't running.

## Prerequisites

The MCP server must be running separately before you use the tool:

```bash
cd ../../../mcp-server
./.venv/Scripts/python server.py    # Windows
```

## Setup

```bash
cd .pi/extensions/mcp-mock-exam
npm install
```

Auto-discovered as a project-local extension (`.pi/extensions/*/index.ts`),
so it loads automatically once this project is trusted by pi. Use
`/reload` after editing `index.ts`.

For a quick one-off test without relying on auto-discovery:

```bash
pi -e ./.pi/extensions/mcp-mock-exam/index.ts
```

## Usage

Inside pi, just ask it to quiz you, e.g.:

> Give me a random mock exam question.

pi will call `mock_exam_question`, which fetches a question from the MCP
server and returns the full question, options, correct answer id(s),
explanations, and summary.

Check connectivity any time with:

```
/mock-exam-status
```

## Configuration

Server URL defaults to `http://127.0.0.1:8765/mcp`. Override with the
`MOCK_EXAM_MCP_URL` environment variable if you run the server on a
different host/port.
