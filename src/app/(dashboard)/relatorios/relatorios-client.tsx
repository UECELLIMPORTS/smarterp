'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  BarChart2, Download, Megaphone, TrendingUp, Users, Phone, MessageCircle,
} from 'lucide-react'
import type { RelatoriosData, OriginReportRow, TopClientRow } from './page'
import { CUSTOMER_ORIGIN_OPTIONS, originLabel } from '@/lib/customer-origin'

const BRL = (c: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(c / 100)

const ORIGIN_COLORS: Record<string, string> = {
  instagram_pago:     '#E4405F',
  instagram_organico: '#C13584',
  indicacao:          '#00FF94',
  passou_na_porta:    '#FFAA00',
  google:             '#4285F4',
  facebook:           '#1877F2',
  outros:             '#9B6DFF',
}

function stripDigits(s: string | null): string {
  return (s ?? '').replace(/\D/g, '')
}
function fmtPhone(s: string | null): string {
  const d = stripDigits(s)
  if (!d) return ''
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return s ?? ''
}

export function RelatoriosClient({ data }: { data: RelatoriosData }) {
  const router = useRouter()
  const { period, source, origin, resumo, origins, topClients, from, to } = data

  const [customOpen, setCustomOpen] = useState(period === 'custom')
  const [fromDate, setFromDate]     = useState(from ?? '')
  const [toDate, setToDate]         = useState(to ?? '')

  function updateQuery(changes: Record<string, string | undefined>) {
    const p = new URLSearchParams()
    const merged = { period, source, origin, ...changes }
    if (merged.period)   p.set('period', merged.period)
    if (merged.source)   p.set('source', merged.source)
    if (merged.origin)   p.set('origin', merged.origin)
    if (merged.period === 'custom' && fromDate && toDate) {
      p.set('from', fromDate)
      p.set('to', toDate)
    }
    router.push(`/relatorios?${p.toString()}`)
  }

  function applyCustom() {
    if (!fromDate || !toDate) return
    const p = new URLSearchParams()
    p.set('period', 'custom')
    p.set('from', fromDate)
    p.set('to', toDate)
    p.set('source', source)
    p.set('origin', origin)
    router.push(`/relatorios?${p.toString()}`)
  }

  const PERIODS: { v: 'total' | 'smarterp' | 'checksmart'; label: string; color: string }[] = [
    { v: 'total',      label: 'Ambos',      color: '#00E5FF' },
    { v: 'smarterp',   label: 'SmartERP',   color: '#00FF94' },
    { v: 'checksmart', label: 'CheckSmart', color: '#9B6DFF' },
  ]

  const periodOptions: { v: RelatoriosData['period']; label: string }[] = [
    { v: '7d',  label: '7d' },
    { v: '30d', label: '30d' },
    { v: '90d', label: '90d' },
    { v: '6m',  label: '6m' },
  ]

  function exportOriginsCsv() {
    const BOM = '﻿'
    const header = 'Origem;Qtd Clientes;Transações;Ticket Médio;Total Faturado;Total Lucro;Margem %\n'
    const lines = origins.map(o => {
      const ticket = (o.ticketMedioCents / 100).toFixed(2).replace('.', ',')
      const total  = (o.totalCents  / 100).toFixed(2).replace('.', ',')
      const profit = (o.profitCents / 100).toFixed(2).replace('.', ',')
      const cell = (v: string) => `"${v.replace(/"/g, '""')}"`
      return [
        cell(o.label),
        o.uniqueCustomers,
        o.transactions,
        `"R$ ${ticket}"`,
        `"R$ ${total}"`,
        `"R$ ${profit}"`,
        `${o.marginPercent}%`,
      ].join(';')
    }).join('\n')

    const blob = new Blob([BOM + header + lines], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `relatorio-origens-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#E8F0FE' }}>Relatórios</h1>
          <p className="mt-1 text-sm" style={{ color: '#5A7A9A' }}>
            Análise consolidada por origem, com filtros de período e sistema
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex gap-1 rounded-xl p-1" style={{ background: '#111827', border: '1px solid #1E2D45' }}>
            {periodOptions.map(p => (
              <button
                key={p.v}
                onClick={() => { setCustomOpen(false); updateQuery({ period: p.v }) }}
                className="rounded-lg px-4 py-1.5 text-xs font-bold transition-all"
                style={period === p.v
                  ? { background: '#00E5FF', color: '#000' }
                  : { color: '#5A7A9A' }
                }
              >
                {p.label}
              </button>
            ))}
            <button
              onClick={() => setCustomOpen(v => !v)}
              className="rounded-lg px-4 py-1.5 text-xs font-bold transition-all"
              style={period === 'custom' || customOpen
                ? { background: '#00E5FF', color: '#000' }
                : { color: '#5A7A9A' }
              }
            >
              Datas
            </button>
          </div>
          {customOpen && (
            <div className="flex items-center gap-2 rounded-xl p-2" style={{ background: '#111827', border: '1px solid #1E2D45' }}>
              <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
                className="rounded-lg border px-2 py-1 text-xs text-text outline-none"
                style={{ background: '#0D1320', borderColor: '#1E2D45' }} />
              <span className="text-xs" style={{ color: '#5A7A9A' }}>até</span>
              <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
                className="rounded-lg border px-2 py-1 text-xs text-text outline-none"
                style={{ background: '#0D1320', borderColor: '#1E2D45' }} />
              <button onClick={applyCustom} disabled={!fromDate || !toDate}
                className="rounded-lg px-3 py-1 text-xs font-bold transition-opacity disabled:opacity-50"
                style={{ background: '#00FF94', color: '#000' }}>
                Aplicar
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Filtros secundários */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Sistema */}
        <div className="flex gap-1 rounded-lg p-1" style={{ background: '#0D1320', border: '1px solid #1E2D45' }}>
          {PERIODS.map(p => (
            <button
              key={p.v}
              onClick={() => updateQuery({ source: p.v })}
              className="rounded px-3 py-1 text-[11px] font-bold transition-all"
              style={source === p.v ? { background: p.color, color: '#000' } : { color: '#5A7A9A' }}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Filtro de Origem */}
        <select
          value={origin}
          onChange={e => updateQuery({ origin: e.target.value })}
          className="rounded-lg border px-3 py-1.5 text-xs outline-none"
          style={{ background: '#0D1320', borderColor: '#1E2D45', color: '#E8F0FE' }}
        >
          <option value="all">Todas as origens</option>
          {CUSTOMER_ORIGIN_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
          <option value="__no_origin__">Sem origem informada</option>
        </select>
      </div>

      {/* Cards de resumo */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <SummaryCard label="Faturamento" value={BRL(resumo.totalCents)} color="#00E5FF" icon={TrendingUp} />
        <SummaryCard label="Lucro" value={BRL(resumo.profitCents)} sub={`margem ${resumo.marginPercent}%`} color="#00FF94" icon={BarChart2} />
        <SummaryCard label="Transações" value={String(resumo.transactions)} color="#E8F0FE" icon={BarChart2} />
        <SummaryCard label="Clientes únicos" value={String(resumo.uniqueCustomers)} color="#9B6DFF" icon={Users} />
      </div>

      {/* Relatório por Origem */}
      <div className="rounded-2xl border" style={{ background: '#111827', borderColor: '#1E2D45' }}>
        <div className="flex items-center justify-between border-b px-6 py-4" style={{ borderColor: '#1E2D45' }}>
          <div className="flex items-center gap-2">
            <div className="h-4 w-1 rounded-full" style={{ background: '#E4405F' }} />
            <div>
              <p className="text-xs font-bold uppercase tracking-widest" style={{ color: '#8AA8C8' }}>Relatório por Origem</p>
              <p className="text-[11px]" style={{ color: '#5A7A9A' }}>Métricas completas por canal de aquisição</p>
            </div>
          </div>
          <button
            onClick={exportOriginsCsv}
            disabled={origins.length === 0}
            className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition-all hover:bg-white/5 disabled:opacity-50"
            style={{ borderColor: '#1E2D45', color: '#00FF94' }}
          >
            <Download className="h-3.5 w-3.5" />
            Exportar CSV
          </button>
        </div>
        <div className="p-6 overflow-x-auto">
          {origins.length === 0 ? (
            <p className="py-10 text-center text-sm" style={{ color: '#5A7A9A' }}>
              Sem dados no período e filtros selecionados
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left" style={{ borderColor: '#1E2D45' }}>
                  {['Origem', 'Clientes', 'Transações', 'Ticket Médio', 'Faturamento', 'Lucro', 'Margem'].map(h => (
                    <th key={h} className="pb-3 pr-4 text-[10px] font-bold uppercase tracking-wider" style={{ color: '#5A7A9A' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {origins.map((row, i) => <OriginRow key={i} row={row} />)}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Top 10 Clientes */}
      <div className="rounded-2xl border" style={{ background: '#111827', borderColor: '#1E2D45' }}>
        <div className="flex items-center gap-2 border-b px-6 py-4" style={{ borderColor: '#1E2D45' }}>
          <div className="h-4 w-1 rounded-full" style={{ background: '#00E5FF' }} />
          <div>
            <p className="text-xs font-bold uppercase tracking-widest" style={{ color: '#8AA8C8' }}>Top 10 Clientes</p>
            <p className="text-[11px]" style={{ color: '#5A7A9A' }}>
              No período, aplicando todos os filtros
              {origin !== 'all' && <> · <span style={{ color: '#00E5FF' }}>origem: {origin === '__no_origin__' ? 'Não informado' : originLabel(origin)}</span></>}
            </p>
          </div>
        </div>
        <div className="p-6 overflow-x-auto">
          {topClients.length === 0 ? (
            <p className="py-10 text-center text-sm" style={{ color: '#5A7A9A' }}>
              Nenhum cliente no período
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left" style={{ borderColor: '#1E2D45' }}>
                  {['Cliente', 'Contato', 'Origem', 'Transações', 'Faturamento', 'Lucro'].map(h => (
                    <th key={h} className="pb-3 pr-4 text-[10px] font-bold uppercase tracking-wider" style={{ color: '#5A7A9A' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {topClients.map(c => <ClientRow key={c.id} c={c} />)}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Summary card ──────────────────────────────────────────────────────────

function SummaryCard({
  label, value, sub, color, icon: Icon,
}: {
  label: string
  value: string
  sub?: string
  color: string
  icon: React.ElementType
}) {
  return (
    <div className="rounded-2xl border p-5 relative overflow-hidden" style={{ background: '#111827', borderColor: '#1E2D45' }}>
      <div className="absolute -right-4 -top-4 h-20 w-20 rounded-full opacity-20"
        style={{ background: `radial-gradient(circle, ${color}, transparent)` }} />
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#5A7A9A' }}>{label}</span>
        <Icon className="h-4 w-4" style={{ color }} />
      </div>
      <div className="text-2xl font-bold tracking-tight" style={{ color, fontFamily: 'ui-monospace,monospace' }}>{value}</div>
      {sub && <div className="mt-0.5 text-[11px]" style={{ color: '#5A7A9A' }}>{sub}</div>}
    </div>
  )
}

// ── Origin row ────────────────────────────────────────────────────────────

function OriginRow({ row }: { row: OriginReportRow }) {
  const color = row.value ? (ORIGIN_COLORS[row.value] ?? '#9B6DFF') : '#5A7A9A'
  return (
    <tr className="border-b transition-colors hover:bg-white/[0.02]" style={{ borderColor: 'rgba(30,45,69,.5)' }}>
      <td className="py-3 pr-4">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
          <span className="font-medium text-sm" style={{ color: '#E8F0FE' }}>{row.label}</span>
        </div>
      </td>
      <td className="py-3 pr-4 font-mono" style={{ color: '#E8F0FE' }}>{row.uniqueCustomers}</td>
      <td className="py-3 pr-4 font-mono" style={{ color: '#E8F0FE' }}>{row.transactions}</td>
      <td className="py-3 pr-4 font-mono" style={{ color: '#8AA8C8' }}>{BRL(row.ticketMedioCents)}</td>
      <td className="py-3 pr-4 font-mono font-semibold" style={{ color }}>{BRL(row.totalCents)}</td>
      <td className="py-3 pr-4 font-mono font-semibold" style={{ color: '#00FF94' }}>{BRL(row.profitCents)}</td>
      <td className="py-3 pr-4 font-mono" style={{ color: row.marginPercent >= 20 ? '#00FF94' : row.marginPercent >= 10 ? '#FFAA00' : '#FF4D6D' }}>
        {row.marginPercent}%
      </td>
    </tr>
  )
}

// ── Client row ────────────────────────────────────────────────────────────

function ClientRow({ c }: { c: TopClientRow }) {
  const waNum    = stripDigits(c.whatsapp)
  const phoneNum = stripDigits(c.whatsapp || c.phone)
  const phoneDisplay = fmtPhone(c.whatsapp || c.phone)
  const wa = waNum
    ? `https://wa.me/${waNum.startsWith('55') ? '' : '55'}${waNum}?text=${encodeURIComponent(`Olá ${c.name.split(' ')[0]}! Tudo bem?`)}`
    : ''
  const ori = c.origin ? originLabel(c.origin) : null
  const oriColor = c.origin ? (ORIGIN_COLORS[c.origin] ?? '#9B6DFF') : '#5A7A9A'

  return (
    <tr className="border-b transition-colors hover:bg-white/[0.02]" style={{ borderColor: 'rgba(30,45,69,.5)' }}>
      <td className="py-3 pr-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold"
            style={{ background: 'rgba(0,229,255,.12)', color: '#00E5FF' }}>
            {c.name.trim().charAt(0).toUpperCase()}
          </div>
          <span className="font-medium text-sm" style={{ color: '#E8F0FE' }}>{c.name}</span>
        </div>
      </td>
      <td className="py-3 pr-4">
        {phoneDisplay ? (
          <div className="flex items-center gap-1.5">
            {wa && (
              <a href={wa} target="_blank" rel="noopener noreferrer"
                className="flex h-7 w-7 items-center justify-center rounded-lg transition-all hover:opacity-80"
                style={{ background: 'rgba(37,211,102,.15)', color: '#25D366' }}
                title={`WhatsApp ${phoneDisplay}`}>
                <MessageCircle className="h-3.5 w-3.5" />
              </a>
            )}
            <a href={`tel:${phoneNum}`}
              className="flex h-7 w-7 items-center justify-center rounded-lg transition-all hover:opacity-80"
              style={{ background: 'rgba(0,229,255,.12)', color: '#00E5FF' }}
              title={`Ligar ${phoneDisplay}`}>
              <Phone className="h-3.5 w-3.5" />
            </a>
            <span className="text-xs font-mono" style={{ color: '#8AA8C8' }}>{phoneDisplay}</span>
          </div>
        ) : (
          <span className="text-xs" style={{ color: '#5A7A9A' }}>—</span>
        )}
      </td>
      <td className="py-3 pr-4">
        {ori ? (
          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold"
            style={{ background: `${oriColor}20`, color: oriColor }}>
            <Megaphone className="h-2.5 w-2.5 mr-1" />
            {ori}
          </span>
        ) : (
          <span className="text-xs" style={{ color: '#5A7A9A' }}>—</span>
        )}
      </td>
      <td className="py-3 pr-4 font-mono font-semibold" style={{ color: '#E8F0FE' }}>{c.transactions}</td>
      <td className="py-3 pr-4 font-mono font-semibold" style={{ color: '#E8F0FE' }}>{BRL(c.totalCents)}</td>
      <td className="py-3 pr-4 font-mono font-semibold" style={{ color: '#00FF94' }}>{BRL(c.profitCents)}</td>
    </tr>
  )
}
