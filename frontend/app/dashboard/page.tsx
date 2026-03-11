'use client'

import { useEffect, useState, useRef, FormEvent } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

interface ToolResult {
  ok: boolean
  resumen?: string
  error?: string
}

interface ApiResponse {
  mode: string
  request?: string
  reply?: string
  model_raw?: string
  tool_result?: ToolResult
  error?: string
}

interface Message {
  role: 'user' | 'bot'
  text: string
}

export default function DashboardPage() {
  const router = useRouter()
  const [userEmail, setUserEmail] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [apiStatus, setApiStatus] = useState('verificando…')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setUserEmail(data.user.email || '')
    })
    pingApi()
  }, [])

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

  const formatReply = (data: ApiResponse): string => {
    if (data.mode?.startsWith('tool_call')) {
      if (data.tool_result?.ok) return data.tool_result.resumen || 'Acción completada.'
      return data.tool_result?.error || 'Error al ejecutar la acción.'
    }
    if (data.reply) return data.reply
    if (data.error) return `⚠️ ${data.error}`
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
        body: JSON.stringify({ message: text }),
      })
      const j: ApiResponse = await r.json()
      setMessages(prev => [...prev, { role: 'bot', text: formatReply(j) }])
    } catch {
      setMessages(prev => [...prev, { role: 'bot', text: 'Error al conectar con la API.' }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@600;700&family=Open+Sans:wght@400;500&display=swap');
        :root {
          --blue-900: #0b3f91; --blue-800: #114da0; --blue-700: #1e63d6;
          --blue-100: #e8f0ff; --blue-050: #f5f8ff;
          --gray-900: #101828; --gray-500: #667085; --gray-300: #d0d5dd; --gray-200: #eaecf0;
          --white: #ffffff;
        }
        body { background: var(--blue-050); color: var(--gray-900); font-family: 'Open Sans', system-ui, sans-serif; }
        .topbar { background: var(--blue-900); color: #fff; padding: 14px 20px; display: flex; align-items: center; justify-content: space-between; }
        .topbar-left { display: flex; align-items: center; gap: 12px; }
        .dot { width: 10px; height: 10px; border-radius: 50%; background: #7dd3fc; box-shadow: 0 0 12px #7dd3fc; }
        .topbar-title { font-family: 'Montserrat', sans-serif; font-weight: 700; font-size: 1rem; }
        .topbar-right { display: flex; align-items: center; gap: 14px; }
        .user-badge { font-size: 12px; color: rgba(255,255,255,0.65); background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.15); border-radius: 999px; padding: 4px 12px; }
        .logout-btn { background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); color: rgba(255,255,255,0.85); border-radius: 8px; padding: 6px 14px; font-size: 12px; cursor: pointer; transition: background 0.2s; }
        .logout-btn:hover { background: rgba(255,255,255,0.18); }
        .app { max-width: 920px; margin: 24px auto; padding: 0 16px; }
        .card { background: var(--white); border: 1px solid var(--gray-200); border-radius: 16px; box-shadow: 0 6px 20px rgba(16,24,40,.04); }
        .panel { display: grid; grid-template-rows: auto 1fr auto; height: min(75vh, 820px); }
        .status-badge { display: inline-flex; align-items: center; gap: 8px; background: #eef4ff; color: var(--blue-800); border: 1px solid #d8e5ff; border-radius: 999px; padding: 6px 12px; font-size: 12px; margin: 14px 16px 0; width: fit-content; }
        .status-dot { width: 7px; height: 7px; border-radius: 50%; background: #22c55e; box-shadow: 0 0 0 3px rgba(34,197,94,.15); }
        .messages { padding: 18px; overflow-y: auto; scroll-behavior: smooth; }
        .empty { color: var(--gray-500); text-align: center; margin-top: 32px; font-size: 15px; line-height: 1.7; }
        .row { display: flex; gap: 10px; margin: 10px 0; align-items: flex-end; }
        .row.user { justify-content: flex-end; }
        .bubble { max-width: 72%; padding: 12px 15px; border-radius: 14px; font-size: 15px; line-height: 1.45; border: 1px solid var(--gray-200); white-space: pre-wrap; word-break: break-word; }
        .user .bubble { background: var(--blue-100); border-color: #c8dbff; }
        .bot .bubble { background: #fff; }
        .typing { display: flex; gap: 4px; align-items: center; padding: 14px 15px; }
        .typing span { width: 7px; height: 7px; background: var(--gray-300); border-radius: 50%; animation: bounce 1.2s infinite; }
        .typing span:nth-child(2) { animation-delay: 0.2s; }
        .typing span:nth-child(3) { animation-delay: 0.4s; }
        @keyframes bounce { 0%, 60%, 100% { transform: translateY(0); } 30% { transform: translateY(-6px); } }
        .inputbar { display: flex; gap: 10px; padding: 12px; border-top: 1px solid var(--gray-200); background: #fff; border-radius: 0 0 16px 16px; }
        .field { flex: 1; display: flex; align-items: center; border: 1.5px solid var(--gray-300); border-radius: 12px; padding: 10px 14px; transition: border-color 0.2s, box-shadow 0.2s; }
        .field:focus-within { border-color: var(--blue-800); box-shadow: 0 0 0 3px rgba(17,77,160,0.1); }
        .field input { flex: 1; border: 0; outline: none; font-size: 15px; font-family: inherit; background: transparent; }
        .field input::placeholder { color: var(--gray-300); }
        .send-btn { background: var(--blue-800); color: #fff; border: 0; border-radius: 12px; padding: 10px 20px; font-weight: 600; cursor: pointer; font-family: 'Montserrat', sans-serif; font-size: 14px; transition: background 0.2s, transform 0.1s; }
        .send-btn:hover:not(:disabled) { background: var(--blue-700); transform: translateY(-1px); }
        .send-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .footer { color: var(--gray-500); font-size: 12px; text-align: center; margin: 10px 0 20px; }
      `}</style>

      <header className="topbar">
        <div className="topbar-left">
          <span className="dot" />
          <span className="topbar-title">Asistente TOOLI · UTB</span>
        </div>
        <div className="topbar-right">
          {userEmail && <span className="user-badge">👤 {userEmail}</span>}
          <button className="logout-btn" onClick={handleLogout}>Cerrar sesión</button>
        </div>
      </header>

      <main className="app">
        <section className="card panel">
          <div className="status-badge">
            <span className="status-dot" />
            Conectado · Modelo: <strong>{apiStatus}</strong>
          </div>

          <div className="messages" aria-live="polite">
            {messages.length === 0 ? (
              <div className="empty">
                Inicia una conversación sobre <b>TOOLI</b>.<br />
                Por ejemplo: <em>¿Cuál es el estado de mi último ticket?</em>
              </div>
            ) : (
              messages.map((msg, i) => (
                <div key={i} className={`row ${msg.role}`}>
                  <div className="bubble">{msg.text}</div>
                </div>
              ))
            )}
            {loading && (
              <div className="row bot">
                <div className="bubble typing">
                  <span /><span /><span />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <form className="inputbar" onSubmit={handleSubmit} autoComplete="off">
            <label className="field">
              <input
                type="text"
                placeholder="Escribe tu mensaje…"
                value={input}
                onChange={e => setInput(e.target.value)}
                disabled={loading}
                required
              />
            </label>
            <button className="send-btn" type="submit" disabled={loading || !input.trim()}>
              Enviar
            </button>
          </form>
        </section>
        <p className="footer">MVP · Restringido a consultas de TOOLI (GLPI UTB)</p>
      </main>
    </>
  )
}