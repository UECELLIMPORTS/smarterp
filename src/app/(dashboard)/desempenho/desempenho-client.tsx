'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Trophy, Download, ShoppingCart, Wrench, DollarSign, TrendingUp, Clock, Info,
  AlertTriangle, Headset, ExternalLink, X, RotateCcw,
} from 'lucide-react'
import type { TeamPerformanceData, TeamMemberPerformance, ServiceLine, ReturnLine } from '@/actions/desempenho'
import type { Period } from './page'

const BRL = (c: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(c / 100)

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' })

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
  { v: 'hoje',        label: 'Hoje' },
  { v: 'ontem',       label: 'Ontem' },
  { v: '7d',          label: '7 dias' },
  { v: 'mes',         label: 'Este mês' },
  { v: 'mes_passado', label: 'Mês passado' },
  { v: '30d',         label: '30 dias' },
  { v: '90d',         label: '90 dias' },
]

const NONE = '__none__'
type Focus = { id: string; name: string; as: 'tech' | 'att' } | null

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
  const [focus, setFocus]       = useState<Focus>(null)
  const { canViewAll, members, totals, services, returns, people, checksmartUrl } = data

  const nameOf = (id: string | null) => (id ? people[id] ?? 'Ex-colaborador' : null)
  const keyOf  = (id: string | null) => id ?? NONE

  const techRows = members.filter(m => m.repairsCount > 0 || m.returnsCount > 0 || m.role === 'technician' || (m.userId && m.role === 'employee'))
  const attRows  = members.filter(m => m.userId !== null || m.osOpenedCount + m.osDeliveredCount + m.salesCount > 0)
  const withoutTech = services.filter(s => !s.technicianId)

  const shown = useMemo(() => {
    if (!focus) return services
    return services.filter(s => keyOf(focus.as === 'tech' ? s.technicianId : s.attendantId) === focus.id)
  }, [services, focus])

  function go(changes: { period?: Period; from?: string; to?: string; store?: string }) {
    const p = new URLSearchParams()
    const next = { period, store, from: fromDate, to: toDate, ...changes }
    p.set('period', next.period)
    if (next.period === 'custom' && next.from && next.to) {
      p.set('from', next.from)
      p.set('to', next.to)
    }
    if (next.store && next.store !== 'all') p.set('store', next.store)
    setFocus(null)
    router.push(`/desempenho?${p.toString()}`)
  }

  function exportCsv() {
    const BOM = '﻿'
    const money = (c: number) => `"R$ ${(c / 100).toFixed(2).replace('.', ',')}"`
    const cell  = (v: string | null) => `"${(v ?? '').replace(/"/g, '""')}"`
    const out: string[] = []
    out.push('TÉCNICOS — SERVIÇOS ENTREGUES')
    out.push(['Técnico', 'Serviços', 'Faturamento', 'Lucro', 'Retornos', 'Taxa de retorno', 'Horas de serviço'].join(';'))
    for (const m of techRows) out.push([cell(m.name), m.repairsCount, money(m.repairsRevenueCents), money(m.repairsProfitCents), m.returnsCount, cell(rateLabel(m)), (m.serviceMinutes / 60).toFixed(1).replace('.', ',')].join(';'))
    out.push('')
    out.push('ATENDENTES — OS E VENDAS')
    out.push(['Atendente', 'OS abertas', 'OS entregues', 'Faturamento OS', 'Vendas PDV', 'Faturamento PDV', 'Faturamento total', 'Lucro total'].join(';'))
    for (const m of attRows) out.push([cell(m.name), m.osOpenedCount, m.osDeliveredCount, money(m.osRevenueCents), m.salesCount, money(m.salesRevenueCents), money(m.totalRevenueCents), money(m.totalProfitCents)].join(';'))
    out.push('')
    out.push('SERVIÇOS ENTREGUES (DETALHADO)')
    out.push(['OS', 'Tipo', 'Entrada', 'Entrega', 'Cliente', 'Aparelho', 'Atendente', 'Técnico', 'Valor', 'Lucro'].join(';'))
    for (const s of services) out.push([
      cell(s.orderNumber), cell(s.isReturn ? 'Retorno' : 'Serviço'), cell(fmtDate(s.receivedAt)), cell(fmtDate(s.deliveredAt)), cell(s.customer), cell(s.device),
      cell(nameOf(s.attendantId) ?? 'Sem colaborador'), cell(nameOf(s.technicianId) ?? 'Sem técnico'),
      money(s.totalCents), money(s.profitCents),
    ].join(';'))
    if (returns.length > 0) {
      out.push('')
      out.push('RETORNOS NO PERÍODO')
      out.push(['OS de retorno', 'Aberta em', 'Status', 'Cliente', 'Aparelho', 'OS original', 'Técnico original', 'Motivo'].join(';'))
      for (const r of returns) out.push([
        cell(r.orderNumber), cell(fmtDate(r.receivedAt)), cell(STATUS_LABEL[r.status] ?? r.status), cell(r.customer), cell(r.device),
        cell(r.parentNumber), cell(nameOf(r.technicianId) ?? 'Sem técnico'), cell(r.reason),
      ].join(';'))
    }
    const blob = new Blob([BOM + out.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `comissao-equipe-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function pick(m: TeamMemberPerformance, as: 'tech' | 'att') {
    const id = keyOf(m.userId)
    setFocus(f => (f && f.id === id && f.as === as ? null : { id, name: m.name, as }))
    setTimeout(() => document.getElementById('lista-servicos')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
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
            Serviços por técnico, atendimentos e vendas por colaborador — base para a comissão
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

      {/* Alerta: serviços sem técnico */}
      {canViewAll && withoutTech.length > 0 && (
        <div className="rounded-xl border p-3 text-xs" style={{ background: 'rgba(245,158,11,.08)', borderColor: 'rgba(245,158,11,.5)', color: '#FCD34D' }}>
          <p className="flex items-center gap-1.5 font-bold">
            <AlertTriangle className="h-3.5 w-3.5" />
            {withoutTech.length} serviço{withoutTech.length > 1 ? 's' : ''} entregue{withoutTech.length > 1 ? 's' : ''} sem técnico ({BRL(withoutTech.reduce((s, o) => s + o.totalCents, 0))})
          </p>
          <p className="mt-1" style={{ color: '#CBD5E1' }}>
            Defina o técnico no CheckSmart (card &quot;Datas e Prazo&quot; da OS) para entrar na comissão:
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {withoutTech.map(s => (
              <a key={s.orderId} href={`${checksmartUrl}/orders/${s.orderId}`} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-mono hover:bg-white/5"
                style={{ borderColor: 'rgba(245,158,11,.5)', color: '#FCD34D' }}>
                {s.orderNumber} <ExternalLink className="h-2.5 w-2.5" />
              </a>
            ))}
          </div>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <KPI label="Serviços entregues" value={String(totals.repairsCount)} sub={BRL(totals.repairsRevenueCents)} icon={Wrench} color="#F59E0B" />
        <KPI label="OS abertas" value={String(totals.osOpenedCount)} sub="entrada no período" icon={Headset} color="#8B5CF6" />
        <KPI label="Vendas PDV" value={String(totals.salesCount)} sub={BRL(totals.salesRevenueCents)} icon={ShoppingCart} color="#10B981" />
        <KPI label="Faturamento total" value={BRL(totals.totalRevenueCents)}
          sub={totals.totalRevenueCents > 0 ? `Lucro ${BRL(totals.totalProfitCents)} · ${Math.round((totals.totalProfitCents / totals.totalRevenueCents) * 100)}%` : '—'}
          icon={DollarSign} color="#22C55E" />
        <KPI label="Retornos" value={String(totals.returnsCount)}
          sub={totals.repairsCount > 0 ? `${pct(totals.returnsCount, totals.repairsCount)} dos serviços` : 'OS de retorno abertas'}
          icon={RotateCcw} color={totals.returnsCount > 0 ? '#F97316' : '#94A3B8'} />
        <KPI label="Horas de serviço" value={fmtHours(totals.serviceMinutes)} sub={`${totals.repairsWithTime} de ${totals.repairsCount} com tempo medido`} icon={Clock} color="#38BDF8" />
      </div>

      {/* Técnicos */}
      <Section title="Técnicos · serviços entregues" color="#F59E0B" icon={Wrench}
        hint="Clique em um técnico para ver as OS dele.">
        <table className="w-full text-xs">
          <thead style={{ background: '#1B2638' }}>
            <tr>
              <Th>Técnico</Th>
              <Th align="right">Serviços</Th>
              <Th align="right">Faturamento</Th>
              <Th align="right">Lucro</Th>
              <Th align="right">Ticket médio</Th>
              <Th align="right">Retornos</Th>
              <Th align="right">Taxa de retorno</Th>
              <Th align="right">Horas</Th>
            </tr>
          </thead>
          <tbody>
            {techRows.map(m => (
              <ClickRow key={keyOf(m.userId)} onClick={() => pick(m, 'tech')}
                active={focus?.as === 'tech' && focus.id === keyOf(m.userId)}>
                <NameCell m={m} fallback="Sem técnico" warn={!m.userId} />
                <Td align="right" mono bold>{m.repairsCount}</Td>
                <Td align="right" mono bold>{BRL(m.repairsRevenueCents)}</Td>
                <Td align="right" mono color={profitColor(m.repairsProfitCents)}>{BRL(m.repairsProfitCents)}</Td>
                <Td align="right" mono color="#CBD5E1">{BRL(m.repairsCount ? Math.round(m.repairsRevenueCents / m.repairsCount) : 0)}</Td>
                <Td align="right" mono bold={m.returnsCount > 0} color={m.returnsCount > 0 ? '#F97316' : '#94A3B8'}>{m.returnsCount}</Td>
                <Td align="right" mono color={rateColor(m)}>{rateLabel(m)}</Td>
                <Td align="right" mono>{fmtHours(m.serviceMinutes)}</Td>
              </ClickRow>
            ))}
          </tbody>
        </table>
      </Section>

      {/* Atendentes */}
      <Section title="Atendentes · OS abertas e vendas" color="#8B5CF6" icon={Headset}
        hint="Clique em um atendente para ver as OS que ele abriu.">
        <table className="w-full text-xs">
          <thead style={{ background: '#1B2638' }}>
            <tr>
              <Th>Atendente</Th>
              <Th align="right">OS abertas</Th>
              <Th align="right">OS entregues</Th>
              <Th align="right">Faturamento OS</Th>
              <Th align="right">Vendas PDV</Th>
              <Th align="right">Faturamento PDV</Th>
              <Th align="right">Faturamento total</Th>
              <Th align="right">Lucro total</Th>
            </tr>
          </thead>
          <tbody>
            {attRows.map(m => (
              <ClickRow key={keyOf(m.userId)} onClick={() => pick(m, 'att')}
                active={focus?.as === 'att' && focus.id === keyOf(m.userId)}>
                <NameCell m={m} fallback="Sem colaborador" />
                <Td align="right" mono>{m.osOpenedCount}</Td>
                <Td align="right" mono bold>{m.osDeliveredCount}</Td>
                <Td align="right" mono>{BRL(m.osRevenueCents)}</Td>
                <Td align="right" mono>{m.salesCount}</Td>
                <Td align="right" mono>{BRL(m.salesRevenueCents)}</Td>
                <Td align="right" mono bold>{BRL(m.totalRevenueCents)}</Td>
                <Td align="right" mono bold color={profitColor(m.totalProfitCents)}>{BRL(m.totalProfitCents)}</Td>
              </ClickRow>
            ))}
          </tbody>
        </table>
      </Section>

      {/* Retornos */}
      {returns.length > 0 && (
        <Section title="Retornos no período" color="#F97316" icon={RotateCcw}
          hint={`${returns.length} OS de retorno · contam para o técnico do serviço original`}>
          <table className="w-full text-xs">
            <thead style={{ background: '#1B2638' }}>
              <tr>
                <Th>OS de retorno</Th>
                <Th>Aberta em</Th>
                <Th>Status</Th>
                <Th>Cliente</Th>
                <Th>Aparelho</Th>
                <Th>OS original</Th>
                <Th>Técnico original</Th>
                <Th>Motivo</Th>
              </tr>
            </thead>
            <tbody>
              {returns.map(r => <ReturnRow key={r.orderId} r={r} nameOf={nameOf} url={checksmartUrl} />)}
            </tbody>
          </table>
        </Section>
      )}

      {/* Lista detalhada */}
      <div id="lista-servicos" className="scroll-mt-4">
        <Section
          title={focus ? `Serviços de ${focus.name} · como ${focus.as === 'tech' ? 'técnico' : 'atendente'}` : 'Serviços entregues no período'}
          color="#22C55E" icon={DollarSign}
          hint={`${shown.length} OS · ${BRL(shown.reduce((s, o) => s + o.totalCents, 0))}`}
          action={focus && (
            <button onClick={() => setFocus(null)}
              className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] hover:bg-white/5"
              style={{ borderColor: '#2A3650', color: '#CBD5E1' }}>
              <X className="h-3 w-3" /> Ver todos
            </button>
          )}>
          {shown.length === 0 ? (
            <p className="py-10 text-center text-sm" style={{ color: '#94A3B8' }}>Nenhum serviço entregue.</p>
          ) : (
            <table className="w-full text-xs">
              <thead style={{ background: '#1B2638' }}>
                <tr>
                  <Th>OS</Th>
                  <Th>Entrega</Th>
                  <Th>Cliente</Th>
                  <Th>Aparelho</Th>
                  <Th>Atendente</Th>
                  <Th>Técnico</Th>
                  <Th align="right">Valor</Th>
                  <Th align="right">Lucro</Th>
                  <Th align="right">Horas</Th>
                </tr>
              </thead>
              <tbody>
                {shown.map(s => <ServiceRow key={s.orderId} s={s} nameOf={nameOf} url={checksmartUrl} />)}
              </tbody>
            </table>
          )}
        </Section>
      </div>

      {/* Regras */}
      <div className="rounded-xl border p-4 text-[11px] space-y-1.5"
        style={{ background: '#131C2A', borderColor: '#2A3650', color: '#94A3B8' }}>
        <p className="flex items-center gap-1.5 font-bold" style={{ color: '#CBD5E1' }}>
          <Info className="h-3.5 w-3.5" /> Como os números são calculados
        </p>
        <p><b style={{ color: '#CBD5E1' }}>Serviços (técnico):</b> OS <b>entregues</b> no período, creditadas ao técnico responsável da OS. Use &quot;Mês passado&quot; para fechar a comissão do dia 10.</p>
        <p><b style={{ color: '#CBD5E1' }}>Atendimento:</b> crédito de quem abriu a OS. &quot;OS abertas&quot; conta a entrada no período; faturamento e lucro contam as OS que ele abriu e foram entregues no período.</p>
        <p><b style={{ color: '#CBD5E1' }}>Vendas PDV:</b> crédito de quem registrou a venda. Canceladas não contam.</p>
        <p><b style={{ color: '#CBD5E1' }}>Retornos:</b> OS de retorno abertas no período contam para o técnico que fez o serviço original. Taxa de retorno = retornos ÷ serviços entregues no período. A OS de retorno não conta como serviço nem atendimento novo.</p>
        <p><b style={{ color: '#CBD5E1' }}>Lucro:</b> valor da OS menos o custo das peças.</p>
        <p><b style={{ color: '#CBD5E1' }}>Horas de serviço:</b> tempo em &quot;Em diagnóstico&quot; ou &quot;Em reparo&quot;. Medido a partir de 16/11/2026; OS anteriores ficam sem horas.</p>
        {!canViewAll && (
          <p style={{ color: '#F59E0B' }}>Você está vendo só os seus números. Para ver toda a equipe, peça ao dono a permissão &quot;Ver relatório da equipe&quot;.</p>
        )}
      </div>
    </div>
  )
}

const STATUS_LABEL: Record<string, string> = {
  received: 'Recebida', diagnosing: 'Diagnóstico', waiting_parts: 'Ag. peça',
  in_repair: 'Em reparo', ready: 'Pronta', delivered: 'Entregue', cancelled: 'Cancelada',
}

const pct = (n: number, d: number) => `${Math.round((n / d) * 100)}%`
const rateLabel = (m: TeamMemberPerformance) =>
  m.repairsCount > 0 ? pct(m.returnsCount, m.repairsCount) : m.returnsCount > 0 ? '—' : '0%'
const rateColor = (m: TeamMemberPerformance) => {
  if (m.returnsCount === 0) return '#10B981'
  const r = m.repairsCount > 0 ? m.returnsCount / m.repairsCount : 1
  return r > 0.1 ? '#EF4444' : '#F97316'
}

function ReturnBadge() {
  return (
    <span className="ml-1.5 inline-flex items-center gap-0.5 rounded border px-1 py-px text-[9px] font-bold uppercase tracking-wider align-middle"
      style={{ borderColor: 'rgba(249,115,22,.6)', background: 'rgba(249,115,22,.15)', color: '#FB923C' }}>
      <RotateCcw className="h-2.5 w-2.5" /> Retorno
    </span>
  )
}

function ReturnRow({ r, nameOf, url }: { r: ReturnLine; nameOf: (id: string | null) => string | null; url: string }) {
  const tech = nameOf(r.technicianId)
  return (
    <tr className="border-t" style={{ borderColor: '#2A3650', background: 'rgba(249,115,22,.04)' }}>
      <Td mono>
        <a href={`${url}/orders/${r.orderId}`} target="_blank" rel="noreferrer"
          className="inline-flex items-center gap-1 hover:underline" style={{ color: '#FB923C' }}>
          {r.orderNumber} <ExternalLink className="h-2.5 w-2.5" />
        </a>
        <ReturnBadge />
      </Td>
      <Td mono color="#CBD5E1">{fmtDate(r.receivedAt)}</Td>
      <Td color="#CBD5E1">{STATUS_LABEL[r.status] ?? r.status}</Td>
      <Td>{r.customer ?? '—'}</Td>
      <Td color="#CBD5E1">{r.device}</Td>
      <Td mono>
        {r.parentId ? (
          <a href={`${url}/orders/${r.parentId}`} target="_blank" rel="noreferrer" className="hover:underline" style={{ color: '#38BDF8' }}>
            {r.parentNumber}
          </a>
        ) : '—'}
      </Td>
      <Td color={tech ? '#F8FAFC' : '#F59E0B'} bold>{tech ?? 'Sem técnico'}</Td>
      <Td color="#CBD5E1">
        <span className="block max-w-[260px] truncate" title={r.reason ?? ''}>{r.reason ?? '—'}</span>
      </Td>
    </tr>
  )
}

const profitColor = (c: number) => c > 0 ? '#10B981' : c < 0 ? '#EF4444' : '#94A3B8'

function ServiceRow({ s, nameOf, url }: { s: ServiceLine; nameOf: (id: string | null) => string | null; url: string }) {
  const tech = nameOf(s.technicianId)
  return (
    <tr className="border-t" style={{ borderColor: '#2A3650' }}>
      <Td mono>
        <a href={`${url}/orders/${s.orderId}`} target="_blank" rel="noreferrer"
          className="inline-flex items-center gap-1 hover:underline" style={{ color: '#38BDF8' }}>
          {s.orderNumber} <ExternalLink className="h-2.5 w-2.5" />
        </a>
        {s.isReturn && <ReturnBadge />}
      </Td>
      <Td mono color="#CBD5E1">{fmtDate(s.deliveredAt)}</Td>
      <Td>{s.customer ?? '—'}</Td>
      <Td color="#CBD5E1">{s.device}</Td>
      <Td color="#CBD5E1">{nameOf(s.attendantId) ?? 'Sem colaborador'}</Td>
      <Td color={tech ? '#F8FAFC' : '#F59E0B'} bold={!tech}>{tech ?? 'Sem técnico'}</Td>
      <Td align="right" mono bold>{BRL(s.totalCents)}</Td>
      <Td align="right" mono color={profitColor(s.profitCents)}>{BRL(s.profitCents)}</Td>
      <Td align="right" mono color="#CBD5E1">{fmtHours(s.minutes)}</Td>
    </tr>
  )
}

function NameCell({ m, fallback, warn }: { m: TeamMemberPerformance; fallback: string; warn?: boolean }) {
  return (
    <Td bold color={warn ? '#F59E0B' : undefined}>
      <div className="flex flex-col">
        <span>{m.userId ? m.name : fallback}</span>
        {m.role && (
          <span className="text-[10px] font-normal" style={{ color: '#94A3B8' }}>{ROLE_LABEL[m.role] ?? m.role}</span>
        )}
      </div>
    </Td>
  )
}

function ClickRow({ children, onClick, active }: { children: React.ReactNode; onClick: () => void; active: boolean }) {
  return (
    <tr onClick={onClick}
      className="border-t cursor-pointer transition-colors hover:bg-white/[0.04]"
      style={{ borderColor: '#2A3650', background: active ? 'rgba(34,197,94,.08)' : undefined }}>
      {children}
    </tr>
  )
}

function Section({ title, color, icon: Icon, hint, action, children }: {
  title: string; color: string; icon: React.ElementType; hint?: string
  action?: React.ReactNode; children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border overflow-hidden" style={{ background: '#131C2A', borderColor: '#2A3650' }}>
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 border-b" style={{ borderColor: '#2A3650' }}>
        <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider" style={{ color }}>
          <Icon className="h-3.5 w-3.5" /> {title}
        </p>
        <div className="flex items-center gap-2">
          {hint && <span className="text-[11px]" style={{ color: '#94A3B8' }}>{hint}</span>}
          {action}
        </div>
      </div>
      <div className="overflow-x-auto">{children}</div>
    </div>
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

function Th({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <th className={`px-3 py-2 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap ${align === 'right' ? 'text-right' : 'text-left'}`}
      style={{ color: '#94A3B8' }}>
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
