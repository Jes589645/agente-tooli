'use client'

import { useEffect, useState, useRef, FormEvent } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

interface ToolResult {
  ok: boolean
  resumen?: string
  error?: string
  ticket_id?: string | number
  user_email?: string
  args?: {
    titulo?: string
  }
}

interface ApiResponse {
  mode: string
  session_id?: string
  request?: string
  reply?: string
  knowledge?: {
    id?: string
  }
  model_raw?: string
  tool_result?: ToolResult
  error?: string
}

interface Message {
  role: 'user' | 'bot'
  text: string
}

interface ConversationHistoryItem {
  role: 'user' | 'assistant'
  content: string
}

interface TicketRecord {
  id: string
  title: string
  user_email: string
  created_at: string
  status_label?: string
  updated_at?: string | null
  ok?: boolean
  error?: string
}

type ActiveView = 'chat' | 'tickets'

export default function DashboardPage() {
  const router = useRouter()
  const [userEmail, setUserEmail] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [sessionId, setSessionId] = useState('')
  const [lastKnowledgeId, setLastKnowledgeId] = useState('')
  const [loading, setLoading] = useState(false)
  const [activeView, setActiveView] = useState<ActiveView>('chat')
  const [tickets, setTickets] = useState<TicketRecord[]>([])
  const [ticketsLoading, setTicketsLoading] = useState(false)
  const [apiStatus, setApiStatus] = useState('verificando...')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setUserEmail(data.user.email || '')
    })
    setSessionId(getOrCreateSessionId())
    pingApi()
  }, [])

  useEffect(() => {
    if (!userEmail) return
    const storedTickets = loadStoredTickets(userEmail)
    setTickets(storedTickets)
    if (storedTickets.length) refreshTickets(storedTickets)
  }, [userEmail])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const pingApi = async () => {
    try {
      const r = await fetch('/api/tooli/healthz')
      if (!r.ok) throw new Error('offline')
      const j = await r.json()
      setApiStatus(j.model || 'OK')
    } catch {
      setApiStatus('offline')
    }
  }

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const getOrCreateSessionId = () => {
    const existing = window.localStorage.getItem('tooli_session_id')
    if (existing) return existing
    const next = window.crypto?.randomUUID?.() || `session-${Date.now()}-${Math.random().toString(16).slice(2)}`
    window.localStorage.setItem('tooli_session_id', next)
    return next
  }

  const startNewChat = () => {
    const next = window.crypto?.randomUUID?.() || `session-${Date.now()}-${Math.random().toString(16).slice(2)}`
    window.localStorage.setItem('tooli_session_id', next)
    setSessionId(next)
    setLastKnowledgeId('')
    setMessages([])
    setActiveView('chat')
  }

  const ticketStorageKey = (email: string) => `tooli_tickets_${email.toLowerCase().trim()}`

  const loadStoredTickets = (email: string): TicketRecord[] => {
    try {
      const raw = window.localStorage.getItem(ticketStorageKey(email))
      if (!raw) return []
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) return []
      return parsed.filter(item => item?.id && item?.user_email === email)
    } catch {
      return []
    }
  }

  const persistTickets = (email: string, nextTickets: TicketRecord[]) => {
    window.localStorage.setItem(ticketStorageKey(email), JSON.stringify(nextTickets))
  }

  const storeGeneratedTicket = (result: ToolResult) => {
    if (!userEmail || !result.ticket_id) return
    const ticketId = String(result.ticket_id)
    const nextTicket: TicketRecord = {
      id: ticketId,
      title: result.args?.titulo || `Ticket #${ticketId}`,
      user_email: userEmail,
      created_at: new Date().toISOString(),
      status_label: 'Creado',
      ok: true,
    }

    setTickets(prev => {
      const withoutDuplicate = prev.filter(ticket => ticket.id !== ticketId)
      const next = [nextTicket, ...withoutDuplicate]
      persistTickets(userEmail, next)
      return next
    })
  }

  const refreshTickets = async (sourceTickets = tickets) => {
    if (!userEmail || sourceTickets.length === 0) return
    setTicketsLoading(true)
    try {
      const ids = sourceTickets.map(ticket => ticket.id).join(',')
      const r = await fetch(`/api/tooli/tickets?ids=${encodeURIComponent(ids)}`)
      const data = await r.json()
      const glpiTickets = Array.isArray(data.tickets) ? data.tickets : []
      const byId = new Map(glpiTickets.map((ticket: TicketRecord) => [String(ticket.id), ticket]))
      const next = sourceTickets.map(ticket => {
        const glpiTicket = byId.get(ticket.id)
        return glpiTicket ? { ...ticket, ...glpiTicket, user_email: userEmail } : ticket
      })
      setTickets(next)
      persistTickets(userEmail, next)
    } finally {
      setTicketsLoading(false)
    }
  }

  const formatReply = (data: ApiResponse): string => {
    if (data.mode?.startsWith('tool_call')) {
      if (data.tool_result?.ok) return data.tool_result.resumen || 'Accion completada.'
      return data.tool_result?.error || 'Error al ejecutar la accion.'
    }
    if (data.reply) return data.reply
    if (data.error) return `Aviso: ${data.error}`
    return JSON.stringify(data)
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const text = input.trim()
    if (!text || loading) return

    setMessages(prev => [...prev, { role: 'user', text }])
    setInput('')
    setLoading(true)

    try {
      const r = await fetch('/api/tooli/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          session_id: sessionId || getOrCreateSessionId(),
          last_knowledge_id: lastKnowledgeId || undefined,
          user_email: userEmail || undefined,
          user_name: userName || undefined,
          conversation_history: buildConversationHistory(messages),
        }),
      })
      const j: ApiResponse = await r.json()
      if (j.session_id) {
        window.localStorage.setItem('tooli_session_id', j.session_id)
        setSessionId(j.session_id)
      }
      if (j.knowledge?.id) setLastKnowledgeId(j.knowledge.id)
      if (j.tool_result?.ok && j.tool_result.ticket_id) storeGeneratedTicket(j.tool_result)
      setMessages(prev => [...prev, { role: 'bot', text: formatReply(j) }])
    } catch {
      setMessages(prev => [...prev, { role: 'bot', text: 'Error al conectar con la API.' }])
    } finally {
      setLoading(false)
    }
  }

  const userName = userEmail.split('@')[0] || 'Operador'

  const buildConversationHistory = (items: Message[]): ConversationHistoryItem[] => (
    items.slice(-8).map(item => ({
      role: item.role === 'user' ? 'user' : 'assistant',
      content: item.text,
    }))
  )

  return (
    <>
      <style>{`
        :root {
          --bg: #f3f7fc;
          --navy-soft: #0f2048;
          --blue: #2e5bff;
          --blue-soft: #e7eeff;
          --panel-strong: rgba(255,255,255,0.94);
          --line: #dce5f1;
          --text: #0f172a;
          --muted: #64748b;
          --bot: #f8fbff;
          --user: linear-gradient(135deg, #f0f5ff, #e5edff);
          --success: #18a957;
        }
        .page {
          min-height: 100vh;
          display: grid;
          grid-template-columns: 256px 1fr;
          background:
            radial-gradient(circle at top left, rgba(46, 91, 255, 0.12), transparent 18%),
            var(--bg);
          color: var(--text);
          font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif;
        }
        .sidebar {
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding: 16px;
          border-right: 1px solid var(--line);
          background: linear-gradient(180deg, rgba(255,255,255,0.74), rgba(255,255,255,0.58));
          backdrop-filter: blur(18px);
        }
        .brand {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 8px;
          margin-bottom: 8px;
        }
        .brand-mark {
          width: 40px;
          height: 40px;
          border-radius: 14px;
          background: linear-gradient(135deg, #0a1b39, #2454ff);
          box-shadow: 0 16px 26px rgba(36, 84, 255, 0.22);
        }
        .brand-title {
          margin: 0;
          font-size: 1rem;
          font-weight: 800;
        }
        .brand-copy {
          margin: 3px 0 0;
          color: var(--muted);
          font-size: 0.8rem;
        }
        .new-chat {
          width: 100%;
          min-height: 48px;
          border: 0;
          border-radius: 16px;
          background: linear-gradient(135deg, var(--blue), #5c74ff);
          color: white;
          font-weight: 800;
          cursor: pointer;
          box-shadow: 0 16px 28px rgba(46, 91, 255, 0.18);
        }
        .nav {
          margin-top: 16px;
          display: grid;
          gap: 6px;
        }
        .nav-item {
          display: flex;
          align-items: center;
          gap: 12px;
          width: 100%;
          min-height: 48px;
          padding: 0 14px;
          border: 0;
          border-radius: 14px;
          background: transparent;
          color: var(--navy-soft);
          font-size: 0.96rem;
          font-weight: 600;
          text-align: left;
          cursor: pointer;
        }
        .nav-item.active {
          background: var(--blue-soft);
          color: var(--blue);
        }
        .main {
          min-width: 0;
          display: grid;
          grid-template-rows: auto auto 1fr auto;
        }
        .topbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding: 18px 32px;
          border-bottom: 1px solid var(--line);
          background: rgba(255,255,255,0.72);
          backdrop-filter: blur(18px);
        }
        .topbar-left {
          display: flex;
          align-items: center;
          gap: 20px;
          min-width: 0;
        }
        .workspace-title {
          margin: 0;
          font-size: 1.2rem;
          font-weight: 800;
        }
        .top-links {
          display: flex;
          gap: 18px;
          color: var(--muted);
          font-size: 0.94rem;
          white-space: nowrap;
        }
        .topbar-right {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .search {
          min-width: 240px;
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 14px;
          border-radius: 16px;
          border: 1px solid var(--line);
          background: rgba(255,255,255,0.9);
          color: var(--muted);
          font-size: 0.92rem;
        }
        .icon-btn,
        .logout-btn {
          min-height: 42px;
          padding: 0 14px;
          border-radius: 14px;
          border: 1px solid var(--line);
          background: rgba(255,255,255,0.9);
          color: var(--navy-soft);
          cursor: pointer;
          font-weight: 700;
        }
        .user-pill {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          padding: 6px 8px 6px 6px;
          border-radius: 999px;
          background: rgba(255,255,255,0.9);
          border: 1px solid var(--line);
          font-size: 0.88rem;
        }
        .avatar {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          display: grid;
          place-items: center;
          background: linear-gradient(135deg, #091a38, #2454ff);
          color: white;
          font-weight: 800;
        }
        .headline-row {
          display: flex;
          align-items: end;
          justify-content: space-between;
          gap: 20px;
          padding: 24px 32px;
        }
        .kicker {
          margin: 0 0 6px;
          color: var(--muted);
          font-size: 0.82rem;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .headline {
          margin: 0;
          font-family: Georgia, "Times New Roman", serif;
          font-size: clamp(2rem, 4vw, 2.8rem);
          letter-spacing: -0.05em;
        }
        .status-badge {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          padding: 8px 14px;
          border-radius: 999px;
          background: rgba(255,255,255,0.85);
          border: 1px solid var(--line);
          color: var(--navy-soft);
          font-size: 0.9rem;
          font-weight: 700;
          white-space: nowrap;
        }
        .status-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--success);
          box-shadow: 0 0 0 4px rgba(24, 169, 87, 0.12);
        }
        .messages {
          padding: 0 32px 24px;
          overflow-y: auto;
        }
        .tickets-view {
          padding: 0 32px 32px;
          overflow-y: auto;
        }
        .tickets-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 16px;
        }
        .tickets-copy {
          margin: 0;
          color: var(--muted);
          line-height: 1.6;
        }
        .ticket-list {
          display: grid;
          gap: 12px;
        }
        .ticket-card {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 16px;
          padding: 18px 20px;
          border: 1px solid var(--line);
          border-radius: 8px;
          background: rgba(255,255,255,0.9);
          box-shadow: 0 14px 34px rgba(15, 23, 42, 0.04);
        }
        .ticket-title {
          margin: 0 0 8px;
          font-size: 1rem;
          font-weight: 800;
        }
        .ticket-meta {
          margin: 0;
          color: var(--muted);
          font-size: 0.88rem;
        }
        .ticket-status {
          align-self: start;
          padding: 8px 12px;
          border-radius: 999px;
          background: var(--blue-soft);
          color: var(--blue);
          font-size: 0.86rem;
          font-weight: 800;
          white-space: nowrap;
        }
        .ticket-status.error {
          background: rgba(220, 38, 38, 0.08);
          color: #b91c1c;
        }
        .empty {
          max-width: 760px;
          padding: 26px 28px;
          border-radius: 24px;
          background: var(--panel-strong);
          border: 1px solid var(--line);
          color: var(--muted);
          line-height: 1.8;
        }
        .row {
          display: flex;
          gap: 16px;
          margin: 18px 0;
          align-items: flex-start;
        }
        .row.user {
          justify-content: flex-end;
        }
        .message-mark {
          flex: 0 0 40px;
          width: 40px;
          height: 40px;
          border-radius: 16px;
          display: grid;
          place-items: center;
          background: linear-gradient(135deg, #0a1b39, #2454ff);
          color: white;
          font-size: 0.95rem;
          font-weight: 800;
        }
        .row.user .message-mark {
          background: linear-gradient(135deg, #d9e4ff, #eef4ff);
          color: var(--blue);
        }
        .bubble-wrap { max-width: min(840px, 88%); }
        .bubble {
          padding: 22px 24px;
          border-radius: 24px;
          border: 1px solid var(--line);
          background: var(--bot);
          white-space: pre-wrap;
          word-break: break-word;
          line-height: 1.7;
          box-shadow: 0 20px 40px rgba(15, 23, 42, 0.04);
        }
        .row.user .bubble { background: var(--user); }
        .timestamp {
          margin-top: 8px;
          padding: 0 8px;
          color: var(--muted);
          font-size: 0.78rem;
        }
        .typing {
          display: flex;
          gap: 4px;
          align-items: center;
          min-height: 26px;
        }
        .typing span {
          width: 7px;
          height: 7px;
          background: #9fb0ca;
          border-radius: 50%;
          animation: bounce 1.2s infinite;
        }
        .typing span:nth-child(2) { animation-delay: 0.2s; }
        .typing span:nth-child(3) { animation-delay: 0.4s; }
        @keyframes bounce { 0%, 60%, 100% { transform: translateY(0); } 30% { transform: translateY(-6px); } }
        .composer-shell { padding: 0 32px 32px; }
        .composer {
          border: 1px solid var(--line);
          border-radius: 28px;
          overflow: hidden;
          background: rgba(255,255,255,0.88);
          box-shadow: 0 26px 60px rgba(15, 23, 42, 0.08);
          backdrop-filter: blur(16px);
        }
        .composer-tools {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 16px 20px;
          border-bottom: 1px solid var(--line);
          color: var(--muted);
          font-size: 0.9rem;
        }
        .tool-divider {
          width: 1px;
          height: 16px;
          background: var(--line);
        }
        .composer-main {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 16px;
          padding: 16px;
        }
        .textarea-shell {
          min-height: 88px;
          display: flex;
          align-items: flex-start;
          border-radius: 20px;
          background: rgba(248, 250, 252, 0.9);
        }
        .textarea-shell input {
          width: 100%;
          border: 0;
          outline: 0;
          background: transparent;
          padding: 18px 18px;
          font-size: 1rem;
          color: var(--text);
        }
        .textarea-shell input::placeholder { color: #94a3b8; }
        .actions {
          display: flex;
          align-items: end;
          gap: 8px;
        }
        .secondary-btn,
        .send-btn {
          min-width: 132px;
          min-height: 48px;
          border-radius: 16px;
          font-weight: 800;
          cursor: pointer;
        }
        .secondary-btn {
          border: 1px solid var(--line);
          background: rgba(255,255,255,0.92);
          color: var(--navy-soft);
        }
        .send-btn {
          border: 0;
          background: linear-gradient(135deg, var(--blue), #5c74ff);
          color: white;
          box-shadow: 0 16px 28px rgba(46, 91, 255, 0.2);
        }
        .send-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
          box-shadow: none;
        }
        .composer-footer {
          display: flex;
          justify-content: center;
          gap: 28px;
          padding: 0 20px 18px;
          color: var(--muted);
          font-size: 0.82rem;
        }
        @media (max-width: 1100px) {
          .page { grid-template-columns: 1fr; }
          .sidebar, .top-links, .search { display: none; }
        }
        @media (max-width: 760px) {
          .topbar, .headline-row, .messages, .composer-shell {
            padding-left: 18px;
            padding-right: 18px;
          }
          .tickets-view {
            padding-left: 18px;
            padding-right: 18px;
          }
          .ticket-card { grid-template-columns: 1fr; }
          .composer-main { grid-template-columns: 1fr; }
          .actions { justify-content: stretch; }
          .secondary-btn, .send-btn { flex: 1; }
          .bubble-wrap { max-width: 100%; }
        }
      `}</style>

      <div className="page">
        <aside className="sidebar">
          <div>
            <div className="brand">
              <div className="brand-mark" />
              <div>
                <p className="brand-title">TOOLI</p>
                <p className="brand-copy">Workspace operacional</p>
              </div>
            </div>
            <button className="new-chat" type="button" onClick={startNewChat}>+ Nueva conversacion</button>
            <nav className="nav">
              <button className={`nav-item ${activeView === 'chat' ? 'active' : ''}`} type="button" onClick={() => setActiveView('chat')}>Base de conocimiento</button>
              <button className={`nav-item ${activeView === 'tickets' ? 'active' : ''}`} type="button" onClick={() => { setActiveView('tickets'); refreshTickets() }}>Tickets</button>
              <button className="nav-item" type="button">Automatizaciones</button>
              <button className="nav-item" type="button">Analitica</button>
            </nav>
          </div>
          <div className="nav">
            <button className="nav-item" type="button">Configuracion</button>
            <button className="nav-item" type="button" onClick={handleLogout}>Cerrar sesion</button>
          </div>
        </aside>

        <main className="main">
          <header className="topbar">
            <div className="topbar-left">
              <h2 className="workspace-title">Asistente de operaciones</h2>
              <div className="top-links">
                <span>Dashboard</span>
                <span>Tickets</span>
                <span>Base de conocimiento</span>
                <span>Activity</span>
              </div>
            </div>
            <div className="topbar-right">
              <div className="search">Buscar recursos...</div>
              <button className="icon-btn" type="button">Alertas</button>
              {userEmail && (
                <div className="user-pill">
                  <div className="avatar">{userName.slice(0, 1).toUpperCase()}</div>
                  <span>{userName}</span>
                </div>
              )}
              <button className="logout-btn" onClick={handleLogout}>Salir</button>
            </div>
          </header>

          <div className="headline-row">
            <div>
              <p className="kicker">Centro de orientacion inteligente</p>
              <h1 className="headline">Resuelve primero con TOOLI</h1>
            </div>
            <div className="status-badge">
              <span className="status-dot" />
              Modelo activo: <strong>{apiStatus}</strong>
            </div>
          </div>

          {activeView === 'tickets' ? (
            <section className="tickets-view" aria-live="polite">
              <div className="tickets-toolbar">
                <p className="tickets-copy">
                  Tickets generados por {userEmail || 'el usuario autenticado'} desde TOOLI.
                </p>
                <button className="secondary-btn" type="button" onClick={() => refreshTickets()} disabled={ticketsLoading || tickets.length === 0}>
                  {ticketsLoading ? 'Actualizando...' : 'Actualizar'}
                </button>
              </div>
              {tickets.length === 0 ? (
                <div className="empty">
                  Todavia no hay tickets creados desde esta sesion de usuario. Cuando TOOLI radique uno en GLPI, aparecera aqui ligado a tu correo.
                </div>
              ) : (
                <div className="ticket-list">
                  {tickets.map(ticket => (
                    <article className="ticket-card" key={ticket.id}>
                      <div>
                        <p className="ticket-title">#{ticket.id} · {ticket.title}</p>
                        <p className="ticket-meta">
                          Usuario: {ticket.user_email} · Creado: {new Date(ticket.created_at).toLocaleString()}
                        </p>
                        {ticket.updated_at && (
                          <p className="ticket-meta">Ultima actualizacion GLPI: {ticket.updated_at}</p>
                        )}
                        {ticket.error && <p className="ticket-meta">{ticket.error}</p>}
                      </div>
                      <span className={`ticket-status ${ticket.ok === false ? 'error' : ''}`}>
                        {ticket.ok === false ? 'Sin consultar' : ticket.status_label || 'Creado'}
                      </span>
                    </article>
                  ))}
                </div>
              )}
            </section>
          ) : (
            <div className="messages" aria-live="polite">
              {messages.length === 0 ? (
                <div className="empty">
                  Hola. Empieza una conversacion con TOOLI para consultar servicios,
                  resolver dudas frecuentes o validar si un caso realmente necesita ticket.
                  Prueba con: <em>Tengo un solapamiento en mi horario de matricula</em>
                </div>
              ) : (
                messages.map((msg, i) => (
                  <div key={i} className={`row ${msg.role}`}>
                    {msg.role === 'bot' && <div className="message-mark">AI</div>}
                    <div className="bubble-wrap">
                      <div className="bubble">{msg.text}</div>
                      <div className="timestamp">{msg.role === 'bot' ? 'Asistente TOOLI' : 'Ahora'}</div>
                    </div>
                    {msg.role === 'user' && <div className="message-mark">Tu</div>}
                  </div>
                ))
              )}
              {loading && (
                <div className="row bot">
                  <div className="message-mark">AI</div>
                  <div className="bubble-wrap">
                    <div className="bubble typing">
                      <span /><span /><span />
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}

          <div className="composer-shell">
            <form className="composer" onSubmit={handleSubmit} autoComplete="off">
              <div className="composer-tools">
                <span>Adjuntar</span>
                <span>Comandos</span>
                <span>Plantillas</span>
                <span className="tool-divider" />
                <span>Pregunta por un servicio o describe el problema...</span>
              </div>
              <div className="composer-main">
                <label className="textarea-shell">
                  <input
                    type="text"
                    placeholder="Pregunta por un servicio o describe el problema..."
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    disabled={loading}
                    required
                  />
                </label>
                <div className="actions">
                  <button className="secondary-btn" type="button" onClick={() => { setActiveView('tickets'); refreshTickets() }}>Tickets</button>
                  <button className="send-btn" type="submit" disabled={loading || !input.trim()}>
                    Enviar
                  </button>
                </div>
              </div>
              <div className="composer-footer">
                <span>Canal seguro</span>
                <span>Auditoria habilitada</span>
              </div>
            </form>
          </div>
        </main>
      </div>
    </>
  )
}
