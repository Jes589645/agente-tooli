import os
from fastapi import FastAPI
from .router import router

app = FastAPI(title="Agente TOOLI-UTB (MVP)")
app.include_router(router)

@app.get("/healthz")
async def health():
    return {"ok": True, "model": os.getenv("LLM_MODEL", "unknown")}
