'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Store, Globe, MapPin, DollarSign, TrendingUp, AlertTriangle,
  Package, ShoppingBag, ArrowRight, Calculator, Settings, Megaphone, Target,
} from 'lucide-react'
import type {
  ChannelAnalytics, ChannelAnalyticsPeriod, ChannelMetric,
  OriginMetric, OriginChannelMatrix, CacByChannel,
} from '@/actions/sales-channels'

const BRL = (c: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
    .format(c / 100)
    .replace(/ /g, ' ')
    .replace(/ /g, ' ')
const NUM = (n: number) => new Intl.NumberFormat('pt-BR').format(n)
const PCT = (v: number) => `${(v * 100).toFixed(1)}%`

type Props = {
  data: ChannelAnalytics
  origins: OriginMetric[]
  originChannelMatrix: OriginChannelMatrix
  cac: CacByChannel
  fixedCostMonthlyCents: number | null
}

/** Quantos dias o período cobre (pra pro-ratear custo fixo mensal). null pra 'all'. */
function periodDays(period: ChannelAnalyticsPeriod): number | null {
  switch (period) {
    case '7d':   return 7
    case '30d':  return 30
    case '90d':  return 90
    case '180d': return 180
    case '365d': return 365
    case 'all':  return null
  }
}

const PERIOD_OPTIONS: { v: ChannelAnalyticsPeriod; label: string }[] = [
  { v: '7d',   label: '7d' },
  { v: '30d',  label: '30d' },
  { v: '90d',  label: '90d' },
  { v: '180d', label: '180d' },
  { v: '365d', label: '1 ano' },
  { v: 'all',  label: 'Tudo' },
]

export function CanaisClient({ data, origins, originChannelMatrix, cac, fixedCostMonthlyCents }: Props) {
  const router = useRouter()

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: '#E8F0FE' }}>
            <Store className="h-5 w-5" style={{ color: '#00E5FF' }} />
            Canais de venda
          </h1>
          <p className="mt-1 text-sm" style={{ color: '#5A7A9A' }}>
            Análise cruzada de vendas online (WhatsApp, Instagram, Delivery) vs loja física (Balcão, Retirada)
          </p>
        </div>
        <div className="flex gap-1 rounded-xl p-1" style={{ background: '#111827', border: '1px solid #1E2D45' }}>
          {PERIOD_OPTIONS.map(p => (
            <button
              key={p.v}
              onClick={() => router.push(`/analytics/canais?period=${p.v}`)}
              className="rounded-lg px-3 py-1.5 text-xs font-bold transition-all"
              style={data.period === p.v
                ? { background: '#00E5FF', color: '#080C14' }
                : { color: '#5A7A9A' }
              }
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Alert se muitas vendas sem canal */}
      {data.naoInformadoCount > 0 && data.totalTxCount > 0 && (
        <NaoInformadoBanner
          count={data.naoInformadoCount}
          total={data.totalTxCount}
          cents={data.naoInformadoCents}
        />
      )}

      {/* KPIs principais */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Faturamento total"
          value={BRL(data.totalCents)}
          sub={`${data.totalTxCount} transações no período`}
          color="#E8F0FE"
          icon={DollarSign}
        />
        <KpiCard
          label="Online"
          value={BRL(data.onlineCents)}
          sub={PCT(data.pctOnline)}
          color="#00E5FF"
          icon={Globe}
        />
        <KpiCard
          label="Física"
          value={BRL(data.fisicaCents)}
          sub={PCT(data.pctFisica)}
          color="#FFAA00"
          icon={MapPin}
        />
        <KpiCard
          label="Ticket médio geral"
          value={data.totalTxCount > 0 ? BRL(Math.round(data.totalCents / data.totalTxCount)) : '—'}
          sub={`${data.channels.filter(c => c.totalCents > 0).length} canais ativos`}
          color="#9B6DFF"
          icon={TrendingUp}
        />
      </div>

      {/* Donut + Sustento */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <OnlineVsFisicaCard data={data} />
        <SustentoCard data={data} />
      </div>

      {/* Modalidade de entrega */}
      <DeliveryBreakdownCard data={data} />

      {/* Break-even da loja física */}
      <BreakEvenSection
        data={data}
        fixedCostMonthlyCents={fixedCostMonthlyCents}
      />

      {/* Tabela por canal */}
      <ChannelTableSection channels={data.channels.filter(c => c.totalCents > 0 || (c.salesCount + c.osCount) > 0)} />

      {/* Origem dos clientes */}
      <OriginSection origins={origins} />

      {/* Heatmap Origem × Canal */}
      <OriginChannelMatrixSection matrix={originChannelMatrix} />

      {/* CAC por canal (Meta Ads) */}
      <CacByChannelSection cac={cac} />

      {/* Gráfico temporal */}
      {data.daily.length > 0 && <DailyChartSection daily={data.daily} />}
    </div>
  )
}

// ── Componentes ────────────────────────────────────────────────────────────

function NaoInformadoBanner({ count, total, cents }: { count: number; total: number; cents: number }) {
  const pct = total > 0 ? count / total : 0
  if (pct < 0.1) return null  // só mostra se > 10%
  return (
    <div className="rounded-xl border p-4 flex items-start gap-3"
      style={{ background: 'rgba(255,170,0,.06)', borderColor: 'rgba(255,170,0,.4)' }}>
      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" style={{ color: '#FFAA00' }} />
      <div>
        <p className="text-sm font-semibold" style={{ color: '#FFAA00' }}>
          {count} transação(ões) sem canal informado ({PCT(pct)} do total)
        </p>
        <p className="text-xs mt-1" style={{ color: '#8AA8C8' }}>
          {BRL(cents)} em vendas não foram classificadas. Marque o canal ao finalizar a venda no POS ou Financeiro — quanto mais dados, mais preciso fica o relatório.
        </p>
      </div>
    </div>
  )
}

function OnlineVsFisicaCard({ data }: { data: ChannelAnalytics }) {
  const { pctOnline, pctFisica, pctOutro, onlineCents, fisicaCents, outroCents } = data
  const onlineDeg = pctOnline * 360
  const fisicaDeg = pctFisica * 360
  const outroDeg  = pctOutro  * 360
  const total = onlineCents + fisicaCents + outroCents

  return (
    <div className="rounded-2xl border p-6" style={{ background: '#111827', borderColor: '#1E2D45' }}>
      <div className="flex items-center gap-2 mb-4">
        <div className="h-4 w-1 rounded-full" style={{ background: '#00E5FF' }} />
        <h2 className="text-xs font-bold uppercase tracking-widest" style={{ color: '#8AA8C8' }}>
          Online vs Física
        </h2>
      </div>

      {total === 0 ? (
        <p className="py-10 text-center text-sm" style={{ color: '#5A7A9A' }}>
          Sem vendas classificadas no período
        </p>
      ) : (
        <div className="flex items-center gap-6 flex-wrap">
          <div
            className="h-40 w-40 rounded-full shrink-0 relative"
            style={{
              background: `conic-gradient(
                #00E5FF 0deg ${onlineDeg}deg,
                #FFAA00 ${onlineDeg}deg ${onlineDeg + fisicaDeg}deg,
                #5A7A9A ${onlineDeg + fisicaDeg}deg ${onlineDeg + fisicaDeg + outroDeg}deg
              )`,
            }}
          >
            <div className="absolute inset-5 rounded-full flex flex-col items-center justify-center"
              style={{ background: '#111827' }}>
              <span className="text-3xl font-bold font-mono" style={{ color: '#00E5FF' }}>
                {PCT(pctOnline)}
              </span>
              <span className="text-[10px] uppercase tracking-wider mt-1" style={{ color: '#5A7A9A' }}>Online</span>
            </div>
          </div>
          <div className="flex-1 min-w-[200px] space-y-2">
            <LegendRow color="#00E5FF" label="Online" value={BRL(onlineCents)} pct={PCT(pctOnline)} />
            <LegendRow color="#FFAA00" label="Física" value={BRL(fisicaCents)} pct={PCT(pctFisica)} />
            {outroCents > 0 && (
              <LegendRow color="#5A7A9A" label="Outro" value={BRL(outroCents)} pct={PCT(pctOutro)} />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function LegendRow({ color, label, value, pct }: { color: string; label: string; value: string; pct: string }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <div className="flex items-center gap-2 min-w-0">
        <span className="h-3 w-3 rounded shrink-0" style={{ background: color }} />
        <span style={{ color: '#E8F0FE' }}>{label}</span>
      </div>
      <div className="text-right">
        <span className="font-mono font-semibold" style={{ color }}>{value}</span>
        <span className="ml-2" style={{ color: '#5A7A9A' }}>{pct}</span>
      </div>
    </div>
  )
}

function SustentoCard({ data }: { data: ChannelAnalytics }) {
  const { fisicaBalcaoCents, fisicaRetiradaCents, pctSustento } = data
  const total = fisicaBalcaoCents + fisicaRetiradaCents

  return (
    <div className="rounded-2xl border p-6" style={{ background: '#111827', borderColor: '#1E2D45' }}>
      <div className="flex items-center gap-2 mb-4">
        <div className="h-4 w-1 rounded-full" style={{ background: '#9B6DFF' }} />
        <div>
          <h2 className="text-xs font-bold uppercase tracking-widest" style={{ color: '#8AA8C8' }}>
            Efeito Sustento
          </h2>
          <p className="text-[11px] mt-0.5" style={{ color: '#5A7A9A' }}>
            Quanto da &quot;física&quot; é na verdade retirada de venda online
          </p>
        </div>
      </div>

      {total === 0 ? (
        <p className="py-10 text-center text-sm" style={{ color: '#5A7A9A' }}>
          Sem vendas físicas no período
        </p>
      ) : (
        <>
          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between text-[11px] mb-1">
                <span style={{ color: '#8AA8C8' }}>
                  <ShoppingBag className="h-3 w-3 inline mr-1" />
                  Balcão (física pura)
                </span>
                <span className="font-mono font-bold" style={{ color: '#FFAA00' }}>{BRL(fisicaBalcaoCents)}</span>
              </div>
              <div className="h-3 rounded-md overflow-hidden" style={{ background: '#0D1320' }}>
                <div className="h-full" style={{
                  width: `${(fisicaBalcaoCents / total) * 100}%`,
                  background: 'linear-gradient(90deg, #FFAA0066, #FFAA00)',
                }} />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between text-[11px] mb-1">
                <span style={{ color: '#8AA8C8' }}>
                  <Package className="h-3 w-3 inline mr-1" />
                  Retirada (veio de venda online)
                </span>
                <span className="font-mono font-bold" style={{ color: '#9B6DFF' }}>{BRL(fisicaRetiradaCents)}</span>
              </div>
              <div className="h-3 rounded-md overflow-hidden" style={{ background: '#0D1320' }}>
                <div className="h-full" style={{
                  width: `${(fisicaRetiradaCents / total) * 100}%`,
                  background: 'linear-gradient(90deg, #9B6DFF66, #9B6DFF)',
                }} />
              </div>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t text-center" style={{ borderColor: '#1E2D45' }}>
            <p className="text-[10px] uppercase tracking-wider" style={{ color: '#5A7A9A' }}>
              Do movimento da loja física
            </p>
            <p className="text-2xl font-bold font-mono mt-1" style={{ color: '#9B6DFF' }}>
              {PCT(pctSustento)}
            </p>
            <p className="text-[11px] mt-1" style={{ color: '#8AA8C8' }}>
              {pctSustento >= 0.3
                ? 'é movimento que o online gerou — a física depende do online'
                : 'é movimento que o online gerou — a física ainda tem vida própria'}
            </p>
          </div>
        </>
      )}
    </div>
  )
}

type BreakEvenMetric = 'revenue' | 'profit'
type BreakEvenSource = 'all' | 'sales' | 'os'

/** Pega o valor de um canal conforme métrica + fonte selecionadas. */
function pickChannelValue(c: ChannelMetric | undefined, metric: BreakEvenMetric, source: BreakEvenSource): number {
  if (!c) return 0
  if (metric === 'revenue') {
    if (source === 'sales') return c.salesRevenueCents
    if (source === 'os')    return c.osRevenueCents
    return c.totalCents
  }
  if (source === 'sales') return c.salesProfitCents
  if (source === 'os')    return c.osProfitCents
  return c.totalProfitCents
}

function DeliveryBreakdownCard({ data }: { data: ChannelAnalytics }) {
  const total = data.deliveryBreakdown.reduce((s, d) => s + d.cents, 0)
  const visible = data.deliveryBreakdown.filter(d => d.cents > 0)

  // Cores fixas por modalidade pra ficar consistente entre recargas.
  const COLORS: Record<string, string> = {
    counter:       '#FFAA00',  // balcão (igual à física)
    pickup:        '#9B6DFF',  // retirada
    shipping:      '#00E5FF',  // delivery (igual à online)
    nao_informado: '#5A7A9A',
  }

  return (
    <div className="rounded-2xl border p-6" style={{ background: '#111827', borderColor: '#1E2D45' }}>
      <div className="flex items-center gap-2 mb-4">
        <div className="h-4 w-1 rounded-full" style={{ background: '#00E5FF' }} />
        <div>
          <h2 className="text-xs font-bold uppercase tracking-widest flex items-center gap-1.5" style={{ color: '#8AA8C8' }}>
            <Package className="h-3.5 w-3.5" />
            Modalidade de Entrega
          </h2>
          <p className="text-[11px] mt-0.5" style={{ color: '#5A7A9A' }}>
            Como o produto/aparelho chegou ao cliente (independente do canal de fechamento)
          </p>
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="py-6 text-center text-sm" style={{ color: '#5A7A9A' }}>
          Sem modalidade de entrega registrada no período
        </p>
      ) : (
        <div className="space-y-3">
          {visible.map(d => {
            const pct   = total > 0 ? d.cents / total : 0
            const color = COLORS[d.delivery] ?? '#8AA8C8'
            return (
              <div key={d.delivery}>
                <div className="flex items-center justify-between text-[11px] mb-1.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="h-3 w-3 rounded shrink-0" style={{ background: color }} />
                    <span className="font-medium truncate" style={{ color: '#E8F0FE' }}>{d.label}</span>
                    <span className="font-mono shrink-0" style={{ color: '#5A7A9A' }}>{PCT(pct)}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 ml-2">
                    <span className="font-mono" style={{ color: '#8AA8C8' }}>{NUM(d.count)} tx</span>
                    <span className="font-mono font-bold" style={{ color }}>{BRL(d.cents)}</span>
                  </div>
                </div>
                <div className="h-2 rounded-md overflow-hidden" style={{ background: '#0D1320' }}>
                  <div className="h-full transition-all" style={{
                    width: `${pct * 100}%`,
                    background: `linear-gradient(90deg, ${color}55, ${color})`,
                  }} />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function BreakEvenSection({
  data, fixedCostMonthlyCents,
}: {
  data: ChannelAnalytics
  fixedCostMonthlyCents: number | null
}) {
  const [metric, setMetric] = useState<BreakEvenMetric>('profit')
  const [source, setSource] = useState<BreakEvenSource>('all')

  // Não configurado → CTA
  if (fixedCostMonthlyCents == null) {
    return (
      <div className="rounded-2xl border p-6" style={{ background: '#111827', borderColor: '#1E2D45' }}>
        <div className="flex items-center gap-2 mb-4">
          <div className="h-4 w-1 rounded-full" style={{ background: '#FFAA00' }} />
          <h2 className="text-xs font-bold uppercase tracking-widest" style={{ color: '#8AA8C8' }}>
            Break-even da loja física
          </h2>
        </div>
        <div className="rounded-xl border p-6 text-center"
          style={{ background: '#0D1320', borderColor: 'rgba(255,170,0,.25)' }}>
          <Calculator className="h-8 w-8 mx-auto mb-3" style={{ color: '#FFAA00', opacity: 0.6 }} />
          <p className="text-sm font-semibold" style={{ color: '#E8F0FE' }}>
            Configure o custo fixo mensal da loja física
          </p>
          <p className="text-xs mt-2 max-w-md mx-auto" style={{ color: '#8AA8C8' }}>
            Pra descobrir quanto a loja física se paga (ou não) e quanto o online sustenta, precisamos do custo fixo mensal (aluguel + salários + contas).
          </p>
          <Link
            href="/configuracoes"
            className="mt-4 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold transition-colors hover:bg-white/5"
            style={{ background: 'rgba(255,170,0,.1)', color: '#FFAA00', border: '1px solid rgba(255,170,0,.3)' }}
          >
            <Settings className="h-3.5 w-3.5" />
            Configurar agora
          </Link>
        </div>
      </div>
    )
  }

  // Período = 'all' → não faz sentido prorratear
  const days = periodDays(data.period)
  if (days === null) {
    return (
      <div className="rounded-2xl border p-6" style={{ background: '#111827', borderColor: '#1E2D45' }}>
        <div className="flex items-center gap-2 mb-4">
          <div className="h-4 w-1 rounded-full" style={{ background: '#FFAA00' }} />
          <h2 className="text-xs font-bold uppercase tracking-widest" style={{ color: '#8AA8C8' }}>
            Break-even da loja física
          </h2>
        </div>
        <p className="text-xs text-center py-6" style={{ color: '#5A7A9A' }}>
          Escolha um período específico (7d, 30d, 90d…) pra calcular o break-even.
        </p>
      </div>
    )
  }

  const balcaoCh   = data.channels.find(c => c.channel === 'fisica_balcao')
  const retiradaCh = data.channels.find(c => c.channel === 'fisica_retirada')
  const onlineChs  = data.channels.filter(c => c.group === 'online' && c.channel !== 'fisica_retirada')

  // Cálculo do break-even — agora respeita métrica (faturamento ou lucro) + fonte (sales/os/ambos).
  const custoPeriodoCents    = Math.round(fixedCostMonthlyCents * (days / 30))
  const fisicaPuraCents      = pickChannelValue(balcaoCh, metric, source)
  const deficitCents         = custoPeriodoCents - fisicaPuraCents
  const isLoja               = deficitCents > 0
  const onlinePuroCents      = onlineChs.reduce((s, c) => s + pickChannelValue(c, metric, source), 0)
  const retiradaCents        = pickChannelValue(retiradaCh, metric, source)
  const onlineCents          = onlinePuroCents + retiradaCents  // retirada conta como online
  const pctOnlineCobriuDeficit = isLoja && onlineCents > 0
    ? Math.min(1, deficitCents / onlineCents)
    : 0
  const sobraOnlineCents     = isLoja ? onlineCents - deficitCents : onlineCents

  const periodoTxt =
    days === 7   ? 'últimos 7 dias'    :
    days === 30  ? 'últimos 30 dias'   :
    days === 90  ? 'últimos 90 dias'   :
    days === 180 ? 'últimos 180 dias'  :
    'últimos 12 meses'

  const metricLabel    = metric === 'profit' ? 'lucro'        : 'faturamento'
  const metricLabelCap = metric === 'profit' ? 'Lucro'        : 'Faturamento'
  const sourceLabel    = source === 'sales' ? 'só SmartERP (vendas)'
                       : source === 'os'    ? 'só CheckSmart (OS)'
                       : 'SmartERP + CheckSmart'

  // Em modo "lucro", o conceito muda: o lucro do balcão precisa cobrir o custo
  // fixo. "Déficit" significa que o lucro não dá pra cobrir o aluguel.
  const balcaoCardLabel = metric === 'profit'
    ? 'Lucro do balcão (física pura)'
    : 'Faturamento do balcão (física pura)'
  const balcaoCardSub = metric === 'profit'
    ? `lucro do balcão (${sourceLabel})`
    : `faturamento de balcão (${sourceLabel})`
  const deficitCardLabel = isLoja
    ? (metric === 'profit' ? 'Déficit (lucro abaixo do custo)' : 'Déficit da física')
    : (metric === 'profit' ? 'Superávit (lucro cobre o custo)' : 'Superávit')
  const deficitCardSub = isLoja
    ? (metric === 'profit' ? 'o lucro do balcão não cobre o custo fixo' : 'a física está abaixo do custo')
    : (metric === 'profit' ? 'o lucro do balcão cobre o custo fixo'    : 'a física cobre o próprio custo')

  return (
    <div className="rounded-2xl border p-6 space-y-4" style={{ background: '#111827', borderColor: '#1E2D45' }}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="h-4 w-1 rounded-full" style={{ background: isLoja ? '#FF4D6D' : '#00FF94' }} />
          <div>
            <h2 className="text-xs font-bold uppercase tracking-widest flex items-center gap-1.5" style={{ color: '#8AA8C8' }}>
              <Calculator className="h-3.5 w-3.5" />
              Break-even da loja física
            </h2>
            <p className="text-[11px] mt-0.5" style={{ color: '#5A7A9A' }}>
              {metric === 'profit'
                ? `Quanto o ${metricLabel} do balcão cobre do custo fixo nos ${periodoTxt}`
                : `Quanto o online está sustentando a física nos ${periodoTxt}`}
            </p>
          </div>
        </div>
        <Link
          href="/configuracoes"
          className="text-[11px] font-bold transition-colors hover:underline"
          style={{ color: '#5A7A9A' }}
          title="Editar custo fixo"
        >
          <Settings className="h-3 w-3 inline mr-1" />
          {BRL(fixedCostMonthlyCents)}/mês
        </Link>
      </div>

      {/* Toggles: métrica + fonte */}
      <div className="flex flex-wrap gap-3">
        <ToggleGroup
          label="Métrica"
          options={[
            { v: 'profit',  label: 'Lucro' },
            { v: 'revenue', label: 'Faturamento' },
          ]}
          value={metric}
          onChange={setMetric}
          activeColor="#00FF94"
        />
        <ToggleGroup
          label="Fonte"
          options={[
            { v: 'all',   label: 'Ambos' },
            { v: 'sales', label: 'SmartERP' },
            { v: 'os',    label: 'CheckSmart' },
          ]}
          value={source}
          onChange={setSource}
          activeColor="#00E5FF"
        />
      </div>

      {/* Aviso pequeno se algumas vendas usaram custo atual no fallback */}
      {metric === 'profit' && data.salesItemsWithFallbackCount > 0 && (source === 'all' || source === 'sales') && (
        <div className="rounded-lg border px-3 py-2 text-[11px] flex items-start gap-2"
          style={{ background: 'rgba(255,170,0,.05)', borderColor: 'rgba(255,170,0,.25)', color: '#8AA8C8' }}>
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{ color: '#FFAA00' }} />
          <span>
            <strong style={{ color: '#FFAA00' }}>{NUM(data.salesItemsWithFallbackCount)}</strong> item(s) de venda sem custo gravado na época —
            usamos o custo atual do produto como estimativa. O lucro pode estar levemente impreciso pra vendas antigas.
          </span>
        </div>
      )}

      {/* 3 cards horizontais: custo, balcão (lucro/fat), déficit/superávit */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border p-4" style={{ background: '#0D1320', borderColor: '#1E2D45' }}>
          <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#5A7A9A' }}>
            Custo fixo do período
          </p>
          <p className="text-xl font-bold font-mono mt-1" style={{ color: '#FFAA00' }}>
            {BRL(custoPeriodoCents)}
          </p>
          <p className="text-[10px] mt-1" style={{ color: '#8AA8C8' }}>
            {BRL(fixedCostMonthlyCents)}/mês × ({days}/30)
          </p>
        </div>

        <div className="rounded-xl border p-4" style={{ background: '#0D1320', borderColor: '#1E2D45' }}>
          <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#5A7A9A' }}>
            {balcaoCardLabel}
          </p>
          <p className="text-xl font-bold font-mono mt-1" style={{ color: metric === 'profit' ? '#00FF94' : '#E8F0FE' }}>
            {BRL(fisicaPuraCents)}
          </p>
          <p className="text-[10px] mt-1" style={{ color: '#8AA8C8' }}>
            {balcaoCardSub}
          </p>
        </div>

        <div className="rounded-xl border p-4"
          style={{
            background: isLoja ? 'rgba(255,77,109,.08)' : 'rgba(0,255,148,.06)',
            borderColor: isLoja ? 'rgba(255,77,109,.3)' : 'rgba(0,255,148,.3)',
          }}>
          <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#5A7A9A' }}>
            {deficitCardLabel}
          </p>
          <p className="text-xl font-bold font-mono mt-1" style={{ color: isLoja ? '#FF4D6D' : '#00FF94' }}>
            {isLoja ? '-' : '+'} {BRL(Math.abs(deficitCents))}
          </p>
          <p className="text-[10px] mt-1" style={{ color: '#8AA8C8' }}>
            {deficitCardSub}
          </p>
        </div>
      </div>

      {/* Mensagem principal */}
      {isLoja ? (
        <div className="rounded-xl border p-5"
          style={{ background: 'rgba(255,77,109,.04)', borderColor: 'rgba(255,77,109,.3)' }}>
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0" style={{ color: '#FF4D6D' }} />
            <div className="flex-1">
              <p className="text-sm font-bold" style={{ color: '#FF4D6D' }}>
                {onlineCents <= 0
                  ? `Loja física com déficit — ${metricLabel} do online insuficiente nesta visão`
                  : onlineCents < deficitCents
                    ? `${metricLabelCap} do online não é suficiente pra cobrir a física`
                    : `O ${metricLabel} do online está sustentando a loja física`}
              </p>
              <p className="text-xs mt-1" style={{ color: '#E8F0FE' }}>
                Nos {periodoTxt}, o balcão gerou <strong>{BRL(fisicaPuraCents)}</strong> de {metricLabel} ({sourceLabel}),
                mas o custo fixo da loja foi <strong>{BRL(custoPeriodoCents)}</strong>.
                {onlineCents <= 0
                  ? <> Mude a fonte ou métrica pra ver outras combinações.</>
                  : onlineCents < deficitCents
                    ? <> O <strong style={{ color: '#00E5FF' }}>{metricLabel} online ({BRL(onlineCents)})</strong> cobre parte do déficit, mas ainda faltam <strong style={{ color: '#FF4D6D' }}>{BRL(deficitCents - onlineCents)}</strong>.</>
                    : <> O <strong style={{ color: '#00E5FF' }}>{metricLabel} online (incluindo retiradas) está cobrindo {BRL(deficitCents)}</strong> de déficit.</>
                }
              </p>
              {onlineCents >= deficitCents && onlineCents > 0 && (
                <div className="mt-3 space-y-2">
                  <div className="flex items-center justify-between text-[11px]">
                    <span style={{ color: '#8AA8C8' }}>
                      Sobra do {metricLabel} online após pagar o déficit da física
                    </span>
                    <span className="font-mono font-bold" style={{ color: sobraOnlineCents >= 0 ? '#00FF94' : '#FF4D6D' }}>
                      {BRL(sobraOnlineCents)}
                    </span>
                  </div>
                  <div className="h-3 rounded-md overflow-hidden flex" style={{ background: '#0D1320' }}>
                    <div className="h-full" style={{
                      width: `${pctOnlineCobriuDeficit * 100}%`,
                      background: 'linear-gradient(90deg, #FF4D6D66, #FF4D6D)',
                    }} title="Déficit da física" />
                    <div className="h-full" style={{
                      width: `${(1 - pctOnlineCobriuDeficit) * 100}%`,
                      background: 'linear-gradient(90deg, #00FF9466, #00FF94)',
                    }} title="Sobra do online" />
                  </div>
                  <div className="flex items-center justify-between text-[10px]" style={{ color: '#5A7A9A' }}>
                    <span>Cobre o déficit da física ({PCT(pctOnlineCobriuDeficit)})</span>
                    <span>Sobra livre ({PCT(1 - pctOnlineCobriuDeficit)})</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border p-5"
          style={{ background: 'rgba(0,255,148,.04)', borderColor: 'rgba(0,255,148,.3)' }}>
          <div className="flex items-start gap-3">
            <TrendingUp className="h-5 w-5 mt-0.5 shrink-0" style={{ color: '#00FF94' }} />
            <div>
              <p className="text-sm font-bold" style={{ color: '#00FF94' }}>
                {metric === 'profit'
                  ? 'O lucro do balcão cobre o custo fixo da loja'
                  : 'A loja física cobre o próprio custo'}
              </p>
              <p className="text-xs mt-1" style={{ color: '#E8F0FE' }}>
                Nos {periodoTxt}, o balcão gerou {BRL(fisicaPuraCents)} de {metricLabel} ({sourceLabel}) contra {BRL(custoPeriodoCents)} de custo fixo —
                sobram <strong style={{ color: '#00FF94' }}>{BRL(Math.abs(deficitCents))}</strong> só da física.
                O {metricLabel} online ({BRL(onlineCents)}) é {metric === 'profit' ? 'lucro líquido' : 'faturamento'} em cima disso.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ToggleGroup<T extends string>({
  label, options, value, onChange, activeColor,
}: {
  label:       string
  options:     { v: T; label: string }[]
  value:       T
  onChange:    (v: T) => void
  activeColor: string
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#5A7A9A' }}>
        {label}
      </span>
      <div className="flex gap-1 rounded-xl p-1" style={{ background: '#0D1320', border: '1px solid #1E2D45' }}>
        {options.map(o => {
          const active = o.v === value
          return (
            <button
              key={o.v}
              onClick={() => onChange(o.v)}
              className="rounded-lg px-3 py-1 text-[11px] font-bold transition-all"
              style={active
                ? { background: activeColor, color: '#080C14' }
                : { color: '#8AA8C8' }
              }
            >
              {o.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function ChannelTableSection({ channels }: { channels: ChannelMetric[] }) {
  return (
    <div className="rounded-2xl border" style={{ background: '#111827', borderColor: '#1E2D45' }}>
      <div className="border-b px-6 py-4" style={{ borderColor: '#1E2D45' }}>
        <div className="flex items-center gap-2">
          <div className="h-4 w-1 rounded-full" style={{ background: '#E4405F' }} />
          <h2 className="text-xs font-bold uppercase tracking-widest" style={{ color: '#8AA8C8' }}>
            Performance por canal
          </h2>
        </div>
      </div>

      <div className="overflow-x-auto">
        {channels.length === 0 ? (
          <p className="p-10 text-center text-sm" style={{ color: '#5A7A9A' }}>
            Sem dados de canais no período
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left" style={{ borderColor: '#1E2D45' }}>
                {['Canal', 'Grupo', 'Vendas', 'OS', 'Faturamento', 'Lucro', 'Margem', 'Ticket médio'].map(h => (
                  <th key={h} className="px-5 py-3 text-[10px] font-bold uppercase tracking-wider" style={{ color: '#5A7A9A' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {channels
                .sort((a, b) => b.totalCents - a.totalCents)
                .map(c => {
                  const margin = c.totalCents > 0 ? c.totalProfitCents / c.totalCents : 0
                  const profitColor = c.totalProfitCents < 0 ? '#FF4D6D'
                                    : c.totalProfitCents === 0 ? '#5A7A9A'
                                    : '#00FF94'
                  const marginColor = margin < 0    ? '#FF4D6D'
                                    : margin < 0.15 ? '#FFAA00'
                                    : margin < 0.30 ? '#E8F0FE'
                                    : '#00FF94'
                  return (
                    <tr key={c.channel} className="border-b hover:bg-white/[0.02] transition-colors" style={{ borderColor: 'rgba(30,45,69,.5)' }}>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full shrink-0" style={{ background: c.color }} />
                          <span className="font-medium" style={{ color: '#E8F0FE' }}>{c.label}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded"
                          style={{
                            background: c.group === 'online' ? 'rgba(0,229,255,.1)'
                                      : c.group === 'fisica' ? 'rgba(255,170,0,.1)'
                                      : 'rgba(138,168,200,.1)',
                            color: c.group === 'online' ? '#00E5FF'
                                 : c.group === 'fisica' ? '#FFAA00'
                                 : '#8AA8C8',
                          }}>
                          {c.group}
                        </span>
                      </td>
                      <td className="px-5 py-3 font-mono" style={{ color: '#8AA8C8' }}>{NUM(c.salesCount)}</td>
                      <td className="px-5 py-3 font-mono" style={{ color: '#8AA8C8' }}>{NUM(c.osCount)}</td>
                      <td className="px-5 py-3 font-mono font-semibold" style={{ color: c.color }}>
                        {BRL(c.totalCents)}
                      </td>
                      <td className="px-5 py-3 font-mono font-semibold" style={{ color: profitColor }}>
                        {c.totalCents > 0 ? BRL(c.totalProfitCents) : '—'}
                      </td>
                      <td className="px-5 py-3 font-mono" style={{ color: marginColor }}>
                        {c.totalCents > 0 ? PCT(margin) : '—'}
                      </td>
                      <td className="px-5 py-3 font-mono" style={{ color: '#8AA8C8' }}>
                        {c.avgTicketCents > 0 ? BRL(c.avgTicketCents) : '—'}
                      </td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function OriginSection({ origins }: { origins: OriginMetric[] }) {
  const sorted     = [...origins].sort((a, b) => b.totalCents - a.totalCents)
  const totalCents = sorted.reduce((s, o) => s + o.totalCents, 0)
  const totalCust  = sorted.reduce((s, o) => s + o.customers,  0)
  const totalTx    = sorted.reduce((s, o) => s + o.transactions, 0)
  const maxCents   = sorted[0]?.totalCents ?? 0

  return (
    <div className="rounded-2xl border" style={{ background: '#111827', borderColor: '#1E2D45' }}>
      <div className="border-b px-6 py-4" style={{ borderColor: '#1E2D45' }}>
        <div className="flex items-center gap-2">
          <div className="h-4 w-1 rounded-full" style={{ background: '#E4405F' }} />
          <div>
            <h2 className="text-xs font-bold uppercase tracking-widest flex items-center gap-1.5" style={{ color: '#8AA8C8' }}>
              <Megaphone className="h-3.5 w-3.5" />
              Origem dos clientes
            </h2>
            <p className="text-[11px] mt-0.5" style={{ color: '#5A7A9A' }}>
              De onde vieram os clientes que compraram no período (canal de aquisição, não onde fecharam)
            </p>
          </div>
        </div>
      </div>

      {sorted.length === 0 ? (
        <p className="p-10 text-center text-sm" style={{ color: '#5A7A9A' }}>
          Sem clientes com origem registrada no período. Marque a origem ao cadastrar o cliente em /erp-clientes.
        </p>
      ) : (
        <div className="p-6 space-y-5">
          {/* Resumo */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border p-3" style={{ background: '#0D1320', borderColor: '#1E2D45' }}>
              <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#5A7A9A' }}>Faturamento</p>
              <p className="text-lg font-bold font-mono mt-1" style={{ color: '#E8F0FE' }}>{BRL(totalCents)}</p>
            </div>
            <div className="rounded-xl border p-3" style={{ background: '#0D1320', borderColor: '#1E2D45' }}>
              <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#5A7A9A' }}>Clientes únicos</p>
              <p className="text-lg font-bold font-mono mt-1" style={{ color: '#00E5FF' }}>{NUM(totalCust)}</p>
            </div>
            <div className="rounded-xl border p-3" style={{ background: '#0D1320', borderColor: '#1E2D45' }}>
              <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#5A7A9A' }}>Transações</p>
              <p className="text-lg font-bold font-mono mt-1" style={{ color: '#9B6DFF' }}>{NUM(totalTx)}</p>
            </div>
          </div>

          {/* Barras por origem */}
          <div className="space-y-3">
            {sorted.map(o => {
              const pct = totalCents > 0 ? o.totalCents / totalCents : 0
              const barW = maxCents > 0 ? (o.totalCents / maxCents) * 100 : 0
              return (
                <div key={o.origin}>
                  <div className="flex items-center justify-between text-[11px] mb-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="h-3 w-3 rounded shrink-0" style={{ background: o.color }} />
                      <span className="font-medium truncate" style={{ color: '#E8F0FE' }}>{o.label}</span>
                      <span className="font-mono shrink-0" style={{ color: '#5A7A9A' }}>{PCT(pct)}</span>
                    </div>
                    <span className="font-mono font-bold shrink-0 ml-2" style={{ color: o.color }}>
                      {BRL(o.totalCents)}
                    </span>
                  </div>
                  <div className="h-2.5 rounded-md overflow-hidden" style={{ background: '#0D1320' }}>
                    <div className="h-full transition-all" style={{
                      width: `${barW}%`,
                      background: `linear-gradient(90deg, ${o.color}55, ${o.color})`,
                    }} />
                  </div>
                  <div className="flex items-center justify-between text-[10px] mt-1" style={{ color: '#5A7A9A' }}>
                    <span>
                      <span className="font-mono" style={{ color: '#8AA8C8' }}>{NUM(o.customers)}</span> cliente(s)
                      {' · '}
                      <span className="font-mono" style={{ color: '#8AA8C8' }}>{NUM(o.transactions)}</span> transação(ões)
                    </span>
                    <span>
                      ticket médio <span className="font-mono" style={{ color: '#8AA8C8' }}>{o.avgTicketCents > 0 ? BRL(o.avgTicketCents) : '—'}</span>
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function OriginChannelMatrixSection({ matrix }: { matrix: OriginChannelMatrix }) {
  const [mode, setMode] = useState<'absolute' | 'pct_row'>('absolute')
  const { origins, channels, cells, rowTotals, colTotals, grandTotal } = matrix

  if (grandTotal === 0 || origins.length === 0 || channels.length === 0) {
    return (
      <div className="rounded-2xl border" style={{ background: '#111827', borderColor: '#1E2D45' }}>
        <div className="border-b px-6 py-4" style={{ borderColor: '#1E2D45' }}>
          <div className="flex items-center gap-2">
            <div className="h-4 w-1 rounded-full" style={{ background: '#9B6DFF' }} />
            <h2 className="text-xs font-bold uppercase tracking-widest" style={{ color: '#8AA8C8' }}>
              Origem × Canal
            </h2>
          </div>
        </div>
        <p className="p-10 text-center text-sm" style={{ color: '#5A7A9A' }}>
          Sem dados pra cruzar origem e canal no período
        </p>
      </div>
    )
  }

  const cellMap = new Map<string, { totalCents: number; transactions: number }>()
  for (const c of cells) cellMap.set(`${c.origin}|${c.channel}`, { totalCents: c.totalCents, transactions: c.transactions })

  const maxCent = Math.max(0, ...cells.map(c => c.totalCents))

  // Em modo absoluto, intensidade da célula = valor / max global.
  // Em modo % por linha, intensidade = valor / total da origem.
  const intensity = (origin: string, value: number) => {
    if (mode === 'pct_row') {
      const row = rowTotals[origin] ?? 0
      return row > 0 ? value / row : 0
    }
    return maxCent > 0 ? value / maxCent : 0
  }

  return (
    <div className="rounded-2xl border" style={{ background: '#111827', borderColor: '#1E2D45' }}>
      <div className="border-b px-6 py-4 flex items-start justify-between gap-3 flex-wrap" style={{ borderColor: '#1E2D45' }}>
        <div className="flex items-center gap-2">
          <div className="h-4 w-1 rounded-full" style={{ background: '#9B6DFF' }} />
          <div>
            <h2 className="text-xs font-bold uppercase tracking-widest" style={{ color: '#8AA8C8' }}>
              Origem × Canal
            </h2>
            <p className="text-[11px] mt-0.5" style={{ color: '#5A7A9A' }}>
              De onde vem o cliente (linhas) × onde fechou a venda (colunas)
            </p>
          </div>
        </div>
        <ToggleGroup
          label="Visão"
          options={[
            { v: 'absolute', label: 'Valor' },
            { v: 'pct_row',  label: '% por origem' },
          ]}
          value={mode}
          onChange={setMode}
          activeColor="#9B6DFF"
        />
      </div>

      <div className="overflow-x-auto p-4">
        <table className="w-full text-xs border-separate" style={{ borderSpacing: '4px' }}>
          <thead>
            <tr>
              <th className="px-2 py-2 text-left text-[10px] font-bold uppercase tracking-wider" style={{ color: '#5A7A9A' }}>
                Origem ↓ / Canal →
              </th>
              {channels.map(ch => (
                <th key={ch.key} className="px-2 py-2 text-center text-[10px] font-bold uppercase tracking-wider" style={{ color: ch.color }}>
                  <div className="flex items-center justify-center gap-1.5">
                    <span className="h-2 w-2 rounded-full" style={{ background: ch.color }} />
                    {ch.label}
                  </div>
                </th>
              ))}
              <th className="px-2 py-2 text-right text-[10px] font-bold uppercase tracking-wider" style={{ color: '#8AA8C8' }}>
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {origins.map(or => {
              const rowTotal = rowTotals[or.key] ?? 0
              return (
                <tr key={or.key}>
                  <td className="px-2 py-1 whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full" style={{ background: or.color }} />
                      <span style={{ color: '#E8F0FE' }}>{or.label}</span>
                    </div>
                  </td>
                  {channels.map(ch => {
                    const cell = cellMap.get(`${or.key}|${ch.key}`)
                    const value = cell?.totalCents ?? 0
                    const tx    = cell?.transactions ?? 0
                    const inten = intensity(or.key, value)
                    const pctRow = rowTotal > 0 ? value / rowTotal : 0
                    if (value === 0) {
                      return (
                        <td key={ch.key} className="px-2 py-2 text-center font-mono text-[10px]"
                          style={{ background: '#0D1320', borderRadius: 6, color: '#3A4A60' }}>
                          —
                        </td>
                      )
                    }
                    return (
                      <td key={ch.key}
                        className="px-2 py-2 text-center font-mono"
                        style={{
                          background: hexWithAlpha(ch.color, 0.12 + inten * 0.55),
                          color: inten > 0.5 ? '#E8F0FE' : '#8AA8C8',
                          borderRadius: 6,
                        }}
                        title={`${or.label} × ${ch.label} — ${BRL(value)} em ${tx} transação(ões) (${PCT(pctRow)} dessa origem)`}
                      >
                        <div className="text-[11px] font-semibold" style={{ color: '#E8F0FE' }}>
                          {mode === 'pct_row' ? PCT(pctRow) : BRL(value)}
                        </div>
                        <div className="text-[9px]" style={{ color: '#8AA8C8' }}>
                          {NUM(tx)} tx
                        </div>
                      </td>
                    )
                  })}
                  <td className="px-2 py-2 text-right font-mono text-[11px] font-bold" style={{ color: '#E8F0FE' }}>
                    {BRL(rowTotal)}
                  </td>
                </tr>
              )
            })}
            {/* Linha de totais por canal */}
            <tr>
              <td className="px-2 py-2 text-[10px] font-bold uppercase tracking-wider" style={{ color: '#5A7A9A' }}>
                Total
              </td>
              {channels.map(ch => (
                <td key={ch.key} className="px-2 py-2 text-center font-mono text-[11px] font-bold" style={{ color: ch.color }}>
                  {BRL(colTotals[ch.key] ?? 0)}
                </td>
              ))}
              <td className="px-2 py-2 text-right font-mono text-[11px] font-bold" style={{ color: '#00FF94' }}>
                {BRL(grandTotal)}
              </td>
            </tr>
          </tbody>
        </table>
        <p className="text-[10px] mt-3" style={{ color: '#5A7A9A' }}>
          {mode === 'pct_row'
            ? 'Cada célula mostra que % do faturamento daquela origem fechou em cada canal.'
            : 'Cada célula mostra o faturamento — cor mais forte = maior valor.'}
        </p>
      </div>
    </div>
  )
}

function CacByChannelSection({ cac }: { cac: CacByChannel }) {
  if (!cac.available) {
    return (
      <div className="rounded-2xl border" style={{ background: '#111827', borderColor: '#1E2D45' }}>
        <div className="border-b px-6 py-4" style={{ borderColor: '#1E2D45' }}>
          <div className="flex items-center gap-2">
            <div className="h-4 w-1 rounded-full" style={{ background: '#1877F2' }} />
            <h2 className="text-xs font-bold uppercase tracking-widest flex items-center gap-1.5" style={{ color: '#8AA8C8' }}>
              <Target className="h-3.5 w-3.5" />
              CAC por canal (Meta Ads)
            </h2>
          </div>
        </div>
        <p className="p-8 text-center text-sm" style={{ color: '#8AA8C8' }}>
          {cac.unavailableReason ?? 'Dados de Meta Ads indisponíveis no período.'}
        </p>
      </div>
    )
  }

  const noAttribution = cac.metaCustomerCount === 0

  return (
    <div className="rounded-2xl border" style={{ background: '#111827', borderColor: '#1E2D45' }}>
      <div className="border-b px-6 py-4" style={{ borderColor: '#1E2D45' }}>
        <div className="flex items-center gap-2">
          <div className="h-4 w-1 rounded-full" style={{ background: '#1877F2' }} />
          <div>
            <h2 className="text-xs font-bold uppercase tracking-widest flex items-center gap-1.5" style={{ color: '#8AA8C8' }}>
              <Target className="h-3.5 w-3.5" />
              CAC e ROAS por canal (Meta Ads)
            </h2>
            <p className="text-[11px] mt-0.5" style={{ color: '#5A7A9A' }}>
              Cruza gasto Meta com clientes que tinham <code style={{ color: '#8AA8C8' }}>campaign_code</code> preenchido — mostra onde os clientes pagos fecharam.
            </p>
          </div>
        </div>
      </div>

      {/* KPIs do topo */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 p-6 pb-3">
        <div className="rounded-xl border p-4" style={{ background: '#0D1320', borderColor: '#1E2D45' }}>
          <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#5A7A9A' }}>
            Gasto Meta no período
          </p>
          <p className="text-xl font-bold font-mono mt-1" style={{ color: '#E4405F' }}>
            {BRL(cac.spendCents)}
          </p>
        </div>
        <div className="rounded-xl border p-4" style={{ background: '#0D1320', borderColor: '#1E2D45' }}>
          <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#5A7A9A' }}>
            Clientes Meta atribuídos
          </p>
          <p className="text-xl font-bold font-mono mt-1" style={{ color: '#00E5FF' }}>
            {NUM(cac.metaCustomerCount)}
          </p>
          <p className="text-[10px] mt-1" style={{ color: '#8AA8C8' }}>
            com campaign_code que fecharam venda/OS
          </p>
        </div>
        <div className="rounded-xl border p-4" style={{ background: '#0D1320', borderColor: '#1E2D45' }}>
          <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#5A7A9A' }}>
            CAC Meta global
          </p>
          <p className="text-xl font-bold font-mono mt-1" style={{ color: '#FFAA00' }}>
            {noAttribution ? '—' : BRL(cac.cacCents)}
          </p>
          <p className="text-[10px] mt-1" style={{ color: '#8AA8C8' }}>
            gasto ÷ clientes atribuídos
          </p>
        </div>
        <div className="rounded-xl border p-4"
          style={{
            background: cac.globalRoas >= 1 ? 'rgba(0,255,148,.06)' : 'rgba(255,77,109,.08)',
            borderColor: cac.globalRoas >= 1 ? 'rgba(0,255,148,.3)' : 'rgba(255,77,109,.3)',
          }}>
          <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#5A7A9A' }}>
            ROAS global
          </p>
          <p className="text-xl font-bold font-mono mt-1" style={{ color: cac.globalRoas >= 1 ? '#00FF94' : '#FF4D6D' }}>
            {noAttribution ? '—' : `${cac.globalRoas.toFixed(2)}×`}
          </p>
          <p className="text-[10px] mt-1" style={{ color: '#8AA8C8' }}>
            {BRL(cac.totalAttributedRevenueCents)} de receita atribuída
          </p>
        </div>
      </div>

      {/* Aviso se não tem atribuição */}
      {noAttribution && (
        <div className="mx-6 mb-4 rounded-lg border p-3 flex items-start gap-2 text-[11px]"
          style={{ background: 'rgba(255,170,0,.05)', borderColor: 'rgba(255,170,0,.25)', color: '#8AA8C8' }}>
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{ color: '#FFAA00' }} />
          <span>
            Nenhuma venda/OS atribuída a Meta no período. Verifique se o atendente está preenchendo
            o <strong style={{ color: '#FFAA00' }}>campaign_code</strong> ao cadastrar clientes vindos de anúncios.
          </span>
        </div>
      )}

      {/* Tabela por canal */}
      {!noAttribution && cac.byChannel.length > 0 && (
        <div className="overflow-x-auto px-6 pb-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left" style={{ borderColor: '#1E2D45' }}>
                {['Canal', 'Clientes Meta', '% do Meta', 'Receita atribuída', 'ROAS canal'].map(h => (
                  <th key={h} className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider" style={{ color: '#5A7A9A' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cac.byChannel.map(c => (
                <tr key={c.channel} className="border-b hover:bg-white/[0.02] transition-colors" style={{ borderColor: 'rgba(30,45,69,.5)' }}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full shrink-0" style={{ background: c.color }} />
                      <span className="font-medium" style={{ color: '#E8F0FE' }}>{c.label}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono" style={{ color: '#8AA8C8' }}>{NUM(c.customers)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 rounded overflow-hidden max-w-[120px]" style={{ background: '#0D1320' }}>
                        <div className="h-full" style={{
                          width: `${c.pctCustomers * 100}%`,
                          background: `linear-gradient(90deg, ${c.color}66, ${c.color})`,
                        }} />
                      </div>
                      <span className="text-[11px] font-mono" style={{ color: '#8AA8C8' }}>{PCT(c.pctCustomers)}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono font-semibold" style={{ color: c.color }}>
                    {BRL(c.revenueCents)}
                  </td>
                  <td className="px-4 py-3 font-mono font-semibold" style={{ color: c.roas >= 1 ? '#00FF94' : '#FF4D6D' }}>
                    {c.roas.toFixed(2)}×
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[10px] mt-3" style={{ color: '#5A7A9A' }}>
            ROAS canal = receita atribuída do canal ÷ gasto Meta total. Soma dos ROAS dos canais = ROAS global.
          </p>
        </div>
      )}
    </div>
  )
}

/** Aceita um hex #RRGGBB e devolve rgba(r,g,b,alpha). */
function hexWithAlpha(hex: string, alpha: number): string {
  const m = hex.replace('#', '')
  const r = parseInt(m.slice(0, 2), 16)
  const g = parseInt(m.slice(2, 4), 16)
  const b = parseInt(m.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, alpha))})`
}

function DailyChartSection({
  daily,
}: {
  daily: { date: string; onlineCents: number; fisicaCents: number; onlineProfitCents: number; fisicaProfitCents: number }[]
}) {
  const [metric, setMetric] = useState<BreakEvenMetric>('revenue')

  const width  = 800
  const height = 260
  const padL   = 60
  const padR   = 20
  const padT   = 20
  const padB   = 40
  const innerW = width  - padL - padR
  const innerH = height - padT - padB

  const series = daily.map(d => ({
    date:   d.date,
    online: metric === 'profit' ? d.onlineProfitCents : d.onlineCents,
    fisica: metric === 'profit' ? d.fisicaProfitCents : d.fisicaCents,
  }))

  // Em modo lucro pode haver valores negativos. Eixo y precisa ir do mínimo ao máximo,
  // com baseline em zero quando aparecer negativo.
  const allVals  = series.flatMap(d => [d.online, d.fisica])
  const maxVal   = Math.max(0, ...allVals, 1)
  const minVal   = Math.min(0, ...allVals)
  const range    = maxVal - minVal || 1
  const barGroupW = innerW / Math.max(1, series.length)
  const barW = Math.max(2, (barGroupW / 2) - 2)

  const xBase  = (i: number) => padL + i * barGroupW
  const yScale = (v: number) => padT + innerH - ((v - minVal) / range) * innerH
  const yZero  = yScale(0)
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(t => ({
    value: minVal + range * t,
    y:     padT + innerH - t * innerH,
  }))
  const xStep  = Math.max(1, Math.ceil(series.length / 10))
  const fmtShortDate = (iso: string) => iso.slice(5).replace('-', '/')
  const metricLabel = metric === 'profit' ? 'Lucro' : 'Faturamento'

  return (
    <div className="rounded-2xl border p-6 space-y-3" style={{ background: '#111827', borderColor: '#1E2D45' }}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="h-4 w-1 rounded-full" style={{ background: '#00FF94' }} />
          <h2 className="text-xs font-bold uppercase tracking-widest" style={{ color: '#8AA8C8' }}>
            Evolução diária — Online vs Física ({metricLabel.toLowerCase()})
          </h2>
        </div>
        <ToggleGroup
          label="Métrica"
          options={[
            { v: 'revenue', label: 'Faturamento' },
            { v: 'profit',  label: 'Lucro' },
          ]}
          value={metric}
          onChange={setMetric}
          activeColor="#00FF94"
        />
      </div>
      <div className="rounded-xl border p-4" style={{ background: '#0D1320', borderColor: '#1E2D45' }}>
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full" preserveAspectRatio="xMidYMid meet">
          {yTicks.map(t => (
            <line key={t.y}
              x1={padL} y1={t.y} x2={width - padR} y2={t.y}
              stroke="#1E2D45" strokeWidth="1" strokeDasharray="2 3"
            />
          ))}
          {/* Linha do zero destacada quando há valores negativos */}
          {minVal < 0 && (
            <line x1={padL} y1={yZero} x2={width - padR} y2={yZero}
              stroke="#5A7A9A" strokeWidth="1" />
          )}

          {series.map((d, i) => {
            const x = xBase(i) + 2
            const yOnline  = yScale(d.online)
            const yFisica  = yScale(d.fisica)
            const hOnline  = Math.abs(yOnline - yZero)
            const hFisica  = Math.abs(yFisica - yZero)
            const yOnTop   = Math.min(yOnline, yZero)
            const yFiTop   = Math.min(yFisica, yZero)
            return (
              <g key={i}>
                <rect
                  x={x}
                  y={yOnTop}
                  width={barW}
                  height={Math.max(1, hOnline)}
                  fill={d.online < 0 ? '#FF4D6D' : '#00E5FF'}
                  opacity="0.85"
                >
                  <title>{`${d.date}: Online ${metricLabel} ${BRL(d.online)}`}</title>
                </rect>
                <rect
                  x={x + barW + 2}
                  y={yFiTop}
                  width={barW}
                  height={Math.max(1, hFisica)}
                  fill={d.fisica < 0 ? '#FF4D6D' : '#FFAA00'}
                  opacity="0.85"
                >
                  <title>{`${d.date}: Física ${metricLabel} ${BRL(d.fisica)}`}</title>
                </rect>
              </g>
            )
          })}

          {yTicks.map(t => (
            <text key={`ylbl-${t.y}`}
              x={padL - 8} y={t.y + 3}
              textAnchor="end" fontSize="10" fill="#5A7A9A" fontFamily="ui-monospace,monospace"
            >
              {BRL(Math.round(t.value))}
            </text>
          ))}

          {series.map((d, i) => (i % xStep === 0 || i === series.length - 1) && (
            <text key={`xlbl-${i}`}
              x={xBase(i) + barGroupW / 2} y={height - 15}
              textAnchor="middle" fontSize="10" fill="#5A7A9A" fontFamily="ui-monospace,monospace"
            >
              {fmtShortDate(d.date)}
            </text>
          ))}
        </svg>
        <div className="mt-2 flex items-center justify-center gap-4 text-[11px]">
          <span className="inline-flex items-center gap-1.5" style={{ color: '#8AA8C8' }}>
            <span className="h-2.5 w-2.5 rounded" style={{ background: '#00E5FF' }} /> Online
          </span>
          <span className="inline-flex items-center gap-1.5" style={{ color: '#8AA8C8' }}>
            <span className="h-2.5 w-2.5 rounded" style={{ background: '#FFAA00' }} /> Física
          </span>
          {minVal < 0 && (
            <span className="inline-flex items-center gap-1.5" style={{ color: '#8AA8C8' }}>
              <span className="h-2.5 w-2.5 rounded" style={{ background: '#FF4D6D' }} /> Lucro negativo (prejuízo)
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

function KpiCard({
  label, value, sub, color, icon: Icon,
}: {
  label: string; value: string; sub: string
  color: string; icon: React.ElementType
}) {
  return (
    <div className="rounded-2xl border p-5 relative overflow-hidden" style={{ background: '#111827', borderColor: '#1E2D45' }}>
      <div className="absolute -right-4 -top-4 h-20 w-20 rounded-full opacity-15"
        style={{ background: `radial-gradient(circle, ${color}, transparent)` }} />
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#5A7A9A' }}>{label}</span>
        <Icon className="h-4 w-4" style={{ color }} />
      </div>
      <div className="text-2xl font-bold tracking-tight" style={{ color, fontFamily: 'ui-monospace,monospace' }}>{value}</div>
      <div className="mt-1 text-[11px]" style={{ color: '#5A7A9A' }}>{sub}</div>
    </div>
  )
}

// Suprime warning do TS se algum dia usarmos ArrowRight
void ArrowRight
