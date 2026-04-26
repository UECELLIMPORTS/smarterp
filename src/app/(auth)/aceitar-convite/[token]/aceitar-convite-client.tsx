'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Zap, Eye, EyeOff, Loader2, ArrowRight, Mail, Crown, Users } from 'lucide-react'
import { acceptInvite } from '@/actions/team'
import { createClient } from '@/lib/supabase/client'

const inputCls = 'w-full rounded-lg border px-3.5 py-2.5 text-sm text-text placeholder:text-muted outline-none transition-colors focus:border-accent/60'
const inputStyle = { background: '#111827', borderColor: '#1E2D45' }

type Props = {
  token:      string
  email:      string
  role:       string
  tenantName: string
}

export function AceitarConviteClient({ token, email, role, tenantName }: Props) {
  const router = useRouter()
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const result = await acceptInvite({ token, fullName, password })
    if (!result.ok) {
      setLoading(false)
      setError(result.error)
      return
    }

    // Login automático após aceitar
    const supabase = createClient()
    const { error: loginErr } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (loginErr) { router.push('/login?invite_accepted=1'); return }
    await supabase.auth.refreshSession()
    router.push('/')
    router.refresh()
  }

  const ready = fullName.trim().length >= 2 && password.length >= 8

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10"
      style={{ background: 'linear-gradient(135deg, #080C14 0%, #0D1320 50%, #080C14 100%)' }}>
      <div className="w-full max-w-md">
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
        </div>

        <div className="rounded-2xl border p-7" style={{ background: '#0D1320', borderColor: '#1E2D45' }}>
          {/* Header com nome do tenant */}
          <div className="mb-6 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border"
              style={{ background: 'rgba(0,255,148,.1)', borderColor: 'rgba(0,255,148,.3)' }}>
              <Users className="h-6 w-6" style={{ color: '#00FF94' }} />
            </div>
            <h1 className="text-xl font-bold mb-1" style={{ color: '#E8F0FE' }}>Você foi convidado!</h1>
            <p className="text-sm" style={{ color: '#8AA8C8' }}>
              Junte-se à equipe da <strong style={{ color: '#00E5FF' }}>{tenantName}</strong> como{' '}
              <span className="inline-flex items-center gap-1 font-bold" style={{ color: '#00E5FF' }}>
                {role === 'manager' ? <><Crown className="h-3 w-3" /> manager</> : role}
              </span>
            </p>
          </div>

          <div className="rounded-lg border p-3 mb-5 flex items-center gap-2"
            style={{ background: '#0F1A2B', borderColor: '#1E2D45' }}>
            <Mail className="h-4 w-4 shrink-0" style={{ color: '#5A7A9A' }} />
            <span className="text-sm" style={{ color: '#E8F0FE' }}>{email}</span>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
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
                Crie sua senha (mínimo 8 caracteres)
              </label>
              <div className="relative">
                <input value={password} onChange={e => setPassword(e.target.value)}
                  type={showPass ? 'text' : 'password'} placeholder="••••••••"
                  required minLength={8} autoComplete="new-password"
                  className={inputCls + ' pr-10'} style={inputStyle} />
                <button type="button" onClick={() => setShowPass(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 hover:text-text"
                  tabIndex={-1} style={{ color: '#5A7A9A' }}>
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
              {loading ? 'Aceitando convite...' : 'Aceitar e entrar'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
