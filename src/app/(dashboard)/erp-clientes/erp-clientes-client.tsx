'use client'

import { useRouter } from 'next/navigation'
import { TrendingUp, Users, UserPlus, Lightbulb } from 'lucide-react'
import type { DashboardData, TopClient, MonthPoint } from './page'

// ── Helpers ────────────────────────────────────────────────────────────────

const BRL = (c: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(c / 100)

// ── Donut Chart (CSS conic-gradient) ──────────────────────────────────────

function DonutChart({ recShare, novShare }: { recShare: number; novShare: number }) {
  const recDeg = Math.round((recShare / 100) * 360)
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative flex items-center justify-center" style={{ width: 180, height: 180 }}>
        {/* Outer ring */}
        <div style={{
          width: 180, height: 180, borderRadius: '50%',
          background: recShare === 0
            ? '#9B6DFF'
            : recShare === 100
            ? '#00FF94'
            : `conic-gradient(#00FF94 0deg ${recDeg}deg, #9B6DFF ${recDeg}deg 360deg)`,
        }} />
        {/* Center hole */}
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

      {/* Legend */}
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
      {/* Glow */}
      <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full opacity-30"
        style={{ background: `radial-gradient(circle, ${glowColor}, transparent)` }}
      />

      {/* Header */}
      <div className="mb-4 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg"
          style={{ background: `${color}20` }}>
          <Icon className="h-4 w-4" style={{ color }} />
        </div>
        <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#5A7A9A' }}>
          {label}
        </span>
      </div>

      {/* Total */}
      <div className="mb-5">
        <span className="text-3xl font-bold tracking-tight" style={{ color, fontFamily: 'ui-monospace,monospace' }}>
          {BRL(totalCents)}
        </span>
        <span className="ml-2 text-xs" style={{ color: '#5A7A9A' }}>{transactions} pedidos</span>
      </div>

      {/* Sub-metrics */}
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

// ── Top Clients Table ─────────────────────────────────────────────────────

function ClientsTable({ clients }: { clients: TopClient[] }) {
  function badge(c: TopClient) {
    if (c.transactions >= 5 || c.totalCents >= 500000) return { label: 'VIP', color: '#FFAA00', bg: 'rgba(255,170,0,.15)' }
    if (c.type === 'recorrente') return { label: 'Recorrente', color: '#00FF94', bg: 'rgba(0,255,148,.12)' }
    return { label: 'Novo', color: '#9B6DFF', bg: 'rgba(155,109,255,.15)' }
  }

  function avatar(name: string) {
    return name.trim().charAt(0).toUpperCase()
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
                      {avatar(c.name)}
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

// ── Main component ────────────────────────────────────────────────────────

export function ErpClientesClient({ data }: { data: DashboardData }) {
  const router = useRouter()
  const { period, recorrentes, novos, monthlyData, topClients, insightText } = data

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

        {/* Period filter */}
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
        {/* Donut */}
        <div className="rounded-2xl border p-6" style={{ background: '#111827', borderColor: '#1E2D45' }}>
          <div className="mb-5 flex items-center gap-2">
            <div className="h-4 w-1 rounded-full" style={{ background: '#00FF94' }} />
            <div>
              <p className="text-xs font-bold uppercase tracking-widest" style={{ color: '#8AA8C8' }}>
                Recorrentes vs Novos
              </p>
              <p className="text-[11px]" style={{ color: '#5A7A9A' }}>Distribuição do faturamento</p>
            </div>
          </div>
          <div className="flex items-center justify-center py-2">
            <DonutChart recShare={recorrentes.sharePercent} novShare={novos.sharePercent} />
          </div>
        </div>

        {/* Bar chart */}
        <div className="rounded-2xl border p-6" style={{ background: '#111827', borderColor: '#1E2D45' }}>
          <div className="mb-5 flex items-start justify-between">
            <div className="flex items-center gap-2">
              <div className="h-4 w-1 rounded-full" style={{ background: '#9B6DFF' }} />
              <div>
                <p className="text-xs font-bold uppercase tracking-widest" style={{ color: '#8AA8C8' }}>
                  Evolução Mensal
                </p>
                <p className="text-[11px]" style={{ color: '#5A7A9A' }}>Faturamento nos últimos 6 meses</p>
              </div>
            </div>
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

      {/* Top clients */}
      <div className="rounded-2xl border" style={{ background: '#111827', borderColor: '#1E2D45' }}>
        <div className="flex items-center gap-2 border-b px-6 py-4" style={{ borderColor: '#1E2D45' }}>
          <div className="h-4 w-1 rounded-full" style={{ background: '#00E5FF' }} />
          <div>
            <p className="text-xs font-bold uppercase tracking-widest" style={{ color: '#8AA8C8' }}>
              Top Clientes
            </p>
            <p className="text-[11px]" style={{ color: '#5A7A9A' }}>Por valor total no período</p>
          </div>
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
