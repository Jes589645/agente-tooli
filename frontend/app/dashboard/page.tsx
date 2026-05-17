'use client'

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from 'react'
import { DM_Sans, Rubik } from 'next/font/google'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-dm-sans',
  weight: ['400', '500', '600', '700'],
})

const rubik = Rubik({
  subsets: ['latin'],
  variable: '--font-rubik',
  weight: ['400', '500', '600', '700'],
})

const TOOLI_BASE_IMAGE = 'https://lh3.googleusercontent.com/aida-public/AB6AXuBb7ZfQhXwJYscJa5cKYKXWEnD9zFdQG0rc0DrWr1ei8h5C9gZCCM9foiO93Vdg_mi_IqWpfn2R3gg2diLvPvUo6g8aiqKT9vlVgCsMgXNENp8uQzColc7Zfav_u2TQ0u1BwqW_9rLmCHTzOjlRqTTFyItLo2UiHv5fRzzFwaGx76_yEbCOmibDs-igT67HZUDY1DUu0D0BgBGXT_xp1iBXAvAgsXKT9OckrwsJw6tX5Kdq2pCdPnipUs44VUg3zKF56J8OKkE0Febt'
const TOOLI_SPIN_IMAGE = 'https://lh3.googleusercontent.com/aida-public/AB6AXuCBHRdKecy0_vPpp1br6uupMzSH5GjJqP7NHW6pke7gx6AqT7LicsDtB0OOvRRzMzQRet7GkFxMQuiCP5AA2TxEkJpPpP9huliZ9nZkfX4PhqP8_ZEIVKEFnY-oHJns6QduW8cRNOpTti5C9k5AGaWvrj-5Dt7q6KHpcsrjhP0BqhGVZrJqAAQF7ZS6N4TUToRi_hfemeDfWLQSCWxXmXOiIdKJH-RiOg_GTEUhc-NQKVMx1H5OcU3ZqIN1x07JkPnwDLZIEvcRA076'
const TOOLI_WINDMILL_IMAGE = 'https://lh3.googleusercontent.com/aida-public/AB6AXuAI68proG3-nbJfglTTDuqr084MzghEUbwyDgkIXvzDJwlMJJzfJU9M8YkHC4CgCZEnJQ82XoESiX3nl_Yy_hy41cPo7YwCAEgvib-_y9c8RezcxPdOIjlZqkCKiomzZktg3iMFFbxl2syNy1NpJ_yjg03Bz8Q7ItP9NUVg-GAfUut6U2s6Tp1MEkiRjEbaKTfLkZbeHqcw35WxmNdjsUCPE9dkiVy1AVdWKWUsfQtsIZUmQyfBIbq-x1A9zSWbqH8gBUOhIXpEg-dA'
const TOOLI_MOVES = ['spin', 'windmill', 'freeze', 'bounce', 'backflip'] as const

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
  status?: number
  status_label?: string
  updated_at?: string | null
  ok?: boolean
  error?: string
}

type ActiveView = 'chat' | 'tickets'
type TooliMove = (typeof TOOLI_MOVES)[number] | ''
type IconName =
  | 'add'
  | 'dashboard'
  | 'book'
  | 'ticket'
  | 'logout'
  | 'spark'
  | 'send'
  | 'shield'
  | 'eye'
  | 'refresh'
  | 'chat'
  | 'bolt'

function normalizeEmail(value: string) {
  return value.toLowerCase().trim()
}

function formatDateTime(value?: string | null) {
  if (!value) return 'Sin fecha'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('es-CO')
}

function summarizeModelLabel(value: string) {
  return value === 'offline' ? 'API offline' : value
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  const raw = await response.text()

  if (!raw.trim()) {
    throw new Error(`La API respondio vacia (${response.status}).`)
  }

  try {
    return JSON.parse(raw) as T
  } catch {
    const preview = raw.replace(/\s+/g, ' ').trim().slice(0, 180)
    throw new Error(
      response.ok
        ? `La API devolvio una respuesta no valida: ${preview}`
        : `La API devolvio ${response.status}: ${preview}`
    )
  }
}

function Icon({ name, className = '' }: { name: IconName; className?: string }) {
  const sharedProps = {
    'aria-hidden': true,
    className,
    fill: 'none',
    stroke: 'currentColor',
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    strokeWidth: 1.9,
    viewBox: '0 0 24 24',
  }

  switch (name) {
    case 'add':
      return (
        <svg {...sharedProps}>
          <path d="M12 5v14M5 12h14" />
        </svg>
      )
    case 'dashboard':
      return (
        <svg {...sharedProps}>
          <path d="M4 5h7v7H4zM13 5h7v4h-7zM13 11h7v8h-7zM4 14h7v5H4z" />
        </svg>
      )
    case 'book':
      return (
        <svg {...sharedProps}>
          <path d="M5 5.5A2.5 2.5 0 0 1 7.5 3H20v16H7.5A2.5 2.5 0 0 0 5 21z" />
          <path d="M5 5.5V21M9 7h7M9 11h7" />
        </svg>
      )
    case 'ticket':
      return (
        <svg {...sharedProps}>
          <path d="M4 8a2 2 0 0 0 2-2h12a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H6a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4z" />
          <path d="M12 8v8" />
        </svg>
      )
    case 'logout':
      return (
        <svg {...sharedProps}>
          <path d="M14 16l4-4-4-4" />
          <path d="M18 12H9" />
          <path d="M10 20H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h5" />
        </svg>
      )
    case 'spark':
      return (
        <svg {...sharedProps}>
          <path d="M12 3l1.8 4.7L18.5 9l-4.7 1.3L12 15l-1.8-4.7L5.5 9l4.7-1.3z" />
        </svg>
      )
    case 'send':
      return (
        <svg {...sharedProps}>
          <path d="M22 2L11 13" />
          <path d="M22 2l-7 20-4-9-9-4z" />
        </svg>
      )
    case 'shield':
      return (
        <svg {...sharedProps}>
          <path d="M12 3l7 3v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6z" />
          <path d="M9.5 12.5l1.7 1.7 3.8-4.2" />
        </svg>
      )
    case 'eye':
      return (
        <svg {...sharedProps}>
          <path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12z" />
          <circle cx="12" cy="12" r="2.5" />
        </svg>
      )
    case 'refresh':
      return (
        <svg {...sharedProps}>
          <path d="M20 11a8 8 0 0 0-14-4M4 13a8 8 0 0 0 14 4" />
          <path d="M20 4v5h-5M4 20v-5h5" />
        </svg>
      )
    case 'chat':
      return (
        <svg {...sharedProps}>
          <path d="M7 18l-4 3V6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H7z" />
          <path d="M8 9h8M8 13h5" />
        </svg>
      )
    case 'bolt':
      return (
        <svg {...sharedProps}>
          <path d="M13 2L5 14h5l-1 8 8-12h-5z" />
        </svg>
      )
    default:
      return null
  }
}

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
  const [ticketsError, setTicketsError] = useState('')
  const [apiStatus, setApiStatus] = useState('verificando...')
  const [currentMove, setCurrentMove] = useState<TooliMove>('')
  const [isAnimating, setIsAnimating] = useState(false)
  const [tooliImg, setTooliImg] = useState(TOOLI_BASE_IMAGE)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const moveResetRef = useRef<number | null>(null)

  const userName = userEmail.split('@')[0] || 'Operador'
  const userInitial = userName.slice(0, 1).toUpperCase()
  const activeTicketCount = tickets.filter(ticket => {
    const label = (ticket.status_label || '').toLowerCase()
    return ticket.ok !== false && !label.includes('resuelto') && !label.includes('cerrado')
  }).length

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setUserEmail(data.user.email || '')
    })
    setSessionId(getOrCreateSessionId())
    void pingApi()

    return () => {
      if (moveResetRef.current !== null) window.clearTimeout(moveResetRef.current)
    }
  }, [])

  useEffect(() => {
    if (!userEmail) return
    const storedTickets = loadStoredTickets(userEmail)
    setTickets(storedTickets)
    if (storedTickets.length) void refreshTickets(storedTickets)
  }, [userEmail])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, loading])

  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = '0px'
    textarea.style.height = `${Math.min(textarea.scrollHeight, 240)}px`
  }, [input])

  const pingApi = async () => {
    try {
      const response = await fetch('/api/tooli/healthz')
      if (!response.ok) throw new Error('offline')
      const data = await response.json()
      setApiStatus(data.model || 'OK')
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
    setInput('')
    setActiveView('chat')
  }

  const ticketStorageKey = (email: string) => `tooli_tickets_${normalizeEmail(email)}`

  const loadStoredTickets = (email: string): TicketRecord[] => {
    try {
      const raw = window.localStorage.getItem(ticketStorageKey(email))
      if (!raw) return []
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) return []
      return parsed.filter(item => item?.id && normalizeEmail(item?.user_email || '') === normalizeEmail(email))
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
    if (!userEmail || sourceTickets.length === 0) {
      setTicketsError('')
      return
    }

    setTicketsLoading(true)
    setTicketsError('')

    try {
      const ids = sourceTickets.map(ticket => ticket.id).join(',')
      const response = await fetch(`/api/tooli/tickets?ids=${encodeURIComponent(ids)}`)
      const data = await readJsonResponse<{ error?: string; tickets?: TicketRecord[] }>(response)
      if (!response.ok) throw new Error(data?.error || 'No se pudieron consultar los tickets.')

      const glpiTickets = Array.isArray(data.tickets) ? data.tickets : []
      const byId = new Map(glpiTickets.map((ticket: TicketRecord) => [String(ticket.id), ticket]))
      const next = sourceTickets.map(ticket => {
        const glpiTicket = byId.get(ticket.id)
        return glpiTicket ? { ...ticket, ...glpiTicket, user_email: userEmail } : ticket
      })
      setTickets(next)
      persistTickets(userEmail, next)
    } catch (error) {
      setTicketsError(error instanceof Error ? error.message : 'No se pudieron actualizar los tickets.')
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

  const buildConversationHistory = (items: Message[]): ConversationHistoryItem[] => (
    items.slice(-8).map(item => ({
      role: item.role === 'user' ? 'user' : 'assistant',
      content: item.text,
    }))
  )

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const text = input.trim()
    if (!text || loading) return

    setMessages(prev => [...prev, { role: 'user', text }])
    setInput('')
    setLoading(true)

    try {
      const response = await fetch('/api/tooli/chat', {
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

      const data = await readJsonResponse<ApiResponse>(response)
      if (data.session_id) {
        window.localStorage.setItem('tooli_session_id', data.session_id)
        setSessionId(data.session_id)
      }
      if (data.knowledge?.id) setLastKnowledgeId(data.knowledge.id)
      if (data.tool_result?.ok && data.tool_result.ticket_id) storeGeneratedTicket(data.tool_result)
      setMessages(prev => [...prev, { role: 'bot', text: formatReply(data) }])
    } catch (error) {
      setMessages(prev => [
        ...prev,
        {
          role: 'bot',
          text: error instanceof Error ? error.message : 'Error al conectar con la API.',
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  const handleTextareaKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      event.currentTarget.form?.requestSubmit()
    }
  }

  const triggerMove = () => {
    if (isAnimating) return

    const move = TOOLI_MOVES[Math.floor(Math.random() * TOOLI_MOVES.length)]
    setIsAnimating(true)
    setCurrentMove(move)

    if (move === 'windmill') setTooliImg(TOOLI_WINDMILL_IMAGE)
    else if (move === 'spin') setTooliImg(TOOLI_SPIN_IMAGE)
    else setTooliImg(TOOLI_BASE_IMAGE)

    if (moveResetRef.current !== null) window.clearTimeout(moveResetRef.current)

    moveResetRef.current = window.setTimeout(() => {
      setIsAnimating(false)
      setCurrentMove('')
      setTooliImg(TOOLI_BASE_IMAGE)
      moveResetRef.current = null
    }, 1000)
  }

  const openChat = () => setActiveView('chat')
  const openTickets = () => {
    setActiveView('tickets')
    void refreshTickets()
  }

  return (
    <>
      <style>{`
        :root {
          --page-bg: #f8fafc;
          --panel: rgba(255, 255, 255, 0.82);
          --panel-strong: rgba(255, 255, 255, 0.92);
          --panel-muted: rgba(248, 250, 252, 0.7);
          --line: rgba(192, 199, 210, 0.55);
          --text: #1c1b1b;
          --muted: #5f6772;
          --primary: #005792;
          --primary-strong: #0170b9;
          --primary-soft: #d1e4ff;
          --secondary: #633fff;
          --secondary-soft: rgba(99, 63, 255, 0.12);
          --cyan: #08edf9;
          --success: #10b981;
          --danger: #ba1a1a;
          --danger-soft: rgba(186, 26, 26, 0.12);
          --shadow-lg: 0 30px 60px rgba(1, 24, 55, 0.12);
          --shadow-md: 0 18px 40px rgba(15, 23, 42, 0.08);
          --sidebar-width: 320px;
          --header-height: 72px;
        }
        .dashboard-shell {
          min-height: 100vh;
          color: var(--text);
          font-family: var(--font-dm-sans), sans-serif;
          background:
            radial-gradient(circle at 12% 0%, rgba(8, 237, 249, 0.14), transparent 22%),
            radial-gradient(circle at 88% 12%, rgba(99, 63, 255, 0.12), transparent 20%),
            var(--page-bg);
        }
        .page {
          min-height: 100vh;
          position: relative;
        }
        .sidebar {
          position: fixed;
          inset: 0 auto 0 0;
          width: var(--sidebar-width);
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          border-right: 1px solid var(--line);
          background: rgba(255, 255, 255, 0.88);
          backdrop-filter: blur(18px);
          z-index: 30;
        }
        .brand {
          padding: 28px 26px 20px;
          display: flex;
          align-items: center;
          gap: 14px;
        }
        .brand-mark {
          width: 44px;
          height: 44px;
          border-radius: 14px;
          display: grid;
          place-items: center;
          color: white;
          background: linear-gradient(135deg, var(--primary-strong), var(--secondary));
          box-shadow: 0 18px 30px rgba(1, 112, 185, 0.25);
        }
        .brand-title {
          margin: 0;
          font-size: 1.1rem;
          font-weight: 700;
        }
        .brand-copy {
          margin: 4px 0 0;
          color: var(--muted);
          font-size: 0.77rem;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .sidebar-body {
          padding: 0 18px 24px;
        }
        .sidebar-footer {
          padding: 18px;
          border-top: 1px solid var(--line);
        }
        .button-primary,
        .button-secondary,
        .button-ghost,
        .nav-item,
        .logout-link {
          border: 0;
          cursor: pointer;
          font: inherit;
        }
        .button-primary {
          min-height: 58px;
          width: 100%;
          padding: 0 20px;
          border-radius: 18px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          color: white;
          font-weight: 700;
          background: linear-gradient(135deg, var(--primary-strong), #0385da);
          box-shadow: 0 20px 34px rgba(1, 112, 185, 0.22);
          transition: transform 180ms ease, box-shadow 180ms ease, opacity 180ms ease;
        }
        .button-primary:hover {
          transform: translateY(-1px);
        }
        .button-primary:disabled {
          opacity: 0.68;
          cursor: not-allowed;
          transform: none;
          box-shadow: none;
        }
        .button-secondary {
          min-height: 54px;
          padding: 0 22px;
          border-radius: 18px;
          border: 1px solid rgba(1, 112, 185, 0.18);
          background: rgba(255, 255, 255, 0.74);
          color: var(--primary-strong);
          font-weight: 700;
          transition: background 180ms ease, border-color 180ms ease;
        }
        .button-secondary:hover {
          background: rgba(209, 228, 255, 0.4);
        }
        .button-ghost {
          min-height: 48px;
          padding: 0 16px;
          border-radius: 14px;
          background: transparent;
          color: var(--muted);
          font-weight: 600;
        }
        .nav-list {
          margin-top: 18px;
          display: grid;
          gap: 8px;
        }
        .nav-item,
        .logout-link {
          width: 100%;
          min-height: 52px;
          padding: 0 16px;
          border-radius: 16px;
          display: inline-flex;
          align-items: center;
          gap: 12px;
          background: transparent;
          color: var(--muted);
          font-weight: 600;
          text-align: left;
          transition: background 180ms ease, color 180ms ease, transform 180ms ease;
        }
        .nav-item:hover,
        .logout-link:hover {
          background: rgba(229, 222, 255, 0.12);
          color: var(--text);
        }
        .nav-item.active {
          background: rgba(99, 63, 255, 0.12);
          color: var(--secondary);
          font-weight: 700;
        }
        .icon {
          width: 20px;
          height: 20px;
          flex: 0 0 20px;
        }
        .main {
          margin-left: var(--sidebar-width);
          min-height: 100vh;
          position: relative;
        }
        .topbar {
          position: fixed;
          top: 0;
          left: var(--sidebar-width);
          right: 0;
          height: var(--header-height);
          padding: 0 32px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 18px;
          border-bottom: 1px solid var(--line);
          background: rgba(248, 250, 252, 0.74);
          backdrop-filter: blur(18px);
          z-index: 20;
        }
        .topbar-left {
          min-width: 0;
          display: flex;
          align-items: center;
          gap: 28px;
        }
        .topbar-title {
          margin: 0;
          font-size: 1.1rem;
          font-weight: 700;
          white-space: nowrap;
        }
        .topbar-nav {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .topbar-link {
          min-height: 38px;
          padding: 0 14px;
          border-radius: 999px;
          border: 0;
          background: transparent;
          color: var(--muted);
          cursor: pointer;
          font: inherit;
          font-weight: 600;
          transition: background 180ms ease, color 180ms ease;
        }
        .topbar-link.active {
          background: rgba(209, 228, 255, 0.75);
          color: var(--primary-strong);
        }
        .topbar-right {
          display: flex;
          align-items: center;
          gap: 16px;
        }
        .user-panel {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          padding-left: 16px;
          border-left: 1px solid var(--line);
        }
        .avatar {
          width: 36px;
          height: 36px;
          border-radius: 999px;
          display: grid;
          place-items: center;
          color: white;
          font-size: 0.8rem;
          font-weight: 700;
          background: linear-gradient(135deg, var(--secondary), #845df8);
        }
        .user-name {
          max-width: 140px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: 0.92rem;
          font-weight: 600;
        }
        .logout-inline {
          border: 0;
          background: transparent;
          color: var(--danger);
          cursor: pointer;
          font: inherit;
          font-weight: 700;
        }
        .main-inner {
          position: relative;
          padding: calc(var(--header-height) + 34px) 32px 36px;
        }
        .ambient {
          position: absolute;
          border-radius: 999px;
          filter: blur(110px);
          pointer-events: none;
          opacity: 0.9;
        }
        .ambient.top {
          top: 70px;
          right: 40px;
          width: 460px;
          height: 460px;
          background: rgba(8, 237, 249, 0.12);
        }
        .ambient.bottom {
          left: 30px;
          bottom: 120px;
          width: 360px;
          height: 360px;
          background: rgba(99, 63, 255, 0.1);
        }
        .content {
          max-width: 1180px;
          margin: 0 auto;
          position: relative;
          z-index: 1;
        }
        .hero {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 24px;
          margin-bottom: 26px;
        }
        .eyebrow {
          margin: 0 0 8px;
          color: var(--primary-strong);
          font-size: 0.76rem;
          font-weight: 700;
          letter-spacing: 0.18em;
          text-transform: uppercase;
        }
        .hero-title {
          margin: 0;
          max-width: 700px;
          font-size: clamp(2rem, 3.8vw, 2.9rem);
          line-height: 1.04;
          letter-spacing: -0.04em;
          font-weight: 700;
        }
        .hero-status {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          padding: 11px 18px;
          border-radius: 999px;
          border: 1px solid rgba(192, 199, 210, 0.55);
          background: rgba(255, 255, 255, 0.8);
          box-shadow: var(--shadow-md);
          white-space: nowrap;
        }
        .hero-status-dot {
          width: 10px;
          height: 10px;
          border-radius: 999px;
          background: var(--success);
          box-shadow: 0 0 0 6px rgba(16, 185, 129, 0.14);
        }
        .hero-status.offline .hero-status-dot {
          background: var(--danger);
          box-shadow: 0 0 0 6px rgba(186, 26, 26, 0.12);
        }
        .hero-status-copy {
          color: var(--muted);
          font-size: 0.9rem;
          font-weight: 500;
        }
        .hero-status-copy strong {
          color: var(--text);
        }
        .dashboard-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.45fr) minmax(300px, 0.8fr);
          gap: 24px;
          margin-bottom: 24px;
        }
        .glass-card,
        .panel-card {
          position: relative;
          overflow: hidden;
          border: 1px solid rgba(255, 255, 255, 0.46);
          background: var(--panel);
          backdrop-filter: blur(18px);
          box-shadow: var(--shadow-lg);
        }
        .glass-card {
          padding: 28px;
          border-radius: 32px;
        }
        .assistant-card {
          display: grid;
          grid-template-columns: 120px minmax(0, 1fr);
          align-items: center;
          gap: 24px;
          border-left: 4px solid rgba(8, 237, 249, 0.95);
          border-top-left-radius: 12px;
        }
        .assistant-card::after {
          content: '';
          position: absolute;
          top: -34px;
          right: -38px;
          width: 180px;
          height: 180px;
          border-radius: 999px;
          background: radial-gradient(circle, rgba(8, 237, 249, 0.18), transparent 70%);
        }
        .assistant-figure {
          position: relative;
          display: grid;
          place-items: center;
        }
        .assistant-trigger {
          width: 112px;
          height: 112px;
          display: grid;
          place-items: center;
          position: relative;
          border: 0;
          background: transparent;
          cursor: pointer;
          padding: 0;
        }
        .assistant-trigger:focus-visible {
          outline: 2px solid rgba(1, 112, 185, 0.45);
          outline-offset: 8px;
          border-radius: 999px;
        }
        .assistant-image-shell {
          width: 112px;
          height: 112px;
          display: grid;
          place-items: center;
          transition: transform 300ms ease, filter 300ms ease;
        }
        .assistant-image {
          width: 100%;
          height: 100%;
          object-fit: contain;
          filter: drop-shadow(0 24px 32px rgba(1, 24, 55, 0.16));
        }
        .assistant-trigger:hover .assistant-tooltip {
          opacity: 1;
          transform: translate(-50%, 0);
        }
        .assistant-tooltip {
          position: absolute;
          left: 50%;
          bottom: -6px;
          transform: translate(-50%, 4px);
          opacity: 0;
          padding: 4px 10px;
          border-radius: 999px;
          background: var(--primary-strong);
          color: white;
          font-size: 0.62rem;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          transition: opacity 180ms ease, transform 180ms ease;
          white-space: nowrap;
        }
        .assistant-copy {
          position: relative;
          z-index: 1;
        }
        .assistant-label {
          margin: 0 0 10px;
          color: var(--primary-strong);
          font-size: 0.8rem;
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }
        .assistant-text {
          margin: 0;
          color: #404751;
          line-height: 1.7;
          font-size: 1rem;
          font-family: var(--font-rubik), sans-serif;
        }
        .assistant-text strong {
          color: var(--primary-strong);
        }
        .assistant-tip {
          margin-top: 18px;
          display: inline-flex;
          align-items: center;
          gap: 10px;
          padding: 12px 16px;
          border-radius: 16px;
          background: rgba(240, 244, 250, 0.6);
          color: var(--muted);
          font-size: 0.88rem;
        }
        .assistant-tip strong {
          color: var(--primary-strong);
        }
        .assistant-idle {
          animation: floatIdle 4s ease-in-out infinite;
        }
        .assistant-spin {
          animation: spinMove 0.8s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .assistant-windmill {
          animation: windmillMove 1s ease-in-out;
        }
        .assistant-bounce {
          animation: bounceMove 0.8s ease;
        }
        .assistant-backflip {
          animation: backflipMove 0.8s ease-in-out;
        }
        .assistant-freeze {
          filter: grayscale(1) contrast(1.14);
          transition: filter 0.5s ease;
        }
        .insight-column {
          display: grid;
          gap: 18px;
        }
        .insight-card {
          padding: 24px;
          border-radius: 28px;
        }
        .insight-title {
          margin: 0;
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 1.05rem;
          font-weight: 700;
        }
        .insight-copy,
        .meta-copy {
          margin: 8px 0 0;
          color: var(--muted);
          line-height: 1.6;
        }
        .live-chip {
          display: inline-flex;
          align-items: center;
          padding: 4px 8px;
          border-radius: 999px;
          background: rgba(1, 112, 185, 0.1);
          color: var(--primary-strong);
          font-size: 0.62rem;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .insight-count {
          margin-top: 16px;
          font-size: 2.4rem;
          line-height: 1;
          font-weight: 700;
        }
        .insight-support {
          margin-top: 8px;
          display: flex;
          align-items: center;
          gap: 8px;
          color: var(--muted);
          font-size: 0.88rem;
        }
        .meta-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 18px;
          margin-bottom: 24px;
        }
        .meta-card {
          padding: 24px;
          border-radius: 24px;
          background: var(--panel-strong);
          border: 1px solid rgba(192, 199, 210, 0.35);
          box-shadow: var(--shadow-md);
        }
        .meta-label {
          margin: 0;
          color: var(--muted);
          font-size: 0.78rem;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          font-weight: 700;
        }
        .meta-value {
          margin: 12px 0 0;
          font-size: 1.15rem;
          font-weight: 700;
        }
        .meta-value.tight {
          font-size: 0.98rem;
          line-height: 1.5;
          word-break: break-word;
        }
        .conversation-card,
        .tickets-card {
          border-radius: 32px;
          background: var(--panel-strong);
          border: 1px solid rgba(192, 199, 210, 0.35);
          box-shadow: var(--shadow-lg);
          overflow: hidden;
        }
        .section-header {
          padding: 24px 28px 18px;
          border-bottom: 1px solid rgba(192, 199, 210, 0.28);
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
        }
        .section-title {
          margin: 0;
          font-size: 1.08rem;
          font-weight: 700;
        }
        .section-copy {
          margin: 6px 0 0;
          color: var(--muted);
          line-height: 1.6;
        }
        .conversation-stream {
          padding: 18px 28px 28px;
        }
        .empty-state {
          padding: 28px;
          border-radius: 24px;
          background: rgba(248, 250, 252, 0.7);
          border: 1px dashed rgba(192, 199, 210, 0.55);
          color: var(--muted);
          line-height: 1.8;
        }
        .message-row {
          display: flex;
          gap: 16px;
          align-items: flex-start;
          margin-top: 18px;
        }
        .message-row.user {
          justify-content: flex-end;
        }
        .message-badge {
          width: 42px;
          height: 42px;
          flex: 0 0 42px;
          display: grid;
          place-items: center;
          border-radius: 16px;
          color: white;
          font-size: 0.8rem;
          font-weight: 700;
          background: linear-gradient(135deg, var(--primary-strong), var(--secondary));
        }
        .message-row.user .message-badge {
          background: linear-gradient(135deg, rgba(209, 228, 255, 0.9), rgba(229, 237, 255, 0.9));
          color: var(--primary-strong);
        }
        .message-wrap {
          max-width: min(820px, calc(100% - 58px));
        }
        .message-bubble {
          padding: 22px 24px;
          border-radius: 24px;
          border: 1px solid rgba(192, 199, 210, 0.44);
          background: rgba(248, 251, 255, 0.95);
          white-space: pre-wrap;
          word-break: break-word;
          line-height: 1.72;
          box-shadow: 0 18px 36px rgba(15, 23, 42, 0.05);
        }
        .message-row.user .message-bubble {
          background: linear-gradient(135deg, rgba(240, 245, 255, 0.98), rgba(229, 237, 255, 0.98));
        }
        .message-meta {
          margin-top: 8px;
          padding: 0 10px;
          color: var(--muted);
          font-size: 0.78rem;
        }
        .typing {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          min-height: 24px;
        }
        .typing span {
          width: 8px;
          height: 8px;
          border-radius: 999px;
          background: #9fb0ca;
          animation: typingBounce 1.2s infinite ease-in-out;
        }
        .typing span:nth-child(2) {
          animation-delay: 0.2s;
        }
        .typing span:nth-child(3) {
          animation-delay: 0.4s;
        }
        .tickets-list {
          padding: 18px 28px 28px;
          display: grid;
          gap: 16px;
        }
        .tickets-banner {
          margin: 0 28px 4px;
          padding: 14px 16px;
          border-radius: 18px;
          color: var(--danger);
          background: var(--danger-soft);
          border: 1px solid rgba(186, 26, 26, 0.18);
        }
        .ticket-card {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 18px;
          padding: 22px 24px;
          border-radius: 24px;
          border: 1px solid rgba(192, 199, 210, 0.38);
          background: rgba(255, 255, 255, 0.88);
          box-shadow: var(--shadow-md);
        }
        .ticket-title {
          margin: 0;
          font-size: 1rem;
          font-weight: 700;
        }
        .ticket-copy {
          margin: 10px 0 0;
          color: var(--muted);
          line-height: 1.65;
        }
        .ticket-status {
          align-self: flex-start;
          padding: 10px 14px;
          border-radius: 999px;
          font-size: 0.82rem;
          font-weight: 700;
          white-space: nowrap;
          color: var(--primary-strong);
          background: rgba(1, 112, 185, 0.12);
        }
        .ticket-status.error {
          color: var(--danger);
          background: var(--danger-soft);
        }
        .composer-shell {
          position: sticky;
          bottom: 0;
          margin-top: 26px;
          padding-bottom: 10px;
        }
        .composer {
          overflow: hidden;
          border-radius: 34px;
          background: rgba(255, 255, 255, 0.72);
          border: 1px solid rgba(255, 255, 255, 0.5);
          box-shadow: var(--shadow-lg);
          backdrop-filter: blur(18px);
        }
        .composer-bar {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 16px 24px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.25);
          background: rgba(255, 255, 255, 0.32);
          color: var(--muted);
        }
        .composer-live {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          font-size: 0.82rem;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          font-weight: 600;
        }
        .composer-live-dot {
          width: 8px;
          height: 8px;
          border-radius: 999px;
          background: var(--cyan);
          box-shadow: 0 0 0 5px rgba(8, 237, 249, 0.16);
          animation: pulseDot 1.6s infinite ease-in-out;
        }
        .composer-main {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 18px;
          padding: 20px 22px;
        }
        .composer-input {
          width: 100%;
          min-height: 72px;
          max-height: 240px;
          resize: none;
          border: 0;
          outline: 0;
          padding: 18px 20px;
          border-radius: 24px;
          background: rgba(240, 244, 250, 0.72);
          color: var(--text);
          line-height: 1.6;
          font-size: 1rem;
        }
        .composer-input::placeholder {
          color: rgba(64, 71, 81, 0.55);
        }
        .composer-actions {
          display: flex;
          align-items: flex-end;
          gap: 12px;
        }
        .composer-send {
          min-width: 156px;
          padding: 0 28px;
        }
        .composer-footer {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 28px;
          padding: 0 22px 18px;
          color: var(--muted);
          font-size: 0.76rem;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .composer-footer-item {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          opacity: 0.58;
          transition: opacity 180ms ease;
        }
        .composer-footer-item:hover {
          opacity: 1;
        }
        .muted-pill {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          border-radius: 999px;
          background: rgba(248, 250, 252, 0.8);
          border: 1px solid rgba(192, 199, 210, 0.35);
          color: var(--muted);
          font-size: 0.8rem;
        }
        @keyframes floatIdle {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          50% { transform: translateY(-10px) rotate(2deg); }
        }
        @keyframes spinMove {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes windmillMove {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(720deg); }
        }
        @keyframes bounceMove {
          0%, 20%, 50%, 80%, 100% { transform: translateY(0); }
          40% { transform: translateY(-30px); }
          60% { transform: translateY(-15px); }
        }
        @keyframes backflipMove {
          0% { transform: rotateX(0deg) translateY(0); }
          50% { transform: rotateX(180deg) translateY(-50px); }
          100% { transform: rotateX(360deg) translateY(0); }
        }
        @keyframes typingBounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.55; }
          30% { transform: translateY(-6px); opacity: 1; }
        }
        @keyframes pulseDot {
          0%, 100% { transform: scale(1); opacity: 0.75; }
          50% { transform: scale(1.15); opacity: 1; }
        }
        @media (max-width: 1180px) {
          .dashboard-grid {
            grid-template-columns: 1fr;
          }
          .meta-grid {
            grid-template-columns: 1fr;
          }
          .composer-main {
            grid-template-columns: 1fr;
          }
          .composer-actions {
            justify-content: stretch;
          }
          .composer-actions .button-secondary,
          .composer-actions .button-primary {
            flex: 1;
          }
        }
        @media (max-width: 980px) {
          :root {
            --sidebar-width: 100%;
            --header-height: auto;
          }
          .sidebar {
            position: static;
            width: auto;
            border-right: 0;
            border-bottom: 1px solid var(--line);
          }
          .main {
            margin-left: 0;
          }
          .topbar {
            position: static;
            left: 0;
            height: auto;
            padding: 18px 20px;
            flex-direction: column;
            align-items: flex-start;
          }
          .topbar-left,
          .topbar-right {
            width: 100%;
            justify-content: space-between;
          }
          .topbar-left {
            flex-direction: column;
            align-items: flex-start;
            gap: 14px;
          }
          .topbar-right {
            gap: 14px;
          }
          .main-inner {
            padding: 24px 20px 28px;
          }
        }
        @media (max-width: 760px) {
          .brand {
            padding: 22px 20px 16px;
          }
          .sidebar-body,
          .sidebar-footer {
            padding-left: 14px;
            padding-right: 14px;
          }
          .hero {
            flex-direction: column;
            align-items: stretch;
          }
          .assistant-card {
            grid-template-columns: 1fr;
            text-align: center;
          }
          .assistant-figure {
            justify-content: center;
          }
          .assistant-tip {
            width: 100%;
            justify-content: center;
          }
          .section-header,
          .conversation-stream,
          .tickets-list {
            padding-left: 18px;
            padding-right: 18px;
          }
          .tickets-banner {
            margin-left: 18px;
            margin-right: 18px;
          }
          .ticket-card {
            grid-template-columns: 1fr;
          }
          .message-wrap {
            max-width: 100%;
          }
          .composer-bar,
          .composer-main,
          .composer-footer {
            padding-left: 16px;
            padding-right: 16px;
          }
          .composer-footer {
            gap: 16px;
            flex-wrap: wrap;
          }
          .user-panel {
            border-left: 0;
            padding-left: 0;
          }
        }
      `}</style>

      <div className={`dashboard-shell ${dmSans.variable} ${rubik.variable}`}>
        <div className="page">
          <aside className="sidebar">
            <div>
              <div className="brand">
                <div className="brand-mark">
                  <Icon name="spark" className="icon" />
                </div>
                <div>
                  <p className="brand-title">TOOLI</p>
                  <p className="brand-copy">Workspace operacional</p>
                </div>
              </div>

              <div className="sidebar-body">
                <button className="button-primary" type="button" onClick={startNewChat}>
                  <Icon name="add" className="icon" />
                  <span>Nueva conversacion</span>
                </button>

                <nav className="nav-list" aria-label="Navegacion del dashboard">
                  <button className={`nav-item ${activeView === 'chat' ? 'active' : ''}`} type="button" onClick={openChat}>
                    <Icon name="dashboard" className="icon" />
                    <span>Workspace</span>
                  </button>
                  <button className={`nav-item ${activeView === 'chat' ? 'active' : ''}`} type="button" onClick={openChat}>
                    <Icon name="book" className="icon" />
                    <span>Knowledge Base</span>
                  </button>
                  <button className={`nav-item ${activeView === 'tickets' ? 'active' : ''}`} type="button" onClick={openTickets}>
                    <Icon name="ticket" className="icon" />
                    <span>Tickets</span>
                  </button>
                </nav>
              </div>
            </div>

            <div className="sidebar-footer">
              <button className="logout-link" type="button" onClick={handleLogout}>
                <Icon name="logout" className="icon" />
                <span>Cerrar sesion</span>
              </button>
            </div>
          </aside>

          <main className="main">
            <header className="topbar">
              <div className="topbar-left">
                <h2 className="topbar-title">Agente TOOLI</h2>
                <nav className="topbar-nav" aria-label="Vistas principales">
                  <button className={`topbar-link ${activeView === 'chat' ? 'active' : ''}`} type="button" onClick={openChat}>
                    Dashboard
                  </button>
                  <button className={`topbar-link ${activeView === 'tickets' ? 'active' : ''}`} type="button" onClick={openTickets}>
                    Tickets
                  </button>
                </nav>
              </div>

              <div className="topbar-right">
                <div className="user-panel">
                  <div className="avatar">{userInitial}</div>
                  <span className="user-name">{userName}</span>
                  <button className="logout-inline" type="button" onClick={handleLogout}>
                    Salir
                  </button>
                </div>
              </div>
            </header>

            <div className="main-inner">
              <div className="ambient top" />
              <div className="ambient bottom" />

              <div className="content">
                <section className="hero">
                  <div>
                    <p className="eyebrow">Centro de orientacion inteligente</p>
                    <h1 className="hero-title">Resuelve primero con TOOLI</h1>
                  </div>

                  <div className={`hero-status ${apiStatus === 'offline' ? 'offline' : ''}`}>
                    <span className="hero-status-dot" />
                    <span className="hero-status-copy">
                      Modelo activo: <strong>{summarizeModelLabel(apiStatus)}</strong>
                    </span>
                  </div>
                </section>

                {activeView === 'chat' ? (
                  <>
                    <section className="dashboard-grid">
                      <article className="glass-card assistant-card">
                        <div className="assistant-figure">
                          <button className="assistant-trigger" type="button" onClick={triggerMove} aria-label="Animar a TOOLI">
                            <div
                              className={[
                                'assistant-image-shell',
                                !isAnimating ? 'assistant-idle' : '',
                                currentMove === 'spin' ? 'assistant-spin' : '',
                                currentMove === 'windmill' ? 'assistant-windmill' : '',
                                currentMove === 'bounce' ? 'assistant-bounce' : '',
                                currentMove === 'backflip' ? 'assistant-backflip' : '',
                                currentMove === 'freeze' ? 'assistant-freeze' : '',
                              ].filter(Boolean).join(' ')}
                            >
                              <img src={tooliImg} alt="Tooli animado" className="assistant-image" />
                            </div>
                            <span className="assistant-tooltip">Hazme click</span>
                          </button>
                        </div>

                        <div className="assistant-copy">
                          <p className="assistant-label">Tooli Asistente</p>
                          <p className="assistant-text">
                            Hola. Soy <strong>TOOLI</strong>, tu asistente operacional inteligente.
                            Puedo ayudarte a consultar servicios, resolver dudas frecuentes o validar
                            si un caso realmente necesita ticket.
                          </p>

                          <div className="assistant-tip">
                            <Icon name="bolt" className="icon" />
                            <span>
                              Prueba con: <strong>&quot;¿Como generar mi recibo de matricula?&quot;</strong>
                            </span>
                          </div>
                        </div>
                      </article>

                      <div className="insight-column">
                        <article className="glass-card insight-card">
                          <h3 className="insight-title">
                            Solicitudes activas
                            <span className="live-chip">Tiempo real</span>
                          </h3>
                          <p className="insight-copy">Casos abiertos o pendientes de revision registrados desde esta cuenta.</p>
                          <p className="insight-count">{activeTicketCount}</p>
                          <div className="insight-support">
                            <Icon name="ticket" className="icon" />
                            <span>{tickets.length} tickets vinculados a tu correo</span>
                          </div>
                        </article>

                        <article className="glass-card insight-card">
                          <h3 className="insight-title">Contexto de sesion</h3>
                          <p className="meta-copy">
                            La sesion, la memoria reciente y el conocimiento sugerido siguen conectados al backend actual.
                          </p>
                          <div className="insight-support">
                            <div className="muted-pill">
                              <Icon name="chat" className="icon" />
                              <span>{messages.length} mensajes</span>
                            </div>
                            <div className="muted-pill">
                              <Icon name="book" className="icon" />
                              <span>{lastKnowledgeId || 'Sin KB activa'}</span>
                            </div>
                          </div>
                        </article>
                      </div>
                    </section>

                    <section className="meta-grid">
                      <article className="meta-card">
                        <p className="meta-label">Sesion actual</p>
                        <p className="meta-value tight">{sessionId || 'Preparando sesion...'}</p>
                      </article>
                      <article className="meta-card">
                        <p className="meta-label">Usuario autenticado</p>
                        <p className="meta-value tight">{userEmail || 'Cargando perfil...'}</p>
                      </article>
                    </section>

                    <section className="conversation-card" aria-live="polite">
                      <div className="section-header">
                        <div>
                          <h3 className="section-title">Conversacion activa</h3>
                          <p className="section-copy">
                            El flujo sigue usando <code>/api/tooli/chat</code> con la misma sesion,
                            historial y contexto del usuario.
                          </p>
                        </div>
                      </div>

                      <div className="conversation-stream">
                        {messages.length === 0 ? (
                          <div className="empty-state">
                            TOOLI esta listo para ayudarte. Describe un servicio, plantea el problema
                            o pide orientacion antes de escalar a ticket.
                          </div>
                        ) : (
                          messages.map((msg, index) => (
                            <div key={index} className={`message-row ${msg.role}`}>
                              {msg.role === 'bot' && <div className="message-badge">AI</div>}
                              <div className="message-wrap">
                                <div className="message-bubble">{msg.text}</div>
                                <div className="message-meta">{msg.role === 'bot' ? 'Agente TOOLI' : 'Ahora'}</div>
                              </div>
                              {msg.role === 'user' && <div className="message-badge">Tu</div>}
                            </div>
                          ))
                        )}

                        {loading && (
                          <div className="message-row bot">
                            <div className="message-badge">AI</div>
                            <div className="message-wrap">
                              <div className="message-bubble">
                                <div className="typing">
                                  <span />
                                  <span />
                                  <span />
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                        <div ref={messagesEndRef} />
                      </div>
                    </section>
                  </>
                ) : (
                  <section className="tickets-card" aria-live="polite">
                    <div className="section-header">
                      <div>
                        <h3 className="section-title">Tickets creados desde TOOLI</h3>
                        <p className="section-copy">
                          Se mantiene el enlace con <code>/api/tooli/tickets</code> y con el historial
                          persistido por correo en esta sesion.
                        </p>
                      </div>

                      <button className="button-secondary" type="button" onClick={() => void refreshTickets()} disabled={ticketsLoading || tickets.length === 0}>
                        <Icon name="refresh" className="icon" />
                        <span>{ticketsLoading ? 'Actualizando...' : 'Actualizar'}</span>
                      </button>
                    </div>

                    {ticketsError && <p className="tickets-banner">{ticketsError}</p>}

                    <div className="tickets-list">
                      {tickets.length === 0 ? (
                        <div className="empty-state">
                          Todavia no hay tickets creados desde esta cuenta. Cuando TOOLI radique uno
                          en GLPI, aparecera aqui ligado a tu correo.
                        </div>
                      ) : (
                        tickets.map(ticket => (
                          <article className="ticket-card" key={ticket.id}>
                            <div>
                              <p className="ticket-title">#{ticket.id} · {ticket.title}</p>
                              <p className="ticket-copy">
                                Usuario: {ticket.user_email}
                                <br />
                                Creado: {formatDateTime(ticket.created_at)}
                                {ticket.updated_at ? (
                                  <>
                                    <br />
                                    Ultima actualizacion GLPI: {formatDateTime(ticket.updated_at)}
                                  </>
                                ) : null}
                                {ticket.error ? (
                                  <>
                                    <br />
                                    {ticket.error}
                                  </>
                                ) : null}
                              </p>
                            </div>

                            <span className={`ticket-status ${ticket.ok === false ? 'error' : ''}`}>
                              {ticket.ok === false ? 'Sin consultar' : ticket.status_label || 'Creado'}
                            </span>
                          </article>
                        ))
                      )}
                    </div>
                  </section>
                )}

                <div className="composer-shell">
                  <form className="composer" onSubmit={handleSubmit} autoComplete="off">
                    <div className="composer-bar">
                      <div className="composer-live">
                        <span className="composer-live-dot" />
                        <span>{loading ? 'Tooli esta respondiendo...' : 'Tooli esta escuchando...'}</span>
                      </div>
                    </div>

                    <div className="composer-main">
                      <textarea
                        ref={textareaRef}
                        className="composer-input"
                        placeholder="Pregunta por un servicio o describe el problema..."
                        value={input}
                        onChange={event => setInput(event.target.value)}
                        onKeyDown={handleTextareaKeyDown}
                        disabled={loading}
                        rows={1}
                        required
                      />

                      <div className="composer-actions">
                        <button className="button-secondary" type="button" onClick={openTickets}>
                          Tickets
                        </button>
                        <button className="button-primary composer-send" type="submit" disabled={loading || !input.trim()}>
                          <span>Enviar</span>
                          <Icon name="send" className="icon" />
                        </button>
                      </div>
                    </div>

                    <div className="composer-footer">
                      <div className="composer-footer-item">
                        <Icon name="shield" className="icon" />
                        <span>Canal cifrado</span>
                      </div>
                      <div className="composer-footer-item">
                        <Icon name="eye" className="icon" />
                        <span>Auditoria activa</span>
                      </div>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>
    </>
  )
}
