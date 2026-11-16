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
import os
import random
from pathlib import Path
from typing import Any

from mcp.server.mcpserver import MCPServer

# --- Configuration -----------------------------------------------------

HOST = "127.0.0.1"
PORT = 8765
SERVER_DIR = Path(__file__).parent


def resolve_data_file() -> Path:
    """Pick the question bank to serve.

    The web app's bank (../src/data/questions.json) is the only copy, so the
    app and this server always serve the same questions. Set the
    MOCK_EXAM_QUESTIONS env var to serve a different file.
    """
    override = os.environ.get("MOCK_EXAM_QUESTIONS")
    path = (
        Path(override).expanduser().resolve()
        if override
        else SERVER_DIR.parent / "src" / "data" / "questions.json"
    )

    if not path.is_file():
        raise RuntimeError(
            f"Question bank not found: {path}. "
            "Run the server from the mock-exam repo or set MOCK_EXAM_QUESTIONS."
        )

    return path


def validate_questions(questions: Any, source: Path) -> list[dict[str, Any]]:
    """Fail at startup, not on a random tool call, if the bank has the wrong shape."""
    if not isinstance(questions, list) or not questions:
        raise RuntimeError(f"{source} must contain a non-empty JSON array of questions")

    errors: list[str] = []
    for index, question in enumerate(questions, start=1):
        label = question.get("id", f"#{index}") if isinstance(question, dict) else f"#{index}"
        if not isinstance(question, dict):
            errors.append(f"{label}: not an object")
            continue
        for field in ("id", "question", "options", "correctOptionIds"):
            if field not in question:
                errors.append(f"{label}: missing '{field}'")
        options = question.get("options") or []
        option_ids = {option.get("id") for option in options if isinstance(option, dict)}
        if len(options) < 2:
            errors.append(f"{label}: needs at least 2 options")
        for option in options:
            if not isinstance(option, dict) or "id" not in option or "text" not in option:
                errors.append(f"{label}: every option needs 'id' and 'text'")
                break
        for answer_id in question.get("correctOptionIds") or []:
            if answer_id not in option_ids:
                errors.append(f"{label}: correct answer '{answer_id}' is not an option")
        if not question.get("correctOptionIds"):
            errors.append(f"{label}: no correct answer")

    if errors:
        shown = "\n  ".join(errors[:20])
        more = f"\n  ... and {len(errors) - 20} more" if len(errors) > 20 else ""
        raise RuntimeError(f"Invalid question bank {source}:\n  {shown}{more}")

    return questions


# --- Load question bank once at startup ---------------------------------

DATA_FILE = resolve_data_file()

with DATA_FILE.open("r", encoding="utf-8") as f:
    QUESTIONS: list[dict[str, Any]] = validate_questions(json.load(f), DATA_FILE)

QUESTIONS_BY_ID = {question["id"]: question for question in QUESTIONS}

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
        "check the length of correct_option_ids to tell which kind it is. "
        "Optional arguments: question_id to fetch one specific question, "
        "multi_answer_only to pick only select-all-that-apply questions, "
        "exclude_ids to avoid repeating questions already asked in this quiz, "
        "and topic to pick only questions with that topic (case-insensitive). "
        "The result's topic is an empty string when the question has none."
    ),
)
def get_random_question(
    question_id: str | None = None,
    multi_answer_only: bool = False,
    exclude_ids: list[str] | None = None,
    topic: str | None = None,
) -> dict[str, Any]:
    if question_id:
        question = QUESTIONS_BY_ID.get(question_id)
        if question is None:
            raise ValueError(f"No question with id '{question_id}'")
    else:
        excluded = set(exclude_ids or [])
        wanted_topic = (topic or "").strip().lower()
        candidates = [
            q
            for q in QUESTIONS
            if q["id"] not in excluded
            and (not multi_answer_only or len(q["correctOptionIds"]) > 1)
            and (not wanted_topic or str(q.get("topic", "")).strip().lower() == wanted_topic)
        ]
        if not candidates:
            raise ValueError("No questions match the given filters")
        question = random.choice(candidates)

    return {
        "id": question["id"],
        "question": question["question"],
        "options": [
            {
                "id": option["id"],
                "text": option["text"],
                "explanation": option.get("explanation", ""),
            }
            for option in question["options"]
        ],
        "correct_option_ids": question["correctOptionIds"],
        "summary": question.get("summary", ""),
        "topic": question.get("topic", ""),
    }


if __name__ == "__main__":
    mcp.run(transport="streamable-http", host=HOST, port=PORT)
