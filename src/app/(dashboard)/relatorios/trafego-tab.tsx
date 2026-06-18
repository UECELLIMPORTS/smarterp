'use client'

import { useMemo } from 'react'
import { TrendingUp, TrendingDown, DollarSign, ShoppingCart, Percent, BarChart2, Megaphone, Users } from 'lucide-react'
import type { TrafegoRow } from './page'
import { originLabel } from '@/lib/customer-origin'

const BRL = (c: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(c / 100)

type Props = { rows: TrafegoRow[] }

function marginColor(m: number) {
  if (m >= 30) return '#10B981'
  if (m >= 15) return '#F59E0B'
  return '#EF4444'
}

// ── Mini card de KPI ───────────────────────────────────────────────────────
function KpiCard({ label, value, sub, accent }: {
  label: string; value: string; sub?: string; accent: string
}) {
  return (
    <div className="rounded-xl border p-4" style={{ background: '#131C2A', borderColor: '#2A3650' }}>
      <p className="text-[11px] uppercase tracking-wider" style={{ color: '#64748B' }}>{label}</p>
      <p className="mt-1.5 text-xl font-bold" style={{ color: accent }}>{value}</p>
      {sub && <p className="mt-0.5 text-xs" style={{ color: '#64748B' }}>{sub}</p>}
    </div>
  )
}

// ── Barra de progresso horizontal simples ─────────────────────────────────
function SplitBar({ paidPct }: { paidPct: number }) {
  const organicPct = 100 - paidPct
  return (
    <div className="flex h-4 w-full overflow-hidden rounded-full" style={{ background: '#2A3650' }}>
      <div
        className="flex items-center justify-center text-[10px] font-bold text-white transition-all"
        style={{ width: `${paidPct}%`, background: '#F43F5E', minWidth: paidPct > 8 ? undefined : 0 }}
      >
        {paidPct > 12 ? `${paidPct}%` : ''}
      </div>
      <div
        className="flex items-center justify-center text-[10px] font-bold text-white transition-all"
        style={{ width: `${organicPct}%`, background: '#10B981', minWidth: organicPct > 8 ? undefined : 0 }}
      >
        {organicPct > 12 ? `${organicPct}%` : ''}
      </div>
    </div>
  )
}

// ── Gráfico de barras mensais (CSS, sem recharts) ──────────────────────────
function MonthlyChart({ months }: {
  months: { label: string; paidCents: number; organicCents: number }[]
}) {
  const maxVal = Math.max(...months.map(m => m.paidCents + m.organicCents), 1)

  return (
    <div className="overflow-x-auto">
      <div className="flex items-end gap-3 min-w-max pb-2" style={{ height: 160 }}>
        {months.map(m => {
          const total   = m.paidCents + m.organicCents
          const totalH  = Math.round((total / maxVal) * 140)
          const paidH   = total > 0 ? Math.round((m.paidCents / total) * totalH) : 0
          const orgH    = totalH - paidH
          return (
            <div key={m.label} className="flex flex-col items-center gap-1" style={{ width: 44 }}>
              <div className="flex flex-col-reverse items-center w-full" style={{ height: 140 }}>
                <div title={`Orgânico: ${BRL(m.organicCents)}`}
                  style={{ height: orgH, width: 28, background: '#10B981', borderRadius: '4px 4px 0 0', opacity: 0.85 }} />
                <div title={`Pago: ${BRL(m.paidCents)}`}
                  style={{ height: paidH, width: 28, background: '#F43F5E', opacity: 0.85 }} />
              </div>
              <span className="text-[10px]" style={{ color: '#64748B' }}>{m.label}</span>
            </div>
          )
        })}
      </div>
      {/* Legenda */}
      <div className="flex items-center gap-4 mt-2">
        {[{ color: '#F43F5E', label: 'Tráfego Pago' }, { color: '#10B981', label: 'Orgânico' }].map(l => (
          <div key={l.label} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: l.color }} />
            <span className="text-xs" style={{ color: '#94A3B8' }}>{l.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Componente principal ───────────────────────────────────────────────────
export function PagoOrganicoTab({ rows }: Props) {

  const paid    = useMemo(() => rows.filter(r => r.isPaid), [rows])
  const organic = useMemo(() => rows.filter(r => !r.isPaid), [rows])

  function agg(list: TrafegoRow[]) {
    const rev     = list.reduce((s, r) => s + r.totalCents, 0)
    const profit  = list.reduce((s, r) => s + r.profitCents, 0)
    const count   = list.length
    const margin  = rev > 0 ? Math.round((profit / rev) * 100) : 0
    const ticket  = count > 0 ? Math.round(rev / count) : 0
    return { rev, profit, count, margin, ticket }
  }

  const paidStats    = useMemo(() => agg(paid),    [paid])
  const organicStats = useMemo(() => agg(organic), [organic])
  const totalRev     = paidStats.rev + organicStats.rev

  const paidPct    = totalRev > 0 ? Math.round((paidStats.rev / totalRev) * 100) : 0
  const organicPct = 100 - paidPct

  // Meses — últimos com dados (máx 6)
  const months = useMemo(() => {
    const map = new Map<string, { label: string; paidCents: number; organicCents: number }>()
    for (const r of rows) {
      const [year, month] = r.month.split('-')
      const label = new Date(Number(year), Number(month) - 1, 1)
        .toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
      const ex = map.get(r.month)
      if (ex) {
        if (r.isPaid) ex.paidCents    += r.totalCents
        else          ex.organicCents += r.totalCents
      } else {
        map.set(r.month, {
          label,
          paidCents:    r.isPaid ? r.totalCents : 0,
          organicCents: r.isPaid ? 0 : r.totalCents,
        })
      }
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v)
  }, [rows])

  // Campanhas (tráfego pago com meta_campaign_id)
  const campaigns = useMemo(() => {
    const map = new Map<string, { name: string; count: number; rev: number; profit: number }>()
    for (const r of paid) {
      if (!r.campaignId) continue
      const ex = map.get(r.campaignId)
      if (ex) { ex.count++; ex.rev += r.totalCents; ex.profit += r.profitCents }
      else     map.set(r.campaignId, { name: r.campaignName ?? r.campaignId, count: 1, rev: r.totalCents, profit: r.profitCents })
    }
    return [...map.values()].sort((a, b) => b.rev - a.rev)
  }, [paid])

  // Origem do orgânico
  const organicOrigins = useMemo(() => {
    const map = new Map<string, { count: number; rev: number; profit: number }>()
    for (const r of organic) {
      const key = r.customerOrigin ?? '__sem_origem__'
      const ex = map.get(key)
      if (ex) { ex.count++; ex.rev += r.totalCents; ex.profit += r.profitCents }
      else     map.set(key, { count: 1, rev: r.totalCents, profit: r.profitCents })
    }
    return [...map.entries()]
      .map(([key, v]) => ({
        key,
        label: key === '__sem_origem__' ? 'Não informado' : originLabel(key),
        ...v,
        margin: v.rev > 0 ? Math.round((v.profit / v.rev) * 100) : 0,
      }))
      .sort((a, b) => b.rev - a.rev)
  }, [organic])

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 rounded-xl border"
        style={{ background: '#1B2638', borderColor: '#2A3650' }}>
        <BarChart2 className="h-10 w-10" style={{ color: '#2A3650' }} />
        <p className="text-sm" style={{ color: '#64748B' }}>Nenhuma transação no período selecionado</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">

      {/* ── Head-to-head ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">

        {/* Pago */}
        <div className="rounded-xl border p-5 space-y-4"
          style={{ background: 'rgba(244,63,94,.06)', borderColor: 'rgba(244,63,94,.3)' }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg"
                style={{ background: 'rgba(244,63,94,.15)' }}>
                <Megaphone className="h-4 w-4" style={{ color: '#F43F5E' }} />
              </div>
              <span className="text-sm font-semibold" style={{ color: '#F43F5E' }}>Tráfego Pago</span>
            </div>
            <span className="rounded-full border px-2 py-0.5 text-xs font-bold"
              style={{ borderColor: 'rgba(244,63,94,.4)', color: '#F43F5E' }}>
              {paidPct}% da receita
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <KpiCard label="Transações"  value={String(paidStats.count)}        accent="#F43F5E" />
            <KpiCard label="Faturamento" value={BRL(paidStats.rev)}             accent="#F43F5E" />
            <KpiCard label="Lucro Bruto" value={BRL(paidStats.profit)}          accent={paidStats.profit >= 0 ? '#10B981' : '#EF4444'} />
            <KpiCard label="Margem"      value={`${paidStats.margin}%`}         accent={marginColor(paidStats.margin)} />
            <KpiCard label="Ticket Médio" value={BRL(paidStats.ticket)}         accent="#F8FAFC"
              sub="por transação" />
          </div>
        </div>

        {/* Orgânico */}
        <div className="rounded-xl border p-5 space-y-4"
          style={{ background: 'rgba(16,185,129,.06)', borderColor: 'rgba(16,185,129,.3)' }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg"
                style={{ background: 'rgba(16,185,129,.15)' }}>
                <Users className="h-4 w-4" style={{ color: '#10B981' }} />
              </div>
              <span className="text-sm font-semibold" style={{ color: '#10B981' }}>Orgânico</span>
            </div>
            <span className="rounded-full border px-2 py-0.5 text-xs font-bold"
              style={{ borderColor: 'rgba(16,185,129,.4)', color: '#10B981' }}>
              {organicPct}% da receita
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <KpiCard label="Transações"  value={String(organicStats.count)}     accent="#10B981" />
            <KpiCard label="Faturamento" value={BRL(organicStats.rev)}          accent="#10B981" />
            <KpiCard label="Lucro Bruto" value={BRL(organicStats.profit)}       accent={organicStats.profit >= 0 ? '#10B981' : '#EF4444'} />
            <KpiCard label="Margem"      value={`${organicStats.margin}%`}      accent={marginColor(organicStats.margin)} />
            <KpiCard label="Ticket Médio" value={BRL(organicStats.ticket)}      accent="#F8FAFC"
              sub="por transação" />
          </div>
        </div>
      </div>

      {/* ── Split bar ─────────────────────────────────────────────────────── */}
      <div className="rounded-xl border p-5 space-y-3"
        style={{ background: '#1B2638', borderColor: '#2A3650' }}>
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold" style={{ color: '#F8FAFC' }}>Participação na Receita Total</p>
          <p className="text-xs" style={{ color: '#64748B' }}>{BRL(totalRev)} total</p>
        </div>
        <SplitBar paidPct={paidPct} />
        <div className="flex justify-between text-xs" style={{ color: '#94A3B8' }}>
          <span>Pago: {BRL(paidStats.rev)}</span>
          <span>Orgânico: {BRL(organicStats.rev)}</span>
        </div>
      </div>

      {/* ── Evolução mensal ──────────────────────────────────────────────── */}
      {months.length > 1 && (
        <div className="rounded-xl border p-5 space-y-4"
          style={{ background: '#1B2638', borderColor: '#2A3650' }}>
          <div className="flex items-center gap-2">
            <BarChart2 className="h-4 w-4" style={{ color: '#22C55E' }} />
            <p className="text-sm font-semibold" style={{ color: '#F8FAFC' }}>Evolução Mensal — Pago vs Orgânico</p>
          </div>
          <MonthlyChart months={months} />
        </div>
      )}

      {/* ── Campanhas (tráfego pago) ──────────────────────────────────────── */}
      {campaigns.length > 0 && (
        <div className="rounded-xl border" style={{ background: '#1B2638', borderColor: '#2A3650' }}>
          <div className="flex items-center gap-2 border-b px-5 py-4"
            style={{ borderColor: '#2A3650' }}>
            <Megaphone className="h-4 w-4" style={{ color: '#F43F5E' }} />
            <p className="text-sm font-semibold" style={{ color: '#F8FAFC' }}>
              Campanhas — Atribuição Direta
            </p>
            <span className="ml-auto text-xs" style={{ color: '#64748B' }}>
              {campaigns.length} {campaigns.length === 1 ? 'campanha' : 'campanhas'}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b" style={{ borderColor: '#2A3650' }}>
                  {['Campanha', 'Transações', 'Faturamento', 'Lucro', 'Margem'].map(h => (
                    <th key={h} className="px-5 py-3 text-left text-[11px] font-medium uppercase tracking-wider"
                      style={{ color: '#64748B' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c, i) => {
                  const margin = c.rev > 0 ? Math.round((c.profit / c.rev) * 100) : 0
                  return (
                    <tr key={i} className="border-b last:border-0"
                      style={{ borderColor: '#2A3650' }}>
                      <td className="px-5 py-3 font-medium" style={{ color: '#F8FAFC' }}>
                        <div className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: '#F43F5E' }} />
                          <span className="truncate max-w-[220px]" title={c.name}>{c.name}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3 tabular-nums" style={{ color: '#94A3B8' }}>{c.count}</td>
                      <td className="px-5 py-3 tabular-nums font-semibold" style={{ color: '#10B981' }}>{BRL(c.rev)}</td>
                      <td className="px-5 py-3 tabular-nums" style={{ color: c.profit >= 0 ? '#10B981' : '#EF4444' }}>{BRL(c.profit)}</td>
                      <td className="px-5 py-3 tabular-nums">
                        <span className="rounded-full px-2 py-0.5 text-xs font-semibold"
                          style={{ background: `${marginColor(margin)}18`, color: marginColor(margin) }}>
                          {margin}%
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Breakdown orgânico ────────────────────────────────────────────── */}
      {organicOrigins.length > 0 && (
        <div className="rounded-xl border" style={{ background: '#1B2638', borderColor: '#2A3650' }}>
          <div className="flex items-center gap-2 border-b px-5 py-4"
            style={{ borderColor: '#2A3650' }}>
            <TrendingUp className="h-4 w-4" style={{ color: '#10B981' }} />
            <p className="text-sm font-semibold" style={{ color: '#F8FAFC' }}>Orgânico — por Origem</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b" style={{ borderColor: '#2A3650' }}>
                  {['Origem', 'Transações', 'Faturamento', 'Lucro', 'Margem'].map(h => (
                    <th key={h} className="px-5 py-3 text-left text-[11px] font-medium uppercase tracking-wider"
                      style={{ color: '#64748B' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {organicOrigins.map((o, i) => (
                  <tr key={i} className="border-b last:border-0" style={{ borderColor: '#2A3650' }}>
                    <td className="px-5 py-3 font-medium" style={{ color: '#F8FAFC' }}>
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: '#10B981' }} />
                        {o.label}
                      </div>
                    </td>
                    <td className="px-5 py-3 tabular-nums" style={{ color: '#94A3B8' }}>{o.count}</td>
                    <td className="px-5 py-3 tabular-nums font-semibold" style={{ color: '#10B981' }}>{BRL(o.rev)}</td>
                    <td className="px-5 py-3 tabular-nums" style={{ color: o.profit >= 0 ? '#10B981' : '#EF4444' }}>{BRL(o.profit)}</td>
                    <td className="px-5 py-3 tabular-nums">
                      <span className="rounded-full px-2 py-0.5 text-xs font-semibold"
                        style={{ background: `${marginColor(o.margin)}18`, color: marginColor(o.margin) }}>
                        {o.margin}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Nota sobre atribuição */}
      <p className="text-xs px-1" style={{ color: '#475569' }}>
        * Tráfego Pago = vendas com campanha Meta Ads vinculada (<code>meta_campaign_id</code>) ou origem do cliente{' '}
        <em>Instagram Pago</em> / <em>Facebook</em>. Demais vendas são contabilizadas como Orgânico.
      </p>

    </div>
  )
}
