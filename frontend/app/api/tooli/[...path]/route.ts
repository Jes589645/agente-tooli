import { NextRequest, NextResponse } from 'next/server'
import knowledgeItems from '../../../../../backend/app/data/knowledge_base.json'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type KnowledgeItem = {
  id?: string
  title?: string
  category?: string
  service?: string
  keywords?: string[]
  user_problem_examples?: string[]
  answer?: string
  self_service_steps?: string[]
  required_data?: string[]
  ticket_policy?: {
    requires_ticket?: boolean
  }
}

type ChatPayload = {
  message?: string
  session_id?: string
  last_knowledge_id?: string
}

type KnowledgeMatch = {
  ok: boolean
  id?: string
  title?: string
  category?: string
  service?: string
  requires_ticket: boolean
  reply: string
  score: number
  item: KnowledgeItem
}

const STOPWORDS = new Set([
  'algo', 'aun', 'como', 'con', 'del', 'esta', 'este', 'los', 'para', 'pero',
  'por', 'que', 'sin', 'todos', 'una', 'intente', 'pasos', 'funciona',
  'no', 'ya', 'me', 'mi', 'un', 'la', 'el', 'en', 'de', 'se', 'si', 'y',
])

export async function GET(_request: NextRequest, context: { params: { path?: string[] } }) {
  const path = context.params.path || []
  if (path[0] === 'healthz') {
    return NextResponse.json({ ok: true, model: process.env.LLM_MODEL || 'knowledge-base' })
  }

  return NextResponse.json({ ok: false, error: 'Ruta no soportada' }, { status: 404 })
}

export async function POST(request: NextRequest, context: { params: { path?: string[] } }) {
  const path = context.params.path || []
  if (path[0] !== 'chat') {
    return NextResponse.json({ ok: false, error: 'Ruta no soportada' }, { status: 404 })
  }

  const payload = await request.json() as ChatPayload
  const userText = (payload.message || '').trim()
  const sessionId = payload.session_id || crypto.randomUUID()

  const previousKnowledge = getKnowledgeById(payload.last_knowledge_id)
  const isFollowUp = hasResolutionAttempt(userText) && previousKnowledge
  const kbMatch = isFollowUp ? previousKnowledge : searchKnowledge(userText)
  const ticketRequested = isTicketCreationRequest(userText)
  const canCreateTicket = ticketRequested && (
    hasEscalationConfirmation(userText) ||
    hasResolutionAttempt(userText) ||
    Boolean(previousKnowledge)
  )

  if (canCreateTicket) {
    const ticketResult = await createTicket(buildTicketArgs(userText, kbMatch || previousKnowledge))
    return NextResponse.json({
      mode: 'tool_call(direct)',
      session_id: sessionId,
      request: userText,
      tool_result: ticketResult,
    })
  }

  if (isFollowUp && previousKnowledge) {
    return NextResponse.json({
      mode: 'escalation_offer',
      session_id: sessionId,
      request: userText,
      reply: buildEscalationOffer(previousKnowledge),
      knowledge: publicKnowledge(previousKnowledge),
    })
  }

  if (kbMatch) {
    return NextResponse.json({
      mode: 'knowledge_base',
      session_id: sessionId,
      request: userText,
      reply: kbMatch.reply,
      knowledge: publicKnowledge(kbMatch),
    })
  }

  if (ticketRequested) {
    return NextResponse.json({
      mode: 'needs_resolution_first',
      session_id: sessionId,
      request: userText,
      reply: 'Antes de crear un ticket, necesito intentar resolverlo con la base de conocimiento de TOOLI. Cuentalo como una solicitud normal: que paso, en que servicio ocurre y que necesitas lograr. Si despues de la orientacion no queda resuelto, puedo ayudarte a escalarlo a GLPI.',
    })
  }

  return NextResponse.json({
    mode: 'text',
    session_id: sessionId,
    request: userText,
    reply: 'Bienvenido a la asistencia de TOOLI de la Universidad Tecnologica de Bolivar. Describe el servicio o problema y te orientare con la base de conocimiento disponible.',
  })
}

function searchKnowledge(userText: string): KnowledgeMatch | null {
  const query = normalize(userText)
  const queryTokens = tokens(query)
  if (!query || queryTokens.size === 0) return null

  let best: { score: number; item: KnowledgeItem } | null = null

  for (const item of knowledgeItems as KnowledgeItem[]) {
    const haystack = normalize([
      item.title || '',
      item.category || '',
      item.service || '',
      ...(item.keywords || []),
      ...(item.user_problem_examples || []),
    ].join(' '))

    let score = 0
    for (const keyword of item.keywords || []) {
      const normalizedKeyword = normalize(keyword)
      if (normalizedKeyword && query.includes(normalizedKeyword)) score += 4
    }

    const haystackTokens = tokens(haystack)
    Array.from(queryTokens).forEach(token => {
      if (haystackTokens.has(token)) score += 1
    })

    if (score > 0 && (!best || score > best.score)) best = { score, item }
  }

  if (!best || best.score < 3) return null
  return toKnowledgeMatch(best.item, best.score)
}

function getKnowledgeById(id?: string): KnowledgeMatch | null {
  if (!id) return null
  const item = (knowledgeItems as KnowledgeItem[]).find(entry => entry.id === id)
  return item ? toKnowledgeMatch(item, 999) : null
}

function toKnowledgeMatch(item: KnowledgeItem, score: number): KnowledgeMatch {
  return {
    ok: true,
    id: item.id,
    title: item.title,
    category: item.category,
    service: item.service,
    requires_ticket: Boolean(item.ticket_policy?.requires_ticket),
    reply: buildReply(item),
    score,
    item,
  }
}

function buildReply(item: KnowledgeItem): string {
  const sections = [(item.answer || '').trim()]
  if (item.self_service_steps?.length) {
    sections.push('Pasos que puedes intentar:\n' + item.self_service_steps.map(step => `- ${step}`).join('\n'))
  }
  return sections.filter(Boolean).join('\n\n')
}

function buildEscalationOffer(kbMatch: KnowledgeMatch): string {
  const sections = [
    `Entiendo. Como ya intentaste los pasos sugeridos para ${kbMatch.title || 'este caso'}, puedo ayudarte a escalar el caso a soporte.`,
  ]
  if (kbMatch.item.required_data?.length) {
    sections.push('Para crear el ticket, comparte estos datos si los tienes:\n' + kbMatch.item.required_data.map(data => `- ${data}`).join('\n'))
  }
  sections.push('Cuando quieras que lo radique, dime: abre un ticket.')
  return sections.join('\n\n')
}

function publicKnowledge(kbMatch: KnowledgeMatch) {
  return {
    ok: kbMatch.ok,
    id: kbMatch.id,
    title: kbMatch.title,
    category: kbMatch.category,
    service: kbMatch.service,
    requires_ticket: kbMatch.requires_ticket,
    score: kbMatch.score,
  }
}

function buildTicketArgs(userText: string, kbMatch: KnowledgeMatch | null) {
  return {
    titulo: kbMatch?.title ? `Solicitud TOOLI - ${kbMatch.title}` : `Solicitud TOOLI - ${userText.slice(0, 80)}`,
    descripcion: [
      'El usuario solicita escalar el caso a GLPI desde TOOLI.',
      `Mensaje actual: ${userText}`,
      kbMatch?.id ? `Caso sugerido por base de conocimiento: ${kbMatch.title} (${kbMatch.id}).` : '',
      kbMatch?.service ? `Servicio relacionado: ${kbMatch.service}.` : '',
    ].filter(Boolean).join('\n\n'),
  }
}

async function createTicket(args: { titulo: string; descripcion: string }) {
  const apiUrl = process.env.GLPI_API_URL
  const appToken = process.env.GLPI_APP_TOKEN
  const userToken = process.env.GLPI_USER_TOKEN

  if (!apiUrl || !appToken || !userToken) {
    return { ok: false, error: 'Faltan credenciales de GLPI en Vercel.' }
  }

  try {
    const sessionResponse = await fetch(`${apiUrl}/initSession`, {
      headers: {
        'App-Token': appToken,
        Authorization: `user_token ${userToken}`,
      },
    })

    if (!sessionResponse.ok) {
      return { ok: false, error: `No se pudo iniciar sesion en GLPI. Codigo: ${sessionResponse.status}` }
    }

    const session = await sessionResponse.json()
    const sessionToken = session.session_token
    const response = await fetch(`${apiUrl}/Ticket`, {
      method: 'POST',
      headers: {
        'App-Token': appToken,
        'Session-Token': sessionToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: {
          name: args.titulo,
          content: args.descripcion,
        },
      }),
    })

    await fetch(`${apiUrl}/killSession`, {
      headers: {
        'App-Token': appToken,
        'Session-Token': sessionToken,
      },
    }).catch(() => undefined)

    if (!response.ok) {
      return { ok: false, error: `Hubo un problema al crear el ticket en GLPI. Codigo: ${response.status}` }
    }

    const data = await response.json()
    if (!data.id) {
      return { ok: false, error: 'GLPI respondio sin error, pero no devolvio el ID del ticket creado.' }
    }

    return {
      ok: true,
      ticket_id: data.id,
      resumen: `Se ha creado exitosamente el ticket #${data.id} con el titulo '${args.titulo}'.`,
    }
  } catch (error) {
    return { ok: false, error: `Error de conexion con GLPI: ${String(error)}` }
  }
}

function normalize(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

function tokens(value: string): Set<string> {
  return new Set((value.match(/[a-z0-9]+/g) || []).filter(token => token.length > 2 && !STOPWORDS.has(token)))
}

function isTicketCreationRequest(userText: string): boolean {
  const text = normalize(userText)
  return text.includes('ticket') && ['crear', 'crea', 'generar', 'genera', 'abrir', 'abre'].some(word => text.includes(word))
}

function hasEscalationConfirmation(userText: string): boolean {
  const text = normalize(userText)
  return [
    'confirmo crear ticket',
    'crear ticket de todos modos',
    'abre el ticket',
    'abrir el ticket',
    'genera el ticket',
    'generar el ticket',
    'si crea el ticket',
    'escalar a ticket',
    'crealo',
    'genera un ticket',
    'abre un ticket',
  ].some(phrase => text.includes(phrase))
}

function hasResolutionAttempt(userText: string): boolean {
  const text = normalize(userText)
  return [
    'ya intente',
    'ya lo intente',
    'hice los pasos',
    'segui los pasos',
    'no funciono',
    'no me funciono',
    'sigue igual',
    'persiste',
    'no se soluciono',
    'no pude resolver',
    'me sigue saliendo',
  ].some(phrase => text.includes(phrase))
}
