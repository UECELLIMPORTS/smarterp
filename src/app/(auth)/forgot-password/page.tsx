'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Zap, Loader2, ArrowRight, ArrowLeft, Mail, CheckCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

const inputCls = 'w-full rounded-lg border px-3.5 py-2.5 text-sm text-text placeholder:text-muted outline-none transition-colors focus:border-accent/60'
const inputStyle = { background: '#111827', borderColor: '#1E2D45' }

export default function ForgotPasswordPage() {
  const [email, setEmail]     = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent]       = useState(false)
  const [error, setError]     = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const supabase = createClient()
    // Supabase manda email com link tipo /reset-password?code=...
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })

    setLoading(false)
    if (error) {
      setError('Erro ao enviar email. Verifique se o endereço está correto.')
      return
    }
    setSent(true)
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10"
      style={{ background: 'linear-gradient(135deg, #080C14 0%, #0D1320 50%, #080C14 100%)' }}>
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-40 h-96 w-96 rounded-full opacity-15 blur-3xl"
          style={{ background: 'radial-gradient(circle, #00E5FF, transparent)' }} />
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
          <Link href="/login" className="inline-flex items-center gap-1.5 text-xs hover:underline mb-4"
            style={{ color: '#5A7A9A' }}>
            <ArrowLeft className="h-3.5 w-3.5" /> Voltar pra login
          </Link>

          {sent ? (
            <div className="text-center py-6">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full"
                style={{ background: 'rgba(0,255,148,.1)' }}>
                <CheckCircle className="h-7 w-7" style={{ color: '#00FF94' }} />
              </div>
              <h1 className="text-lg font-bold text-text mb-2">Email enviado!</h1>
              <p className="text-sm" style={{ color: '#8AA8C8' }}>
                Se essa conta existe, em alguns segundos você vai receber um email
                em <strong style={{ color: '#E8F0FE' }}>{email}</strong> com o link pra criar nova senha.
              </p>
              <p className="mt-4 text-xs" style={{ color: '#5A7A9A' }}>
                Não chegou? Verifica a pasta de spam.
              </p>
            </div>
          ) : (
            <>
              <h1 className="text-xl font-semibold text-text">Esqueci minha senha</h1>
              <p className="mt-1 text-sm" style={{ color: '#64748B' }}>
                Digite seu email pra receber o link de recuperação.
              </p>

              <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium uppercase tracking-wider" style={{ color: '#64748B' }}>
                    E-mail
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none"
                      style={{ color: '#5A7A9A' }} />
                    <input value={email} onChange={e => setEmail(e.target.value)}
                      type="email" placeholder="seu@email.com" required autoComplete="email"
                      className={inputCls + ' pl-9'} style={inputStyle} />
                  </div>
                </div>

                {error && (
                  <div className="rounded-lg border px-3 py-2.5 text-xs"
                    style={{ background: 'rgba(255,77,109,.06)', borderColor: 'rgba(255,77,109,.3)', color: '#FF5C5C' }}>
                    {error}
                  </div>
                )}

                <button type="submit" disabled={loading || !email}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-bold transition-opacity hover:opacity-90 disabled:opacity-40"
                  style={{ background: 'linear-gradient(135deg, #00E5FF, #00FF94)', color: '#080C14' }}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                  {loading ? 'Enviando...' : 'Enviar link de recuperação'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
