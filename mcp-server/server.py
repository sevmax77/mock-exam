"""Mock Exam MCP Server.

Exposes a single tool, `get_random_question`, that returns a full multiple
choice question (question text, options, correct answer id(s), per-option
explanations, and an overall summary) picked at random from a local
question bank (questions.json).

Run it with:

    python server.py

It listens on http://127.0.0.1:8765/mcp using the Streamable HTTP
transport, so any MCP-compatible client/agent on this machine can connect
to that URL and call the tool.
"""

from __future__ import annotations

import json
import random
from pathlib import Path
from typing import Any

from mcp.server.mcpserver import MCPServer

# --- Configuration -----------------------------------------------------

HOST = "127.0.0.1"
PORT = 8765
DATA_FILE = Path(__file__).parent / "questions.json"

# --- Load question bank once at startup ---------------------------------

with DATA_FILE.open("r", encoding="utf-8") as f:
    QUESTIONS: list[dict[str, Any]] = json.load(f)

if not QUESTIONS:
    raise RuntimeError(f"No questions found in {DATA_FILE}")

# --- MCP server -----------------------------------------------------------

mcp = MCPServer(
    name="mock-exam",
    instructions=(
        "Provides practice exam questions from a mock-exam question bank. "
        "Use the get_random_question tool to fetch one question at a time."
    ),
)


@mcp.tool(
    name="get_random_question",
    description=(
        "Return one randomly selected practice exam question, including the "
        "full question text, all answer options, the correct option id(s), "
        "a per-option explanation of why it is or is not correct, and an "
        "overall summary. Some questions have exactly one correct option "
        "(single-answer) and some have two or more (select-all-that-apply); "
        "check the length of correct_option_ids to tell which kind it is."
    ),
)
def get_random_question() -> dict[str, Any]:
    question = random.choice(QUESTIONS)
    return {
        "id": question["id"],
        "question": question["question"],
        "options": [
            {
                "id": option["id"],
                "text": option["text"],
                "explanation": option["explanation"],
            }
            for option in question["options"]
        ],
        "correct_option_ids": question["correctOptionIds"],
        "summary": question["summary"],
    }


if __name__ == "__main__":
    mcp.run(transport="streamable-http", host=HOST, port=PORT)
