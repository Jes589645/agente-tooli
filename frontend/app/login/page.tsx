'use client'

import { useEffect, useState, FormEvent, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'

const ALLOWED_DOMAIN = process.env.NEXT_PUBLIC_ALLOWED_EMAIL_DOMAIN || 'utb.edu.co'

type Status = 'idle' | 'loading' | 'success' | 'error'

const ERROR_MESSAGES: Record<string, string> = {
  domain_not_allowed: `Solo se permiten correos @${ALLOWED_DOMAIN}`,
  auth_callback_error: 'Error al completar la autenticacion. Intenta de nuevo.',
  user_not_found: 'Este correo no esta registrado. Contacta al administrador.',
  invalid_credentials: 'Credenciales incorrectas. Verifica tu correo y contrasena.',
  user_inactive: 'Tu cuenta esta desactivada. Contacta al administrador.',
}

function LoginContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  useEffect(() => {
    const urlError = searchParams.get('error')
    if (urlError && ERROR_MESSAGES[urlError]) {
      setErrorMsg(ERROR_MESSAGES[urlError])
      setStatus('error')
    }
  }, [searchParams])

  const validateEmail = (value: string) => {
    if (!value.endsWith(`@${ALLOWED_DOMAIN}`)) {
      setErrorMsg(`Solo se permiten correos @${ALLOWED_DOMAIN}`)
      setStatus('error')
      return false
    }
    return true
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setErrorMsg('')
    setStatus('idle')

    if (!validateEmail(email)) return

    setStatus('loading')

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({
      email: email.toLowerCase().trim(),
      password,
    })

    if (error) {
      setStatus('error')
      if (error.message.includes('Invalid login credentials')) {
        setErrorMsg(ERROR_MESSAGES.invalid_credentials)
      } else if (error.message.includes('Email not confirmed')) {
        setErrorMsg('Debes confirmar tu correo antes de iniciar sesion.')
      } else {
        setErrorMsg(error.message)
      }
      return
    }

    setStatus('success')
    const redirectTo = searchParams.get('redirectTo') || '/dashboard'
    router.push(redirectTo)
    router.refresh()
  }

  const isLoading = status === 'loading'

  return (
    <>
      <style>{`
        :root {
          --navy-900: #0c1f47;
          --blue-600: #2e5bff;
          --slate-900: #111827;
          --slate-700: #334155;
          --slate-500: #64748b;
          --slate-200: #e2e8f0;
          --surface: rgba(255,255,255,0.92);
          --white: #ffffff;
          --error: #dc2626;
          --success: #15803d;
        }
        .page {
          min-height: 100vh;
          display: grid;
          place-items: center;
          padding: 32px;
          font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif;
        }
        .shell {
          width: min(1100px, 100%);
          min-height: 672px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          background: var(--surface);
          border: 1px solid rgba(255,255,255,0.75);
          border-radius: 30px;
          overflow: hidden;
          box-shadow: 0 40px 100px rgba(15, 23, 42, 0.18);
          backdrop-filter: blur(18px);
        }
        .panel-left {
          position: relative;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding: 48px;
          color: var(--white);
          background:
            linear-gradient(160deg, rgba(6, 19, 47, 0.78), rgba(28, 71, 189, 0.58)),
            radial-gradient(circle at 15% 10%, rgba(97, 215, 255, 0.4), transparent 28%),
            radial-gradient(circle at 85% 15%, rgba(112, 82, 255, 0.22), transparent 26%),
            linear-gradient(135deg, #081226 0%, #0f2f68 55%, #11244a 100%);
        }
        .panel-left::before {
          content: '';
          position: absolute;
          inset: 0;
          background:
            linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px);
          background-size: 44px 44px;
          opacity: 0.22;
          pointer-events: none;
        }
        .left-top,
        .left-bottom {
          position: relative;
          z-index: 1;
        }
        .brand {
          display: inline-flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 44px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          font-size: 0.82rem;
          font-weight: 700;
        }
        .brand-mark {
          width: 28px;
          height: 28px;
          border-radius: 10px;
          background: linear-gradient(135deg, rgba(97, 215, 255, 0.95), rgba(46, 91, 255, 0.92));
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.45), 0 12px 28px rgba(16, 84, 255, 0.35);
        }
        .eyebrow {
          margin: 0 0 16px;
          color: rgba(255,255,255,0.6);
          font-size: 0.78rem;
          font-weight: 700;
          letter-spacing: 0.18em;
          text-transform: uppercase;
        }
        .headline {
          margin: 0;
          max-width: 390px;
          font-family: Georgia, "Times New Roman", serif;
          font-size: clamp(2.7rem, 5vw, 4.3rem);
          line-height: 0.94;
          letter-spacing: -0.05em;
        }
        .subcopy {
          margin: 20px 0 0;
          max-width: 360px;
          color: rgba(255,255,255,0.78);
          font-size: 1rem;
          line-height: 1.7;
        }
        .insight-card {
          width: min(320px, 100%);
          padding: 24px;
          border-radius: 24px;
          border: 1px solid rgba(255,255,255,0.14);
          background: rgba(255,255,255,0.1);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.1);
          backdrop-filter: blur(12px);
        }
        .insight-label {
          margin: 0 0 12px;
          color: rgba(255,255,255,0.62);
          font-size: 0.72rem;
          font-weight: 700;
          letter-spacing: 0.16em;
          text-transform: uppercase;
        }
        .insight-copy {
          margin: 0;
          font-size: 1rem;
          line-height: 1.65;
          color: rgba(255,255,255,0.94);
        }
        .panel-right {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 64px;
          background: linear-gradient(180deg, rgba(255,255,255,0.95), rgba(248, 250, 252, 0.96));
        }
        .form-card { width: min(422px, 100%); }
        .mobile-brand {
          display: none;
          align-items: center;
          gap: 10px;
          margin-bottom: 28px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--navy-900);
          font-size: 0.82rem;
        }
        .form-title {
          margin: 0;
          font-family: Georgia, "Times New Roman", serif;
          font-size: 2.2rem;
          line-height: 1.08;
          color: var(--slate-900);
          letter-spacing: -0.04em;
        }
        .form-subtitle {
          margin: 14px 0 32px;
          color: var(--slate-500);
          font-size: 0.98rem;
          line-height: 1.6;
        }
        .field { margin-bottom: 24px; }
        .field-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 10px;
        }
        .field-label {
          display: block;
          color: var(--slate-700);
          font-size: 0.92rem;
          font-weight: 700;
        }
        .field-link {
          color: var(--blue-600);
          font-size: 0.86rem;
          font-weight: 700;
        }
        .field-shell {
          position: relative;
          display: flex;
          align-items: center;
          min-height: 52px;
          border: 1px solid var(--slate-200);
          border-radius: 16px;
          background: rgba(248, 250, 252, 0.92);
          transition: border-color 0.2s, box-shadow 0.2s, transform 0.2s;
        }
        .field-shell:focus-within {
          border-color: rgba(46, 91, 255, 0.55);
          box-shadow: 0 0 0 5px rgba(46, 91, 255, 0.08);
          transform: translateY(-1px);
        }
        .field-icon {
          width: 20px;
          margin-left: 16px;
          color: var(--slate-500);
          text-align: center;
          font-size: 1rem;
        }
        .field-input {
          width: 100%;
          border: 0;
          outline: 0;
          background: transparent;
          padding: 16px 16px 16px 12px;
          color: var(--slate-900);
          font-size: 0.98rem;
        }
        .field-input::placeholder { color: #94a3b8; }
        .toggle-btn {
          margin-right: 14px;
          border: 0;
          background: transparent;
          color: var(--slate-500);
          font-size: 0.92rem;
          cursor: pointer;
          font-weight: 700;
        }
        .remember-row {
          display: flex;
          align-items: center;
          gap: 12px;
          margin: 8px 0 24px;
          color: var(--slate-700);
          font-size: 0.95rem;
        }
        .remember-row input {
          width: 18px;
          height: 18px;
          accent-color: var(--blue-600);
        }
        .alert {
          padding: 14px 16px;
          border-radius: 16px;
          font-size: 0.92rem;
          margin-bottom: 20px;
          line-height: 1.55;
        }
        .alert-error {
          color: var(--error);
          background: rgba(220, 38, 38, 0.07);
          border: 1px solid rgba(220, 38, 38, 0.14);
        }
        .alert-success {
          color: var(--success);
          background: rgba(21, 128, 61, 0.08);
          border: 1px solid rgba(21, 128, 61, 0.15);
        }
        .submit-btn {
          width: 100%;
          min-height: 56px;
          border: 0;
          border-radius: 18px;
          background: linear-gradient(135deg, var(--blue-600), #1947ef);
          color: var(--white);
          font-size: 1rem;
          font-weight: 800;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          cursor: pointer;
          box-shadow: 0 18px 30px rgba(46, 91, 255, 0.22);
        }
        .submit-btn:disabled {
          opacity: 0.65;
          cursor: not-allowed;
          box-shadow: none;
        }
        .footer-copy {
          margin-top: 36px;
          color: var(--slate-500);
          font-size: 0.94rem;
          text-align: center;
        }
        .footer-copy strong { color: var(--blue-600); }
        @keyframes spin { to { transform: rotate(360deg); } }
        .spinner {
          display: inline-block;
          width: 15px;
          height: 15px;
          border: 2px solid rgba(255,255,255,0.35);
          border-top-color: white;
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
          vertical-align: middle;
          margin-right: 8px;
        }
        @media (max-width: 900px) {
          .page { padding: 18px; }
          .shell { grid-template-columns: 1fr; }
          .panel-left { min-height: 380px; }
          .panel-right { padding: 40px 24px; }
          .mobile-brand { display: inline-flex; }
        }
        @media (max-width: 640px) {
          .page { padding: 0; }
          .shell { border-radius: 0; min-height: 100vh; }
          .panel-left, .panel-right { padding: 28px 20px; }
        }
      `}</style>

      <div className="page">
        <div className="shell">
          <div className="panel-left">
            <div className="left-top">
              <div className="brand">
                <span className="brand-mark" />
                <span>Agente TOOLI</span>
              </div>
              <p className="eyebrow">Asistencia operativa</p>
              <h1 className="headline">Agente inteligente TOOLI</h1>
              <p className="subcopy">
                Resuelve tickets, consulta estados y centraliza conversaciones de soporte
                desde una interfaz mas clara y enfocada.
              </p>
            </div>
            <div className="left-bottom">
              <div className="insight-card">
                <p className="insight-label">Ultima actualizacion</p>
                <p className="insight-copy">
                  "El nuevo motor de Agente TOOLI ha optimizado la gestion de tareas en un 42%."
                </p>
              </div>
            </div>
          </div>

          <div className="panel-right">
            <div className="form-card">
              <div className="mobile-brand">
                <span className="brand-mark" />
                <span>Agente TOOLI</span>
              </div>
              <h2 className="form-title">Bienvenido</h2>
              <p className="form-subtitle">
                Ingresa tus credenciales para acceder al espacio de trabajo.
              </p>

              {status === 'error' && errorMsg && (
                <div className="alert alert-error">{errorMsg}</div>
              )}
              {status === 'success' && (
                <div className="alert alert-success">Autenticacion exitosa, redirigiendo...</div>
              )}

              <form onSubmit={handleSubmit} noValidate>
                <div className="field">
                  <label className="field-label" htmlFor="email">Correo corporativo</label>
                  <div className="field-shell">
                    <span className="field-icon">@</span>
                    <input
                      id="email"
                      type="email"
                      className="field-input"
                      placeholder={`nombre@${ALLOWED_DOMAIN}`}
                      value={email}
                      onChange={e => {
                        setEmail(e.target.value)
                        if (status === 'error') { setStatus('idle'); setErrorMsg('') }
                      }}
                      onBlur={() => {
                        if (email && !email.endsWith(`@${ALLOWED_DOMAIN}`)) {
                          setErrorMsg(`Solo se permiten correos @${ALLOWED_DOMAIN}`)
                          setStatus('error')
                        }
                      }}
                      required
                      autoComplete="email"
                      disabled={isLoading}
                    />
                  </div>
                </div>

                <div className="field">
                  <div className="field-row">
                    <label className="field-label" htmlFor="password">Contrasena</label>
                    <a className="field-link" href="#">Olvidaste tu contrasena?</a>
                  </div>
                  <div className="field-shell">
                    <span className="field-icon">*</span>
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      className="field-input"
                      placeholder="••••••••"
                      value={password}
                      onChange={e => {
                        setPassword(e.target.value)
                        if (status === 'error') { setStatus('idle'); setErrorMsg('') }
                      }}
                      required
                      autoComplete="current-password"
                      disabled={isLoading}
                    />
                    <button
                      type="button"
                      className="toggle-btn"
                      onClick={() => setShowPassword(v => !v)}
                      tabIndex={-1}
                    >
                      {showPassword ? 'Ocultar' : 'Ver'}
                    </button>
                  </div>
                </div>

                <label className="remember-row">
                  <input type="checkbox" defaultChecked />
                  <span>Recordar sesion en este equipo</span>
                </label>

                <button
                  type="submit"
                  className="submit-btn"
                  disabled={isLoading || status === 'success'}
                >
                  {isLoading
                    ? <><span className="spinner" />Verificando...</>
                    : status === 'success'
                      ? 'Acceso concedido'
                      : 'Iniciar sesion'
                  }
                </button>
              </form>

              <p className="footer-copy">
                No tienes acceso? <strong>Solicitar acceso</strong>
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
export default function LoginPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <LoginContent />
    </Suspense>
  )
}
