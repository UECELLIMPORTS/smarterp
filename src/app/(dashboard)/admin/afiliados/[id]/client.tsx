'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Copy, Pause, Play, Ban, ShieldCheck, Loader2, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { setAffiliateStatus, approveCommission, type AffiliateDetail } from '@/actions/affiliates-admin'

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  active:        { label: 'Ativo',          color: '#10B981' },
  pending_email: { label: 'Aguardando',     color: '#F59E0B' },
  paused:        { label: 'Pausado',        color: '#94A3B8' },
  banned:        { label: 'Banido',         color: '#EF4444' },
}

const COMM_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending_approval: { label: 'Em hold',       color: '#F59E0B' },
  under_review:     { label: 'Em revisão',    color: '#EA580C' },
  payable:          { label: 'A pagar',       color: '#10B981' },
  paid:             { label: 'Pago',          color: '#3B82F6' },
  cancelled:        { label: 'Cancelado',     color: '#94A3B8' },
}

const REF_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  attributed:   { label: 'OK',         color: '#10B981' },
  under_review: { label: 'Em revisão', color: '#EA580C' },
  rejected:     { label: 'Fraude',     color: '#EF4444' },
}

export function AfiliadoDetailClient({ affiliate: a }: { affiliate: AffiliateDetail }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const st = STATUS_LABELS[a.status] ?? { label: a.status, color: '#94A3B8' }

  const totalPayable = a.commissions.filter(c => c.status === 'payable').reduce((s, c) => s + c.amountCents, 0)
  const totalPending = a.commissions.filter(c => c.status === 'pending_approval' || c.status === 'under_review').reduce((s, c) => s + c.amountCents, 0)
  const totalPaid    = a.commissions.filter(c => c.status === 'paid').reduce((s, c) => s + c.amountCents, 0)

  function copyLink() {
    const url = `https://app.gestaosmarterp.online/signup?ref=${a.refCode}`
    navigator.clipboard.writeText(url).then(
      () => toast.success('Link copiado'),
      () => toast.error('Falha ao copiar'),
    )
  }

  function changeStatus(newStatus: 'active' | 'paused' | 'banned') {
    let reason: string | undefined
    if (newStatus === 'banned') {
      const r = window.prompt('Motivo do banimento? (opcional)')
      if (r === null) return
      reason = r || undefined
    } else if (a.status === 'banned' || a.status === 'paused') {
      if (!window.confirm(`Confirmar ${newStatus === 'active' ? 'reativar' : newStatus} esse afiliado?`)) return
    }

    startTransition(async () => {
      const res = await setAffiliateStatus(a.id, newStatus, reason)
      if (res.ok) {
        toast.success('Status atualizado')
        router.refresh()
      } else {
        toast.error(res.error)
      }
    })
  }

  function approveComm(commId: string) {
    if (!window.confirm('Aprovar essa comissão? (pula a revisão de fraude)')) return
    startTransition(async () => {
      const res = await approveCommission(commId)
      if (res.ok) {
        toast.success('Comissão aprovada')
        router.refresh()
      } else {
        toast.error(res.error)
      }
    })
  }

  return (
    <div className="space-y-5">
      {/* Cabeçalho com dados + ações */}
      <div className="rounded-xl border p-5 grid grid-cols-1 md:grid-cols-3 gap-4"
        style={{ background: '#131C2A', borderColor: 'rgba(255,255,255,.06)' }}>

        <div className="md:col-span-2 space-y-1.5">
          <Row label="Email"     value={a.email} />
          <Row label="WhatsApp"  value={a.whatsapp ?? '—'} />
          <Row label="CPF/CNPJ"  value={a.cpfCnpj ?? '—'} />
          <Row label="PIX"       value={a.pixKey ? `${a.pixKey} (${a.pixKeyType ?? '?'})` : 'Não cadastrada'} />
          <Row label="Instagram" value={a.instagram ?? '—'} />
          <Row label="Origem"    value={a.source === 'public' ? 'Cadastro público' : 'Manual'} />
          <Row label="Cadastro"  value={new Date(a.createdAt).toLocaleDateString('pt-BR')} />
          {a.notes && <Row label="Notas" value={a.notes} />}
          {a.banReason && (
            <Row label="Motivo do ban" value={a.banReason} />
          )}
        </div>

        <div className="space-y-2">
          <div>
            <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: '#94A3B8' }}>Status</p>
            <span className="inline-block text-xs font-medium px-2 py-1 rounded"
              style={{ background: `${st.color}15`, color: st.color }}>
              {st.label}
            </span>
          </div>

          <button
            type="button" onClick={copyLink}
            className="w-full inline-flex items-center justify-center gap-1.5 rounded-md px-2.5 py-2 text-xs hover:opacity-80"
            style={{ background: 'rgba(16,185,129,.1)', border: '1px solid rgba(16,185,129,.3)', color: '#10B981' }}
          >
            <Copy className="h-3.5 w-3.5" /> Copiar link
          </button>

          <div className="flex flex-col gap-1.5 pt-1">
            {a.status !== 'paused' && a.status !== 'banned' && (
              <button type="button" onClick={() => changeStatus('paused')} disabled={pending}
                className="inline-flex items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] hover:opacity-80"
                style={{ background: 'transparent', border: '1px solid rgba(148,163,184,.3)', color: '#94A3B8' }}>
                <Pause className="h-3 w-3" /> Pausar
              </button>
            )}
            {(a.status === 'paused' || a.status === 'banned') && (
              <button type="button" onClick={() => changeStatus('active')} disabled={pending}
                className="inline-flex items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] hover:opacity-80"
                style={{ background: 'rgba(16,185,129,.1)', border: '1px solid rgba(16,185,129,.3)', color: '#10B981' }}>
                <Play className="h-3 w-3" /> Reativar
              </button>
            )}
            {a.status !== 'banned' && (
              <button type="button" onClick={() => changeStatus('banned')} disabled={pending}
                className="inline-flex items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] hover:opacity-80"
                style={{ background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)', color: '#EF4444' }}>
                <Ban className="h-3 w-3" /> Banir
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Totais de comissões */}
      <div className="grid grid-cols-3 gap-3">
        <Kpi label="A pagar"   value={fmtBRL(totalPayable)}  tint="#10B981" />
        <Kpi label="Pendente"  value={fmtBRL(totalPending)}  tint="#F59E0B" />
        <Kpi label="Já pago"   value={fmtBRL(totalPaid)}     tint="#3B82F6" />
      </div>

      {/* Conversões */}
      <div>
        <h2 className="text-sm font-semibold mb-2" style={{ color: '#F8FAFC' }}>
          Conversões ({a.referrals.length})
        </h2>
        {a.referrals.length === 0 ? (
          <p className="text-xs text-zinc-500">Nenhuma conversão ainda.</p>
        ) : (
          <div className="rounded-xl border overflow-hidden"
            style={{ background: '#131C2A', borderColor: 'rgba(255,255,255,.06)' }}>
            <table className="w-full text-xs">
              <thead style={{ background: 'rgba(255,255,255,.03)' }}>
                <tr style={{ color: '#94A3B8' }}>
                  <th className="text-left px-3 py-2 text-[10px] uppercase tracking-wider font-medium">Tenant</th>
                  <th className="text-left px-3 py-2 text-[10px] uppercase tracking-wider font-medium">Produto</th>
                  <th className="text-left px-3 py-2 text-[10px] uppercase tracking-wider font-medium">Cadastro</th>
                  <th className="text-left px-3 py-2 text-[10px] uppercase tracking-wider font-medium">Status</th>
                  <th className="text-left px-3 py-2 text-[10px] uppercase tracking-wider font-medium">Flags</th>
                </tr>
              </thead>
              <tbody>
                {a.referrals.map(r => {
                  const rs = REF_STATUS_LABELS[r.status] ?? { label: r.status, color: '#94A3B8' }
                  return (
                    <tr key={r.id} className="border-t" style={{ borderColor: 'rgba(255,255,255,.04)' }}>
                      <td className="px-3 py-2 font-mono text-[11px]" style={{ color: '#CBD5E1' }}>
                        {r.tenantId.slice(0, 8)}…
                      </td>
                      <td className="px-3 py-2" style={{ color: '#CBD5E1' }}>{r.product ?? '—'}</td>
                      <td className="px-3 py-2" style={{ color: '#94A3B8' }}>
                        {new Date(r.signupAt).toLocaleDateString('pt-BR')}
                      </td>
                      <td className="px-3 py-2">
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                          style={{ background: `${rs.color}15`, color: rs.color }}>
                          {rs.label}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-[10px]" style={{ color: '#EA580C' }}>
                        {r.fraudFlags.length > 0 ? r.fraudFlags.join(', ') : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Comissões */}
      <div>
        <h2 className="text-sm font-semibold mb-2" style={{ color: '#F8FAFC' }}>
          Comissões ({a.commissions.length})
        </h2>
        {a.commissions.length === 0 ? (
          <p className="text-xs text-zinc-500">Nenhuma comissão registrada.</p>
        ) : (
          <div className="rounded-xl border overflow-hidden"
            style={{ background: '#131C2A', borderColor: 'rgba(255,255,255,.06)' }}>
            <table className="w-full text-xs">
              <thead style={{ background: 'rgba(255,255,255,.03)' }}>
                <tr style={{ color: '#94A3B8' }}>
                  <th className="text-left  px-3 py-2 text-[10px] uppercase tracking-wider font-medium">Mês</th>
                  <th className="text-left  px-3 py-2 text-[10px] uppercase tracking-wider font-medium">Tipo</th>
                  <th className="text-right px-3 py-2 text-[10px] uppercase tracking-wider font-medium">Base</th>
                  <th className="text-right px-3 py-2 text-[10px] uppercase tracking-wider font-medium">%</th>
                  <th className="text-right px-3 py-2 text-[10px] uppercase tracking-wider font-medium">Comissão</th>
                  <th className="text-left  px-3 py-2 text-[10px] uppercase tracking-wider font-medium">Status</th>
                  <th className="text-left  px-3 py-2 text-[10px] uppercase tracking-wider font-medium">Hold até</th>
                  <th className="text-right px-3 py-2 text-[10px] uppercase tracking-wider font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {a.commissions.map(c => {
                  const cs = COMM_STATUS_LABELS[c.status] ?? { label: c.status, color: '#94A3B8' }
                  return (
                    <tr key={c.id} className="border-t" style={{ borderColor: 'rgba(255,255,255,.04)' }}>
                      <td className="px-3 py-2" style={{ color: '#CBD5E1' }}>{c.refMonth.slice(0, 7)}</td>
                      <td className="px-3 py-2" style={{ color: '#CBD5E1' }}>
                        {c.type === 'initial' ? '1ª venda' : 'recorrente'}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums" style={{ color: '#94A3B8' }}>
                        {fmtBRL(c.baseAmountCents)}
                      </td>
                      <td className="px-3 py-2 text-right" style={{ color: '#94A3B8' }}>
                        {c.pct.toFixed(0)}%
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium" style={{ color: '#F8FAFC' }}>
                        {fmtBRL(c.amountCents)}
                      </td>
                      <td className="px-3 py-2">
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                          style={{ background: `${cs.color}15`, color: cs.color }}>
                          {cs.label}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-[11px]" style={{ color: '#94A3B8' }}>
                        {new Date(c.holdUntil).toLocaleDateString('pt-BR')}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {c.status === 'under_review' && (
                          <button type="button" onClick={() => approveComm(c.id)} disabled={pending}
                            className="inline-flex items-center gap-1 text-[10px] hover:underline"
                            style={{ color: '#10B981' }}>
                            {pending ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <ShieldCheck className="h-2.5 w-2.5" />}
                            Aprovar
                          </button>
                        )}
                        {c.status === 'paid' && c.paidAt && (
                          <span className="inline-flex items-center gap-1 text-[10px]" style={{ color: '#3B82F6' }}>
                            <CheckCircle2 className="h-2.5 w-2.5" />
                            {new Date(c.paidAt).toLocaleDateString('pt-BR')}
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-3 gap-2 text-xs">
      <span className="uppercase tracking-wider text-[10px]" style={{ color: '#94A3B8' }}>{label}</span>
      <span className="col-span-2 break-words" style={{ color: '#F8FAFC' }}>{value}</span>
    </div>
  )
}

function Kpi({ label, value, tint }: { label: string; value: string; tint: string }) {
  return (
    <div className="rounded-xl border p-3" style={{ background: '#131C2A', borderColor: 'rgba(255,255,255,.06)' }}>
      <p className="text-[10px] uppercase tracking-wider" style={{ color: '#94A3B8' }}>{label}</p>
      <p className="text-lg font-bold tabular-nums mt-0.5" style={{ color: tint }}>{value}</p>
    </div>
  )
}

function fmtBRL(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
