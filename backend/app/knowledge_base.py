import json
import os
import re
import unicodedata
from functools import lru_cache
from typing import Any


DATA_PATH = os.path.join(os.path.dirname(__file__), "data", "knowledge_base.json")


def _normalize(value: str) -> str:
    ascii_text = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"\s+", " ", ascii_text.lower()).strip()


@lru_cache(maxsize=1)
def load_items() -> list[dict[str, Any]]:
    with open(DATA_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, list):
        return []
    return [item for item in data if isinstance(item, dict)]


def search_knowledge(user_text: str) -> dict[str, Any] | None:
    query = _normalize(user_text)
    if not query:
        return None

    query_tokens = set(re.findall(r"[a-z0-9]+", query))
    best: tuple[int, dict[str, Any]] | None = None

    for item in load_items():
        haystack_parts = [
            str(item.get("title", "")),
            str(item.get("category", "")),
            " ".join(str(keyword) for keyword in item.get("keywords", [])),
        ]
        haystack = _normalize(" ".join(haystack_parts))
        score = 0

        for keyword in item.get("keywords", []):
            normalized_keyword = _normalize(str(keyword))
            if normalized_keyword and normalized_keyword in query:
                score += 4

        haystack_tokens = set(re.findall(r"[a-z0-9]+", haystack))
        score += len(query_tokens & haystack_tokens)

        if score > 0 and (best is None or score > best[0]):
            best = (score, item)

    if best is None:
        return None

    score, item = best
    if score < 3:
        return None

    next_questions = item.get("next_questions", [])
    reply = str(item.get("answer", "")).strip()
    if next_questions:
        questions = "\n".join(f"- {question}" for question in next_questions[:3])
        reply = f"{reply}\n\nPara ayudarte mejor:\n{questions}"

    return {
        "ok": True,
        "id": item.get("id"),
        "title": item.get("title"),
        "category": item.get("category"),
        "requires_ticket": bool(item.get("requires_ticket", False)),
        "reply": reply,
        "score": score,
    }


def is_ticket_creation_request(user_text: str) -> bool:
    text = _normalize(user_text)
    return "ticket" in text and any(word in text for word in ("crear", "crea", "generar", "genera", "abrir", "abre"))


def has_escalation_confirmation(user_text: str) -> bool:
    text = _normalize(user_text)
    confirmations = (
        "confirmo crear ticket",
        "confirma crear ticket",
        "crear ticket de todos modos",
        "abre el ticket",
        "abrir el ticket",
        "genera el ticket",
        "generar el ticket",
        "si, crea el ticket",
        "si crea el ticket",
        "escalar a ticket",
    )
    return any(phrase in text for phrase in confirmations)


def ticket_deflection_reply() -> str:
    return (
        "Antes de crear un ticket, necesito intentar resolverlo con la base de conocimiento de TOOLI. "
        "Cuentalo como una solicitud normal: que paso, en que servicio ocurre y que necesitas lograr. "
        "Si despues de la orientacion no queda resuelto, puedo ayudarte a escalarlo a GLPI."
    )
