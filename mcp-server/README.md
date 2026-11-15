# Mock Exam MCP Server

A minimal [Model Context Protocol](https://modelcontextprotocol.io) server
for practicing MCP. It exposes one tool, `get_random_question`, which
returns a full multiple-choice practice question — question text, all
answer options, the correct option id(s), a per-option explanation, and an
overall summary — picked at random from `questions.json`.

This is a standalone project, separate from the Vite app in the repo root.
It serves the first question bank it finds:

1. the file named by the `MOCK_EXAM_QUESTIONS` environment variable, if set;
2. the web app's bank, `../src/data/questions.json`, so the two never drift apart;
3. `questions.json` next to `server.py`, for running the server outside this repo.

The bank is validated at startup, and the server refuses to start if a question
is malformed (for example, a correct answer that isn't one of the options).

## Setup

```bash
python -m venv .venv
./.venv/Scripts/pip install -r requirements.txt   # Windows
# source .venv/bin/activate && pip install -r requirements.txt   # macOS/Linux
```

## Run

```bash
./.venv/Scripts/python server.py   # Windows
# .venv/bin/python server.py       # macOS/Linux
```

The server listens on `http://127.0.0.1:8765/mcp` using the Streamable
HTTP transport. It is local-only (bound to `127.0.0.1`) and has no
authentication — this is a local practice project, not meant to be exposed
beyond your machine.

Leave it running in a terminal while you use it. Stop with `Ctrl+C`.

## Connect a client

Any MCP client that supports Streamable HTTP servers can connect using the
URL above. Example configs:

**Claude Desktop / Claude Code** (`claude_desktop_config.json` or
`.mcp.json`):

```json
{
  "mcpServers": {
    "mock-exam": {
      "type": "http",
      "url": "http://127.0.0.1:8765/mcp"
    }
  }
}
```

**Cursor** (`.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "mock-exam": {
      "url": "http://127.0.0.1:8765/mcp"
    }
  }
}
```

## Test it manually with MCP Inspector

No config needed, good for debugging while developing:

```bash
npx @modelcontextprotocol/inspector
```

Open the printed URL, choose transport type `Streamable HTTP`, enter
`http://127.0.0.1:8765/mcp` as the URL, connect, then call
`get_random_question` from the Tools tab.

## Tool reference

### `get_random_question`

All arguments are optional:

| Argument | Type | Effect |
|---|---|---|
| `question_id` | string | Return this specific question instead of a random one. |
| `multi_answer_only` | boolean | Pick only select-all-that-apply questions. |
| `exclude_ids` | string[] | Skip these ids, e.g. questions already asked in this quiz. |

Returns:

```json
{
  "id": "q001",
  "question": "...",
  "options": [
    { "id": "A", "text": "...", "explanation": "..." },
    { "id": "B", "text": "...", "explanation": "..." }
  ],
  "correct_option_ids": ["B"],
  "summary": "..."
}
```

`correct_option_ids` has one entry for single-answer questions and two or
more for select-all-that-apply questions.
