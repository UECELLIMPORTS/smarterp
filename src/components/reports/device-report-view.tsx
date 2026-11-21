// Tela do relatório iPhone x Android (OS do CheckSmart + gasto de anúncio do Gestão Smart).
// ARQUIVO IDÊNTICO em ~/checksmart e ~/smarterp (src/components/reports/device-report-view.tsx).

import {
  type DeviceReport, type Source, PLATFORM_LABEL, PLATFORM_COLOR, SOURCE_LABEL,
} from '@/lib/device-report'

const BRL = (c: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(c / 100)
const PCT = (p: number) => `${p.toFixed(p > 0 && p < 10 ? 1 : 0).replace('.', ',')}%`
const MONTH = (m: string) => {
  const [y, mm] = m.split('-')
  return `${['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][Number(mm) - 1]}/${y.slice(2)}`
}

const C = {
  card:  { background: '#131C2A', border: '1px solid #2A3650' },
  title: '#F8FAFC',
  muted: '#94A3B8',
  dim:   '#64748B',
  line:  '#2A3650',
}

function Bar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: '#0B1220' }}>
      <div className="h-full rounded-full" style={{ width: `${Math.max(pct > 0 ? 2 : 0, Math.min(100, pct))}%`, background: color }} />
    </div>
  )
}

export function DeviceReportView({ report }: { report: DeviceReport }) {
  if (!report.count) {
    return <div className="rounded-xl p-8 text-center text-sm" style={{ ...C.card, color: C.muted }}>Nenhuma OS no período.</div>
  }
  const [ios, android] = report.rows
  const sources: Source[] = ['pago', 'organico', 'recorrente']

  return (
    <div className="space-y-5">
      {!report.ok && (
        <p className="rounded-lg px-3 py-2 text-xs" style={{ background: '#3B1D1D', color: '#FCA5A5' }}>
          Não foi possível ler todas as OS: os números abaixo estão incompletos.
        </p>
      )}

      {/* Cartões lado a lado */}
      <div className="grid gap-4 lg:grid-cols-2">
        {report.rows.map(r => {
          const color = PLATFORM_COLOR[r.platform]
          const cacOk = r.cacCents !== null && r.paidProfitPerOs > 0 ? r.cacCents <= r.paidProfitPerOs : null
          return (
            <div key={r.platform} className="rounded-xl p-4 space-y-3" style={{ ...C.card, borderTop: `3px solid ${color}` }}>
              <div className="flex items-baseline justify-between">
                <h2 className="text-base font-bold" style={{ color }}>{PLATFORM_LABEL[r.platform]}</h2>
                <span className="text-xs" style={{ color: C.muted }}>{PCT(r.pctCount)} das OS · {PCT(r.pctProfit)} do lucro</span>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  ['OS', String(r.count)],
                  ['Faturamento', BRL(r.cents)],
                  ['Ticket médio', BRL(r.ticketCents)],
                  ['Lucro por OS', BRL(r.profitPerOs)],
                ].map(([l, v]) => (
                  <div key={l}>
                    <p className="text-[10px] uppercase tracking-wider" style={{ color: C.dim }}>{l}</p>
                    <p className="text-lg font-bold" style={{ color: C.title }}>{v}</p>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2 rounded-lg p-2.5 sm:grid-cols-4" style={{ background: '#0B1220' }}>
                <div>
                  <p className="text-[10px] uppercase tracking-wider" style={{ color: C.dim }}>Gasto em anúncio</p>
                  <p className="text-sm font-bold" style={{ color: C.title }}>{BRL(r.spendCents)}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider" style={{ color: C.dim }}>Clientes novos do anúncio</p>
                  <p className="text-sm font-bold" style={{ color: C.title }}>{r.newPaid}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider" style={{ color: C.dim }}>CAC</p>
                  <p className="text-sm font-bold" style={{ color: cacOk === false ? '#F87171' : cacOk ? '#22C55E' : C.title }}>
                    {r.cacCents !== null ? BRL(r.cacCents) : r.spendCents ? 'sem cliente' : 'sem anúncio'}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider" style={{ color: C.dim }}>CAC máximo</p>
                  <p className="text-sm font-bold" style={{ color: C.muted }}>{r.paidProfitPerOs ? BRL(r.paidProfitPerOs) : '—'}</p>
                </div>
              </div>
              <p className="text-[11px]" style={{ color: C.dim }}>
                CAC máximo = lucro médio da OS que veio do anúncio. Acima disso, a 1ª OS do cliente não paga o anúncio.
              </p>
              <div className="space-y-1.5">
                {sources.map(s => {
                  const c = r.bySource[s]
                  return (
                    <div key={s} className="grid grid-cols-[1fr_auto] items-center gap-x-3 text-xs">
                      <span style={{ color: C.muted }}>{SOURCE_LABEL[s]}</span>
                      <span style={{ color: C.title }}>
                        <b>{c.count}</b> OS · {BRL(c.cents)} · lucro {c.count ? BRL(Math.round(c.profit / c.count)) : '—'}/OS
                      </span>
                      <div className="col-span-2"><Bar pct={r.count ? (100 * c.count) / r.count : 0} color={color} /></div>
                    </div>
                  )
                })}
              </div>
              {r.topModels.length > 0 && (
                <p className="text-[11px]" style={{ color: C.muted }}>
                  <span style={{ color: C.dim }}>Modelos que mais chegam: </span>
                  {r.topModels.map(m => `${m.model} (${m.count})`).join(' · ')}
                </p>
              )}
            </div>
          )
        })}
      </div>

      {/* Comparação direta */}
      <div className="rounded-xl p-4" style={C.card}>
        <h2 className="text-sm font-bold" style={{ color: C.title }}>Comparação direta</h2>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider" style={{ color: C.dim }}>
                <th className="py-2 pr-3"></th>
                <th className="py-2 pr-3 text-right" style={{ color: PLATFORM_COLOR.ios }}>iPhone</th>
                <th className="py-2 pr-3 text-right" style={{ color: PLATFORM_COLOR.android }}>Android</th>
                <th className="py-2 text-right">Diferença</th>
              </tr>
            </thead>
            <tbody style={{ color: C.title }}>
              {([
                ['OS', ios.count, android.count, false],
                ['Ticket médio', ios.ticketCents, android.ticketCents, true],
                ['Lucro por OS', ios.profitPerOs, android.profitPerOs, true],
                ['Lucro por OS do anúncio', ios.paidProfitPerOs, android.paidProfitPerOs, true],
                ['CAC', ios.cacCents ?? 0, android.cacCents ?? 0, true],
              ] as [string, number, number, boolean][]).map(([l, a, b, money]) => (
                <tr key={l} style={{ borderTop: `1px solid ${C.line}` }}>
                  <td className="py-2 pr-3" style={{ color: C.muted }}>{l}</td>
                  <td className="py-2 pr-3 text-right font-semibold">{money ? (a ? BRL(a) : '—') : a}</td>
                  <td className="py-2 pr-3 text-right font-semibold">{money ? (b ? BRL(b) : '—') : b}</td>
                  <td className="py-2 text-right text-xs" style={{ color: C.muted }}>
                    {a && b ? `iPhone ${a >= b ? '+' : ''}${PCT((100 * (a - b)) / b)}` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mês a mês */}
      {report.months.length > 1 && (
        <div className="rounded-xl p-4" style={C.card}>
          <h2 className="text-sm font-bold" style={{ color: C.title }}>Mês a mês</h2>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider" style={{ color: C.dim }}>
                  <th className="py-2 pr-3">Mês</th>
                  <th className="py-2 pr-3 text-right">OS iPhone</th>
                  <th className="py-2 pr-3 text-right">OS Android</th>
                  <th className="py-2 pr-3">% Android</th>
                  <th className="py-2 pr-3 text-right">Lucro iPhone</th>
                  <th className="py-2 text-right">Lucro Android</th>
                </tr>
              </thead>
              <tbody style={{ color: C.title }}>
                {report.months.map(m => {
                  const t = m.ios.count + m.android.count
                  const pa = t ? (100 * m.android.count) / t : 0
                  return (
                    <tr key={m.month} style={{ borderTop: `1px solid ${C.line}` }}>
                      <td className="py-2 pr-3">{MONTH(m.month)}</td>
                      <td className="py-2 pr-3 text-right font-semibold">{m.ios.count}</td>
                      <td className="py-2 pr-3 text-right font-semibold">{m.android.count}</td>
                      <td className="py-2 pr-3">
                        <div className="flex items-center gap-2">
                          <div className="w-20"><Bar pct={pa} color={PLATFORM_COLOR.android} /></div>
                          <span className="text-xs" style={{ color: C.muted }}>{PCT(pa)}</span>
                        </div>
                      </td>
                      <td className="py-2 pr-3 text-right">{BRL(m.ios.profit)}</td>
                      <td className="py-2 text-right">{BRL(m.android.profit)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="space-y-1 rounded-lg px-3 py-2 text-[11px]" style={{ ...C.card, color: C.dim }}>
        <p>• Plataforma pela marca da OS (Apple = iPhone; Samsung, Xiaomi, Motorola etc. = Android). Retornos/garantia e OS de valor zero não entram.</p>
        <p>• Anúncio = cliente com origem &quot;Instagram pago&quot;. Recorrente = cliente que já tinha OS antes. O resto é cliente novo sem anúncio (indicação, passou na porta…).</p>
        {!report.spendSplit && report.spendCents > 0 && (
          <p style={{ color: '#F59E0B' }}>
            • {BRL(report.spendNoPlatformCents)} de gasto foi lançado sem dizer se era campanha de iPhone ou de Android e entrou como iPhone
            (até hoje as campanhas eram quase todas &quot;somente iOS&quot;). Por isso o CAC do Android só fica certo depois que existir campanha de Android lançada separada.
          </p>
        )}
        {report.spendCents === 0 && <p style={{ color: '#F59E0B' }}>• Nenhum gasto de anúncio lançado no período: sem CAC.</p>}
      </div>
    </div>
  )
}
