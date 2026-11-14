'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Trophy, Download, ShoppingCart, Wrench, DollarSign, TrendingUp, Clock, Info,
} from 'lucide-react'
import type { TeamPerformanceData, TeamMemberPerformance } from '@/actions/desempenho'
import type { Period } from './page'

const BRL = (c: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(c / 100)

function fmtHours(minutes: number): string {
  if (minutes <= 0) return '—'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}min`
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`
}

const ROLE_LABEL: Record<string, string> = {
  owner:      'Dono',
  manager:    'Gerente',
  employee:   'Funcionário',
  technician: 'Técnico',
  viewer:     'Visualizador',
}

const PERIODS: { v: Period; label: string }[] = [
  { v: 'hoje', label: 'Hoje' },
  { v: '7d',   label: '7 dias' },
  { v: 'mes',  label: 'Este mês' },
  { v: '30d',  label: '30 dias' },
  { v: '90d',  label: '90 dias' },
]

type Props = {
  data:   TeamPerformanceData
  period: Period
  from:   string | null
  to:     string | null
  store:  string
  stores: { id: string; name: string }[]
}

export function DesempenhoClient({ data, period, from, to, store, stores }: Props) {
  const router = useRouter()
  const [customOpen, setCustomOpen] = useState(period === 'custom')
  const [fromDate, setFromDate] = useState(from ?? '')
  const [toDate, setToDate]     = useState(to ?? '')
  const { canViewAll, members, totals } = data

  function go(changes: { period?: Period; from?: string; to?: string; store?: string }) {
    const p = new URLSearchParams()
    const next = { period, store, from: fromDate, to: toDate, ...changes }
    p.set('period', next.period)
    if (next.period === 'custom' && next.from && next.to) {
      p.set('from', next.from)
      p.set('to', next.to)
    }
    if (next.store && next.store !== 'all') p.set('store', next.store)
    router.push(`/desempenho?${p.toString()}`)
  }

  function exportCsv() {
    const BOM = '﻿'
    const money = (c: number) => `"R$ ${(c / 100).toFixed(2).replace('.', ',')}"`
    const cell  = (v: string) => `"${v.replace(/"/g, '""')}"`
    const header = [
      'Colaborador', 'Função',
      'Vendas PDV', 'Faturamento PDV', 'Lucro PDV',
      'OS abertas', 'OS entregues', 'Faturamento OS', 'Lucro OS',
      'Consertos finalizados', 'Horas de serviço',
      'Total vendas+OS', 'Faturamento total', 'Lucro total',
    ].join(';')
    const lines = members.map(m => [
      cell(m.name), cell(ROLE_LABEL[m.role ?? ''] ?? '—'),
      m.salesCount, money(m.salesRevenueCents), money(m.salesProfitCents),
      m.osOpenedCount, m.osDeliveredCount, money(m.osRevenueCents), money(m.osProfitCents),
      m.repairsCount, (m.serviceMinutes / 60).toFixed(1).replace('.', ','),
      m.totalCount, money(m.totalRevenueCents), money(m.totalProfitCents),
    ].join(';'))
    const blob = new Blob([BOM + header + '\n' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `desempenho-equipe-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2" style={{ color: '#F8FAFC' }}>
            <Trophy className="h-5 w-5" style={{ color: '#F59E0B' }} />
            {canViewAll ? 'Desempenho da equipe' : 'Meu desempenho'}
          </h1>
          <p className="text-xs mt-1" style={{ color: '#94A3B8' }}>
            Vendas do Gestão Smart + ordens de serviço do CheckSmart, por colaborador
          </p>
        </div>
        {canViewAll && members.length > 0 && (
          <button onClick={exportCsv}
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors hover:bg-white/5"
            style={{ borderColor: '#2A3650', color: '#22C55E' }}>
            <Download className="h-3 w-3" />
            Exportar CSV
          </button>
        )}
      </div>

      {/* Filtros */}
      <div className="rounded-xl border p-3 flex flex-wrap items-center gap-2"
        style={{ background: '#131C2A', borderColor: '#2A3650' }}>
        {PERIODS.map(p => (
          <Chip key={p.v} active={period === p.v} onClick={() => { setCustomOpen(false); go({ period: p.v }) }}>
            {p.label}
          </Chip>
        ))}
        <Chip active={period === 'custom'} onClick={() => setCustomOpen(o => !o)}>Personalizado</Chip>
        {customOpen && (
          <div className="flex flex-wrap items-center gap-2">
            <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
              className="rounded-lg border px-2 py-1 text-xs"
              style={{ background: '#1B2638', borderColor: '#2A3650', color: '#F8FAFC' }} />
            <span className="text-xs" style={{ color: '#94A3B8' }}>até</span>
            <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
              className="rounded-lg border px-2 py-1 text-xs"
              style={{ background: '#1B2638', borderColor: '#2A3650', color: '#F8FAFC' }} />
            <button disabled={!fromDate || !toDate}
              onClick={() => go({ period: 'custom', from: fromDate, to: toDate })}
              className="rounded-lg px-3 py-1 text-xs font-bold disabled:opacity-40"
              style={{ background: '#22C55E', color: '#0B1220' }}>
              Aplicar
            </button>
          </div>
        )}
        {stores.length > 1 && (
          <select value={store} onChange={e => go({ store: e.target.value })}
            className="ml-auto rounded-lg border px-2 py-1 text-xs"
            style={{ background: '#1B2638', borderColor: '#2A3650', color: '#F8FAFC' }}>
            <option value="all">Vendas de todas as lojas</option>
            {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <KPI label="Vendas PDV" value={String(totals.salesCount)} sub={BRL(totals.salesRevenueCents)} icon={ShoppingCart} color="#10B981" />
        <KPI label="OS abertas" value={String(totals.osOpenedCount)} sub={`${totals.osDeliveredCount} entregues · ${BRL(totals.osRevenueCents)}`} icon={Wrench} color="#8B5CF6" />
        <KPI label="Faturamento total" value={BRL(totals.totalRevenueCents)} sub={`${totals.totalCount} vendas + OS entregues`} icon={DollarSign} color="#F8FAFC" />
        <KPI label="Lucro total" value={BRL(totals.totalProfitCents)}
          sub={totals.totalRevenueCents > 0 ? `Margem ${Math.round((totals.totalProfitCents / totals.totalRevenueCents) * 100)}%` : '—'}
          icon={TrendingUp} color="#22C55E" />
        <KPI label="Horas de serviço" value={fmtHours(totals.serviceMinutes)} sub={`${totals.repairsCount} consertos finalizados`} icon={Clock} color="#F59E0B" />
      </div>

      {/* Tabela */}
      <div className="rounded-xl border overflow-hidden" style={{ background: '#131C2A', borderColor: '#2A3650' }}>
        {members.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm" style={{ color: '#94A3B8' }}>Nenhum movimento no período.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead style={{ background: '#1B2638' }}>
                <tr>
                  <Th rowSpan={2}>Colaborador</Th>
                  <Th colSpan={3} group color="#10B981">Vendas PDV</Th>
                  <Th colSpan={4} group color="#8B5CF6">OS · atendimento (abriu)</Th>
                  <Th colSpan={2} group color="#F59E0B">OS · execução (finalizou)</Th>
                  <Th colSpan={3} group color="#F8FAFC">Total</Th>
                </tr>
                <tr>
                  <Th align="right">Qtd</Th>
                  <Th align="right">Faturamento</Th>
                  <Th align="right">Lucro</Th>
                  <Th align="right">Abertas</Th>
                  <Th align="right">Entregues</Th>
                  <Th align="right">Faturamento</Th>
                  <Th align="right">Lucro</Th>
                  <Th align="right">Consertos</Th>
                  <Th align="right">Horas</Th>
                  <Th align="right">Ticket médio</Th>
                  <Th align="right">Faturamento</Th>
                  <Th align="right">Lucro</Th>
                </tr>
              </thead>
              <tbody>
                {members.map(m => <MemberRow key={m.userId ?? 'none'} m={m} />)}
              </tbody>
              {canViewAll && members.length > 1 && (
                <tfoot style={{ background: '#1B2638' }}>
                  <MemberRow m={{ ...totals, userId: 'total', name: 'Total', email: null, role: null }} bold />
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>

      {/* Regras */}
      <div className="rounded-xl border p-4 text-[11px] space-y-1.5"
        style={{ background: '#131C2A', borderColor: '#2A3650', color: '#94A3B8' }}>
        <p className="flex items-center gap-1.5 font-bold" style={{ color: '#CBD5E1' }}>
          <Info className="h-3.5 w-3.5" /> Como os números são calculados
        </p>
        <p><b style={{ color: '#CBD5E1' }}>Vendas PDV:</b> crédito de quem registrou a venda. Canceladas não contam.</p>
        <p><b style={{ color: '#CBD5E1' }}>OS · atendimento:</b> crédito de quem abriu a OS. Faturamento e lucro contam as OS já entregues (pela data de entrada), igual aos Relatórios.</p>
        <p><b style={{ color: '#CBD5E1' }}>OS · execução:</b> crédito do técnico responsável da OS ou, se não houver, de quem mudou a OS para &quot;Pronto&quot; no período.</p>
        <p><b style={{ color: '#CBD5E1' }}>Horas de serviço:</b> tempo em que a OS ficou &quot;Em diagnóstico&quot; ou &quot;Em reparo&quot; até ficar pronta. Fila e &quot;Aguardando peças&quot; não contam. OS que pularam direto para &quot;Pronto&quot; ficam sem horas.</p>
        {!canViewAll && (
          <p style={{ color: '#F59E0B' }}>Você está vendo só os seus números. Para ver toda a equipe, peça ao dono a permissão &quot;Ver relatório da equipe&quot;.</p>
        )}
      </div>
    </div>
  )
}

function MemberRow({ m, bold }: { m: TeamMemberPerformance; bold?: boolean }) {
  const ticket = m.totalCount > 0 ? Math.round(m.totalRevenueCents / m.totalCount) : 0
  const profitColor = (c: number) => c > 0 ? '#10B981' : c < 0 ? '#EF4444' : '#94A3B8'
  return (
    <tr className="border-t hover:bg-white/[0.02] transition-colors" style={{ borderColor: '#2A3650' }}>
      <Td bold>
        <div className="flex flex-col">
          <span>{m.name}</span>
          {!bold && m.role && (
            <span className="text-[10px] font-normal" style={{ color: '#94A3B8' }}>{ROLE_LABEL[m.role] ?? m.role}</span>
          )}
        </div>
      </Td>
      <Td align="right" mono bold={bold}>{m.salesCount}</Td>
      <Td align="right" mono bold={bold}>{BRL(m.salesRevenueCents)}</Td>
      <Td align="right" mono bold={bold} color={profitColor(m.salesProfitCents)}>{BRL(m.salesProfitCents)}</Td>
      <Td align="right" mono bold={bold}>{m.osOpenedCount}</Td>
      <Td align="right" mono bold={bold}>{m.osDeliveredCount}</Td>
      <Td align="right" mono bold={bold}>{BRL(m.osRevenueCents)}</Td>
      <Td align="right" mono bold={bold} color={profitColor(m.osProfitCents)}>{BRL(m.osProfitCents)}</Td>
      <Td align="right" mono bold={bold}>{m.repairsCount}</Td>
      <Td align="right" mono bold={bold}>{fmtHours(m.serviceMinutes)}</Td>
      <Td align="right" mono bold={bold} color="#CBD5E1">{BRL(ticket)}</Td>
      <Td align="right" mono bold>{BRL(m.totalRevenueCents)}</Td>
      <Td align="right" mono bold color={profitColor(m.totalProfitCents)}>{BRL(m.totalProfitCents)}</Td>
    </tr>
  )
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className="rounded-lg border px-3 py-1 text-xs font-bold transition-colors"
      style={{
        background:  active ? 'rgba(34,197,94,.12)' : 'transparent',
        borderColor: active ? '#22C55E' : '#2A3650',
        color:       active ? '#22C55E' : '#CBD5E1',
      }}>
      {children}
    </button>
  )
}

function KPI({ label, value, sub, icon: Icon, color }: {
  label: string; value: string; sub: string; icon: React.ElementType; color: string
}) {
  return (
    <div className="rounded-xl border p-3" style={{ background: '#131C2A', borderColor: '#2A3650' }}>
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="h-3.5 w-3.5" style={{ color }} />
        <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#94A3B8' }}>{label}</p>
      </div>
      <p className="text-lg font-bold font-mono" style={{ color }}>{value}</p>
      <p className="text-[10px] mt-0.5 truncate" style={{ color: '#94A3B8' }}>{sub}</p>
    </div>
  )
}

function Th({ children, align = 'left', colSpan, rowSpan, group, color }: {
  children: React.ReactNode; align?: 'left' | 'right'
  colSpan?: number; rowSpan?: number; group?: boolean; color?: string
}) {
  return (
    <th colSpan={colSpan} rowSpan={rowSpan}
      className={`px-3 py-2 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap ${group ? 'text-center border-b' : align === 'right' ? 'text-right' : 'text-left'}`}
      style={{ color: color ?? '#94A3B8', borderColor: '#2A3650' }}>
      {children}
    </th>
  )
}

function Td({ children, align = 'left', mono, bold, color }: {
  children: React.ReactNode; align?: 'left' | 'right'; mono?: boolean; bold?: boolean; color?: string
}) {
  return (
    <td className={`px-3 py-2 whitespace-nowrap ${align === 'right' ? 'text-right' : 'text-left'} ${mono ? 'font-mono' : ''} ${bold ? 'font-bold' : ''}`}
      style={{ color: color ?? '#F8FAFC' }}>
      {children}
    </td>
  )
}
