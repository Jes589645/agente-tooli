 'use client'

import { useState, useEffect, FormEvent, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'

const ALLOWED_DOMAIN = process.env.NEXT_PUBLIC_ALLOWED_EMAIL_DOMAIN || 'utb.edu.co'

type Status = 'idle' | 'loading' | 'success' | 'error'

const ERROR_MESSAGES: Record<string, string> = {
  domain_not_allowed: `Solo se permiten correos @${ALLOWED_DOMAIN}`,
  auth_callback_error: 'Error al completar la autenticación. Intenta de nuevo.',
  user_not_found: 'Este correo no está registrado. Contacta al administrador.',
  invalid_credentials: 'Contraseña incorrecta.',
  user_inactive: 'Tu cuenta está desactivada. Contacta al administrador.',
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
      setErrorMsg(`Solo se permiten correos institucionales (@${ALLOWED_DOMAIN})`)
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
        setErrorMsg('Credenciales incorrectas. Verifica tu correo y contraseña.')
      } else if (error.message.includes('Email not confirmed')) {
        setErrorMsg('Debes confirmar tu correo antes de iniciar sesión.')
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
        @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&family=Open+Sans:wght@300;400;500&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        :root {
          --blue:       #1B3FA0;
          --blue-dark:  #122D7A;
          --blue-light: #2550C0;
          --blue-soft:  #E8EEFB;
          --white:      #FFFFFF;
          --off-white:  #F4F6FC;
          --gray:       #6B7A99;
          --gray-light: #C5CCE0;
          --error:      #D93025;
          --success:    #1A7F4B;
        }
        html, body { height: 100%; background: var(--off-white); }
        .page { min-height: 100vh; display: grid; grid-template-columns: 1.1fr 0.9fr; font-family: 'Open Sans', sans-serif; }
        .panel-left { position: relative; background: var(--blue); display: flex; flex-direction: column; justify-content: space-between; padding: 3rem 4rem; overflow: hidden; }
        .panel-left::before { content: ''; position: absolute; inset: 0; background-image: linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px); background-size: 48px 48px; pointer-events: none; }
        .panel-left::after { content: ''; position: absolute; width: 600px; height: 600px; border-radius: 50%; background: radial-gradient(circle, rgba(255,255,255,0.07) 0%, transparent 70%); bottom: -200px; right: -150px; pointer-events: none; }
        .left-top { position: relative; z-index: 1; }
        .left-logo { display: flex; align-items: center; gap: 14px; margin-bottom: 4rem; }
        .left-logo img { width: 56px; height: 56px; object-fit: contain; background: white; border-radius: 8px; padding: 6px; }
        .left-logo-text { font-family: 'Montserrat', sans-serif; font-weight: 700; font-size: 1rem; color: white; line-height: 1.4; }
        .left-logo-sub { font-size: 0.68rem; font-weight: 400; letter-spacing: 0.15em; color: rgba(255,255,255,0.55); text-transform: uppercase; margin-top: 2px; }
        .left-headline { font-family: 'Montserrat', sans-serif; font-size: clamp(2rem, 3vw, 2.8rem); font-weight: 800; color: white; line-height: 1.15; margin-bottom: 1.2rem; }
        .left-eyebrow { display: block; color: rgba(255,255,255,0.5); font-weight: 500; font-size: 0.55em; letter-spacing: 0.14em; text-transform: uppercase; margin-bottom: 0.5rem; }
        .left-sub { font-size: 0.95rem; color: rgba(255,255,255,0.7); line-height: 1.8; max-width: 380px; margin-bottom: 3rem; }
        .features { display: flex; flex-direction: column; gap: 1rem; position: relative; z-index: 1; }
        .feature-item { display: flex; align-items: center; gap: 14px; }
        .feature-icon { width: 36px; height: 36px; border-radius: 8px; background: rgba(255,255,255,0.12); display: flex; align-items: center; justify-content: center; font-size: 15px; flex-shrink: 0; }
        .feature-text { font-size: 0.875rem; color: rgba(255,255,255,0.8); }
        .left-bottom { position: relative; z-index: 1; padding-top: 2rem; border-top: 1px solid rgba(255,255,255,0.12); }
        .left-footer-text { font-size: 0.75rem; color: rgba(255,255,255,0.35); letter-spacing: 0.04em; }
        .panel-right { background: var(--white); display: flex; align-items: center; justify-content: center; padding: 3rem 3.5rem; }
        .form-card { width: 100%; max-width: 400px; }
        .mobile-logo { display: none; align-items: center; gap: 12px; margin-bottom: 2.5rem; }
        .mobile-logo img { width: 44px; height: 44px; object-fit: contain; }
        .form-eyebrow { font-size: 11px; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; color: var(--blue); margin-bottom: 0.5rem; }
        .form-title { font-family: 'Montserrat', sans-serif; font-size: 1.75rem; font-weight: 700; color: #0F1E45; margin-bottom: 0.4rem; }
        .form-subtitle { font-size: 0.875rem; color: var(--gray); margin-bottom: 2.2rem; }
        .form-subtitle strong { color: var(--blue); font-weight: 600; }
        .field { margin-bottom: 1.2rem; }
        .field-label { display: block; font-size: 12px; font-weight: 600; letter-spacing: 0.04em; color: #3A4566; margin-bottom: 7px; }
        .field-wrapper { position: relative; }
        .field-input { width: 100%; padding: 12px 16px; background: var(--off-white); border: 1.5px solid var(--gray-light); border-radius: 8px; color: #0F1E45; font-size: 0.9rem; font-family: 'Open Sans', sans-serif; transition: border-color 0.2s, background 0.2s, box-shadow 0.2s; outline: none; }
        .field-input::placeholder { color: var(--gray-light); }
        .field-input:focus { border-color: var(--blue); background: white; box-shadow: 0 0 0 3px rgba(27,63,160,0.1); }
        .field-input.has-toggle { padding-right: 46px; }
        .toggle-btn { position: absolute; right: 12px; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer; color: var(--gray); padding: 4px; display: flex; align-items: center; font-size: 15px; transition: color 0.2s; }
        .toggle-btn:hover { color: var(--blue); }
        .alert { padding: 11px 14px; border-radius: 7px; font-size: 0.835rem; margin-bottom: 1.2rem; display: flex; align-items: flex-start; gap: 8px; line-height: 1.5; }
        .alert-error { background: #FEF0EF; border: 1px solid #F5C6C3; color: var(--error); }
        .alert-success { background: #EAF6EF; border: 1px solid #A8DEC0; color: var(--success); }
        .submit-btn { width: 100%; padding: 13px; border-radius: 8px; border: none; font-family: 'Montserrat', sans-serif; font-size: 0.9rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; cursor: pointer; transition: all 0.2s; margin-top: 0.5rem; }
        .submit-btn:not(:disabled) { background: var(--blue); color: white; }
        .submit-btn:not(:disabled):hover { background: var(--blue-light); transform: translateY(-1px); box-shadow: 0 6px 20px rgba(27,63,160,0.3); }
        .submit-btn:not(:disabled):active { transform: translateY(0); }
        .submit-btn:disabled { background: var(--blue-soft); color: var(--blue); opacity: 0.7; cursor: not-allowed; }
        .spinner { display: inline-block; width: 15px; height: 15px; border: 2px solid rgba(255,255,255,0.3); border-top-color: white; border-radius: 50%; animation: spin 0.7s linear infinite; vertical-align: middle; margin-right: 8px; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .divider { margin: 1.5rem 0 1rem; display: flex; align-items: center; gap: 10px; font-size: 11px; color: var(--gray-light); letter-spacing: 0.04em; }
        .divider::before, .divider::after { content: ''; flex: 1; height: 1px; background: var(--gray-light); opacity: 0.5; }
        .help-text { font-size: 12px; color: var(--gray); text-align: center; line-height: 1.7; }
        .help-text strong { color: #3A4566; }
        @media (max-width: 768px) { .page { grid-template-columns: 1fr; } .panel-left { display: none; } .panel-right { padding: 2.5rem 1.5rem; } .mobile-logo { display: flex; } }
      `}</style>

      <div className="page">
        <div className="panel-left">
          <div className="left-top">
            <div className="left-logo">
              <img src="/utb-logo.png" alt="Logo UTB" />
              <div>
                <div className="left-logo-text">Universidad Tecnológica<br />de Bolívar</div>
                <div className="left-logo-sub">Portal institucional</div>
              </div>
            </div>
            <h1 className="left-headline">
              <span className="left-eyebrow">Bienvenido al</span>
              Agente<br />Inteligente<br />Tooli<br />UTB
            </h1>
            <p className="left-sub">
              Plataforma de soporte académico y administrativo
              para la comunidad de la Universidad Tecnológica de Bolívar.
            </p>
            <div className="features">
              {[
                { icon: '🔒', text: 'Acceso exclusivo para correos @utb.edu.co' },
                { icon: '🤖', text: 'Respuestas contextualizadas a tu universidad' },
                { icon: '⚡', text: 'Disponible 24/7 para resolver tus dudas' },
              ].map((f, i) => (
                <div key={i} className="feature-item">
                  <div className="feature-icon">{f.icon}</div>
                  <span className="feature-text">{f.text}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="left-bottom">
            <p className="left-footer-text">© {new Date().getFullYear()} Universidad Tecnológica de Bolívar</p>
          </div>
        </div>

        <div className="panel-right">
          <div className="form-card">
            <div className="mobile-logo">
              <img src="/utb-logo.png" alt="Logo UTB" />
            </div>
            <p className="form-eyebrow">Portal institucional</p>
            <h2 className="form-title">Iniciar sesión</h2>
            <p className="form-subtitle">
              Usa tu correo <strong>@utb.edu.co</strong> para continuar
            </p>

            {status === 'error' && errorMsg && (
              <div className="alert alert-error">
                <span>⚠️</span>
                <span>{errorMsg}</span>
              </div>
            )}
            {status === 'success' && (
              <div className="alert alert-success">
                <span>✓</span>
                <span>Autenticación exitosa, redirigiendo...</span>
              </div>
            )}

            <form onSubmit={handleSubmit} noValidate>
              <div className="field">
                <label className="field-label" htmlFor="email">Correo institucional</label>
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

              <div className="field">
                <label className="field-label" htmlFor="password">Contraseña</label>
                <div className="field-wrapper">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    className="field-input has-toggle"
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
                    {showPassword ? '🙈' : '👁️'}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                className="submit-btn"
                disabled={isLoading || status === 'success'}
              >
                {isLoading
                  ? <><span className="spinner" />Verificando...</>
                  : status === 'success'
                    ? '✓ Acceso concedido'
                    : 'Entrar'
                }
              </button>
            </form>

            <div className="divider">¿Problemas para acceder?</div>
            <p className="help-text">
              Contacta al administrador del sistema.<br />
              Solo cuentas <strong>preregistradas</strong> pueden ingresar.
            </p>
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