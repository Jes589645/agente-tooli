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
  user_email?: string
  user_name?: string
  conversation_history?: ConversationMessage[]
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

type ConversationMessage = {
  role: 'user' | 'assistant'
  content: string
}

type ToolCall = {
  name?: string
  arguments?: Record<string, unknown>
}

const STOPWORDS = new Set([
  'algo', 'aun', 'como', 'con', 'del', 'esta', 'este', 'los', 'para', 'pero',
  'por', 'que', 'sin', 'todos', 'una', 'intente', 'pasos', 'funciona',
  'no', 'ya', 'me', 'mi', 'un', 'la', 'el', 'en', 'de', 'se', 'si', 'y',
])

const SYSTEM_PROMPT = [
  'Eres Asistente TOOLI-UTB.',
  'Respondes en espanol, con tono institucional, breve y claro.',
  'La base de conocimiento institucional es la primera fuente. Si ya no aplica, conversa normalmente dentro del alcance de TOOLI.',
  'Puedes usar el contexto de sesion enviado por el frontend.',
  'Si el usuario pregunta por su nombre, usa el perfil de usuario disponible y no inventes datos.',
  'La creacion de tickets es el ultimo recurso.',
  'Nunca digas que un ticket fue creado, registrado o radicado si no hay resultado real de GLPI.',
  'Si necesitas una accion, responde exclusivamente con JSON: {"tool_call":{"name":"funcionCrearTicket","arguments":{"titulo":"...","descripcion":"..."}}}.',
].join('\n')

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

  try {
    const modelText = await chatCompletion(userText, payload)
    const toolCall = parseToolCall(modelText)

    if (toolCall) {
      if (toolCall.name === 'funcionCrearTicket' && !hasEscalationConfirmation(userText)) {
        return NextResponse.json({
          mode: 'needs_resolution_first',
          session_id: sessionId,
          request: userText,
          model_raw: modelText,
          reply: 'Antes de crear un ticket, intentemos resolverlo con la base de conocimiento de TOOLI. Si despues de la orientacion no queda resuelto, dime: abre un ticket.',
        })
      }

      if (toolCall.name === 'funcionCrearTicket') {
        const ticketResult = await createTicket(normalizeTicketArgs(toolCall.arguments || {}, userText))
        return NextResponse.json({
          mode: 'tool_call(json)',
          session_id: sessionId,
          request: userText,
          model_raw: modelText,
          tool_result: ticketResult,
        })
      }

      return NextResponse.json({
        mode: 'error',
        session_id: sessionId,
        request: userText,
        error: `Funcion no soportada: ${toolCall.name || 'sin nombre'}`,
      })
    }

    return NextResponse.json({
      mode: 'text',
      session_id: sessionId,
      request: userText,
      reply: claimsTicketCreated(modelText)
        ? 'No puedo confirmar la creacion de un ticket porque GLPI no devolvio un ID. Si ya intentaste la solucion y quieres escalar el caso, dime: abre un ticket.'
        : modelText,
    })
  } catch (error) {
    return NextResponse.json({
      mode: 'error',
      session_id: sessionId,
      request: userText,
      error: `No se pudo consultar el modelo. Verifica LLM_API_KEY, LLM_BASE_URL y LLM_MODEL en Vercel. Detalle: ${String(error)}`,
    }, { status: 500 })
  }
}

async function chatCompletion(userText: string, payload: ChatPayload): Promise<string> {
  const apiKey = process.env.LLM_API_KEY
  const baseUrl = process.env.LLM_BASE_URL || 'https://api.groq.com/openai/v1'
  const model = process.env.LLM_MODEL || 'llama-3.1-8b-instant'

  if (!apiKey) {
    throw new Error('LLM_API_KEY no configurada')
  }

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'system',
      content: [
        payload.user_name ? `Nombre visible del usuario: ${payload.user_name}` : '',
        payload.user_email ? `Correo institucional: ${payload.user_email}` : '',
      ].filter(Boolean).join('\n') || 'No hay perfil de usuario disponible.',
    },
    ...sanitizeHistory(payload.conversation_history || []),
    { role: 'user', content: userText },
  ]

  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: Number(process.env.TEMPERATURE || '0.2'),
      top_p: Number(process.env.TOP_P || '0.9'),
      max_tokens: Number(process.env.MAX_TOKENS || '512'),
    }),
  })

  if (!response.ok) {
    throw new Error(`LLM respondio ${response.status}`)
  }

  const data = await response.json()
  const content = data?.choices?.[0]?.message?.content
  if (!content || typeof content !== 'string') {
    throw new Error('LLM respondio sin contenido')
  }
  return content
}

function sanitizeHistory(history: ConversationMessage[]): ConversationMessage[] {
  return history
    .filter(item => (item.role === 'user' || item.role === 'assistant') && item.content?.trim())
    .slice(-8)
    .map(item => ({
      role: item.role,
      content: item.content.slice(0, 1200),
    }))
}

function parseToolCall(modelText: string): ToolCall | null {
  try {
    const parsed = JSON.parse(modelText)
    const toolCall = parsed?.tool_call
    if (toolCall && typeof toolCall === 'object') return toolCall
  } catch {
    return null
  }
  return null
}

function normalizeTicketArgs(args: Record<string, unknown>, userText: string) {
  const titulo = typeof args.titulo === 'string' && args.titulo.trim()
    ? args.titulo.trim()
    : `Solicitud TOOLI - ${userText.slice(0, 80)}`
  const descripcion = typeof args.descripcion === 'string' && args.descripcion.trim()
    ? args.descripcion.trim()
    : userText
  return { titulo, descripcion }
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

function claimsTicketCreated(text: string): boolean {
  const normalized = normalize(text)
  return normalized.includes('ticket') && [
    'ticket creado',
    'se creo el ticket',
    'se ha creado',
    'ticket registrado',
    'se registro el ticket',
    'ticket radicado',
    'se radico',
  ].some(phrase => normalized.includes(phrase))
}
