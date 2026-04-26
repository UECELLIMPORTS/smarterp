'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Zap, Eye, EyeOff, Loader2, ArrowRight, Check } from 'lucide-react'
import { signupTenant, loginAfterSignup } from '@/actions/signup'

const inputCls = 'w-full rounded-lg border px-3.5 py-2.5 text-sm text-text placeholder:text-muted outline-none transition-colors focus:border-accent/60'
const inputStyle = { background: '#111827', borderColor: '#1E2D45' }

export default function SignupPage() {
  const router = useRouter()
  const [fullName, setFullName]     = useState('')
  const [tenantName, setTenantName] = useState('')
  const [email, setEmail]           = useState('')
  const [password, setPassword]     = useState('')
  const [showPass, setShowPass]     = useState(false)
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const result = await signupTenant({ fullName, tenantName, email, password })

    if (!result.ok) {
      setLoading(false)
      setError(result.error)
      return
    }

    const login = await loginAfterSignup(email, password)
    setLoading(false)
    if (!login.ok) {
      router.push('/login?signed_up=1')
      return
    }
    router.push('/')
    router.refresh()
  }

  const ready =
    fullName.trim().length >= 2 &&
    tenantName.trim().length >= 2 &&
    /^\S+@\S+\.\S+$/.test(email) &&
    password.length >= 8

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10"
      style={{ background: 'linear-gradient(135deg, #080C14 0%, #0D1320 50%, #080C14 100%)' }}>
      {/* Glow de fundo */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-40 h-96 w-96 rounded-full opacity-15 blur-3xl"
          style={{ background: 'radial-gradient(circle, #00E5FF, transparent)' }} />
        <div className="absolute -bottom-40 -right-40 h-96 w-96 rounded-full opacity-10 blur-3xl"
          style={{ background: 'radial-gradient(circle, #00FF94, transparent)' }} />
      </div>

      <div className="relative w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-400/30"
              style={{ background: 'linear-gradient(135deg, rgba(0,229,255,.15), rgba(0,255,148,.15))' }}>
              <Zap className="h-5 w-5" style={{ color: '#00E5FF' }} />
            </div>
            <span className="text-lg font-bold tracking-tight text-text">
              Gestão <span style={{ color: '#00E5FF' }}>Inteligente</span>
            </span>
          </div>
          <p className="mt-2 text-sm" style={{ color: '#64748B' }}>
            Sistema de gestão inteligente
          </p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border p-7 shadow-2xl" style={{ background: '#0D1320', borderColor: '#1E2D45' }}>
          <h1 className="text-xl font-semibold text-text">Comece agora</h1>
          <p className="mt-1 text-sm" style={{ color: '#64748B' }}>
            7 dias grátis com todos os recursos. Sem cartão de crédito.
          </p>

          {/* Trial benefits */}
          <ul className="mt-4 space-y-1.5 text-xs" style={{ color: '#8AA8C8' }}>
            <li className="flex items-center gap-2">
              <Check className="h-3.5 w-3.5 shrink-0" style={{ color: '#00FF94' }} />
              Todos os recursos do plano Premium liberados no trial
            </li>
            <li className="flex items-center gap-2">
              <Check className="h-3.5 w-3.5 shrink-0" style={{ color: '#00FF94' }} />
              Cancela a qualquer momento, sem fidelidade
            </li>
          </ul>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium uppercase tracking-wider" style={{ color: '#64748B' }}>
                Seu nome completo
              </label>
              <input value={fullName} onChange={e => setFullName(e.target.value)}
                placeholder="João Silva" required autoComplete="name"
                className={inputCls} style={inputStyle} />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium uppercase tracking-wider" style={{ color: '#64748B' }}>
                Nome da sua empresa
              </label>
              <input value={tenantName} onChange={e => setTenantName(e.target.value)}
                placeholder="Minha Loja LTDA" required
                className={inputCls} style={inputStyle} />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium uppercase tracking-wider" style={{ color: '#64748B' }}>
                E-mail
              </label>
              <input value={email} onChange={e => setEmail(e.target.value)}
                type="email" placeholder="voce@empresa.com.br" required autoComplete="email"
                className={inputCls} style={inputStyle} />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium uppercase tracking-wider" style={{ color: '#64748B' }}>
                Senha (mínimo 8 caracteres)
              </label>
              <div className="relative">
                <input value={password} onChange={e => setPassword(e.target.value)}
                  type={showPass ? 'text' : 'password'} placeholder="••••••••"
                  required autoComplete="new-password" minLength={8}
                  className={inputCls + ' pr-10'} style={inputStyle} />
                <button type="button" onClick={() => setShowPass(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 hover:text-text"
                  tabIndex={-1} aria-label="Mostrar/esconder senha"
                  style={{ color: '#5A7A9A' }}>
                  {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="rounded-lg border px-3 py-2.5 text-xs"
                style={{ background: 'rgba(255,77,109,.06)', borderColor: 'rgba(255,77,109,.3)', color: '#FF5C5C' }}>
                {error}
              </div>
            )}

            <button type="submit" disabled={!ready || loading}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-bold transition-opacity hover:opacity-90 disabled:opacity-40"
              style={{ background: 'linear-gradient(135deg, #00E5FF, #00FF94)', color: '#080C14' }}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              {loading ? 'Criando sua conta...' : 'Começar 7 dias grátis'}
            </button>
          </form>

          <p className="mt-4 text-center text-[11px]" style={{ color: '#5A7A9A' }}>
            Ao criar a conta você concorda com nossos
            {' '}<a href="https://smartgestao-site.vercel.app" className="underline hover:text-white">Termos de Uso</a>.
          </p>
        </div>

        <p className="mt-6 text-center text-sm" style={{ color: '#8AA8C8' }}>
          Já tem conta?
          {' '}<Link href="/login" className="font-semibold hover:underline" style={{ color: '#00E5FF' }}>
            Fazer login
          </Link>
        </p>
      </div>
    </div>
  )
}
