from fastapi import APIRouter
from pydantic import BaseModel
import json

from .conversation_store import append_message, ensure_session_id, get_recent_entries, get_recent_messages
from .llm_client import chat_completion
from .intents import guess_intent, extract_inline_function_call
from .knowledge_base import (
    get_knowledge_by_id,
    has_escalation_confirmation,
    has_resolution_attempt,
    is_ticket_creation_request,
    search_knowledge,
    ticket_deflection_reply,
)
from . import tools

router = APIRouter()


class ChatIn(BaseModel):
    message: str
    session_id: str | None = None


@router.post("/chat")
async def chat(payload: ChatIn):
    user_text = payload.message.strip()
    session_id = ensure_session_id(payload.session_id)
    history = get_recent_messages(session_id)
    history_entries = get_recent_entries(session_id)
    append_message(session_id, "user", user_text)
    hint = guess_intent(user_text)

    # 1) La base de conocimiento es la primera fuente de respuesta.
    prior_kb_match = get_last_knowledge_match(history_entries)
    is_resolution_follow_up = has_resolution_attempt(user_text) and prior_kb_match is not None
    kb_match = prior_kb_match if is_resolution_follow_up else search_knowledge(user_text)
    ticket_requested = is_ticket_creation_request(user_text)
    can_create_ticket = ticket_requested and (
        has_escalation_confirmation(user_text)
        or has_resolution_attempt(user_text)
        or has_prior_knowledge_answer(history_entries)
    )

    if can_create_ticket:
        args = build_ticket_args(user_text, kb_match or prior_kb_match, history_entries)
        tool_result = await run_tool("funcionCrearTicket", args)
        reply = format_tool_reply(tool_result)
        append_message(session_id, "assistant", reply, {"mode": "tool_call(direct)", "tool_name": "funcionCrearTicket"})
        return {
            "mode": "tool_call(direct)",
            "session_id": session_id,
            "request": user_text,
            "tool_result": tool_result,
        }

    if is_resolution_follow_up and prior_kb_match:
        reply = build_escalation_offer(prior_kb_match)
        append_message(session_id, "assistant", reply, {"mode": "escalation_offer", "knowledge_id": prior_kb_match["id"]})
        return {
            "mode": "escalation_offer",
            "session_id": session_id,
            "request": user_text,
            "reply": reply,
            "knowledge": public_knowledge(prior_kb_match),
        }

    if kb_match:
        reply = kb_match["reply"]
        append_message(session_id, "assistant", reply, {"mode": "knowledge_base", "knowledge_id": kb_match["id"]})
        return {
            "mode": "knowledge_base",
            "session_id": session_id,
            "request": user_text,
            "reply": reply,
            "knowledge": public_knowledge(kb_match),
        }

    if ticket_requested:
        reply = ticket_deflection_reply()
        append_message(session_id, "assistant", reply, {"mode": "needs_resolution_first"})
        return {
            "mode": "needs_resolution_first",
            "session_id": session_id,
            "request": user_text,
            "reply": reply,
        }

    # 2) Preguntamos al modelo.
    try:
        model_text = await chat_completion(user_text, hint_intent=hint, conversation_history=history)
    except Exception:
        error = "No se pudo consultar el modelo. Verifica LLM_API_KEY/LLM_BASE_URL/LLM_MODEL en .env."
        append_message(session_id, "assistant", error, {"mode": "error"})
        return {
            "mode": "error",
            "session_id": session_id,
            "request": user_text,
            "error": error,
        }

    # 3) Intentamos parsear una tool_call en JSON.
    tool_result = None
    try:
        data = json.loads(model_text)
        tool_call = data.get("tool_call") if isinstance(data, dict) else None
        if tool_call:
            name = tool_call.get("name")
            if name == "funcionCrearTicket" and not has_escalation_confirmation(user_text):
                reply = ticket_deflection_reply()
                append_message(session_id, "assistant", reply, {"mode": "needs_resolution_first"})
                return {
                    "mode": "needs_resolution_first",
                    "session_id": session_id,
                    "request": user_text,
                    "model_raw": model_text,
                    "reply": reply,
                }
            args = tool_call.get("arguments", {})
            tool_result = await run_tool(name, args)
            reply = format_tool_reply(tool_result)
            append_message(session_id, "assistant", reply, {"mode": "tool_call(json)", "tool_name": name})
            return {
                "mode": "tool_call(json)",
                "session_id": session_id,
                "request": user_text,
                "model_raw": model_text,
                "tool_result": tool_result,
            }
    except Exception:
        pass

    # 4) Si el modelo respondio tipo funcionXxx(), tambien lo soportamos.
    inline = extract_inline_function_call(model_text)
    if inline:
        if inline == "funcionCrearTicket" and not has_escalation_confirmation(user_text):
            reply = ticket_deflection_reply()
            append_message(session_id, "assistant", reply, {"mode": "needs_resolution_first"})
            return {
                "mode": "needs_resolution_first",
                "session_id": session_id,
                "request": user_text,
                "model_raw": model_text,
                "reply": reply,
            }
        tool_result = await run_tool(inline, {})
        reply = format_tool_reply(tool_result)
        append_message(session_id, "assistant", reply, {"mode": "tool_call(inline)", "tool_name": inline})
        return {
            "mode": "tool_call(inline)",
            "session_id": session_id,
            "request": user_text,
            "model_raw": model_text,
            "tool_result": tool_result,
        }

    # 5) Respuesta normal (texto).
    if claims_ticket_created(model_text):
        model_text = (
            "No puedo confirmar la creacion de un ticket porque GLPI no devolvio un ID de ticket. "
            "Si ya intentaste la solucion y quieres escalar el caso, dime: abre un ticket."
        )
    append_message(session_id, "assistant", model_text, {"mode": "text"})
    return {
        "mode": "text",
        "session_id": session_id,
        "request": user_text,
        "reply": model_text,
    }


async def run_tool(name: str, args: dict):
    mapping = {
        "funcionRevisarTicket": tools.funcionRevisarTicket,
        "funcionCrearTicket": tools.funcionCrearTicket,
        "funcionSolicitarCambioCurso": tools.funcionSolicitarCambioCurso,
        "funcionEstadoTalentoTech": tools.funcionEstadoTalentoTech,
    }
    fn = mapping.get(name)
    if not fn:
        return {"ok": False, "error": f"Funcion no soportada: {name}"}
    return await fn(args)


def format_tool_reply(tool_result: dict | None) -> str:
    if not tool_result:
        return "No se recibio respuesta de la accion solicitada."
    if tool_result.get("ok"):
        return str(tool_result.get("resumen") or "Accion completada.")
    return str(tool_result.get("error") or "Error al ejecutar la accion.")


def has_prior_knowledge_answer(entries: list[dict]) -> bool:
    return any(entry.get("metadata", {}).get("mode") == "knowledge_base" for entry in entries)


def get_last_knowledge_match(entries: list[dict]) -> dict | None:
    for entry in reversed(entries):
        metadata = entry.get("metadata", {})
        if metadata.get("mode") in ("knowledge_base", "escalation_offer"):
            match = get_knowledge_by_id(metadata.get("knowledge_id"))
            if match:
                return match
    return None


def build_escalation_offer(kb_match: dict) -> str:
    item = kb_match.get("item") or {}
    title = kb_match.get("title") or "este caso"
    sections = [
        f"Entiendo. Como ya intentaste los pasos sugeridos para {title}, puedo ayudarte a escalar el caso a soporte."
    ]

    required_data = item.get("required_data")
    if isinstance(required_data, list) and required_data:
        data_lines = [str(data).strip() for data in required_data if str(data).strip()]
        if data_lines:
            sections.append("Para crear el ticket, comparte estos datos si los tienes:\n" + "\n".join(f"- {data}" for data in data_lines))

    sections.append("Cuando quieras que lo radique, dime: abre un ticket.")
    return "\n\n".join(sections)


def public_knowledge(kb_match: dict) -> dict:
    return {
        "ok": kb_match.get("ok"),
        "id": kb_match.get("id"),
        "title": kb_match.get("title"),
        "category": kb_match.get("category"),
        "service": kb_match.get("service"),
        "requires_ticket": kb_match.get("requires_ticket"),
        "score": kb_match.get("score"),
    }


def build_ticket_args(user_text: str, kb_match: dict | None, entries: list[dict]) -> dict[str, str]:
    if kb_match:
        title = f"Solicitud TOOLI - {kb_match.get('title') or kb_match.get('category') or 'Soporte'}"
    else:
        clean_text = " ".join(user_text.split())
        title = f"Solicitud TOOLI - {clean_text[:80] or 'Soporte'}"

    context_lines = []
    for entry in entries[-6:]:
        role = "Usuario" if entry.get("role") == "user" else "TOOLI"
        content = " ".join(str(entry.get("content", "")).split())
        if content:
            context_lines.append(f"{role}: {content[:600]}")

    description_parts = [
        f"El usuario solicita escalar el caso a GLPI desde TOOLI.",
        f"Mensaje actual: {user_text}",
    ]
    if kb_match:
        description_parts.append(f"Caso sugerido por base de conocimiento: {kb_match.get('title')} ({kb_match.get('id')}).")
        if kb_match.get("service"):
            description_parts.append(f"Servicio relacionado: {kb_match.get('service')}.")
    if context_lines:
        description_parts.append("Contexto reciente de la conversacion:\n" + "\n".join(context_lines))

    return {
        "titulo": title,
        "descripcion": "\n\n".join(description_parts),
    }


def claims_ticket_created(text: str) -> bool:
    normalized = " ".join(text.lower().split())
    creation_words = (
        "ticket creado",
        "se creo el ticket",
        "se ha creado",
        "ticket registrado",
        "se registro el ticket",
        "ticket radicado",
        "se radico",
    )
    return "ticket" in normalized and any(word in normalized for word in creation_words)
