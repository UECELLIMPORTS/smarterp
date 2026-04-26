'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Zap, Eye, EyeOff, Loader2, ArrowRight, CheckCircle, AlertTriangle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

const inputCls = 'w-full rounded-lg border px-3.5 py-2.5 text-sm text-text placeholder:text-muted outline-none transition-colors focus:border-accent/60'
const inputStyle = { background: '#111827', borderColor: '#1E2D45' }

export default function ResetPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading]   = useState(false)
  const [done, setDone]         = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [validSession, setValidSession] = useState<boolean | null>(null)

  // Quando user clica no link do email, Supabase processa o token automaticamente
  // e cria sessão temporária. Verificamos se ela existe.
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then(({ data }) => {
      setValidSession(!!data.session)
    })
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (password.length < 8) { setError('Senha precisa ter pelo menos 8 caracteres.'); return }
    if (password !== confirm) { setError('As senhas não conferem.'); return }

    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)

    if (error) {
      setError('Erro ao atualizar senha. Tente solicitar o link novamente.')
      return
    }
    setDone(true)
    setTimeout(() => router.push('/'), 2500)
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10"
      style={{ background: 'linear-gradient(135deg, #080C14 0%, #0D1320 50%, #080C14 100%)' }}>
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -bottom-40 -right-40 h-96 w-96 rounded-full opacity-15 blur-3xl"
          style={{ background: 'radial-gradient(circle, #00FF94, transparent)' }} />
      </div>

      <div className="relative w-full max-w-md">
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

        <div className="rounded-2xl border p-7 shadow-2xl" style={{ background: '#0D1320', borderColor: '#1E2D45' }}>
          {validSession === false ? (
            <div className="text-center py-6">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full"
                style={{ background: 'rgba(255,77,109,.1)' }}>
                <AlertTriangle className="h-7 w-7" style={{ color: '#FF5C5C' }} />
              </div>
              <h1 className="text-lg font-bold text-text mb-2">Link expirado ou inválido</h1>
              <p className="text-sm mb-4" style={{ color: '#8AA8C8' }}>
                Este link não é mais válido (links de recuperação expiram em 1 hora).
              </p>
              <Link href="/forgot-password"
                className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold transition-opacity hover:opacity-90"
                style={{ background: '#00E5FF', color: '#080C14' }}>
                Solicitar novo link
              </Link>
            </div>
          ) : done ? (
            <div className="text-center py-6">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full"
                style={{ background: 'rgba(0,255,148,.1)' }}>
                <CheckCircle className="h-7 w-7" style={{ color: '#00FF94' }} />
              </div>
              <h1 className="text-lg font-bold text-text mb-2">Senha atualizada!</h1>
              <p className="text-sm" style={{ color: '#8AA8C8' }}>
                Redirecionando pro dashboard…
              </p>
            </div>
          ) : (
            <>
              <h1 className="text-xl font-semibold text-text">Criar nova senha</h1>
              <p className="mt-1 text-sm" style={{ color: '#64748B' }}>
                Defina sua nova senha de acesso.
              </p>

              <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium uppercase tracking-wider" style={{ color: '#64748B' }}>
                    Nova senha (mínimo 8 caracteres)
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

                <div className="space-y-1.5">
                  <label className="text-xs font-medium uppercase tracking-wider" style={{ color: '#64748B' }}>
                    Confirme a nova senha
                  </label>
                  <input value={confirm} onChange={e => setConfirm(e.target.value)}
                    type={showPass ? 'text' : 'password'} placeholder="••••••••"
                    required minLength={8} autoComplete="new-password"
                    className={inputCls} style={inputStyle} />
                </div>

                {error && (
                  <div className="rounded-lg border px-3 py-2.5 text-xs"
                    style={{ background: 'rgba(255,77,109,.06)', borderColor: 'rgba(255,77,109,.3)', color: '#FF5C5C' }}>
                    {error}
                  </div>
                )}

                <button type="submit" disabled={loading || validSession !== true}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-bold transition-opacity hover:opacity-90 disabled:opacity-40"
                  style={{ background: 'linear-gradient(135deg, #00E5FF, #00FF94)', color: '#080C14' }}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                  {loading ? 'Atualizando...' : 'Atualizar senha'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
