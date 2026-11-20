'use client'

// Componentes das taxas da maquininha: aviso de taxa no pagamento e formulário
// de cadastro nas configurações.
// ARQUIVO IDÊNTICO em ~/checksmart e ~/smarterp (src/components/payments/card-fees-ui.tsx).

import { useState } from 'react'
import {
  type CardFees, MAX_INSTALLMENTS, cardFee, netAfterFee, grossUpForFee, fmtPct,
} from '@/lib/card-fees'

const BRL = (c: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(c / 100)

/** Linha "Taxa X% · você recebe R$ Y" abaixo da escolha de débito/crédito. */
export function CardFeeHint({ fees, kind, installments, amountCents }: {
  fees: CardFees | null; kind: 'credit' | 'debit'; installments?: number; amountCents: number
}) {
  if (!fees) {
    return <p className="text-[11px]" style={{ color: '#64748B' }}>Cadastre as taxas da maquininha em Configurações para ver quanto você recebe.</p>
  }
  const f = cardFee(fees, kind, installments)
  if (!f) return <p className="text-[11px]" style={{ color: '#64748B' }}>Taxa desta opção não cadastrada.</p>
  const fee = amountCents - netAfterFee(amountCents, f.pct)
  return (
    <div className="rounded-md px-2.5 py-1.5 text-[11px] leading-relaxed" style={{ background: '#0B1220', border: '1px solid #2A3650', color: '#94A3B8' }}>
      Taxa {f.estimated ? '≈ ' : ''}<b style={{ color: '#F59E0B' }}>{fmtPct(f.pct)}</b> ({BRL(fee)}) · você recebe <b style={{ color: '#22C55E' }}>{BRL(amountCents - fee)}</b>
      {amountCents > 0 && f.pct > 0 && (
        <span className="block" style={{ color: '#64748B' }}>
          Para receber {BRL(amountCents)} limpo, cobre {BRL(grossUpForFee(amountCents, f.pct))}
          {kind === 'credit' && installments && installments > 1 ? ` (${installments}x de ${BRL(Math.ceil(grossUpForFee(amountCents, f.pct) / installments))})` : ''}
          {f.estimated ? ' · taxa estimada entre as parcelas vizinhas' : ''}
        </span>
      )}
    </div>
  )
}

/** Formulário de taxas (Configurações). Aceita digitar a % ou "quanto recebo de R$ 100". */
export function CardFeesForm({ initial, canEdit, onSave }: {
  initial: CardFees | null
  canEdit: boolean
  onSave: (fees: CardFees) => Promise<{ error?: string }>
}) {
  const toStr = (v: number | null | undefined) => (v === null || v === undefined ? '' : String(v).replace('.', ','))
  const [debit, setDebit] = useState(toStr(initial?.debit))
  const [credit, setCredit] = useState<string[]>(
    Array.from({ length: MAX_INSTALLMENTS }, (_, i) => toStr(initial?.credit[String(i + 1)])),
  )
  const [mode, setMode] = useState<'pct' | 'net'>('pct')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const parse = (s: string): number | null => {
    const t = s.trim().replace('%', '').replace(',', '.')
    if (!t) return null
    const n = Number(t)
    if (!Number.isFinite(n)) return null
    const pct = mode === 'net' ? 100 - n : n       // "recebo 96,96 de 100" → 3,04%
    return pct >= 0 && pct < 100 ? Math.round(pct * 100) / 100 : null
  }
  const show = (s: string) => {
    const p = parse(s)
    if (p === null) return ''
    return mode === 'net' ? `= ${fmtPct(p)}` : `recebe R$ ${(100 - p).toFixed(2).replace('.', ',')} de R$ 100`
  }

  function switchMode(m: 'pct' | 'net') {
    if (m === mode) return
    const conv = (s: string) => { const p = parse(s); return p === null ? '' : String(Math.round((100 - p) * 100) / 100).replace('.', ',') }
    setDebit(conv(debit)); setCredit(credit.map(conv)); setMode(m)
  }

  async function save() {
    const fees: CardFees = { debit: parse(debit), credit: {} }
    credit.forEach((s, i) => { const p = parse(s); if (p !== null) fees.credit[String(i + 1)] = p })
    setSaving(true); setMsg(null)
    const r = await onSave(fees).catch((e: Error) => ({ error: e.message }))
    setSaving(false)
    setMsg(r.error ? { ok: false, text: r.error } : { ok: true, text: 'Taxas salvas.' })
  }

  const input = 'w-24 rounded-md border px-2 py-1 text-right text-sm outline-none disabled:opacity-60'
  const inputStyle = { background: '#0B1220', borderColor: '#2A3650', color: '#F8FAFC' }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs" style={{ color: '#94A3B8' }}>
        Digitar como:
        {(['pct', 'net'] as const).map(m => (
          <button key={m} type="button" onClick={() => switchMode(m)}
            className="rounded-md border px-2 py-1"
            style={mode === m ? { borderColor: '#22C55E', color: '#22C55E' } : { borderColor: '#2A3650' }}>
            {m === 'pct' ? 'Taxa em %' : 'Quanto recebo de R$ 100'}
          </button>
        ))}
      </div>

      <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
        <label className="flex items-center justify-between gap-2 text-sm" style={{ color: '#F8FAFC' }}>
          <span>Débito</span>
          <span className="flex items-center gap-2">
            <span className="text-[10px]" style={{ color: '#64748B' }}>{show(debit)}</span>
            <input value={debit} onChange={e => setDebit(e.target.value)} disabled={!canEdit} inputMode="decimal"
              placeholder={mode === 'pct' ? '0,89' : '99,11'} className={input} style={inputStyle} />
          </span>
        </label>
        {credit.map((v, i) => (
          <label key={i} className="flex items-center justify-between gap-2 text-sm" style={{ color: '#F8FAFC' }}>
            <span>Crédito {i + 1}x</span>
            <span className="flex items-center gap-2">
              <span className="text-[10px]" style={{ color: '#64748B' }}>{show(v)}</span>
              <input value={v} disabled={!canEdit} inputMode="decimal"
                onChange={e => setCredit(c => c.map((x, j) => (j === i ? e.target.value : x)))}
                className={input} style={inputStyle} />
            </span>
          </label>
        ))}
      </div>

      <p className="text-[11px]" style={{ color: '#64748B' }}>
        Parcelas em branco são estimadas pelas vizinhas (ex.: sem 7x, usa a média entre 6x e 10x). As taxas aparecem no PDV, na OS e no relatório de pagamentos.
      </p>

      {canEdit && (
        <div className="flex items-center gap-3">
          <button type="button" onClick={save} disabled={saving}
            className="rounded-lg px-4 py-2 text-xs font-bold disabled:opacity-50"
            style={{ background: '#22C55E', color: '#000' }}>
            {saving ? 'Salvando…' : 'Salvar taxas'}
          </button>
          {msg && <span className="text-xs" style={{ color: msg.ok ? '#22C55E' : '#F87171' }}>{msg.text}</span>}
        </div>
      )}
    </div>
  )
}
