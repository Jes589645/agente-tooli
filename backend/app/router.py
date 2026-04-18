from fastapi import APIRouter
from pydantic import BaseModel
import json

from .conversation_store import append_message, ensure_session_id, get_recent_messages
from .llm_client import chat_completion
from .intents import guess_intent, extract_inline_function_call
from .knowledge_base import (
    has_escalation_confirmation,
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
    append_message(session_id, "user", user_text)
    hint = guess_intent(user_text)

    # 1) La base de conocimiento es la primera fuente de respuesta.
    kb_match = search_knowledge(user_text)
    if kb_match and not has_escalation_confirmation(user_text):
        reply = kb_match["reply"]
        append_message(session_id, "assistant", reply, {"mode": "knowledge_base", "knowledge_id": kb_match["id"]})
        return {
            "mode": "knowledge_base",
            "session_id": session_id,
            "request": user_text,
            "reply": reply,
            "knowledge": kb_match,
        }

    if is_ticket_creation_request(user_text) and not has_escalation_confirmation(user_text):
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
