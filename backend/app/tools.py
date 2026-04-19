import os
from typing import Any

import httpx


GLPI_API_URL = os.getenv("GLPI_API_URL")
GLPI_APP_TOKEN = os.getenv("GLPI_APP_TOKEN")
GLPI_USER_TOKEN = os.getenv("GLPI_USER_TOKEN")

ESTADOS_GLPI = {
    1: "Nuevo",
    2: "En curso (Asignado)",
    3: "En curso (Planificado)",
    4: "En espera",
    5: "Resuelto",
    6: "Cerrado",
}


async def iniciar_sesion_glpi() -> str:
    headers = {
        "App-Token": GLPI_APP_TOKEN,
        "Authorization": f"user_token {GLPI_USER_TOKEN}",
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(f"{GLPI_API_URL}/initSession", headers=headers)
        response.raise_for_status()
        return response.json().get("session_token")


async def funcionRevisarTicket(args: dict[str, Any]) -> dict[str, Any]:
    tipo = args.get("tipo", "ultimo")
    ticket_id = args.get("ticket_id")

    if not GLPI_API_URL or not GLPI_APP_TOKEN or not GLPI_USER_TOKEN:
        return {"ok": False, "error": "Faltan credenciales de GLPI en .env"}

    try:
        session_token = await iniciar_sesion_glpi()
        headers = {
            "App-Token": GLPI_APP_TOKEN,
            "Session-Token": session_token,
        }

        async with httpx.AsyncClient(timeout=30.0) as client:
            if tipo == "por_id" and ticket_id:
                response = await client.get(f"{GLPI_API_URL}/Ticket/{ticket_id}", headers=headers)

                if response.status_code == 200:
                    data = response.json()
                    estado_num = data.get("status")
                    estado_texto = ESTADOS_GLPI.get(estado_num, f"Desconocido ({estado_num})")
                    titulo = data.get("name", "Sin titulo")
                    resumen = f"El ticket #{ticket_id} ('{titulo}') se encuentra en estado: {estado_texto}."
                else:
                    resumen = f"No se pudo encontrar el ticket #{ticket_id} en GLPI."
            else:
                response = await client.get(f"{GLPI_API_URL}/Ticket?sort=id&order=DESC&range=0-1", headers=headers)

                if response.status_code == 200 and len(response.json()) > 0:
                    data = response.json()[0]
                    t_id = data.get("id")
                    estado_num = data.get("status")
                    estado_texto = ESTADOS_GLPI.get(estado_num, f"Desconocido ({estado_num})")
                    titulo = data.get("name", "Sin titulo")
                    resumen = f"Tu ultimo ticket registrado es el #{t_id} ('{titulo}'), el cual esta en estado: {estado_texto}."
                else:
                    resumen = "No se encontraron tickets en el sistema."

            await client.get(f"{GLPI_API_URL}/killSession", headers=headers)

        return {"ok": True, "resumen": resumen, "args": args}

    except Exception as e:
        return {"ok": False, "error": f"Error de conexion con GLPI: {str(e)}"}


async def funcionCrearTicket(args: dict[str, Any]) -> dict[str, Any]:
    titulo = args.get("titulo", "Ticket creado por IA")
    descripcion = args.get("descripcion", "Generado desde el asistente virtual.")

    if not GLPI_API_URL or not GLPI_APP_TOKEN or not GLPI_USER_TOKEN:
        return {"ok": False, "error": "Faltan credenciales de GLPI en .env"}

    try:
        session_token = await iniciar_sesion_glpi()
        headers = {
            "App-Token": GLPI_APP_TOKEN,
            "Session-Token": session_token,
            "Content-Type": "application/json",
        }

        payload = {
            "input": {
                "name": titulo,
                "content": descripcion,
            }
        }

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(f"{GLPI_API_URL}/Ticket", headers=headers, json=payload)
            await client.get(f"{GLPI_API_URL}/killSession", headers=headers)

        if response.status_code not in (200, 201):
            return {
                "ok": False,
                "error": f"Hubo un problema al crear el ticket en GLPI. Codigo: {response.status_code}. Respuesta: {response.text[:500]}",
                "args": args,
            }

        data = response.json()
        ticket_id = data.get("id")
        if not ticket_id:
            return {
                "ok": False,
                "error": "GLPI respondio sin error, pero no devolvio el ID del ticket creado.",
                "args": args,
                "glpi_response": data,
            }

        resumen = f"Se ha creado exitosamente el ticket #{ticket_id} con el titulo '{titulo}'."
        return {"ok": True, "resumen": resumen, "args": args, "ticket_id": ticket_id}

    except Exception as e:
        return {"ok": False, "error": f"Error de conexion con GLPI: {str(e)}"}


async def funcionSolicitarCambioCurso(args: dict[str, Any]) -> dict[str, Any]:
    programa = args.get("programa", "TalentoTech")
    curso_actual = args.get("curso_actual", "No especificado")
    curso_deseado = args.get("curso_deseado", "No especificado")
    resumen = (
        f"Se ha generado la solicitud de cambio de curso en {programa} "
        f"de '{curso_actual}' a '{curso_deseado}'. Seras notificado por correo."
    )
    return {"ok": True, "resumen": resumen, "args": args}


async def funcionEstadoTalentoTech(args: dict[str, Any]) -> dict[str, Any]:
    tipo = args.get("tipo", "inicio")
    if tipo == "inscripcion":
        resumen = "Tu inscripcion a TalentoTech esta confirmada."
    else:
        resumen = "Tu curso de TalentoTech esta programado para iniciar pronto."
    return {"ok": True, "resumen": resumen, "args": args}
