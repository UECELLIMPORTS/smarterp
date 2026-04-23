'use client'

import { useRouter } from 'next/navigation'
import {
  TrendingUp, Users, UserPlus, Lightbulb,
  ShoppingCart, Wrench, Link2, AlertTriangle, Star, Calendar,
} from 'lucide-react'
import type { DashboardData, TopClient, MonthPoint, ChurnClient, WeekdayPoint } from './page'

// ── Helpers ────────────────────────────────────────────────────────────────

const BRL = (c: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(c / 100)

// ── Donut Chart (CSS conic-gradient) ──────────────────────────────────────

function DonutChart({ recShare, novShare }: { recShare: number; novShare: number }) {
  const recDeg = Math.round((recShare / 100) * 360)
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative flex items-center justify-center" style={{ width: 180, height: 180 }}>
        <div style={{
          width: 180, height: 180, borderRadius: '50%',
          background: recShare === 0
            ? '#9B6DFF'
            : recShare === 100
            ? '#00FF94'
            : `conic-gradient(#00FF94 0deg ${recDeg}deg, #9B6DFF ${recDeg}deg 360deg)`,
        }} />
        <div
          className="absolute flex flex-col items-center justify-center"
          style={{ width: 112, height: 112, borderRadius: '50%', background: '#111827' }}
        >
          <span className="text-xl font-bold" style={{ color: '#E8F0FE', fontFamily: 'ui-monospace,monospace' }}>
            {recShare}%
          </span>
          <span className="text-[10px]" style={{ color: '#5A7A9A', marginTop: 2 }}>Recorrentes</span>
        </div>
      </div>
      <div className="flex gap-6">
        <div className="flex items-center gap-2">
          <div className="h-2.5 w-2.5 rounded-full" style={{ background: '#00FF94' }} />
          <span className="text-xs" style={{ color: '#8AA8C8' }}>Recorrentes {recShare}%</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-2.5 w-2.5 rounded-full" style={{ background: '#9B6DFF' }} />
          <span className="text-xs" style={{ color: '#8AA8C8' }}>Novos {novShare}%</span>
        </div>
      </div>
    </div>
  )
}

// ── Bar Chart (CSS flexbox) ────────────────────────────────────────────────

function BarChart({ months }: { months: MonthPoint[] }) {
  const maxVal = Math.max(...months.flatMap(m => [m.recorrentes, m.novos]), 1)

  return (
    <div className="flex w-full items-end gap-2" style={{ height: 200 }}>
      {months.map(m => {
        const recH = Math.max((m.recorrentes / maxVal) * 160, m.recorrentes > 0 ? 6 : 0)
        const novH = Math.max((m.novos / maxVal) * 160, m.novos > 0 ? 6 : 0)
        return (
          <div key={m.label} className="flex flex-1 flex-col items-center gap-1.5">
            <div className="flex w-full items-end gap-0.5" style={{ height: 160 }}>
              <div
                className="flex-1 rounded-t-sm transition-all duration-500"
                style={{ height: recH, background: 'rgba(0,255,148,0.65)' }}
                title={`Recorrentes: ${BRL(m.recorrentes)}`}
              />
              <div
                className="flex-1 rounded-t-sm transition-all duration-500"
                style={{ height: novH, background: 'rgba(155,109,255,0.65)' }}
                title={`Novos: ${BRL(m.novos)}`}
              />
            </div>
            <span className="text-[10px] capitalize" style={{ color: '#5A7A9A' }}>{m.label}</span>
          </div>
        )
      })}
    </div>
  )
}

// ── KPI Card ──────────────────────────────────────────────────────────────

function ClientCard({
  label, icon: Icon, color, glowColor, totalCents, ticketMedioCents, avgProducts, sharePercent, transactions,
}: {
  label: string; icon: React.ElementType; color: string; glowColor: string
  totalCents: number; ticketMedioCents: number; avgProducts: string; sharePercent: number; transactions: number
}) {
  return (
    <div
      className="rounded-2xl border p-6 relative overflow-hidden"
      style={{ background: '#111827', borderColor: '#1E2D45' }}
    >
      <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full opacity-30"
        style={{ background: `radial-gradient(circle, ${glowColor}, transparent)` }}
      />
      <div className="mb-4 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg"
          style={{ background: `${color}20` }}>
          <Icon className="h-4 w-4" style={{ color }} />
        </div>
        <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#5A7A9A' }}>
          {label}
        </span>
      </div>
      <div className="mb-5">
        <span className="text-3xl font-bold tracking-tight" style={{ color, fontFamily: 'ui-monospace,monospace' }}>
          {BRL(totalCents)}
        </span>
        <span className="ml-2 text-xs" style={{ color: '#5A7A9A' }}>{transactions} pedidos</span>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Ticket Médio', value: BRL(ticketMedioCents) },
          { label: 'Produtos/OS',  value: avgProducts },
          { label: 'Share',        value: `${sharePercent}%` },
        ].map(({ label: l, value }) => (
          <div
            key={l}
            className="flex flex-col items-center rounded-lg py-2.5"
            style={{ background: '#0D1320', border: '1px solid #1E2D45' }}
          >
            <span className="text-sm font-bold" style={{ color, fontFamily: 'ui-monospace,monospace' }}>
              {value}
            </span>
            <span className="mt-1 text-[9px] font-semibold uppercase tracking-wider" style={{ color: '#5A7A9A' }}>
              {l}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Sources: SmartERP vs CheckSmart ───────────────────────────────────────

function SourcesSection({ sources }: { sources: DashboardData['sources'] }) {
  const items = [
    {
      label: 'SmartERP — POS',
      icon: ShoppingCart,
      color: '#00E5FF',
      glow: 'rgba(0,229,255,.4)',
      totalCents: sources.smarterp.totalCents,
      transactions: sources.smarterp.transactions,
      customers: sources.smarterp.uniqueCustomers,
      sub: 'vendas no caixa',
    },
    {
      label: 'CheckSmart — OS',
      icon: Wrench,
      color: '#9B6DFF',
      glow: 'rgba(155,109,255,.4)',
      totalCents: sources.checksmart.totalCents,
      transactions: sources.checksmart.transactions,
      customers: sources.checksmart.uniqueCustomers,
      sub: 'ordens de serviço',
    },
  ]

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
      {items.map(({ label, icon: Icon, color, glow, totalCents, transactions, customers, sub }) => (
        <div
          key={label}
          className="rounded-2xl border p-6 relative overflow-hidden"
          style={{ background: '#111827', borderColor: '#1E2D45' }}
        >
          <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full opacity-20"
            style={{ background: `radial-gradient(circle, ${glow}, transparent)` }}
          />
          <div className="mb-4 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg"
              style={{ background: `${color}20` }}>
              <Icon className="h-4 w-4" style={{ color }} />
            </div>
            <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#5A7A9A' }}>
              {label}
            </span>
          </div>
          <div className="mb-4">
            <span className="text-3xl font-bold tracking-tight" style={{ color, fontFamily: 'ui-monospace,monospace' }}>
              {BRL(totalCents)}
            </span>
          </div>
          <div className="flex gap-3">
            <div className="flex flex-col items-center flex-1 rounded-lg py-2.5"
              style={{ background: '#0D1320', border: '1px solid #1E2D45' }}>
              <span className="text-sm font-bold" style={{ color, fontFamily: 'ui-monospace,monospace' }}>{transactions}</span>
              <span className="mt-1 text-[9px] font-semibold uppercase tracking-wider" style={{ color: '#5A7A9A' }}>{sub}</span>
            </div>
            <div className="flex flex-col items-center flex-1 rounded-lg py-2.5"
              style={{ background: '#0D1320', border: '1px solid #1E2D45' }}>
              <span className="text-sm font-bold" style={{ color, fontFamily: 'ui-monospace,monospace' }}>{customers}</span>
              <span className="mt-1 text-[9px] font-semibold uppercase tracking-wider" style={{ color: '#5A7A9A' }}>clientes únicos</span>
            </div>
          </div>
        </div>
      ))}

      {/* Overlap card */}
      <div
        className="rounded-2xl border p-6 relative overflow-hidden flex flex-col items-center justify-center text-center"
        style={{ background: '#111827', borderColor: '#1E2D45' }}
      >
        <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full opacity-20"
          style={{ background: 'radial-gradient(circle, rgba(0,255,148,.4), transparent)' }}
        />
        <div className="flex h-10 w-10 items-center justify-center rounded-xl mb-3"
          style={{ background: 'rgba(0,255,148,.15)' }}>
          <Link2 className="h-5 w-5" style={{ color: '#00FF94' }} />
        </div>
        <span className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: '#5A7A9A' }}>
          Clientes em Ambos
        </span>
        <span className="text-5xl font-bold" style={{ color: '#00FF94', fontFamily: 'ui-monospace,monospace' }}>
          {sources.overlap}
        </span>
        <p className="mt-2 text-xs" style={{ color: '#5A7A9A' }}>
          usaram SmartERP e CheckSmart no período
        </p>
      </div>
    </div>
  )
}

// ── RFM Segments ──────────────────────────────────────────────────────────

function RfmSection({ rfmSegments }: { rfmSegments: DashboardData['rfmSegments'] }) {
  const segments = [
    {
      key: 'campeoes' as const,
      label: 'Campeões',
      desc: 'Recentes, frequentes e alto valor',
      color: '#00FF94',
      bg: 'rgba(0,255,148,.12)',
      icon: '🏆',
    },
    {
      key: 'emRisco' as const,
      label: 'Em Risco',
      desc: 'Alto valor mas sem comprar há tempo',
      color: '#FF4D6D',
      bg: 'rgba(255,77,109,.12)',
      icon: '⚠️',
    },
    {
      key: 'novosPromissores' as const,
      label: 'Promissores',
      desc: 'Compraram recentemente, pouco frequentes',
      color: '#00E5FF',
      bg: 'rgba(0,229,255,.12)',
      icon: '✨',
    },
    {
      key: 'dormentes' as const,
      label: 'Dormentes',
      desc: 'Inativos com baixo histórico',
      color: '#5A7A9A',
      bg: 'rgba(90,122,154,.12)',
      icon: '💤',
    },
  ]

  const total = Object.values(rfmSegments).reduce((a, b) => a + b, 0) || 1

  return (
    <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
      {segments.map(({ key, label, desc, color, bg, icon }) => {
        const count = rfmSegments[key]
        const pct = Math.round((count / total) * 100)
        return (
          <div
            key={key}
            className="rounded-2xl border p-5 flex flex-col"
            style={{ background: '#111827', borderColor: '#1E2D45' }}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-lg">{icon}</span>
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                style={{ background: bg, color }}
              >
                {pct}%
              </span>
            </div>
            <span className="text-2xl font-bold mb-1" style={{ color, fontFamily: 'ui-monospace,monospace' }}>
              {count}
            </span>
            <span className="text-xs font-bold" style={{ color: '#E8F0FE' }}>{label}</span>
            <span className="mt-1 text-[10px]" style={{ color: '#5A7A9A' }}>{desc}</span>
            {/* Progress bar */}
            <div className="mt-3 h-1 rounded-full" style={{ background: '#1E2D45' }}>
              <div
                className="h-1 rounded-full transition-all duration-500"
                style={{ width: `${pct}%`, background: color }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Weekday Heatmap ───────────────────────────────────────────────────────

function WeekdayHeatmap({ days }: { days: WeekdayPoint[] }) {
  const maxCents = Math.max(...days.map(d => d.totalCents), 1)
  const bestIdx = days.reduce((best, d, i) => d.totalCents > days[best].totalCents ? i : best, 0)

  return (
    <div className="grid grid-cols-7 gap-2">
      {days.map((day, i) => {
        const intensity = day.totalCents / maxCents
        const isBest = i === bestIdx && day.totalCents > 0
        return (
          <div
            key={day.label}
            className="flex flex-col items-center gap-2 rounded-xl p-3 transition-all"
            style={{
              background: `rgba(0,229,255,${0.04 + intensity * 0.22})`,
              border: isBest ? '1px solid rgba(0,229,255,.5)' : '1px solid #1E2D45',
            }}
          >
            <span className="text-[11px] font-bold" style={{ color: isBest ? '#00E5FF' : '#8AA8C8' }}>
              {day.label}
            </span>
            {isBest && (
              <span className="rounded-full px-1.5 py-0.5 text-[8px] font-bold"
                style={{ background: 'rgba(0,229,255,.2)', color: '#00E5FF' }}>
                TOP
              </span>
            )}
            <span className="text-xs font-bold text-center leading-tight"
              style={{ color: intensity > 0.5 ? '#00E5FF' : '#E8F0FE', fontFamily: 'ui-monospace,monospace' }}>
              {day.totalCents > 0 ? BRL(day.totalCents) : '—'}
            </span>
            <span className="text-[10px]" style={{ color: '#5A7A9A' }}>
              {day.transactions > 0 ? `${day.transactions} tx` : ''}
            </span>
            {/* Intensity bar */}
            <div className="w-full h-1 rounded-full mt-1" style={{ background: '#1E2D45' }}>
              <div
                className="h-1 rounded-full"
                style={{ width: `${Math.round(intensity * 100)}%`, background: '#00E5FF' }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Churn Risk Table ──────────────────────────────────────────────────────

function ChurnTable({ clients }: { clients: ChurnClient[] }) {
  function urgency(days: number) {
    if (days >= 120) return { label: 'Crítico', color: '#FF4D6D', bg: 'rgba(255,77,109,.15)' }
    if (days >= 90)  return { label: 'Alto',    color: '#FFAA00', bg: 'rgba(255,170,0,.15)' }
    return              { label: 'Médio',    color: '#9B6DFF', bg: 'rgba(155,109,255,.15)' }
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left" style={{ borderColor: '#1E2D45' }}>
            {['Cliente', 'Sem comprar há', 'Valor total (6m)', 'Pedidos', 'Risco'].map(h => (
              <th key={h} className="pb-3 pr-4 text-[10px] font-bold uppercase tracking-wider"
                style={{ color: '#5A7A9A' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {clients.map((c, i) => {
            const u = urgency(c.daysSince)
            return (
              <tr
                key={i}
                className="border-b transition-colors hover:bg-white/[0.02]"
                style={{ borderColor: 'rgba(30,45,69,.5)' }}
              >
                <td className="py-3 pr-4">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold"
                      style={{ background: 'rgba(255,77,109,.12)', color: '#FF4D6D' }}>
                      {c.name.trim().charAt(0).toUpperCase()}
                    </div>
                    <span className="font-medium" style={{ color: '#E8F0FE' }}>{c.name}</span>
                  </div>
                </td>
                <td className="py-3 pr-4 font-mono font-semibold" style={{ color: '#FF4D6D' }}>
                  {c.daysSince} dias
                </td>
                <td className="py-3 pr-4 font-mono font-semibold" style={{ color: '#8AA8C8' }}>
                  {BRL(c.totalCents)}
                </td>
                <td className="py-3 pr-4 font-mono" style={{ color: '#8AA8C8' }}>
                  {c.transactions}
                </td>
                <td className="py-3">
                  <span className="rounded-full px-2.5 py-1 text-[10px] font-bold"
                    style={{ background: u.bg, color: u.color }}>
                    {u.label}
                  </span>
                </td>
              </tr>
            )
          })}
          {clients.length === 0 && (
            <tr>
              <td colSpan={5} className="py-10 text-center text-sm" style={{ color: '#5A7A9A' }}>
                Nenhum cliente em risco no período — ótimo sinal!
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

// ── Top Clients Table ─────────────────────────────────────────────────────

function ClientsTable({ clients }: { clients: TopClient[] }) {
  function badge(c: TopClient) {
    if (c.transactions >= 5 || c.totalCents >= 500000) return { label: 'VIP', color: '#FFAA00', bg: 'rgba(255,170,0,.15)' }
    if (c.type === 'recorrente') return { label: 'Recorrente', color: '#00FF94', bg: 'rgba(0,255,148,.12)' }
    return { label: 'Novo', color: '#9B6DFF', bg: 'rgba(155,109,255,.15)' }
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left" style={{ borderColor: '#1E2D45' }}>
            {['Cliente', 'Pedidos', 'Valor Total', 'Ticket Médio', 'Tipo', 'Último contato'].map(h => (
              <th key={h} className="pb-3 pr-4 text-[10px] font-bold uppercase tracking-wider"
                style={{ color: '#5A7A9A' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {clients.map((c, i) => {
            const b = badge(c)
            return (
              <tr
                key={i}
                className="border-b transition-colors hover:bg-white/[0.02]"
                style={{ borderColor: 'rgba(30,45,69,.5)' }}
              >
                <td className="py-3 pr-4">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold"
                      style={{ background: 'rgba(0,229,255,.12)', color: '#00E5FF' }}>
                      {c.name.trim().charAt(0).toUpperCase()}
                    </div>
                    <span className="font-medium text-sm" style={{ color: '#E8F0FE' }}>{c.name}</span>
                  </div>
                </td>
                <td className="py-3 pr-4 font-mono font-semibold" style={{ color: '#E8F0FE' }}>
                  {c.transactions}
                </td>
                <td className="py-3 pr-4 font-mono font-semibold" style={{ color: '#00FF94' }}>
                  {BRL(c.totalCents)}
                </td>
                <td className="py-3 pr-4 font-mono" style={{ color: '#8AA8C8' }}>
                  {BRL(c.ticketMedioCents)}
                </td>
                <td className="py-3 pr-4">
                  <span className="rounded-full px-2.5 py-1 text-[10px] font-bold"
                    style={{ background: b.bg, color: b.color }}>
                    {b.label}
                  </span>
                </td>
                <td className="py-3 font-mono text-xs" style={{ color: '#5A7A9A' }}>
                  {c.lastDate}
                </td>
              </tr>
            )
          })}
          {clients.length === 0 && (
            <tr>
              <td colSpan={6} className="py-10 text-center text-sm" style={{ color: '#5A7A9A' }}>
                Nenhuma venda encontrada no período
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

// ── Section header helper ─────────────────────────────────────────────────

function SectionHeader({
  accentColor, title, subtitle, icon: Icon, badge,
}: {
  accentColor: string; title: string; subtitle: string
  icon?: React.ElementType; badge?: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-4 w-1 rounded-full" style={{ background: accentColor }} />
      <div className="flex-1">
        <p className="text-xs font-bold uppercase tracking-widest" style={{ color: '#8AA8C8' }}>{title}</p>
        <p className="text-[11px]" style={{ color: '#5A7A9A' }}>{subtitle}</p>
      </div>
      {badge}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────

export function ErpClientesClient({ data }: { data: DashboardData }) {
  const router = useRouter()
  const {
    period, recorrentes, novos, monthlyData, topClients, insightText,
    sources, churnRisk, rfmSegments, weekdayHeatmap,
  } = data

  const periods: Period[] = ['7d', '30d', '90d']
  type Period = '7d' | '30d' | '90d'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#E8F0FE' }}>ERP — Clientes</h1>
          <p className="mt-1 text-sm" style={{ color: '#5A7A9A' }}>
            Análise de clientes novos vs recorrentes
          </p>
        </div>
        <div className="flex gap-1 rounded-xl p-1" style={{ background: '#111827', border: '1px solid #1E2D45' }}>
          {periods.map(p => (
            <button
              key={p}
              onClick={() => router.push(`/erp-clientes?period=${p}`)}
              className="rounded-lg px-4 py-1.5 text-xs font-bold transition-all"
              style={period === p
                ? { background: '#00E5FF', color: '#000' }
                : { color: '#5A7A9A' }
              }
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Insight box */}
      <div
        className="flex items-start gap-3 rounded-xl border px-4 py-3"
        style={{ background: 'rgba(0,229,255,.05)', borderColor: 'rgba(0,229,255,.2)', borderLeftWidth: 3, borderLeftColor: '#00E5FF' }}
      >
        <Lightbulb className="mt-0.5 h-4 w-4 flex-shrink-0" style={{ color: '#00E5FF' }} />
        <p className="text-sm" style={{ color: '#8AA8C8' }}>{insightText}</p>
      </div>

      {/* SmartERP vs CheckSmart */}
      <div className="rounded-2xl border" style={{ background: '#111827', borderColor: '#1E2D45' }}>
        <div className="flex items-center gap-2 border-b px-6 py-4" style={{ borderColor: '#1E2D45' }}>
          <SectionHeader
            accentColor="#00E5FF"
            title="Comparativo de Sistemas"
            subtitle="SmartERP (POS) vs CheckSmart (OS) no período"
          />
        </div>
        <div className="p-6">
          <SourcesSection sources={sources} />
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <ClientCard
          label="Clientes Recorrentes"
          icon={Users}
          color="#00FF94"
          glowColor="rgba(0,255,148,.4)"
          totalCents={recorrentes.totalCents}
          ticketMedioCents={recorrentes.ticketMedioCents}
          avgProducts={recorrentes.avgProducts}
          sharePercent={recorrentes.sharePercent}
          transactions={recorrentes.transactions}
        />
        <ClientCard
          label="Clientes Novos"
          icon={UserPlus}
          color="#9B6DFF"
          glowColor="rgba(155,109,255,.4)"
          totalCents={novos.totalCents}
          ticketMedioCents={novos.ticketMedioCents}
          avgProducts={novos.avgProducts}
          sharePercent={novos.sharePercent}
          transactions={novos.transactions}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <div className="rounded-2xl border p-6" style={{ background: '#111827', borderColor: '#1E2D45' }}>
          <div className="mb-5">
            <SectionHeader
              accentColor="#00FF94"
              title="Recorrentes vs Novos"
              subtitle="Distribuição do faturamento"
            />
          </div>
          <div className="flex items-center justify-center py-2">
            <DonutChart recShare={recorrentes.sharePercent} novShare={novos.sharePercent} />
          </div>
        </div>

        <div className="rounded-2xl border p-6" style={{ background: '#111827', borderColor: '#1E2D45' }}>
          <div className="mb-5 flex items-start justify-between">
            <SectionHeader
              accentColor="#9B6DFF"
              title="Evolução Mensal"
              subtitle="Faturamento nos últimos 6 meses"
            />
            <div className="flex gap-4">
              <div className="flex items-center gap-1.5">
                <div className="h-2 w-2 rounded-full" style={{ background: '#00FF94' }} />
                <span className="text-[10px]" style={{ color: '#5A7A9A' }}>Recorrentes</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-2 w-2 rounded-full" style={{ background: '#9B6DFF' }} />
                <span className="text-[10px]" style={{ color: '#5A7A9A' }}>Novos</span>
              </div>
            </div>
          </div>
          <BarChart months={monthlyData} />
        </div>
      </div>

      {/* RFM Segments */}
      <div className="rounded-2xl border" style={{ background: '#111827', borderColor: '#1E2D45' }}>
        <div className="flex items-center gap-2 border-b px-6 py-4" style={{ borderColor: '#1E2D45' }}>
          <SectionHeader
            accentColor="#FFAA00"
            title="Segmentação RFM"
            subtitle="Classificação por Recência, Frequência e Valor — últimos 6 meses"
            icon={Star}
          />
        </div>
        <div className="p-6">
          <RfmSection rfmSegments={rfmSegments} />
        </div>
      </div>

      {/* Weekday heatmap */}
      <div className="rounded-2xl border" style={{ background: '#111827', borderColor: '#1E2D45' }}>
        <div className="flex items-center gap-2 border-b px-6 py-4" style={{ borderColor: '#1E2D45' }}>
          <SectionHeader
            accentColor="#00E5FF"
            title="Heatmap por Dia da Semana"
            subtitle="Dias com maior faturamento no período selecionado"
            icon={Calendar}
          />
        </div>
        <div className="p-6">
          <WeekdayHeatmap days={weekdayHeatmap} />
        </div>
      </div>

      {/* Churn risk */}
      <div className="rounded-2xl border" style={{ background: '#111827', borderColor: '#1E2D45' }}>
        <div className="flex items-center gap-2 border-b px-6 py-4" style={{ borderColor: '#1E2D45' }}>
          <SectionHeader
            accentColor="#FF4D6D"
            title="Clientes em Risco de Perda"
            subtitle="Sem comprar há 60+ dias — baseado nos últimos 6 meses"
            icon={AlertTriangle}
          />
          {churnRisk.length > 0 && (
            <div className="ml-auto flex items-center gap-1.5 rounded-lg px-2.5 py-1"
              style={{ background: 'rgba(255,77,109,.08)', border: '1px solid rgba(255,77,109,.2)' }}>
              <AlertTriangle className="h-3 w-3" style={{ color: '#FF4D6D' }} />
              <span className="text-[10px] font-bold" style={{ color: '#FF4D6D' }}>
                {churnRisk.length} clientes
              </span>
            </div>
          )}
        </div>
        <div className="p-6">
          <ChurnTable clients={churnRisk} />
        </div>
      </div>

      {/* Top clients */}
      <div className="rounded-2xl border" style={{ background: '#111827', borderColor: '#1E2D45' }}>
        <div className="flex items-center gap-2 border-b px-6 py-4" style={{ borderColor: '#1E2D45' }}>
          <SectionHeader
            accentColor="#00E5FF"
            title="Top Clientes"
            subtitle="Por valor total no período"
          />
          <div className="ml-auto flex items-center gap-1.5 rounded-lg px-2.5 py-1"
            style={{ background: 'rgba(0,229,255,.08)', border: '1px solid rgba(0,229,255,.2)' }}>
            <TrendingUp className="h-3 w-3" style={{ color: '#00E5FF' }} />
            <span className="text-[10px] font-bold" style={{ color: '#00E5FF' }}>
              {topClients.length} clientes
            </span>
          </div>
        </div>
        <div className="p-6">
          <ClientsTable clients={topClients} />
        </div>
      </div>
    </div>
  )
}
