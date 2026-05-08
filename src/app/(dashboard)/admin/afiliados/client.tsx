'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Search, Copy, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import type { AffiliateListItem } from '@/actions/affiliates-admin'

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  active:        { label: 'Ativo',          color: '#10B981' },
  pending_email: { label: 'Aguardando',     color: '#F59E0B' },
  paused:        { label: 'Pausado',        color: '#94A3B8' },
  banned:        { label: 'Banido',         color: '#EF4444' },
}

export function AfiliadosClient({ initialList }: { initialList: AffiliateListItem[] }) {
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [sourceFilter, setSourceFilter] = useState<string>('')
  const [query, setQuery]               = useState('')

  const filtered = useMemo(() => {
    return initialList.filter(a => {
      if (statusFilter && a.status !== statusFilter) return false
      if (sourceFilter && a.source !== sourceFilter) return false
      if (query) {
        const q = query.toLowerCase()
        return a.fullName.toLowerCase().includes(q)
            || a.email.toLowerCase().includes(q)
            || a.refCode.toLowerCase().includes(q)
            || (a.whatsapp ?? '').includes(q)
      }
      return true
    })
  }, [initialList, statusFilter, sourceFilter, query])

  function copyLink(refCode: string) {
    const url = `https://app.gestaosmarterp.online/signup?ref=${refCode}`
    navigator.clipboard.writeText(url).then(
      () => toast.success('Link copiado'),
      () => toast.error('Falha ao copiar'),
    )
  }

  return (
    <>
      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: '#94A3B8' }} />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar por nome, email, código ou WhatsApp"
            className="w-full rounded-lg border px-8 py-2 text-sm outline-none focus:border-emerald-500/50"
            style={{ background: '#131C2A', borderColor: 'rgba(255,255,255,.08)', color: '#F8FAFC' }}
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="rounded-lg border px-2.5 py-2 text-xs"
          style={{ background: '#131C2A', borderColor: 'rgba(255,255,255,.08)', color: '#CBD5E1' }}
        >
          <option value="">Todos status</option>
          <option value="active">Ativo</option>
          <option value="pending_email">Aguardando email</option>
          <option value="paused">Pausado</option>
          <option value="banned">Banido</option>
        </select>
        <select
          value={sourceFilter}
          onChange={e => setSourceFilter(e.target.value)}
          className="rounded-lg border px-2.5 py-2 text-xs"
          style={{ background: '#131C2A', borderColor: 'rgba(255,255,255,.08)', color: '#CBD5E1' }}
        >
          <option value="">Origem</option>
          <option value="manual">Manual</option>
          <option value="public">Público</option>
        </select>
      </div>

      {/* Tabela */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border p-8 text-center text-sm"
          style={{ background: '#131C2A', borderColor: 'rgba(255,255,255,.06)', color: '#94A3B8' }}>
          Nenhum afiliado {initialList.length === 0 ? 'cadastrado ainda' : 'bate com os filtros'}
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden"
          style={{ background: '#131C2A', borderColor: 'rgba(255,255,255,.06)' }}>
          <table className="w-full text-sm">
            <thead style={{ background: 'rgba(255,255,255,.03)' }}>
              <tr style={{ color: '#94A3B8' }}>
                <th className="text-left  px-3 py-2 text-[10px] uppercase tracking-wider font-medium">Nome</th>
                <th className="text-left  px-3 py-2 text-[10px] uppercase tracking-wider font-medium">Código</th>
                <th className="text-left  px-3 py-2 text-[10px] uppercase tracking-wider font-medium">Status</th>
                <th className="text-right px-3 py-2 text-[10px] uppercase tracking-wider font-medium">Convers.</th>
                <th className="text-right px-3 py-2 text-[10px] uppercase tracking-wider font-medium">A pagar</th>
                <th className="text-right px-3 py-2 text-[10px] uppercase tracking-wider font-medium">Pendente</th>
                <th className="text-right px-3 py-2 text-[10px] uppercase tracking-wider font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(a => {
                const st = STATUS_LABELS[a.status] ?? { label: a.status, color: '#94A3B8' }
                return (
                  <tr key={a.id} className="border-t" style={{ borderColor: 'rgba(255,255,255,.04)' }}>
                    <td className="px-3 py-2.5">
                      <Link href={`/admin/afiliados/${a.id}`} className="hover:underline" style={{ color: '#F8FAFC' }}>
                        {a.fullName}
                      </Link>
                      <p className="text-[11px]" style={{ color: '#94A3B8' }}>
                        {a.email}{a.source === 'public' ? ' · público' : ''}
                      </p>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <code className="text-xs font-mono px-1.5 py-0.5 rounded"
                          style={{ background: 'rgba(255,255,255,.05)', color: '#10B981' }}>
                          {a.refCode}
                        </code>
                        <button
                          type="button"
                          onClick={() => copyLink(a.refCode)}
                          className="p-1 rounded hover:bg-white/5"
                          title="Copiar link"
                        >
                          <Copy className="h-3 w-3" style={{ color: '#94A3B8' }} />
                        </button>
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="text-[11px] font-medium px-2 py-0.5 rounded"
                        style={{ background: `${st.color}15`, color: st.color }}>
                        {st.label}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: '#CBD5E1' }}>
                      {a.conversions}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-medium"
                      style={{ color: a.payableCents > 0 ? '#10B981' : '#94A3B8' }}>
                      {fmtBRL(a.payableCents)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums"
                      style={{ color: '#94A3B8' }}>
                      {fmtBRL(a.pendingCents)}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <Link
                        href={`/admin/afiliados/${a.id}`}
                        className="inline-flex items-center gap-1 text-[11px] hover:underline"
                        style={{ color: '#3B82F6' }}
                      >
                        Detalhe <ExternalLink className="h-3 w-3" />
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

function fmtBRL(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
