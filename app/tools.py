from typing import Dict, Any

def funcionRevisarTicket(args: Dict[str, Any]) -> Dict[str, Any]:
    tipo = args.get("tipo", "ultimo")
    ticket_id = args.get("ticket_id")
    if tipo == "por_id" and ticket_id:
        resumen = f"El ticket #{ticket_id} fue resuelto. Se espera tu retroalimentación en TOOLI."
    else:
        resumen = "Tu último ticket fue resuelto exitosamente. Se espera tu retroalimentación en TOOLI."
    return {"ok": True, "resumen": resumen, "args": args}

def funcionSolicitarCambioCurso(args: Dict[str, Any]) -> Dict[str, Any]:
    programa = args.get("programa", "TalentoTech")
    curso_actual = args.get("curso_actual", "No especificado")
    curso_deseado = args.get("curso_deseado", "No especificado")
    resumen = (f"Se ha generado la solicitud de cambio de curso en {programa} "
               f"de '{curso_actual}' a '{curso_deseado}'. Serás notificado por correo institucional.")
    return {"ok": True, "resumen": resumen, "args": args}

def funcionEstadoTalentoTech(args: Dict[str, Any]) -> Dict[str, Any]:
    tipo = args.get("tipo", "inicio")
    if tipo == "inscripcion":
        resumen = "Tu inscripción a TalentoTech está confirmada. Recibirás el cronograma por correo."
    else:
        resumen = "Tu curso de TalentoTech está programado; el inicio se notificará en los próximos días."
    return {"ok": True, "resumen": resumen, "args": args}
