'use client'

// Componentes das taxas da maquininha: aviso de taxa/acréscimo no pagamento,
// botão "copiar preço" e formulário de cadastro nas configurações.
// ARQUIVO IDÊNTICO em ~/checksmart e ~/smarterp (src/components/payments/card-fees-ui.tsx).

import { useState } from 'react'
import {
  type CardFees, type CardMarkup, type CardBrand, MAX_INSTALLMENTS, DEFAULT_MARKUP,
  cardFee, netAfterFee, fmtPct, cardMarkupPct, cardPrice, maxInstallmentsFor,
} from '@/lib/card-fees'

const BRL = (c: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(c / 100)

/** Visa/Master x Elo/Amex/outras (outras têm limite de parcelas). */
export function CardBrandPicker({ fees, brand, onChange }: {
  fees: CardFees | null; brand: CardBrand; onChange: (b: CardBrand) => void
}) {
  const max = maxInstallmentsFor(fees, 'other')
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {([
        { id: 'visa_master', label: 'Visa / Master' },
        { id: 'other',       label: `Elo / Amex / outras (até ${max}x)` },
      ] as const).map(o => (
        <button key={o.id} type="button" onClick={() => onChange(o.id)}
          className="rounded-md border px-2 py-1 text-[11px] font-medium"
          style={brand === o.id
            ? { background: '#F59E0B18', borderColor: '#F59E0B', color: '#F59E0B' }
            : { borderColor: '#2A3650', color: '#94A3B8' }}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

/**
 * Aviso abaixo da escolha de débito/crédito.
 * baseCents = preço do PIX; chargedCents = o que o cliente vai pagar no cartão.
 */
export function CardFeeHint({ fees, kind, installments, baseCents, chargedCents }: {
  fees: CardFees | null; kind: 'credit' | 'debit'; installments?: number
  baseCents: number; chargedCents?: number
}) {
  if (!fees) {
    return <p className="text-[11px]" style={{ color: '#64748B' }}>Cadastre as taxas da maquininha em Configurações para ver quanto você recebe.</p>
  }
  const f = cardFee(fees, kind, installments)
  if (!f) return <p className="text-[11px]" style={{ color: '#64748B' }}>Taxa desta opção não cadastrada.</p>
  const n = kind === 'credit' && installments && installments > 0 ? installments : 1
  const charged = chargedCents ?? baseCents
  const net = netAfterFee(charged, f.pct)
  const diff = net - baseCents
  const ideal = cardPrice(baseCents, fees, kind, n)
  const mk = cardMarkupPct(fees, kind, n)
  return (
    <div className="rounded-md px-2.5 py-1.5 text-[11px] leading-relaxed" style={{ background: '#0B1220', border: '1px solid #2A3650', color: '#94A3B8' }}>
      {charged !== baseCents && (
        <span className="block">
          Cliente paga <b style={{ color: '#F8FAFC' }}>{BRL(charged)}</b>
          {n > 1 ? ` (${n}x de ${BRL(Math.ceil(charged / n))})` : ''} · no PIX seria {BRL(baseCents)}
        </span>
      )}
      Taxa {f.estimated ? '≈ ' : ''}<b style={{ color: '#F59E0B' }}>{fmtPct(f.pct)}</b> ({BRL(charged - net)}) · você recebe <b style={{ color: '#22C55E' }}>{BRL(net)}</b>
      {baseCents > 0 && (
        <span className="block font-semibold" style={{ color: diff >= 0 ? '#22C55E' : '#F87171' }}>
          {diff >= 0 ? `✅ +${BRL(diff)} a mais que no PIX` : `⚠️ ${BRL(-diff)} a menos que no PIX — a taxa está saindo do seu lucro`}
        </span>
      )}
      {charged < ideal && (
        <span className="block" style={{ color: '#64748B' }}>
          Pela sua tabela (+{String(mk).replace('.', ',')}%), cobre {BRL(ideal)}{n > 1 ? ` (${n}x de ${BRL(Math.ceil(ideal / n))})` : ''}
        </span>
      )}
      {f.estimated && <span className="block" style={{ color: '#64748B' }}>Taxa estimada entre as parcelas vizinhas.</span>}
    </div>
  )
}

/** Monta a mensagem de preço para o cliente (PIX x cartão). */
export function priceMessage(fees: CardFees | null, baseCents: number): string {
  const m = fees?.markup ?? DEFAULT_MARKUP
  const debit = cardPrice(baseCents, fees, 'debit')
  const lines = [debit === baseCents
    ? `💚 ${BRL(baseCents)} no PIX, dinheiro ou débito`
    : `💚 ${BRL(baseCents)} no PIX ou dinheiro\n💳 Débito: ${BRL(debit)}`]
  let from = 1
  for (const t of m.tiers) {
    const price = cardPrice(baseCents, fees, 'credit', t.upTo)
    const range = from === t.upTo ? `${t.upTo}x` : from === 1 ? `até ${t.upTo}x` : `${from}x a ${t.upTo}x`
    lines.push(`💳 ${range}: ${BRL(price)}${t.upTo > 1 ? ` (${t.upTo}x de ${BRL(Math.ceil(price / t.upTo))})` : ''}`)
    from = t.upTo + 1
  }
  lines.push(`(Elo e Amex: até ${m.otherBrandsMax}x)`)
  return lines.join('\n')
}

/** Botão que copia "R$ X no PIX ou 10x de R$ Y" para colar no WhatsApp. */
export function CardPriceCopy({ fees, baseCents }: { fees: CardFees | null; baseCents: number }) {
  const [done, setDone] = useState(false)
  if (baseCents <= 0) return null
  async function copy() {
    const text = priceMessage(fees, baseCents)
    try { await navigator.clipboard.writeText(text) } catch {
      const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select()
      document.execCommand('copy'); ta.remove()
    }
    setDone(true); setTimeout(() => setDone(false), 2000)
  }
  return (
    <button type="button" onClick={copy}
      className="w-full rounded-md border px-2 py-1.5 text-[11px] font-medium"
      style={{ borderColor: '#22C55E', color: '#22C55E' }}
      title={priceMessage(fees, baseCents)}>
      {done ? '✓ Copiado! Cole no WhatsApp' : '📋 Copiar preços PIX x cartão para o cliente'}
    </button>
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
  const m0: CardMarkup = initial?.markup ?? DEFAULT_MARKUP
  const [mkDebit, setMkDebit] = useState(toStr(m0.debit))
  const [tiers, setTiers] = useState(m0.tiers.map(t => ({ upTo: String(t.upTo), pct: toStr(t.pct) })))
  const [otherMax, setOtherMax] = useState(String(m0.otherBrandsMax))
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
  const pctOf = (s: string) => { const n = Number(s.trim().replace('%', '').replace(',', '.')); return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null }
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
    const tt = tiers
      .map(t => ({ upTo: parseInt(t.upTo), pct: pctOf(t.pct) }))
      .filter((t): t is { upTo: number; pct: number } => t.upTo >= 1 && t.upTo <= MAX_INSTALLMENTS && t.pct !== null)
      .sort((a, b) => a.upTo - b.upTo)
    const om = parseInt(otherMax)
    fees.markup = {
      debit: pctOf(mkDebit) ?? 0,
      tiers: tt.length ? tt : DEFAULT_MARKUP.tiers,
      otherBrandsMax: om >= 1 && om <= MAX_INSTALLMENTS ? om : DEFAULT_MARKUP.otherBrandsMax,
    }
    setSaving(true); setMsg(null)
    const r = await onSave(fees).catch((e: Error) => ({ error: e.message }))
    setSaving(false)
    setMsg(r.error ? { ok: false, text: r.error } : { ok: true, text: 'Taxas salvas.' })
  }

  const input = 'w-24 rounded-md border px-2 py-1 text-right text-sm outline-none disabled:opacity-60'
  const small = 'w-16 rounded-md border px-2 py-1 text-right text-sm outline-none disabled:opacity-60'
  const inputStyle = { background: '#0B1220', borderColor: '#2A3650', color: '#F8FAFC' }
  const ex = 30000

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <p className="text-sm font-semibold" style={{ color: '#F8FAFC' }}>1. Quanto a maquininha cobra de você</p>
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
          Use a taxa TOTAL (o que sai do seu bolso). Parcelas em branco são estimadas pelas vizinhas.
        </p>
      </div>

      <div className="space-y-3 border-t pt-4" style={{ borderColor: '#2A3650' }}>
        <p className="text-sm font-semibold" style={{ color: '#F8FAFC' }}>2. Acréscimo para o cliente no cartão (sobre o preço do PIX)</p>
        <label className="flex items-center justify-between gap-2 text-sm sm:max-w-xs" style={{ color: '#F8FAFC' }}>
          <span>Débito</span>
          <span className="flex items-center gap-1">+<input value={mkDebit} onChange={e => setMkDebit(e.target.value)} disabled={!canEdit}
            inputMode="decimal" className={small} style={inputStyle} />%</span>
        </label>
        {tiers.map((t, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2 text-sm" style={{ color: '#F8FAFC' }}>
            <span>Crédito {i === 0 ? '1x' : `${(parseInt(tiers[i - 1].upTo) || 0) + 1}x`} até</span>
            <input value={t.upTo} disabled={!canEdit} inputMode="numeric" className={small} style={inputStyle}
              onChange={e => setTiers(ts => ts.map((x, j) => (j === i ? { ...x, upTo: e.target.value } : x)))} />
            <span>x: +</span>
            <input value={t.pct} disabled={!canEdit} inputMode="decimal" className={small} style={inputStyle}
              onChange={e => setTiers(ts => ts.map((x, j) => (j === i ? { ...x, pct: e.target.value } : x)))} />
            <span>%</span>
            {canEdit && tiers.length > 1 && (
              <button type="button" onClick={() => setTiers(ts => ts.filter((_, j) => j !== i))}
                className="text-xs" style={{ color: '#F87171' }}>remover</button>
            )}
          </div>
        ))}
        {canEdit && tiers.length < 4 && (
          <button type="button" onClick={() => setTiers(ts => [...ts, { upTo: '12', pct: '' }])}
            className="text-xs" style={{ color: '#22C55E' }}>+ adicionar faixa</button>
        )}
        <label className="flex items-center gap-2 text-sm" style={{ color: '#F8FAFC' }}>
          <span>Elo / Amex / outras bandeiras: no máximo</span>
          <input value={otherMax} onChange={e => setOtherMax(e.target.value)} disabled={!canEdit}
            inputMode="numeric" className={small} style={inputStyle} />
          <span>parcelas</span>
        </label>
        <div className="rounded-md p-2 text-[11px] whitespace-pre-line" style={{ background: '#0B1220', border: '1px solid #2A3650', color: '#94A3B8' }}>
          Exemplo para um serviço de {BRL(ex)} (já salvo):{'\n'}{priceMessage(initial, ex)}
        </div>
      </div>

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
