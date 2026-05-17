.ENV SETUP

# =========================
# AGENTE-TOOLI ROOT CONFIG
# Fill in every value before deploying.
# This file is consumed by the backend, frontend, and docker-compose setup.
# =========================

# -------------------------
# LLM / AI provider
# Required for backend chat responses.
# Example providers: OpenAI-compatible endpoint, Groq, etc.
# -------------------------

LLM_API_KEY=
LLM_BASE_URL=https://api.groq.com/openai/v1
LLM_MODEL=llama-3.1-8b-instant
MAX_TOKENS=512

# -------------------------
# Backend / API
# CORS origins for local and deployed frontend URLs.
# Separate multiple values with commas.
# -------------------------
ALLOWED_ORIGINS=

# -------------------------
# Supabase
# Required by the Next.js frontend auth flow.
# -------------------------
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_ALLOWED_EMAIL_DOMAIN=


# -------------------------
# GLPI integration
# Fill these to connect TOOLI to GLPI.
# -------------------------

GLPI_API_URL=
GLPI_APP_TOKEN=
GLPI_USER_TOKEN=
