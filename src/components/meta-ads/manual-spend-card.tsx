'use client'

import { useState, useMemo, useTransition, Fragment, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  Plus, Trash2, Target, TrendingUp, TrendingDown, RefreshCw,
  Eye, MousePointer, MessageCircle, ArrowRight, Users, BarChart2,
  ChevronDown, ChevronUp, Trophy, AlertCircle,
} from 'lucide-react'
import { addSpendEntry, deleteSpendEntry, type SpendEntry } from '@/actions/meta-ads-spend-manual'

// Objetivos nativos do Meta Ads
const META_OBJECTIVES = [
  { value: 'vendas',           label: 'Vendas',                     color: '#E4405F' },
  { value: 'leads',            label: 'Leads',                      color: '#8B5CF6' },
  { value: 'trafego',          label: 'Tráfego',                    color: '#3B82F6' },
  { value: 'alcance',          label: 'Alcance',                    color: '#10B981' },
  { value: 'reconhecimento',   label: 'Reconhecimento de marca',    color: '#F59E0B' },
  { value: 'envolvimento',     label: 'Envolvimento',               color: '#EC4899' },
  { value: 'video',            label: 'Visualizações de vídeo',     color: '#06B6D4' },
  { value: 'mensagens',        label: 'Mensagens',                  color: '#22C55E' },
  { value: 'app',              label: 'Promoção do aplicativo',     color: '#F97316' },
]

function ObjectiveBadge({ value }: { value: string | null }) {
  if (!value) return null
  const obj = META_OBJECTIVES.find(o => o.value === value)
  if (!obj) return null
  return (
    <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-semibold shrink-0"
      style={{ background: obj.color + '22', color: obj.color, border: `1px solid ${obj.color}44` }}>
      {obj.label}
    </span>
  )
}

type Props = {
  initialEntries:      SpendEntry[]
  newPaidCustomers:    number
  paidRevenueCents:    number
  period:              '7d' | '30d' | '90d'
  dailyPaidCustomers:  { date: string; count: number }[]
}

const fmtBRL = (cents: number) =>
  (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const fmtUSD = (cents: number) =>
  (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })

const fmtDate = (iso: string) =>
  new Date(iso + 'T12:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })

async function fetchUsdRate(): Promise<number | null> {
  try {
    const res  = await fetch('https://economia.awesomeapi.com.br/json/last/USD-BRL')
    const data = await res.json()
    return parseFloat(data.USDBRL.bid)
  } catch { return null }
}

// ── Gráfico de barras diário ──────────────────────────────────────────────────

type DailyBar = {
  date:        string
  spend:       number
  customers:   number
  cac:         number | null
  costPerConv: number | null
  clicks:      number
  conversations: number
}

function DailyBarChart({ days, metric }: { days: DailyBar[]; metric: 'cac' | 'conv' }) {
  const vals = days.map(d => metric === 'cac' ? (d.cac ?? 0) : (d.costPerConv ?? 0))
  const maxVal = Math.max(1, ...vals)
  const w = 700; const h = 140
  const padL = 55; const padB = 28; const padT = 10; const padR = 10
  const innerW = w - padL - padR
  const innerH = h - padT - padB
  const barW = Math.max(4, (innerW / Math.max(1, days.length)) - 3)

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" preserveAspectRatio="xMidYMid meet">
      {[0, 0.5, 1].map(t => {
        const y = padT + innerH - t * innerH
        return (
          <g key={t}>
            <line x1={padL} y1={y} x2={w - padR} y2={y} stroke="#2A3650" strokeWidth="1" strokeDasharray="3 4" />
            <text x={padL - 6} y={y + 4} textAnchor="end" fontSize="9" fill="#475569" fontFamily="monospace">
              {fmtBRL(maxVal * t)}
            </text>
          </g>
        )
      })}
      {days.map((d, i) => {
        const val = vals[i]
        const barH = val > 0 ? Math.max(3, (val / maxVal) * innerH) : 2
        const x = padL + i * (innerW / days.length) + (innerW / days.length - barW) / 2
        const y = padT + innerH - barH
        const isMin = val > 0 && val === Math.min(...vals.filter(v => v > 0))
        const isMax = val === Math.max(...vals)
        const color = isMin ? '#22C55E' : isMax ? '#EF4444' : '#E4405F88'
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={barH} rx="2" fill={color}>
              <title>{`${fmtDate(d.date)}: ${fmtBRL(val)}${metric === 'cac' ? ` CAC (${d.customers} clientes)` : ` custo/conversa (${d.conversations} conv.)`}`}</title>
            </rect>
            {(i % Math.max(1, Math.ceil(days.length / 8)) === 0 || i === days.length - 1) && (
              <text x={x + barW / 2} y={h - 8} textAnchor="middle" fontSize="9" fill="#475569" fontFamily="monospace">
                {d.date.slice(5).replace('-', '/')}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────

export function ManualSpendCard({
  initialEntries, newPaidCustomers, paidRevenueCents, period, dailyPaidCustomers,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [showForm, setShowForm]     = useState(false)
  const [showDaily, setShowDaily]   = useState(false)
  const [chartMetric, setChartMetric] = useState<'cac' | 'conv'>('cac')
  const [currency, setCurrency]     = useState<'BRL' | 'USD'>('BRL')
  const [date, setDate]             = useState(new Date().toISOString().slice(0, 10))
  const [amount, setAmount]         = useState('')
  const [notes, setNotes]           = useState('')
  const [rate, setRate]             = useState('')
  const [impressionsInput, setImpressionsInput] = useState('')
  const [clicksInput, setClicksInput]           = useState('')
  const [convsInput, setConvsInput]             = useState('')
  const [objective, setObjective]               = useState('')
  const [fetchingRate, setFetchingRate]         = useState(false)
  const [entries, setEntries]       = useState<SpendEntry[]>(initialEntries)

  const days = period === '7d' ? 7 : period === '30d' ? 30 : 90

  useEffect(() => {
    if (currency === 'USD' && !rate) {
      setFetchingRate(true)
      fetchUsdRate().then(r => { if (r) setRate(r.toFixed(2)); setFetchingRate(false) })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currency])

  async function refreshRate() {
    setFetchingRate(true)
    const r = await fetchUsdRate()
    if (r) setRate(r.toFixed(2))
    setFetchingRate(false)
  }

  const sinceDate    = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  const sinceDateStr = sinceDate.toISOString().slice(0, 10)
  const periodEntries    = entries.filter(e => e.spend_date >= sinceDateStr)
  const totalSpend       = periodEntries.reduce((s, e) => s + e.amount_cents, 0)
  const totalImpressions = periodEntries.reduce((s, e) => s + (e.impressions ?? 0), 0)
  const totalClicks      = periodEntries.reduce((s, e) => s + (e.clicks ?? 0), 0)
  const totalConvs       = periodEntries.reduce((s, e) => s + (e.conversations ?? 0), 0)

  const previewBrl = useMemo(() => {
    if (currency !== 'USD') return null
    const a = parseFloat(amount.replace(',', '.'))
    const r = parseFloat(rate.replace(',', '.'))
    if (isNaN(a) || isNaN(r) || r <= 0) return null
    return Math.round(a * r * 100)
  }, [currency, amount, rate])

  const kpis = useMemo(() => {
    const cac      = totalSpend > 0 && newPaidCustomers > 0 ? Math.round(totalSpend / newPaidCustomers) : 0
    const roas     = totalSpend > 0 && paidRevenueCents > 0 ? paidRevenueCents / totalSpend : 0
    const cpm      = totalImpressions > 0 ? (totalSpend / totalImpressions) * 1000 : 0
    const cpc      = totalClicks > 0 ? Math.round(totalSpend / totalClicks) : 0
    const costConv = totalConvs > 0 ? Math.round(totalSpend / totalConvs) : 0
    return { cac, roas, cpm, cpc, costConv }
  }, [totalSpend, newPaidCustomers, paidRevenueCents, totalImpressions, totalClicks, totalConvs])

  // ── Análise diária ───────────────────────────────────────────────────────
  const dailyStats = useMemo(() => {
    if (periodEntries.length === 0) return null

    // Agrupa entries por dia
    const byDate = new Map<string, { spend: number; impr: number; clicks: number; convs: number }>()
    for (const e of periodEntries) {
      const d = byDate.get(e.spend_date) ?? { spend: 0, impr: 0, clicks: 0, convs: 0 }
      d.spend  += e.amount_cents
      d.impr   += e.impressions ?? 0
      d.clicks += e.clicks ?? 0
      d.convs  += e.conversations ?? 0
      byDate.set(e.spend_date, d)
    }

    // Mapa de clientes por dia
    const custMap = new Map(dailyPaidCustomers.map(x => [x.date, x.count]))

    const daybars: DailyBar[] = [...byDate.entries()].map(([date, d]) => {
      const customers   = custMap.get(date) ?? 0
      const cac         = d.spend > 0 && customers > 0 ? Math.round(d.spend / customers) : null
      const costPerConv = d.spend > 0 && d.convs > 0 ? Math.round(d.spend / d.convs) : null
      return { date, spend: d.spend, customers, cac, costPerConv, clicks: d.clicks, conversations: d.convs }
    }).sort((a, b) => a.date.localeCompare(b.date))

    if (daybars.length < 2) return null

    const withCac  = daybars.filter(d => d.cac !== null)
    const withConv = daybars.filter(d => d.costPerConv !== null)

    const bestCac  = withCac.length  > 0 ? withCac.reduce((a, b) => a.cac!  < b.cac!  ? a : b) : null
    const worstCac = withCac.length  > 0 ? withCac.reduce((a, b) => a.cac!  > b.cac!  ? a : b) : null
    const bestConv = withConv.length > 0 ? withConv.reduce((a, b) => a.costPerConv! < b.costPerConv! ? a : b) : null
    const worstConv= withConv.length > 0 ? withConv.reduce((a, b) => a.costPerConv! > b.costPerConv! ? a : b) : null

    return { daybars, bestCac, worstCac, bestConv, worstConv }
  }, [periodEntries, dailyPaidCustomers])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    const isUsd     = currency === 'USD'
    const origCents = Math.round(parseFloat(amount.replace(',', '.')) * 100)
    const rateVal   = isUsd ? parseFloat(rate.replace(',', '.')) : 1
    if (isNaN(origCents) || origCents <= 0 || (isUsd && isNaN(rateVal))) return
    const brlCents  = isUsd ? Math.round(origCents * rateVal) : origCents
    const impr = impressionsInput ? parseInt(impressionsInput.replace(/\D/g, ''), 10) : undefined
    const clks = clicksInput ? parseInt(clicksInput.replace(/\D/g, ''), 10) : undefined
    const cnvs = convsInput  ? parseInt(convsInput.replace(/\D/g, ''),  10) : undefined

    startTransition(async () => {
      const result = await addSpendEntry(
        brlCents, date, notes || undefined, currency,
        isUsd ? origCents : undefined,
        isUsd ? rateVal   : undefined,
        impr, clks, cnvs,
        objective || undefined,
      )
      if (!result.error) {
        const newEntry: SpendEntry = {
          id: crypto.randomUUID(), spend_date: date,
          amount_cents: brlCents, currency,
          original_amount_cents: isUsd ? origCents : null,
          exchange_rate: isUsd ? rateVal : null,
          impressions: impr ?? null, clicks: clks ?? null, conversations: cnvs ?? null,
          objective: objective || null,
          notes: notes || null, created_at: new Date().toISOString(),
        }
        setEntries(prev => [newEntry, ...prev].sort((a, b) => b.spend_date.localeCompare(a.spend_date)))
        setAmount(''); setNotes(''); setImpressionsInput(''); setClicksInput(''); setConvsInput('')
        setObjective('')
        setShowForm(false)
        router.refresh()
      }
    })
  }

  async function handleDelete(id: string) {
    startTransition(async () => {
      const result = await deleteSpendEntry(id)
      if (!result.error) { setEntries(prev => prev.filter(e => e.id !== id)); router.refresh() }
    })
  }

  function entryLabel(e: SpendEntry) {
    if (e.currency === 'USD' && e.original_amount_cents != null)
      return `${fmtUSD(e.original_amount_cents)} (${fmtBRL(e.amount_cents)})`
    return fmtBRL(e.amount_cents)
  }

  return (
    <div className="rounded-2xl border p-5 space-y-4" style={{ background: '#1B2638', borderColor: '#2A3650' }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold" style={{ color: '#F8FAFC' }}>Investimento Manual</h3>
          <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>
            Use quando a API do Meta não estiver disponível ou para complementar os dados automáticos
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold tabular-nums" style={{ color: '#E4405F' }}>{fmtBRL(totalSpend)}</span>
          <button
            onClick={() => setShowForm(v => !v)}
            className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors"
            style={{ borderColor: '#E4405F55', background: '#E4405F11', color: '#E4405F' }}
          >
            <Plus className="h-3.5 w-3.5" />
            Adicionar
          </button>
        </div>
      </div>

      {/* Formulário */}
      {showForm && (
        <form onSubmit={handleAdd} className="rounded-xl border p-3 space-y-3" style={{ borderColor: '#2A3650', background: '#0F1923' }}>
          {/* Moeda */}
          <div className="flex gap-1 rounded-md border p-0.5 w-fit" style={{ borderColor: '#2A3650' }}>
            {(['BRL', 'USD'] as const).map(c => (
              <button key={c} type="button"
                onClick={() => { setCurrency(c); setAmount(''); setRate('') }}
                className="rounded px-3 py-1 text-xs font-semibold transition-colors"
                style={currency === c ? { background: '#E4405F', color: '#fff' } : { color: '#64748B' }}>
                {c === 'BRL' ? '🇧🇷 R$' : '🇺🇸 US$'}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] uppercase tracking-wider" style={{ color: '#64748B' }}>Data</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} required
                className="mt-1 w-full rounded-md border px-2 py-1.5 text-xs focus:outline-none"
                style={{ borderColor: '#2A3650', background: '#1B2638', color: '#F8FAFC' }} />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider" style={{ color: '#64748B' }}>
                Valor ({currency === 'USD' ? 'US$' : 'R$'}) *
              </label>
              <input type="text" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)}
                placeholder="0,00" required
                className="mt-1 w-full rounded-md border px-2 py-1.5 text-xs focus:outline-none"
                style={{ borderColor: '#2A3650', background: '#1B2638', color: '#F8FAFC' }} />
            </div>
          </div>

          {currency === 'USD' && (
            <div className="rounded-md border px-3 py-2 space-y-1.5" style={{ borderColor: '#2A3650', background: '#1B2638' }}>
              <div className="flex items-center justify-between">
                <label className="text-[10px] uppercase tracking-wider" style={{ color: '#64748B' }}>Cotação (R$/US$)</label>
                <button type="button" onClick={refreshRate} disabled={fetchingRate}
                  className="flex items-center gap-1 text-[10px] transition-colors disabled:opacity-50"
                  style={{ color: '#E4405F' }}>
                  <RefreshCw className={`h-3 w-3 ${fetchingRate ? 'animate-spin' : ''}`} />
                  Atualizar cotação
                </button>
              </div>
              <input type="text" inputMode="decimal" value={rate} onChange={e => setRate(e.target.value)}
                placeholder="5,50" required
                className="w-full rounded-md border px-2 py-1.5 text-xs focus:outline-none"
                style={{ borderColor: '#2A3650', background: '#0F1923', color: '#F8FAFC' }} />
              {previewBrl != null && (
                <p className="text-[10px]" style={{ color: '#94A3B8' }}>
                  = <span className="font-semibold" style={{ color: '#E4405F' }}>{fmtBRL(previewBrl)}</span>
                  <span style={{ color: '#475569' }} className="ml-1">(será salvo em reais)</span>
                </p>
              )}
            </div>
          )}

          {/* Objetivo da campanha */}
          <div>
            <label className="text-[10px] uppercase tracking-wider" style={{ color: '#64748B' }}>Objetivo da campanha</label>
            <select value={objective} onChange={e => setObjective(e.target.value)}
              className="mt-1 w-full rounded-md border px-2 py-1.5 text-xs focus:outline-none"
              style={{ borderColor: '#2A3650', background: '#1B2638', color: objective ? '#F8FAFC' : '#64748B' }}>
              <option value="">— Selecionar objetivo —</option>
              {META_OBJECTIVES.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Métricas de mídia */}
          <div className="rounded-md border px-3 py-2 space-y-2" style={{ borderColor: '#2A3650' }}>
            <p className="text-[10px] uppercase tracking-wider" style={{ color: '#64748B' }}>
              Métricas de mídia <span className="normal-case" style={{ color: '#334155' }}>(opcional)</span>
            </p>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Impressões', icon: Eye, state: impressionsInput, setState: setImpressionsInput },
                { label: 'Cliques',    icon: MousePointer, state: clicksInput, setState: setClicksInput },
                { label: 'Conversas', icon: MessageCircle, state: convsInput, setState: setConvsInput },
              ].map(({ label, icon: Icon, state, setState }) => (
                <div key={label}>
                  <label className="flex items-center gap-1 text-[10px] mb-1" style={{ color: '#64748B' }}>
                    <Icon className="h-3 w-3" /> {label}
                  </label>
                  <input type="text" inputMode="numeric" value={state} onChange={e => setState(e.target.value)}
                    placeholder="0"
                    className="w-full rounded-md border px-2 py-1.5 text-xs focus:outline-none"
                    style={{ borderColor: '#2A3650', background: '#1B2638', color: '#F8FAFC' }} />
                </div>
              ))}
            </div>
          </div>

          <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="Observação — ex: Campanha iPhone Usado"
            className="w-full rounded-md border px-2 py-1.5 text-xs focus:outline-none"
            style={{ borderColor: '#2A3650', background: '#1B2638', color: '#F8FAFC' }} />

          <div className="flex gap-2">
            <button type="submit" disabled={isPending}
              className="flex-1 rounded-md px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50 transition-colors"
              style={{ background: '#E4405F' }}>
              {isPending ? 'Salvando…' : 'Salvar'}
            </button>
            <button type="button" onClick={() => setShowForm(false)}
              className="rounded-md border px-3 py-1.5 text-xs transition-colors"
              style={{ borderColor: '#2A3650', color: '#64748B' }}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      {/* Lista de lançamentos */}
      {periodEntries.length > 0 ? (
        <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
          {periodEntries.map(e => (
            <div key={e.id} className="rounded-lg border px-3 py-2.5" style={{ background: '#0F1923', borderColor: '#1E2D45' }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0 flex-wrap">
                  <span className="text-xs shrink-0 font-mono" style={{ color: '#475569' }}>
                    {fmtDate(e.spend_date)}
                  </span>
                  {e.currency === 'USD' && (
                    <span className="text-[9px] rounded px-1.5 py-0.5 font-semibold shrink-0"
                      style={{ background: '#1D4ED820', color: '#60A5FA', border: '1px solid #1D4ED840' }}>USD</span>
                  )}
                  <ObjectiveBadge value={e.objective} />
                  <span className="text-sm font-bold tabular-nums shrink-0" style={{ color: '#E4405F' }}>{entryLabel(e)}</span>
                  {e.notes && <span className="text-[10px] truncate" style={{ color: '#475569' }}>{e.notes}</span>}
                </div>
                <button onClick={() => handleDelete(e.id)} disabled={isPending}
                  className="shrink-0 ml-2 transition-colors disabled:opacity-50 p-1 rounded"
                  style={{ color: '#334155' }}
                  onMouseEnter={ev => (ev.currentTarget.style.color = '#EF4444')}
                  onMouseLeave={ev => (ev.currentTarget.style.color = '#334155')}
                  title="Remover">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              {(e.impressions || e.clicks || e.conversations) && (
                <div className="flex items-center gap-3 mt-2 flex-wrap">
                  {e.impressions != null && (
                    <span className="flex items-center gap-1 text-[11px] rounded-md px-2 py-0.5"
                      style={{ background: '#1E2D45', color: '#64748B' }}>
                      <Eye className="h-3 w-3" /> {e.impressions.toLocaleString('pt-BR')}
                    </span>
                  )}
                  {e.clicks != null && (
                    <span className="flex items-center gap-1 text-[11px] rounded-md px-2 py-0.5"
                      style={{ background: '#1E2D45', color: '#64748B' }}>
                      <MousePointer className="h-3 w-3" /> {e.clicks.toLocaleString('pt-BR')}
                    </span>
                  )}
                  {e.conversations != null && (
                    <span className="flex items-center gap-1 text-[11px] rounded-md px-2 py-0.5"
                      style={{ background: '#1E2D45', color: '#64748B' }}>
                      <MessageCircle className="h-3 w-3" /> {e.conversations.toLocaleString('pt-BR')} conv.
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-center py-3" style={{ color: '#334155' }}>
          Nenhum lançamento nos últimos {days} dias
        </p>
      )}

      {/* KPIs calculados */}
      {totalSpend > 0 && (
        <div className="space-y-3 pt-1 border-t" style={{ borderColor: '#2A3650' }}>
          {/* CPM / CPC / Custo por Conversa */}
          {(totalImpressions > 0 || totalClicks > 0 || totalConvs > 0) && (
            <div className="grid grid-cols-3 gap-2">
              {totalImpressions > 0 && (
                <div className="rounded-xl border p-3" style={{ borderColor: '#2A3650', background: '#0F1923' }}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <Eye className="h-3.5 w-3.5" style={{ color: '#94A3B8' }} />
                    <p className="text-[10px] uppercase tracking-wider" style={{ color: '#64748B' }}>CPM</p>
                  </div>
                  <p className="text-xl font-bold tabular-nums" style={{ color: '#F8FAFC' }}>{fmtBRL(Math.round(kpis.cpm))}</p>
                  <p className="text-[10px] mt-0.5" style={{ color: '#475569' }}>{totalImpressions.toLocaleString('pt-BR')} impr.</p>
                </div>
              )}
              {totalClicks > 0 && (
                <div className="rounded-xl border p-3" style={{ borderColor: '#2A3650', background: '#0F1923' }}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <MousePointer className="h-3.5 w-3.5" style={{ color: '#94A3B8' }} />
                    <p className="text-[10px] uppercase tracking-wider" style={{ color: '#64748B' }}>CPC</p>
                  </div>
                  <p className="text-xl font-bold tabular-nums" style={{ color: '#F8FAFC' }}>{fmtBRL(kpis.cpc)}</p>
                  <p className="text-[10px] mt-0.5" style={{ color: '#475569' }}>{totalClicks.toLocaleString('pt-BR')} cliques</p>
                </div>
              )}
              {totalConvs > 0 && (
                <div className="rounded-xl border p-3" style={{ borderColor: '#2A3650', background: '#0F1923' }}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <MessageCircle className="h-3.5 w-3.5" style={{ color: '#94A3B8' }} />
                    <p className="text-[10px] uppercase tracking-wider" style={{ color: '#64748B' }}>Custo/Conv.</p>
                  </div>
                  <p className="text-xl font-bold tabular-nums" style={{ color: '#F8FAFC' }}>{fmtBRL(kpis.costConv)}</p>
                  <p className="text-[10px] mt-0.5" style={{ color: '#475569' }}>{totalConvs.toLocaleString('pt-BR')} conversas</p>
                </div>
              )}
            </div>
          )}

          {/* CAC / ROAS */}
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border p-3" style={{ borderColor: '#E4405F33', background: '#E4405F08' }}>
              <div className="flex items-center gap-1.5 mb-1">
                <Target className="h-3.5 w-3.5" style={{ color: '#E4405F' }} />
                <p className="text-[10px] uppercase tracking-wider" style={{ color: '#E4405F99' }}>CAC</p>
              </div>
              <p className="text-2xl font-bold tabular-nums" style={{ color: '#E4405F' }}>
                {kpis.cac > 0 ? fmtBRL(kpis.cac) : '—'}
              </p>
              <p className="text-[10px] mt-0.5" style={{ color: '#64748B' }}>
                {newPaidCustomers} clientes pagos no período
              </p>
            </div>
            <div className="rounded-xl border p-3"
              style={{
                borderColor: kpis.roas >= 3 ? '#22C55E33' : kpis.roas >= 1 ? '#F59E0B33' : '#EF444433',
                background:  kpis.roas >= 3 ? '#22C55E08' : kpis.roas >= 1 ? '#F59E0B08' : '#EF444408',
              }}>
              <div className="flex items-center gap-1.5 mb-1">
                <TrendingUp className="h-3.5 w-3.5" style={{ color: kpis.roas >= 3 ? '#22C55E' : kpis.roas >= 1 ? '#F59E0B' : '#EF4444' }} />
                <p className="text-[10px] uppercase tracking-wider" style={{ color: '#64748B' }}>ROAS</p>
              </div>
              <p className="text-2xl font-bold tabular-nums"
                style={{ color: kpis.roas >= 3 ? '#22C55E' : kpis.roas >= 1 ? '#F59E0B' : '#EF4444' }}>
                {kpis.roas > 0 ? `${kpis.roas.toFixed(2)}×` : '—'}
              </p>
              <p className="text-[10px] mt-0.5" style={{ color: '#64748B' }}>receita / investimento</p>
            </div>
          </div>

          {/* Funil */}
          {(totalConvs > 0 || newPaidCustomers > 0) && (
            <div className="rounded-xl border p-4" style={{ borderColor: '#2A3650', background: '#0F1923' }}>
              <div className="flex items-center gap-2 mb-3">
                <Users className="h-4 w-4" style={{ color: '#D4AF37' }} />
                <p className="text-sm font-semibold" style={{ color: '#F8FAFC' }}>Funil de Conversão</p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {([
                  ...(totalConvs > 0 ? [{ label: 'Conversas', value: totalConvs, color: '#7C3AED' }] : []),
                  { label: 'Novos clientes (pago)', value: newPaidCustomers, color: '#E4405F' },
                ]).map((step, i, arr) => (
                  <Fragment key={step.label}>
                    <div className="flex flex-col items-center rounded-xl border px-5 py-3 min-w-[90px]"
                      style={{ borderColor: step.color + '44', background: step.color + '11', color: step.color }}>
                      <span className="text-2xl font-bold tabular-nums">{step.value}</span>
                      <span className="text-[10px] mt-0.5 text-center" style={{ color: '#94A3B8' }}>{step.label}</span>
                    </div>
                    {i < arr.length - 1 && <ArrowRight className="h-4 w-4 shrink-0" style={{ color: '#334155' }} />}
                  </Fragment>
                ))}
              </div>
            </div>
          )}

          {/* Análise por dia */}
          {dailyStats && (
            <div className="rounded-xl border overflow-hidden" style={{ borderColor: '#2A3650', background: '#0F1923' }}>
              <button
                onClick={() => setShowDaily(v => !v)}
                className="w-full flex items-center justify-between px-4 py-3 transition-colors hover:bg-white/5"
              >
                <div className="flex items-center gap-2">
                  <BarChart2 className="h-4 w-4" style={{ color: '#E4405F' }} />
                  <span className="text-sm font-semibold" style={{ color: '#F8FAFC' }}>Análise por Dia</span>
                  <span className="text-[10px] rounded-full px-2 py-0.5" style={{ background: '#E4405F22', color: '#E4405F' }}>
                    {dailyStats.daybars.length} dias
                  </span>
                </div>
                {showDaily
                  ? <ChevronUp className="h-4 w-4" style={{ color: '#475569' }} />
                  : <ChevronDown className="h-4 w-4" style={{ color: '#475569' }} />}
              </button>

              {showDaily && (
                <div className="px-4 pb-4 space-y-4 border-t" style={{ borderColor: '#1E2D45' }}>
                  {/* Best / Worst day */}
                  <div className="grid grid-cols-2 gap-3 pt-3">
                    {/* Melhor dia — CAC */}
                    {dailyStats.bestCac && (
                      <div className="rounded-xl border p-3" style={{ borderColor: '#22C55E33', background: '#22C55E08' }}>
                        <div className="flex items-center gap-1.5 mb-2">
                          <Trophy className="h-3.5 w-3.5" style={{ color: '#22C55E' }} />
                          <p className="text-[10px] uppercase tracking-wider" style={{ color: '#22C55E88' }}>Melhor CAC</p>
                        </div>
                        <p className="text-xl font-bold tabular-nums" style={{ color: '#22C55E' }}>
                          {fmtBRL(dailyStats.bestCac.cac!)}
                        </p>
                        <p className="text-xs mt-1" style={{ color: '#94A3B8' }}>{fmtDate(dailyStats.bestCac.date)}</p>
                        <p className="text-[10px] mt-0.5" style={{ color: '#64748B' }}>
                          {dailyStats.bestCac.customers} clientes · {fmtBRL(dailyStats.bestCac.spend)} gasto
                        </p>
                      </div>
                    )}
                    {/* Pior dia — CAC */}
                    {dailyStats.worstCac && dailyStats.worstCac.date !== dailyStats.bestCac?.date && (
                      <div className="rounded-xl border p-3" style={{ borderColor: '#EF444433', background: '#EF444408' }}>
                        <div className="flex items-center gap-1.5 mb-2">
                          <AlertCircle className="h-3.5 w-3.5" style={{ color: '#EF4444' }} />
                          <p className="text-[10px] uppercase tracking-wider" style={{ color: '#EF444488' }}>Maior CAC</p>
                        </div>
                        <p className="text-xl font-bold tabular-nums" style={{ color: '#EF4444' }}>
                          {fmtBRL(dailyStats.worstCac.cac!)}
                        </p>
                        <p className="text-xs mt-1" style={{ color: '#94A3B8' }}>{fmtDate(dailyStats.worstCac.date)}</p>
                        <p className="text-[10px] mt-0.5" style={{ color: '#64748B' }}>
                          {dailyStats.worstCac.customers} clientes · {fmtBRL(dailyStats.worstCac.spend)} gasto
                        </p>
                      </div>
                    )}
                    {/* Melhor custo/conversa quando não há CAC */}
                    {!dailyStats.bestCac && dailyStats.bestConv && (
                      <div className="rounded-xl border p-3" style={{ borderColor: '#22C55E33', background: '#22C55E08' }}>
                        <div className="flex items-center gap-1.5 mb-2">
                          <Trophy className="h-3.5 w-3.5" style={{ color: '#22C55E' }} />
                          <p className="text-[10px] uppercase tracking-wider" style={{ color: '#22C55E88' }}>Melhor custo/conv.</p>
                        </div>
                        <p className="text-xl font-bold tabular-nums" style={{ color: '#22C55E' }}>
                          {fmtBRL(dailyStats.bestConv.costPerConv!)}
                        </p>
                        <p className="text-xs mt-1" style={{ color: '#94A3B8' }}>{fmtDate(dailyStats.bestConv.date)}</p>
                      </div>
                    )}
                    {!dailyStats.worstCac && dailyStats.worstConv && dailyStats.worstConv.date !== dailyStats.bestConv?.date && (
                      <div className="rounded-xl border p-3" style={{ borderColor: '#EF444433', background: '#EF444408' }}>
                        <div className="flex items-center gap-1.5 mb-2">
                          <AlertCircle className="h-3.5 w-3.5" style={{ color: '#EF4444' }} />
                          <p className="text-[10px] uppercase tracking-wider" style={{ color: '#EF444488' }}>Maior custo/conv.</p>
                        </div>
                        <p className="text-xl font-bold tabular-nums" style={{ color: '#EF4444' }}>
                          {fmtBRL(dailyStats.worstConv.costPerConv!)}
                        </p>
                        <p className="text-xs mt-1" style={{ color: '#94A3B8' }}>{fmtDate(dailyStats.worstConv.date)}</p>
                      </div>
                    )}
                  </div>

                  {/* Seletor de métrica + gráfico */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-semibold" style={{ color: '#CBD5E1' }}>Evolução diária</p>
                      <div className="flex gap-1 rounded-md border p-0.5" style={{ borderColor: '#2A3650' }}>
                        {([
                          { key: 'cac' as const,  label: 'CAC' },
                          { key: 'conv' as const, label: 'Custo/Conv.' },
                        ]).map(opt => (
                          <button key={opt.key} type="button"
                            onClick={() => setChartMetric(opt.key)}
                            className="rounded px-2.5 py-1 text-[10px] font-semibold transition-colors"
                            style={chartMetric === opt.key
                              ? { background: '#E4405F', color: '#fff' }
                              : { color: '#64748B' }}>
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-lg p-2" style={{ background: '#0A1120' }}>
                      <DailyBarChart days={dailyStats.daybars} metric={chartMetric} />
                    </div>
                    <div className="flex items-center gap-4 mt-2 justify-center text-[10px]" style={{ color: '#475569' }}>
                      <span className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded" style={{ background: '#22C55E' }} /> Menor (melhor)
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded" style={{ background: '#EF4444' }} /> Maior (pior)
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded" style={{ background: '#E4405F88' }} /> Outros dias
                      </span>
                    </div>
                  </div>

                  {/* Tabela por dia */}
                  <div className="rounded-lg overflow-hidden border" style={{ borderColor: '#1E2D45' }}>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr style={{ background: '#131C2A' }}>
                            {['Data', 'Gasto', 'Clientes', 'CAC', 'Cliques', 'Conv.', 'Custo/Conv.'].map(h => (
                              <th key={h} className="px-3 py-2 text-left text-[10px] uppercase tracking-wider font-semibold"
                                style={{ color: '#475569' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {dailyStats.daybars.map((d, i) => {
                            const isBestCac  = d.date === dailyStats.bestCac?.date
                            const isWorstCac = d.date === dailyStats.worstCac?.date
                            return (
                              <tr key={d.date} className="border-t"
                                style={{
                                  borderColor: '#1E2D45',
                                  background: isBestCac  ? '#22C55E08'
                                            : isWorstCac ? '#EF444408'
                                            : i % 2 === 0 ? 'transparent' : '#0A111A',
                                }}>
                                <td className="px-3 py-2 font-mono" style={{ color: '#94A3B8' }}>{fmtDate(d.date)}</td>
                                <td className="px-3 py-2 font-mono font-semibold" style={{ color: '#E4405F' }}>{fmtBRL(d.spend)}</td>
                                <td className="px-3 py-2 font-mono" style={{ color: d.customers > 0 ? '#F8FAFC' : '#334155' }}>
                                  {d.customers > 0 ? d.customers : '—'}
                                </td>
                                <td className="px-3 py-2 font-mono font-bold"
                                  style={{ color: isBestCac ? '#22C55E' : isWorstCac ? '#EF4444' : d.cac ? '#F8FAFC' : '#334155' }}>
                                  {d.cac ? fmtBRL(d.cac) : '—'}
                                </td>
                                <td className="px-3 py-2 font-mono" style={{ color: d.clicks > 0 ? '#94A3B8' : '#334155' }}>
                                  {d.clicks > 0 ? d.clicks.toLocaleString('pt-BR') : '—'}
                                </td>
                                <td className="px-3 py-2 font-mono" style={{ color: d.conversations > 0 ? '#94A3B8' : '#334155' }}>
                                  {d.conversations > 0 ? d.conversations : '—'}
                                </td>
                                <td className="px-3 py-2 font-mono"
                                  style={{ color: d.costPerConv ? '#F8FAFC' : '#334155' }}>
                                  {d.costPerConv ? fmtBRL(d.costPerConv) : '—'}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {!dailyStats.bestCac && (
                    <p className="text-[11px] text-center" style={{ color: '#475569' }}>
                      CAC diário disponível quando clientes têm origem "Instagram Pago" ou "Facebook" cadastrada no mesmo dia
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
