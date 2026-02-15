from fastapi import APIRouter
from pydantic import BaseModel
import json

from .llm_client import chat_completion
from .intents import guess_intent, extract_inline_function_call
from . import tools

router = APIRouter()


class ChatIn(BaseModel):
    message: str


@router.post("/chat")
async def chat(payload: ChatIn):
    user_text = payload.message.strip()
    hint = guess_intent(user_text)

    # 1) Preguntamos al modelo
    try:
        model_text = await chat_completion(user_text, hint_intent=hint)
    except Exception:
        return {
            "mode": "error",
            "request": user_text,
            "error": "No se pudo consultar el modelo. Verifica LLM_API_KEY/LLM_BASE_URL/LLM_MODEL en .env.",
        }

    # 2) Intentamos parsear una tool_call en JSON
    tool_result = None
    try:
        data = json.loads(model_text)
        tool_call = data.get("tool_call") if isinstance(data, dict) else None
        if tool_call:
            name = tool_call.get("name")
            args = tool_call.get("arguments", {})
            tool_result = await run_tool(name, args)
            return {
                "mode": "tool_call(json)",
                "request": user_text,
                "model_raw": model_text,
                "tool_result": tool_result,
            }
    except Exception:
        pass

    # 3) Si el modelo respondió tipo funcionXxx(), también lo soportamos
    inline = extract_inline_function_call(model_text)
    if inline:
        tool_result = await run_tool(inline, {})
        return {
            "mode": "tool_call(inline)",
            "request": user_text,
            "model_raw": model_text,
            "tool_result": tool_result,
        }

    # 4) Respuesta normal (texto)
    return {
        "mode": "text",
        "request": user_text,
        "reply": model_text,
    }


async def run_tool(name: str, args: dict):
    mapping = {
        "funcionRevisarTicket": tools.funcionRevisarTicket,
        "funcionSolicitarCambioCurso": tools.funcionSolicitarCambioCurso,
        "funcionEstadoTalentoTech": tools.funcionEstadoTalentoTech,
    }
    fn = mapping.get(name)
    if not fn:
        return {"ok": False, "error": f"Función no soportada: {name}"}
    return fn(args)
