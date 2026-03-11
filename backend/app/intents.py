import re
from typing import Optional, Dict

FUNC_PATTERN = re.compile(r"funcion([A-Za-z]+)\s*\(", re.IGNORECASE)

def guess_intent(user_text: str) -> Optional[str]:
    text = user_text.lower()
    
    if "crear" in text and "ticket" in text:
        return "funcionCrearTicket"
        
    if "último ticket" in text or "ultimo ticket" in text or "estado de mi ticket" in text:
        return "funcionRevisarTicket"
    if "cambiar" in text and "curso" in text and "talentotech" in text:
        return "funcionSolicitarCambioCurso"
    if "talentotech" in text and ("empieza" in text or "inicio" in text):
        return "funcionEstadoTalentoTech"
    return None

def extract_inline_function_call(model_text: str) -> Optional[str]:
    m = FUNC_PATTERN.search(model_text or "")
    if m:
        return f"funcion{m.group(1)}"
    return None