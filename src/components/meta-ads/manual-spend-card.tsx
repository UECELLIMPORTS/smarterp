'use client'

import { useState, useMemo, useTransition, Fragment, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  Plus, Trash2, DollarSign, Target, TrendingUp, RefreshCw,
  Eye, MousePointer, MessageCircle, ArrowRight, Users,
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
  initialEntries: SpendEntry[]
  // Clientes novos de canais pagos no período (instagram_pago + facebook)
  newPaidCustomers: number
  // Faturamento de canais pagos no período
  paidRevenueCents: number
  period: '7d' | '30d' | '90d'
}

const fmtBRL = (cents: number) =>
  (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const fmtUSD = (cents: number) =>
  (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })

async function fetchUsdRate(): Promise<number | null> {
  try {
    const res  = await fetch('https://economia.awesomeapi.com.br/json/last/USD-BRL')
    const data = await res.json()
    return parseFloat(data.USDBRL.bid)
  } catch { return null }
}

export function ManualSpendCard({ initialEntries, newPaidCustomers, paidRevenueCents, period }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [showForm, setShowForm]     = useState(false)
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

  // Auto-busca cotação quando USD selecionado
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
                style={currency === c
                  ? { background: '#E4405F', color: '#fff' }
                  : { color: '#64748B' }}
              >
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
        <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
          {periodEntries.map(e => (
            <div key={e.id} className="rounded-lg px-2.5 py-2" style={{ background: '#0F1923' }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0 flex-wrap">
                  <span className="text-[10px] shrink-0" style={{ color: '#475569' }}>
                    {new Date(e.spend_date + 'T12:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                  </span>
                  {e.currency === 'USD' && (
                    <span className="text-[9px] rounded px-1 py-0.5 font-semibold shrink-0"
                      style={{ background: '#1D4ED820', color: '#60A5FA' }}>USD</span>
                  )}
                  <ObjectiveBadge value={e.objective} />
                  <span className="text-xs font-semibold tabular-nums shrink-0" style={{ color: '#E4405F' }}>{entryLabel(e)}</span>
                  {e.notes && <span className="text-[10px] truncate" style={{ color: '#475569' }}>{e.notes}</span>}
                </div>
                <button onClick={() => handleDelete(e.id)} disabled={isPending}
                  className="shrink-0 ml-2 transition-colors disabled:opacity-50"
                  style={{ color: '#334155' }}
                  onMouseEnter={ev => (ev.currentTarget.style.color = '#EF4444')}
                  onMouseLeave={ev => (ev.currentTarget.style.color = '#334155')}
                  title="Remover">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              {(e.impressions || e.clicks || e.conversations) && (
                <div className="flex items-center gap-3 mt-1">
                  {e.impressions != null && (
                    <span className="flex items-center gap-0.5 text-[9px]" style={{ color: '#334155' }}>
                      <Eye className="h-2.5 w-2.5" /> {e.impressions.toLocaleString('pt-BR')}
                    </span>
                  )}
                  {e.clicks != null && (
                    <span className="flex items-center gap-0.5 text-[9px]" style={{ color: '#334155' }}>
                      <MousePointer className="h-2.5 w-2.5" /> {e.clicks.toLocaleString('pt-BR')}
                    </span>
                  )}
                  {e.conversations != null && (
                    <span className="flex items-center gap-0.5 text-[9px]" style={{ color: '#334155' }}>
                      <MessageCircle className="h-2.5 w-2.5" /> {e.conversations.toLocaleString('pt-BR')} conversas
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-center py-2" style={{ color: '#334155' }}>
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
        </div>
      )}
    </div>
  )
}
