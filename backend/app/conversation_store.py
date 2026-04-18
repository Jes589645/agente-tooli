import json
import os
import uuid
from datetime import datetime, timezone
from typing import Any, Literal


DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
LOG_PATH = os.path.join(DATA_DIR, "conversation_sessions.jsonl")

Role = Literal["user", "assistant", "system"]

_sessions: dict[str, list[dict[str, Any]]] = {}


def ensure_session_id(session_id: str | None) -> str:
    clean_session_id = (session_id or "").strip()
    if clean_session_id:
        return clean_session_id
    return str(uuid.uuid4())


def append_message(
    session_id: str,
    role: Role,
    content: str,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    os.makedirs(DATA_DIR, exist_ok=True)
    entry = {
        "session_id": session_id,
        "role": role,
        "content": content,
        "metadata": metadata or {},
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    _sessions.setdefault(session_id, []).append(entry)

    with open(LOG_PATH, "a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")

    return entry


def get_recent_messages(session_id: str, limit: int = 8) -> list[dict[str, str]]:
    entries = _sessions.get(session_id, [])
    recent = entries[-limit:]
    return [
        {
            "role": "assistant" if item["role"] == "assistant" else "user",
            "content": str(item.get("content", "")),
        }
        for item in recent
        if item.get("role") in ("user", "assistant") and item.get("content")
    ]
