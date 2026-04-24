'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Settings, TrendingUp, DollarSign, Eye, MousePointer, Target,
  AlertTriangle, ExternalLink, CheckCircle2,
} from 'lucide-react'
import type {
  MetaAdsCredentialsSafe, MetaAdsInsights, MetaAdsCampaign, MetaAdsPeriod,
} from '@/actions/meta-ads'
import type { OriginTotals } from './page'

const BRL = (c: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(c / 100)

const NUM = (n: number) =>
  new Intl.NumberFormat('pt-BR').format(n)

type Props = {
  period: MetaAdsPeriod
  credentials: MetaAdsCredentialsSafe
  insights: MetaAdsInsights | null
  campaigns: MetaAdsCampaign[]
  loadError: string | null
  originRevenue: OriginTotals
}

export function MetaAdsDashboard({
  period, credentials, insights, campaigns, loadError, originRevenue,
}: Props) {
  const router = useRouter()

  const periodOptions: { v: MetaAdsPeriod; label: string }[] = [
    { v: 'today',     label: 'Hoje' },
    { v: 'yesterday', label: 'Ontem' },
    { v: '7d',        label: '7d' },
    { v: '30d',       label: '30d' },
    { v: '90d',       label: '90d' },
  ]

  // ROAS — cruzamento: faturamento atribuído / gasto
  const metaRevenueCents = originRevenue.igPagoCents + originRevenue.igOrgCents + originRevenue.facebookCents
  const spendCents       = insights?.spendCents ?? 0
  const roas             = spendCents > 0 ? metaRevenueCents / spendCents : 0
  const returnPerReal    = spendCents > 0 ? (metaRevenueCents / spendCents).toFixed(2) : '—'

  const statusColor = (s: string) => {
    if (s === 'ACTIVE')  return { c: '#00FF94', bg: 'rgba(0,255,148,.15)', label: 'Ativa' }
    if (s === 'PAUSED')  return { c: '#FFAA00', bg: 'rgba(255,170,0,.15)', label: 'Pausada' }
    if (s === 'DELETED' || s === 'ARCHIVED') return { c: '#5A7A9A', bg: 'rgba(90,122,154,.15)', label: s === 'DELETED' ? 'Excluída' : 'Arquivada' }
    return { c: '#8AA8C8', bg: 'rgba(138,168,200,.15)', label: s }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#E8F0FE' }}>Meta Ads</h1>
          <p className="mt-1 text-sm" style={{ color: '#5A7A9A' }}>
            Conta: <span className="font-mono">{credentials.adAccountId}</span>
            {credentials.lastSyncAt && <> · Última sync: {new Date(credentials.lastSyncAt).toLocaleString('pt-BR')}</>}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex gap-1 rounded-xl p-1" style={{ background: '#111827', border: '1px solid #1E2D45' }}>
            {periodOptions.map(p => (
              <button
                key={p.v}
                onClick={() => router.push(`/meta-ads?period=${p.v}`)}
                className="rounded-lg px-3 py-1.5 text-xs font-bold transition-all"
                style={period === p.v
                  ? { background: '#E4405F', color: '#fff' }
                  : { color: '#5A7A9A' }
                }
              >
                {p.label}
              </button>
            ))}
          </div>
          <Link
            href="/meta-ads/configuracoes"
            className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors hover:bg-white/5"
            style={{ borderColor: '#1E2D45', color: '#00E5FF' }}
          >
            <Settings className="h-3.5 w-3.5" />
            Configurações
          </Link>
        </div>
      </div>

      {/* Erro de carregamento */}
      {loadError && (
        <div className="rounded-xl border px-4 py-3 flex items-start gap-2"
          style={{ background: 'rgba(255,77,109,.08)', borderColor: 'rgba(255,77,109,.3)' }}>
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" style={{ color: '#FF4D6D' }} />
          <div className="flex-1">
            <p className="text-sm font-semibold" style={{ color: '#E8F0FE' }}>Erro ao carregar dados da Meta</p>
            <p className="text-xs font-mono mt-1" style={{ color: '#FF4D6D' }}>{loadError}</p>
            <p className="text-xs mt-2" style={{ color: '#8AA8C8' }}>
              Tokens de longa duração expiram em 60 dias.{' '}
              <Link href="/meta-ads/configuracoes" className="underline" style={{ color: '#00E5FF' }}>
                Revise suas credenciais
              </Link>
              {' '}ou teste a conexão.
            </p>
          </div>
        </div>
      )}

      {/* KPIs principais */}
      {insights && (
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <KpiCard
            label="Investido"
            value={BRL(insights.spendCents)}
            sub={`${insights.dateStart} – ${insights.dateEnd}`}
            color="#E4405F"
            icon={DollarSign}
          />
          <KpiCard
            label="Impressões"
            value={NUM(insights.impressions)}
            sub={`Alcance: ${NUM(insights.reach)} · Freq: ${insights.frequency.toFixed(1)}`}
            color="#00E5FF"
            icon={Eye}
          />
          <KpiCard
            label="Cliques"
            value={NUM(insights.clicks)}
            sub={`CTR: ${insights.ctr.toFixed(2)}%`}
            color="#FFAA00"
            icon={MousePointer}
          />
          <KpiCard
            label="CPC / CPM"
            value={BRL(insights.cpcCents)}
            sub={`CPM: ${BRL(insights.cpmCents)}`}
            color="#9B6DFF"
            icon={Target}
          />
        </div>
      )}

      {/* ROAS — destaque */}
      {insights && (
        <div className="rounded-2xl border p-6" style={{ background: '#111827', borderColor: '#1E2D45' }}>
          <div className="flex items-center gap-2 mb-4">
            <div className="h-4 w-1 rounded-full" style={{ background: '#00FF94' }} />
            <div>
              <h2 className="text-xs font-bold uppercase tracking-widest" style={{ color: '#8AA8C8' }}>ROAS Real</h2>
              <p className="text-[11px]" style={{ color: '#5A7A9A' }}>
                Gasto no Meta × Faturamento atribuído aos canais <strong>Instagram Pago</strong>, <strong>Instagram Orgânico</strong> e <strong>Facebook</strong>
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            <div className="rounded-xl border p-5" style={{ background: '#0D1320', borderColor: '#1E2D45' }}>
              <div className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#5A7A9A' }}>Investido</div>
              <div className="text-2xl font-bold mt-1" style={{ color: '#E4405F', fontFamily: 'ui-monospace,monospace' }}>
                {BRL(insights.spendCents)}
              </div>
              <div className="text-[11px] mt-1" style={{ color: '#5A7A9A' }}>em Meta Ads</div>
            </div>

            <div className="rounded-xl border p-5" style={{ background: '#0D1320', borderColor: '#1E2D45' }}>
              <div className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#5A7A9A' }}>Retornou</div>
              <div className="text-2xl font-bold mt-1" style={{ color: '#00FF94', fontFamily: 'ui-monospace,monospace' }}>
                {BRL(metaRevenueCents)}
              </div>
              <div className="text-[11px] mt-1" style={{ color: '#5A7A9A' }}>{originRevenue.txCount} venda(s)/OS atribuídas</div>
            </div>

            <div className="rounded-xl border p-5 relative overflow-hidden"
              style={{ background: '#0D1320', borderColor: roas >= 1 ? 'rgba(0,255,148,.4)' : 'rgba(255,77,109,.4)' }}>
              <div className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#5A7A9A' }}>ROAS</div>
              <div className="text-2xl font-bold mt-1" style={{ color: roas >= 1 ? '#00FF94' : '#FF4D6D', fontFamily: 'ui-monospace,monospace' }}>
                {returnPerReal === '—' ? '—' : `${returnPerReal}x`}
              </div>
              <div className="text-[11px] mt-1" style={{ color: '#5A7A9A' }}>
                {spendCents > 0 && metaRevenueCents > 0
                  ? `R$ 1 investido → ${BRL(metaRevenueCents / (spendCents / 100))}`
                  : 'Sem dados suficientes'}
              </div>
            </div>
          </div>

          {/* Breakdown por canal */}
          <div className="mt-4 pt-4 border-t space-y-2" style={{ borderColor: '#1E2D45' }}>
            <div className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#5A7A9A' }}>
              Faturamento por canal no período
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <ChannelRow label="Instagram Pago" value={originRevenue.igPagoCents}  color="#E4405F" />
              <ChannelRow label="Instagram Orgânico" value={originRevenue.igOrgCents} color="#C13584" />
              <ChannelRow label="Facebook" value={originRevenue.facebookCents} color="#1877F2" />
            </div>
          </div>

          <div className="mt-4 flex items-start gap-2 text-[11px] rounded-lg px-3 py-2"
            style={{ background: 'rgba(0,229,255,.05)', borderLeft: '2px solid #00E5FF', color: '#8AA8C8' }}>
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5" style={{ color: '#00E5FF' }} />
            <span>
              O ROAS usa a origem do cliente (&quot;Como nos conheceu?&quot;) pra atribuir o faturamento. Quanto mais clientes cadastrados com origem correta, mais preciso fica.
            </span>
          </div>
        </div>
      )}

      {/* Campanhas */}
      <div className="rounded-2xl border" style={{ background: '#111827', borderColor: '#1E2D45' }}>
        <div className="flex items-center justify-between border-b px-6 py-4" style={{ borderColor: '#1E2D45' }}>
          <div className="flex items-center gap-2">
            <div className="h-4 w-1 rounded-full" style={{ background: '#E4405F' }} />
            <div>
              <p className="text-xs font-bold uppercase tracking-widest" style={{ color: '#8AA8C8' }}>Campanhas</p>
              <p className="text-[11px]" style={{ color: '#5A7A9A' }}>Performance por campanha no período</p>
            </div>
          </div>
          {campaigns.length > 0 && (
            <span className="text-[11px] rounded-full px-2.5 py-1 font-bold"
              style={{ background: 'rgba(228,64,95,.1)', color: '#E4405F' }}>
              {campaigns.length} campanha(s)
            </span>
          )}
        </div>
        <div className="overflow-x-auto">
          {campaigns.length === 0 ? (
            <p className="p-10 text-center text-sm" style={{ color: '#5A7A9A' }}>
              {loadError ? 'Verifique a conexão pra ver as campanhas' : 'Nenhuma campanha no período'}
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left" style={{ borderColor: '#1E2D45' }}>
                  {['Campanha', 'Status', 'Objetivo', 'Investido', 'Impressões', 'Cliques', 'CTR', 'CPC'].map(h => (
                    <th key={h} className="px-5 py-3 text-[10px] font-bold uppercase tracking-wider" style={{ color: '#5A7A9A' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {campaigns
                  .sort((a, b) => b.spendCents - a.spendCents)
                  .map(c => {
                    const s = statusColor(c.status)
                    return (
                      <tr key={c.id} className="border-b hover:bg-white/[0.02] transition-colors" style={{ borderColor: 'rgba(30,45,69,.5)' }}>
                        <td className="px-5 py-3">
                          <p className="font-medium text-sm" style={{ color: '#E8F0FE' }}>{c.name}</p>
                          <p className="text-[10px] font-mono mt-0.5" style={{ color: '#5A7A9A' }}>ID: {c.id}</p>
                        </td>
                        <td className="px-5 py-3">
                          <span className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                            style={{ background: s.bg, color: s.c }}>
                            {s.label}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-xs" style={{ color: '#8AA8C8' }}>
                          {c.objective ?? '—'}
                        </td>
                        <td className="px-5 py-3 font-mono font-semibold" style={{ color: '#E4405F' }}>
                          {BRL(c.spendCents)}
                        </td>
                        <td className="px-5 py-3 font-mono" style={{ color: '#8AA8C8' }}>
                          {NUM(c.impressions)}
                        </td>
                        <td className="px-5 py-3 font-mono" style={{ color: '#8AA8C8' }}>
                          {NUM(c.clicks)}
                        </td>
                        <td className="px-5 py-3 font-mono" style={{ color: c.ctr >= 2 ? '#00FF94' : c.ctr >= 1 ? '#FFAA00' : '#FF4D6D' }}>
                          {c.ctr.toFixed(2)}%
                        </td>
                        <td className="px-5 py-3 font-mono" style={{ color: '#8AA8C8' }}>
                          {BRL(c.cpcCents)}
                        </td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Rodapé com link útil */}
      <div className="flex items-center justify-center gap-2 text-[11px]" style={{ color: '#5A7A9A' }}>
        <a
          href={`https://business.facebook.com/adsmanager/manage/campaigns?act=${credentials.adAccountId.replace('act_', '')}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 transition-colors hover:text-[#00E5FF]"
        >
          <ExternalLink className="h-3 w-3" />
          Abrir no Ads Manager
        </a>
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

function ChannelRow({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-lg border p-3" style={{ background: '#111827', borderColor: '#1E2D45' }}>
      <div className="flex items-center gap-2 mb-1">
        <span className="h-2 w-2 rounded-full" style={{ background: color }} />
        <span className="text-[11px]" style={{ color: '#8AA8C8' }}>{label}</span>
      </div>
      <div className="font-mono font-bold text-sm" style={{ color }}>
        {BRL(value)}
      </div>
    </div>
  )
}
