import os, json, httpx
from typing import Dict, Any

BASE_URL = os.getenv("LLM_BASE_URL", "https://api.groq.com/openai/v1")
API_KEY = os.getenv("LLM_API_KEY", "")
MODEL   = os.getenv("LLM_MODEL", "llama-3.1-8b-instant")
TEMPERATURE = float(os.getenv("TEMPERATURE", "0.2"))
TOP_P = float(os.getenv("TOP_P", "0.9"))
MAX_TOKENS = int(os.getenv("MAX_TOKENS", "512"))

SYSTEM_PROMPT_PATH = os.path.join(os.path.dirname(__file__), "prompts", "system_tooli.txt")
with open(SYSTEM_PROMPT_PATH, "r", encoding="utf-8") as f:
    SYSTEM_PROMPT = f.read()

async def chat_completion(user_text: str, hint_intent: str | None = None) -> str:
    """
    Llama a un endpoint OpenAI-compatible (p.ej., Groq) para obtener la salida del modelo.
    """
    headers = {"Authorization": f"Bearer {API_KEY}"}
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    if hint_intent:
        messages.append({
            "role": "user",
            "content": f"(Pista de intención: {hint_intent})"
        })
    messages.append({"role": "user", "content": user_text})

    payload = {
        "model": MODEL,
        "messages": messages,
        "temperature": TEMPERATURE,
        "top_p": TOP_P,
        "max_tokens": MAX_TOKENS
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        r = await client.post(f"{BASE_URL}/chat/completions", headers=headers, json=payload)
    r.raise_for_status()
    data = r.json()
    return data["choices"][0]["message"]["content"]
