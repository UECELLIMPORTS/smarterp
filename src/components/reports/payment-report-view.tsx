// Tela do relatório de formas de pagamento (OS do CheckSmart + PDV do Gestão Smart).
// ARQUIVO IDÊNTICO em ~/checksmart e ~/smarterp (src/components/reports/payment-report-view.tsx).

import type { PaymentReport, PayKey } from '@/lib/payment-report'
import { PAY_LABEL, PAY_COLOR } from '@/lib/payment-report'

const BRL = (c: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(c / 100)
const PCT = (p: number) => `${p.toFixed(p > 0 && p < 10 ? 1 : 0).replace('.', ',')}%`

const C = {
  card:   { background: '#131C2A', border: '1px solid #2A3650' },
  title:  '#F8FAFC',
  muted:  '#94A3B8',
  dim:    '#64748B',
  line:   '#2A3650',
}

function Kpi({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="rounded-xl p-4" style={C.card}>
      <p className="text-[11px] uppercase tracking-wider" style={{ color: C.dim }}>{label}</p>
      <p className="mt-1 text-xl font-bold" style={{ color: color ?? C.title }}>{value}</p>
      {sub && <p className="mt-0.5 text-xs" style={{ color: C.muted }}>{sub}</p>}
    </div>
  )
}

function Dot({ k }: { k: PayKey }) {
  return <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: PAY_COLOR[k] }} />
}

export function PaymentReportView({ report }: { report: PaymentReport }) {
  const { rows, weekdays, installments, keysInUse, totalCents, count } = report
  const top    = rows[0]
  const pix    = rows.find(r => r.key === 'pix')
  const cardC  = rows.filter(r => r.key === 'credit' || r.key === 'debit' || r.key === 'card')
  const cardCents = cardC.reduce((a, r) => a + r.cents, 0)
  const bestDay = [...weekdays].sort((a, b) => b.cents - a.cents)[0]
  const none   = rows.find(r => r.key === 'none')
  const cardNoType = rows.find(r => r.key === 'card')
  const showBoth = report.source === 'total'

  if (!count) {
    return (
      <div className="rounded-xl p-8 text-center text-sm" style={{ ...C.card, color: C.muted }}>
        Nenhum recebimento no período.
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {(!report.os.ok || !report.sales.ok) && (
        <p className="rounded-lg px-3 py-2 text-xs" style={{ background: '#3B1D1D', color: '#FCA5A5' }}>
          Não foi possível ler {!report.os.ok ? 'as OS do CheckSmart' : 'as vendas do Gestão Smart'}: os números abaixo estão incompletos.
        </p>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi label="Total recebido" value={BRL(totalCents)}
          sub={showBoth ? `OS ${BRL(report.os.cents)} · PDV ${BRL(report.sales.cents)}` : undefined} />
        <Kpi label="Transações" value={String(count)} sub={`Ticket médio ${BRL(Math.round(totalCents / count))}`} />
        <Kpi label="Forma nº 1" value={top ? PAY_LABEL[top.key] : '—'} color={top ? PAY_COLOR[top.key] : undefined}
          sub={top ? `${PCT(top.pctCents)} do valor · ${top.count} transações` : undefined} />
        <Kpi label="Total em PIX" value={BRL(pix?.cents ?? 0)} color={PAY_COLOR.pix}
          sub={`${PCT(pix?.pctCents ?? 0)} do valor · ${pix?.count ?? 0} transações`} />
        <Kpi label="Total em cartão" value={BRL(cardCents)} color={PAY_COLOR.credit}
          sub={`${PCT(totalCents ? (100 * cardCents) / totalCents : 0)} do valor`} />
      </div>

      {report.hasFees ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <Kpi label="Taxas da maquininha (estimado)" value={BRL(report.feeCents)} color="#F59E0B"
            sub={`${PCT(totalCents ? (100 * report.feeCents) / totalCents : 0)} do total · ${PCT(cardCents ? (100 * report.feeCents) / cardCents : 0)} do cartão`} />
          <Kpi label="Líquido recebido" value={BRL(report.netCents)} color="#22C55E" sub="Total menos as taxas" />
          <Kpi label="Taxa média por venda no cartão" value={BRL(cardC.reduce((a, r) => a + r.count, 0) ? Math.round(report.feeCents / cardC.reduce((a, r) => a + r.count, 0)) : 0)}
            sub="Quanto a maquininha leva, em média, de cada cartão" />
        </div>
      ) : (
        <p className="rounded-lg px-3 py-2 text-xs" style={{ ...C.card, color: C.muted }}>
          💡 Cadastre as taxas da maquininha em Configurações para ver quanto você paga de taxa e o líquido recebido.
        </p>
      )}

      {/* Por forma de pagamento */}
      <div className="rounded-xl p-4" style={C.card}>
        <h2 className="text-sm font-bold" style={{ color: C.title }}>Por forma de pagamento</h2>
        <p className="mb-3 text-xs" style={{ color: C.muted }}>Quantidade, valor e participação de cada forma</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider" style={{ color: C.dim }}>
                <th className="py-2 pr-3">Forma</th>
                <th className="py-2 pr-3 text-right">Qtde</th>
                <th className="py-2 pr-3 text-right">% qtde</th>
                <th className="py-2 pr-3 text-right">Valor</th>
                <th className="py-2 pr-3">% do valor</th>
                <th className="py-2 pr-3 text-right">Ticket</th>
                {report.hasFees && <th className="py-2 pr-3 text-right">Taxa</th>}
                {showBoth && <th className="py-2 pr-3 text-right">CheckSmart (OS)</th>}
                {showBoth && <th className="py-2 text-right">Gestão Smart (PDV)</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.key} style={{ borderTop: `1px solid ${C.line}`, color: C.title }}>
                  <td className="py-2 pr-3"><span className="inline-flex items-center gap-2"><Dot k={r.key} />{r.label}</span></td>
                  <td className="py-2 pr-3 text-right font-semibold">{r.count}</td>
                  <td className="py-2 pr-3 text-right" style={{ color: C.muted }}>{PCT(r.pctCount)}</td>
                  <td className="py-2 pr-3 text-right font-semibold">{BRL(r.cents)}</td>
                  <td className="py-2 pr-3">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-24 overflow-hidden rounded-full" style={{ background: '#0B1220' }}>
                        <div className="h-full rounded-full" style={{ width: `${Math.max(2, r.pctCents)}%`, background: r.color }} />
                      </div>
                      <span className="text-xs" style={{ color: C.muted }}>{PCT(r.pctCents)}</span>
                    </div>
                  </td>
                  <td className="py-2 pr-3 text-right" style={{ color: C.muted }}>{BRL(r.ticketCents)}</td>
                  {report.hasFees && <td className="py-2 pr-3 text-right" style={{ color: r.feeCents ? '#F59E0B' : C.dim }}>{r.feeCents ? BRL(r.feeCents) : '—'}</td>}
                  {showBoth && <td className="py-2 pr-3 text-right text-xs" style={{ color: C.muted }}>{r.os.count} · {BRL(r.os.cents)}</td>}
                  {showBoth && <td className="py-2 text-right text-xs" style={{ color: C.muted }}>{r.sales.count} · {BRL(r.sales.cents)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Dia da semana */}
      <div className="rounded-xl p-4" style={C.card}>
        <h2 className="text-sm font-bold" style={{ color: C.title }}>Por dia da semana</h2>
        <p className="mb-3 text-xs" style={{ color: C.muted }}>
          Em que dia as pessoas pagam com cada forma
          {bestDay && bestDay.cents > 0 && <> · dia que mais recebe: <b style={{ color: C.title }}>{bestDay.label}</b> ({BRL(bestDay.cents)})</>}
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider" style={{ color: C.dim }}>
                <th className="py-2 pr-3">Dia</th>
                <th className="py-2 pr-3 text-right">Total</th>
                {keysInUse.map(k => (
                  <th key={k} className="py-2 pr-3 text-right"><span className="inline-flex items-center gap-1.5"><Dot k={k} />{PAY_LABEL[k].replace('Cartão de ', '').replace(' (PDV, sem tipo)', '')}</span></th>
                ))}
                <th className="py-2 text-right">Mais usada</th>
              </tr>
            </thead>
            <tbody>
              {weekdays.map(w => {
                const isBest = bestDay && w.dow === bestDay.dow && w.cents > 0
                return (
                  <tr key={w.dow} style={{ borderTop: `1px solid ${C.line}`, color: C.title, background: isBest ? 'rgba(34,197,94,0.06)' : undefined }}>
                    <td className="py-2 pr-3 font-semibold">
                      {w.label}
                      <span className="ml-1 text-[10px] font-normal" style={{ color: C.dim }}>{w.days}× no período</span>
                    </td>
                    <td className="py-2 pr-3 text-right">
                      <b>{BRL(w.cents)}</b>
                      <span className="block text-[11px]" style={{ color: C.dim }}>{w.count} transações</span>
                    </td>
                    {keysInUse.map(k => {
                      const c = w.byKey[k]
                      const pct = w.cents && c ? (100 * c.cents) / w.cents : 0
                      return (
                        <td key={k} className="py-2 pr-3 text-right">
                          {c ? (
                            <>
                              <span>{c.count}× · {BRL(c.cents)}</span>
                              <span className="block text-[11px]" style={{ color: C.dim }}>{PCT(pct)} do dia</span>
                            </>
                          ) : <span style={{ color: C.dim }}>—</span>}
                        </td>
                      )
                    })}
                    <td className="py-2 text-right">
                      {w.topKey ? <span className="inline-flex items-center gap-1.5"><Dot k={w.topKey} />{PAY_LABEL[w.topKey]}</span> : <span style={{ color: C.dim }}>—</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Parcelas do crédito */}
      {installments.length > 0 && (
        <div className="rounded-xl p-4" style={C.card}>
          <h2 className="text-sm font-bold" style={{ color: C.title }}>Crédito por número de parcelas</h2>
          <p className="mb-3 text-xs" style={{ color: C.muted }}>Quanto mais parcelas, maior a taxa da maquininha</p>
          <div className="flex flex-wrap gap-2">
            {installments.map(i => (
              <div key={i.n} className="rounded-lg px-3 py-2" style={{ background: '#0B1220', border: `1px solid ${C.line}` }}>
                <p className="text-xs font-bold" style={{ color: i.n ? PAY_COLOR.credit : C.dim }}>{i.n ? `${i.n}x` : 'Parcelas não informadas'}</p>
                <p className="text-sm font-semibold" style={{ color: C.title }}>{BRL(i.cents)}</p>
                <p className="text-[11px]" style={{ color: C.dim }}>{i.count} transações · {PCT(i.pctCents)} do crédito</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Observações */}
      <div className="space-y-1 text-[11px]" style={{ color: C.dim }}>
        {none && <p>⚠️ {none.count} recebimento(s) sem forma de pagamento ou pendente ({BRL(none.cents)}). Preencha na OS/venda para o relatório ficar exato.</p>}
        {cardNoType && <p>⚠️ {cardNoType.count} venda(s) do PDV gravadas só como &quot;cartão&quot;, sem dizer se foi débito ou crédito (taxa não calculada).</p>}
        {report.hasFees && report.creditNoInst > 0 && <p>⚠️ {report.creditNoInst} venda(s) no crédito sem número de parcelas: a taxa foi calculada como 1x.</p>}
        {report.hasFees && <p>Taxas estimadas com as taxas cadastradas em Configurações; o valor real pode variar um pouco por bandeira.</p>}
        <p>OS entram pela data de recebimento do aparelho; OS com valor zero (retorno/garantia) e canceladas ficam de fora. Pagamento misto do PDV é dividido entre as formas usadas.</p>
      </div>
    </div>
  )
}
