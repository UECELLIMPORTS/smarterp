'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Zap, Eye, EyeOff, Loader2 } from 'lucide-react'

export default function LoginPage() {
  const router  = useRouter()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    setLoading(false)

    if (error) {
      setError('E-mail ou senha incorretos.')
      return
    }

    router.push('/')
    router.refresh()
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4"
      style={{ background: 'linear-gradient(135deg, #080C14 0%, #0D1320 50%, #080C14 100%)' }}
    >
      {/* Glow de fundo */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-40 h-96 w-96 rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #00E5FF, transparent)' }} />
        <div className="absolute -bottom-40 -right-40 h-96 w-96 rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #00FF94, transparent)' }} />
      </div>

      <div className="relative w-full max-w-md">

        {/* Logo */}
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-accent/30"
            style={{ background: 'linear-gradient(135deg, #00E5FF20, #00FF9420)' }}
          >
            <Zap className="h-7 w-7" style={{ color: '#00E5FF' }} />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight text-text">
              Smart<span style={{ color: '#00E5FF' }}>ERP</span>
            </h1>
            <p className="mt-1 text-sm" style={{ color: '#64748B' }}>
              Sistema de gestão inteligente
            </p>
          </div>
        </div>

        {/* Card */}
        <div className="rounded-2xl border p-8 shadow-2xl"
          style={{ background: '#0D1320', borderColor: '#1E2D45' }}
        >
          <h2 className="mb-6 text-lg font-semibold text-text">Entrar na sua conta</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium uppercase tracking-wider" style={{ color: '#64748B' }}>
                E-mail
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="seu@email.com"
                className="w-full rounded-lg border px-3.5 py-2.5 text-sm text-text placeholder:text-muted
                  outline-none transition-colors focus:border-accent/60"
                style={{ background: '#111827', borderColor: '#1E2D45' }}
              />
            </div>

            {/* Senha */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium uppercase tracking-wider" style={{ color: '#64748B' }}>
                Senha
              </label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  className="w-full rounded-lg border px-3.5 py-2.5 pr-10 text-sm text-text placeholder:text-muted
                    outline-none transition-colors focus:border-accent/60"
                  style={{ background: '#111827', borderColor: '#1E2D45' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPass((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                  style={{ color: '#64748B' }}
                >
                  {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Erro */}
            {error && (
              <p className="rounded-lg border px-3 py-2 text-sm"
                style={{ background: '#FF5C5C15', borderColor: '#FF5C5C40', color: '#FF5C5C' }}>
                {error}
              </p>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold
                transition-opacity disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg, #00E5FF, #00FF94)', color: '#080C14' }}
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs" style={{ color: '#64748B' }}>
          Smart ERP © {new Date().getFullYear()} — Todos os direitos reservados
        </p>
      </div>
    </div>
  )
}
