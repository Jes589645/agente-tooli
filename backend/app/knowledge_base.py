import json
import os
import re
import unicodedata
from functools import lru_cache
from typing import Any


DATA_PATH = os.path.join(os.path.dirname(__file__), "data", "knowledge_base.json")

STOPWORDS = {
    "a",
    "al",
    "algo",
    "aun",
    "como",
    "con",
    "de",
    "del",
    "el",
    "en",
    "es",
    "esta",
    "este",
    "la",
    "lo",
    "los",
    "me",
    "mi",
    "no",
    "para",
    "pero",
    "por",
    "que",
    "se",
    "si",
    "sin",
    "todos",
    "una",
    "un",
    "y",
    "ya",
}


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


def get_knowledge_by_id(knowledge_id: str | None) -> dict[str, Any] | None:
    if not knowledge_id:
        return None
    for item in load_items():
        if item.get("id") == knowledge_id:
            ticket_policy = item.get("ticket_policy", {})
            return {
                "ok": True,
                "id": item.get("id"),
                "title": item.get("title"),
                "category": item.get("category"),
                "service": item.get("service"),
                "requires_ticket": bool(ticket_policy.get("requires_ticket", item.get("requires_ticket", False))),
                "reply": build_reply(item),
                "item": item,
                "score": 999,
            }
    return None


def search_knowledge(user_text: str) -> dict[str, Any] | None:
    query = _normalize(user_text)
    if not query:
        return None

    query_tokens = _tokens(query)
    if not query_tokens:
        return None

    best: tuple[int, dict[str, Any]] | None = None

    for item in load_items():
        haystack_parts = [
            str(item.get("title", "")),
            str(item.get("category", "")),
            str(item.get("service", "")),
            " ".join(str(keyword) for keyword in item.get("keywords", [])),
            " ".join(str(example) for example in item.get("user_problem_examples", [])),
        ]
        haystack = _normalize(" ".join(haystack_parts))
        score = 0

        for keyword in item.get("keywords", []):
            normalized_keyword = _normalize(str(keyword))
            if normalized_keyword and normalized_keyword in query:
                score += 4

        haystack_tokens = _tokens(haystack)
        score += len(query_tokens & haystack_tokens)

        if score > 0 and (best is None or score > best[0]):
            best = (score, item)

    if best is None:
        return None

    score, item = best
    if score < 3:
        return None

    reply = build_reply(item)
    ticket_policy = item.get("ticket_policy", {})

    return {
        "ok": True,
        "id": item.get("id"),
        "title": item.get("title"),
        "category": item.get("category"),
        "service": item.get("service"),
        "requires_ticket": bool(ticket_policy.get("requires_ticket", item.get("requires_ticket", False))),
        "reply": reply,
        "item": item,
        "score": score,
    }


def build_reply(item: dict[str, Any]) -> str:
    sections = [str(item.get("answer", "")).strip()]

    steps = _as_text_list(item.get("self_service_steps"))
    if steps:
        sections.append("Pasos que puedes intentar:\n" + "\n".join(f"- {step}" for step in steps))

    next_questions = _as_text_list(item.get("next_questions"))
    if next_questions:
        sections.append("Para ayudarte mejor:\n" + "\n".join(f"- {question}" for question in next_questions[:3]))

    return "\n\n".join(section for section in sections if section)


def _as_text_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item).strip() for item in value if str(item).strip()]


def _tokens(value: str) -> set[str]:
    return {token for token in re.findall(r"[a-z0-9]+", value) if token not in STOPWORDS and len(token) > 2}


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
        "crealo",
        "genera un ticket",
        "abre un ticket",
    )
    return any(phrase in text for phrase in confirmations)


def has_resolution_attempt(user_text: str) -> bool:
    text = _normalize(user_text)
    attempts = (
        "ya intente",
        "ya lo intente",
        "hice los pasos",
        "segui los pasos",
        "no funciono",
        "no me funciono",
        "sigue igual",
        "persiste",
        "no se soluciono",
        "no pude resolver",
        "me sigue saliendo",
    )
    return any(phrase in text for phrase in attempts)


def ticket_deflection_reply() -> str:
    return (
        "Antes de crear un ticket, necesito intentar resolverlo con la base de conocimiento de TOOLI. "
        "Cuentalo como una solicitud normal: que paso, en que servicio ocurre y que necesitas lograr. "
        "Si despues de la orientacion no queda resuelto, puedo ayudarte a escalarlo a GLPI."
    )
