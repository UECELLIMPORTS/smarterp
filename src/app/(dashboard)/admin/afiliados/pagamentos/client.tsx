'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Download, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { markCommissionsPaid, type PayableSummary } from '@/actions/affiliates-admin'

export function PagamentosClient({ initialList }: { initialList: PayableSummary[] }) {
  const router = useRouter()
  const [selected, setSelected]   = useState<Set<string>>(new Set(initialList.filter(p => !p.belowMinimum).map(p => p.affiliateId)))
  const [includeBelow, setIncludeBelow] = useState(false)
  const [proof, setProof]         = useState('')
  const [pending, startTransition] = useTransition()

  const visible = includeBelow ? initialList : initialList.filter(p => !p.belowMinimum)

  const totals = useMemo(() => {
    let cents = 0, count = 0
    visible.forEach(p => {
      if (selected.has(p.affiliateId)) {
        cents += p.totalCents
        count += p.commissionIds.length
      }
    })
    return { cents, count, affs: visible.filter(p => selected.has(p.affiliateId)).length }
  }, [visible, selected])

  function toggle(id: string) {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  function toggleAll() {
    if (selected.size === visible.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(visible.map(p => p.affiliateId)))
    }
  }

  function downloadCsv() {
    const selectedItems = visible.filter(p => selected.has(p.affiliateId))
    if (selectedItems.length === 0) {
      toast.error('Nenhum afiliado selecionado')
      return
    }
    const lines = [
      ['Nome', 'Email', 'Tipo PIX', 'Chave PIX', 'Valor (R$)', 'Comissões'].join(','),
      ...selectedItems.map(p => [
        csvEscape(p.fullName),
        csvEscape(p.email),
        csvEscape(p.pixKeyType ?? ''),
        csvEscape(p.pixKey ?? ''),
        (p.totalCents / 100).toFixed(2).replace('.', ','),
        p.commissionIds.length.toString(),
      ].join(',')),
    ]
    const csv = lines.join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `pagamento-afiliados-${new Date().toISOString().slice(0,10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function confirmPaid() {
    if (selected.size === 0) {
      toast.error('Selecione ao menos 1 afiliado')
      return
    }
    if (!window.confirm(`Marcar ${totals.count} comissão(ões) de ${totals.affs} afiliado(s) como PAGAS? (${fmtBRL(totals.cents)})\n\nFaça o PIX antes pelo seu app do banco.`)) return

    const allCommissionIds = visible
      .filter(p => selected.has(p.affiliateId))
      .flatMap(p => p.commissionIds)

    startTransition(async () => {
      const res = await markCommissionsPaid(allCommissionIds, proof || undefined)
      if (res.ok) {
        toast.success(`${res.data?.count ?? 0} comissão(ões) marcadas como pagas`)
        router.refresh()
      } else {
        toast.error(res.error)
      }
    })
  }

  if (initialList.length === 0) {
    return (
      <div className="rounded-xl border p-8 text-center text-sm"
        style={{ background: '#131C2A', borderColor: 'rgba(255,255,255,.06)', color: '#94A3B8' }}>
        Não há comissões a pagar agora. Quando o cron diário liberar holds vencidos, vão aparecer aqui.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Sumário fixo */}
      <div className="rounded-xl border p-4 grid grid-cols-3 gap-3 sticky top-2 z-10"
        style={{ background: '#131C2A', borderColor: 'rgba(16,185,129,.3)' }}>
        <div>
          <p className="text-[10px] uppercase tracking-wider" style={{ color: '#94A3B8' }}>Selecionados</p>
          <p className="text-lg font-bold tabular-nums mt-0.5" style={{ color: '#F8FAFC' }}>
            {totals.affs} afiliado(s)
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider" style={{ color: '#94A3B8' }}>Comissões</p>
          <p className="text-lg font-bold tabular-nums mt-0.5" style={{ color: '#F8FAFC' }}>
            {totals.count}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider" style={{ color: '#94A3B8' }}>Total a pagar</p>
          <p className="text-lg font-bold tabular-nums mt-0.5" style={{ color: '#10B981' }}>
            {fmtBRL(totals.cents)}
          </p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={toggleAll}
          className="text-xs hover:underline" style={{ color: '#3B82F6' }}>
          {selected.size === visible.length ? 'Desmarcar todos' : 'Selecionar todos'}
        </button>
        <label className="text-xs inline-flex items-center gap-1.5 ml-auto" style={{ color: '#CBD5E1' }}>
          <input type="checkbox" checked={includeBelow}
            onChange={e => setIncludeBelow(e.target.checked)} />
          Incluir abaixo do mínimo (R$ 30)
        </label>
        <button type="button" onClick={downloadCsv}
          className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs hover:opacity-80"
          style={{ background: 'rgba(59,130,246,.1)', border: '1px solid rgba(59,130,246,.3)', color: '#3B82F6' }}>
          <Download className="h-3 w-3" /> Baixar CSV
        </button>
      </div>

      {/* Lista */}
      <div className="rounded-xl border overflow-hidden"
        style={{ background: '#131C2A', borderColor: 'rgba(255,255,255,.06)' }}>
        <table className="w-full text-sm">
          <thead style={{ background: 'rgba(255,255,255,.03)' }}>
            <tr style={{ color: '#94A3B8' }}>
              <th className="text-left px-3 py-2 text-[10px] uppercase tracking-wider font-medium w-8">✓</th>
              <th className="text-left px-3 py-2 text-[10px] uppercase tracking-wider font-medium">Afiliado</th>
              <th className="text-left px-3 py-2 text-[10px] uppercase tracking-wider font-medium">PIX</th>
              <th className="text-right px-3 py-2 text-[10px] uppercase tracking-wider font-medium">Comiss.</th>
              <th className="text-right px-3 py-2 text-[10px] uppercase tracking-wider font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {visible.map(p => (
              <tr key={p.affiliateId} className="border-t hover:bg-white/5"
                style={{ borderColor: 'rgba(255,255,255,.04)' }}>
                <td className="px-3 py-2.5">
                  <input type="checkbox" checked={selected.has(p.affiliateId)}
                    onChange={() => toggle(p.affiliateId)} />
                </td>
                <td className="px-3 py-2.5">
                  <p className="text-sm" style={{ color: '#F8FAFC' }}>{p.fullName}</p>
                  <p className="text-[11px]" style={{ color: '#94A3B8' }}>{p.email}</p>
                </td>
                <td className="px-3 py-2.5">
                  {p.pixKey ? (
                    <>
                      <p className="font-mono text-xs" style={{ color: '#CBD5E1' }}>{p.pixKey}</p>
                      <p className="text-[10px] uppercase" style={{ color: '#94A3B8' }}>
                        {p.pixKeyType ?? '?'}
                      </p>
                    </>
                  ) : (
                    <span className="text-[11px] inline-flex items-center gap-1" style={{ color: '#EA580C' }}>
                      <AlertTriangle className="h-3 w-3" /> sem PIX
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: '#94A3B8' }}>
                  {p.commissionIds.length}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums font-semibold"
                  style={{ color: p.belowMinimum ? '#EA580C' : '#10B981' }}>
                  {fmtBRL(p.totalCents)}
                  {p.belowMinimum && (
                    <p className="text-[10px] font-normal mt-0.5" style={{ color: '#EA580C' }}>
                      abaixo do mínimo
                    </p>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Confirmar pagamento */}
      <div className="rounded-xl border p-4 space-y-3"
        style={{ background: '#131C2A', borderColor: 'rgba(255,255,255,.06)' }}>
        <p className="text-xs leading-relaxed" style={{ color: '#94A3B8' }}>
          Fluxo: <strong style={{ color: '#10B981' }}>1)</strong> Baixe o CSV →
          <strong style={{ color: '#10B981' }}> 2)</strong> Pague os PIX no app do banco →
          <strong style={{ color: '#10B981' }}> 3)</strong> Volte aqui e marque como pagos.
          <br />
          A marcação é IRREVERSÍVEL e libera o status &quot;paid&quot; nas comissões selecionadas.
        </p>

        <div>
          <label className="text-[10px] uppercase tracking-wider mb-1 block" style={{ color: '#94A3B8' }}>
            Comprovante (opcional)
          </label>
          <input type="text" value={proof} onChange={e => setProof(e.target.value)}
            placeholder="Ex: id da transação ou link do comprovante"
            className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-emerald-500/50 bg-zinc-950 border-zinc-700"
            style={{ color: '#F8FAFC' }} />
        </div>

        <button type="button" onClick={confirmPaid} disabled={pending || selected.size === 0}
          className="w-full inline-flex items-center justify-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ background: '#10B981' }}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          Confirmar pagamento ({fmtBRL(totals.cents)})
        </button>
      </div>
    </div>
  )
}

function csvEscape(s: string): string {
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function fmtBRL(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
