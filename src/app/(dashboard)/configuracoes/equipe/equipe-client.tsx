'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Users, ArrowLeft, UserPlus, Crown, Mail, Trash2, Loader2,
  Copy, Check, Clock, X,
} from 'lucide-react'
import { inviteMember, removeMember, cancelInvite, type TeamMember, type PendingInvite } from '@/actions/team'

const inputCls = 'w-full rounded-lg border px-3.5 py-2.5 text-sm text-text placeholder:text-muted outline-none transition-colors focus:border-accent/60'
const inputStyle = { background: '#111827', borderColor: '#1E2D45' }

const DT = (iso: string) => {
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
}

type Props = {
  members:    TeamMember[]
  invites:    PendingInvite[]
  ownerEmail: string
}

export function EquipeClient({ members, invites, ownerEmail }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError]         = useState<string | null>(null)

  // Form de convite
  const [email, setEmail] = useState('')
  const [showInviteUrl, setShowInviteUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await inviteMember({ email, role: 'manager' })
      if (!result.ok) { setError(result.error); return }
      setShowInviteUrl(result.inviteUrl)
      setEmail('')
      router.refresh()
    })
  }

  function handleRemove(userId: string, email: string) {
    if (!confirm(`Remover ${email} da equipe?`)) return
    startTransition(async () => {
      try {
        await removeMember(userId)
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Erro ao remover')
      }
    })
  }

  function handleCancelInvite(inviteId: string, email: string) {
    if (!confirm(`Cancelar convite pra ${email}?`)) return
    startTransition(async () => {
      try {
        await cancelInvite(inviteId)
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Erro ao cancelar')
      }
    })
  }

  async function copyInviteUrl(url: string) {
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div>
        <Link href="/configuracoes" className="inline-flex items-center gap-1.5 text-xs hover:underline mb-2"
          style={{ color: '#5A7A9A' }}>
          <ArrowLeft className="h-3.5 w-3.5" /> Voltar pra Configurações
        </Link>
        <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: '#E8F0FE' }}>
          <Users className="h-5 w-5" style={{ color: '#00FF94' }} />
          Equipe
        </h1>
        <p className="mt-1 text-sm" style={{ color: '#5A7A9A' }}>
          Gerencie quem tem acesso à sua conta. {members.length} {members.length === 1 ? 'pessoa' : 'pessoas'} no total.
        </p>
      </div>

      {/* Convite — mostra URL gerado */}
      {showInviteUrl && (
        <div className="rounded-xl border p-4" style={{ background: 'rgba(0,255,148,.04)', borderColor: 'rgba(0,255,148,.3)' }}>
          <p className="text-sm font-bold mb-2" style={{ color: '#00FF94' }}>Convite criado!</p>
          <p className="text-xs mb-3" style={{ color: '#8AA8C8' }}>
            Email enviado pro convidado. Você também pode copiar o link e mandar manualmente:
          </p>
          <div className="flex gap-2">
            <input value={showInviteUrl} readOnly
              className="flex-1 rounded-lg border px-3 py-2 text-xs font-mono outline-none"
              style={{ background: '#0F1A2B', borderColor: '#1E2D45', color: '#E8F0FE' }} />
            <button onClick={() => copyInviteUrl(showInviteUrl)}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition-opacity hover:opacity-90"
              style={{ background: copied ? '#00FF94' : '#00E5FF', color: '#080C14' }}>
              {copied ? <><Check className="h-3.5 w-3.5" />Copiado</> : <><Copy className="h-3.5 w-3.5" />Copiar</>}
            </button>
          </div>
          <button onClick={() => setShowInviteUrl(null)}
            className="mt-3 text-xs hover:underline" style={{ color: '#5A7A9A' }}>
            Fechar
          </button>
        </div>
      )}

      {/* Form convidar membro */}
      <div className="rounded-xl border p-5" style={{ background: '#111827', borderColor: '#1E2D45' }}>
        <h2 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: '#E8F0FE' }}>
          <UserPlus className="h-4 w-4" style={{ color: '#00E5FF' }} />
          Convidar novo membro
        </h2>
        <form onSubmit={handleInvite} className="flex flex-col sm:flex-row gap-2">
          <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
            placeholder="email@empresa.com" className={inputCls} style={inputStyle} />
          <button type="submit" disabled={pending || !email}
            className="inline-flex items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-sm font-bold transition-opacity hover:opacity-90 disabled:opacity-40"
            style={{ background: 'linear-gradient(135deg, #00E5FF, #00FF94)', color: '#080C14' }}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
            Enviar convite
          </button>
        </form>
        <p className="mt-3 text-xs" style={{ color: '#5A7A9A' }}>
          Convidado entra como <strong>manager</strong> — acessa tudo no app exceto Equipe e Assinatura.
          Convite expira em 7 dias.
        </p>
        {error && (
          <p className="mt-2 text-xs" style={{ color: '#FF5C5C' }}>{error}</p>
        )}
      </div>

      {/* Lista de membros ativos */}
      <div className="rounded-xl border overflow-hidden" style={{ background: '#111827', borderColor: '#1E2D45' }}>
        <div className="border-b px-5 py-3" style={{ borderColor: '#1E2D45' }}>
          <h2 className="text-xs font-bold uppercase tracking-widest" style={{ color: '#5A7A9A' }}>
            Membros ativos ({members.length})
          </h2>
        </div>
        <ul>
          {members.map(m => (
            <li key={m.userId}
              className="flex items-center gap-3 px-5 py-4 border-b last:border-0"
              style={{ borderColor: '#1E2D45' }}>
              <div className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold shrink-0"
                style={{ background: m.role === 'owner'
                  ? 'linear-gradient(135deg, #FFB800, #FFAA00)'
                  : 'linear-gradient(135deg, #00E5FF, #00FF94)',
                  color: '#080C14' }}>
                {(m.fullName ?? m.email).slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold truncate" style={{ color: '#E8F0FE' }}>
                    {m.fullName ?? m.email}
                  </p>
                  {m.role === 'owner' && (
                    <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-bold uppercase"
                      style={{ background: 'rgba(255,184,0,.15)', color: '#FFB800' }}>
                      <Crown className="h-3 w-3" /> dono
                    </span>
                  )}
                  {m.role === 'manager' && (
                    <span className="rounded px-2 py-0.5 text-[10px] font-bold uppercase"
                      style={{ background: 'rgba(0,229,255,.15)', color: '#00E5FF' }}>
                      manager
                    </span>
                  )}
                </div>
                <p className="text-xs truncate" style={{ color: '#8AA8C8' }}>{m.email}</p>
                <p className="text-[10px] mt-0.5" style={{ color: '#5A7A9A' }}>
                  No time desde {DT(m.createdAt)}
                </p>
              </div>
              {m.role !== 'owner' && (
                <button onClick={() => handleRemove(m.userId, m.email)}
                  disabled={pending}
                  className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-white/5 transition-colors"
                  title="Remover da equipe"
                  style={{ color: '#FF5C5C' }}>
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>

      {/* Lista de convites pendentes */}
      {invites.length > 0 && (
        <div className="rounded-xl border overflow-hidden" style={{ background: '#111827', borderColor: '#1E2D45' }}>
          <div className="border-b px-5 py-3" style={{ borderColor: '#1E2D45' }}>
            <h2 className="text-xs font-bold uppercase tracking-widest" style={{ color: '#5A7A9A' }}>
              Convites pendentes ({invites.length})
            </h2>
          </div>
          <ul>
            {invites.map(inv => (
              <li key={inv.id}
                className="flex items-center gap-3 px-5 py-4 border-b last:border-0"
                style={{ borderColor: '#1E2D45' }}>
                <div className="flex h-10 w-10 items-center justify-center rounded-full shrink-0"
                  style={{ background: 'rgba(255,184,0,.15)' }}>
                  <Clock className="h-5 w-5" style={{ color: '#FFB800' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: '#E8F0FE' }}>{inv.email}</p>
                  <p className="text-xs" style={{ color: '#8AA8C8' }}>
                    Convidado em {DT(inv.createdAt)} · expira em {DT(inv.expiresAt)}
                  </p>
                </div>
                <button onClick={() => copyInviteUrl(inv.inviteUrl)}
                  className="hidden sm:flex h-8 px-3 items-center gap-1.5 rounded-lg hover:bg-white/5 text-xs"
                  style={{ color: '#8AA8C8' }}
                  title="Copiar link do convite">
                  <Copy className="h-3.5 w-3.5" /> Copiar link
                </button>
                <button onClick={() => handleCancelInvite(inv.id, inv.email)}
                  disabled={pending}
                  className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-white/5"
                  title="Cancelar convite"
                  style={{ color: '#FF5C5C' }}>
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Disclaimer */}
      <p className="text-xs" style={{ color: '#5A7A9A' }}>
        Você é o dono ({ownerEmail}). Apenas você pode convidar/remover membros e gerenciar a assinatura.
      </p>
    </div>
  )
}
