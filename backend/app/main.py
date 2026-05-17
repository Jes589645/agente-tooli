import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .router import router

app = FastAPI(title="Agente TOOLI-UTB (API)")

# Permitir peticiones desde el frontend Next.js
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)


@app.get("/healthz")
async def health():
    return {"ok": True, "model": os.getenv("LLM_MODEL", "unknown")}