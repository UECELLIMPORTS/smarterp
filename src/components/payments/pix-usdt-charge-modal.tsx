'use client'

/**
 * Modal "Cobrar Pix → USDT" (ZimPay). Mesmo componente no CheckSmart e no Gestão Smart.
 *
 * Etapas: formulário (valor editável, já vem cheio) → QR + copia-e-cola com status ao vivo → Pago ✅
 * O colaborador nunca vê saldo, carteira, cotação de saque ou credenciais.
 */

import { useEffect, useRef, useState } from 'react'
import QRCodeLib from 'qrcode'
import { Check, Copy, Loader2, X, RefreshCw } from 'lucide-react'

export type PixUsdtChargeView = {
  id:             string
  amount_cents:   number
  payer_name:     string
  pix_code:       string | null
  status:         string
  usdt_estimated: number | null
  paid_at:        string | null
}

type Result = { data?: PixUsdtChargeView; error?: unknown }

type Props = {
  open:                 boolean
  onClose:              () => void
  title?:               string
  subtitle?:            string
  defaultAmountCents:   number
  defaultPayerName?:    string | null
  defaultPayerDocument?: string | null
  onCreate: (p: { amountCents: number; payerName: string; payerDocument: string }) => Promise<Result>
  onPoll:   (chargeId: string) => Promise<Result>
  /** Chamado uma vez quando o Pix é confirmado. */
  onPaid?:  (charge: PixUsdtChargeView) => void | Promise<void>
  /** Retoma uma cobrança já existente (ex.: ainda pendente). */
  existing?: PixUsdtChargeView | null
}

const PAID = ['pix_paid', 'queued', 'processing', 'sent', 'confirmed', 'failed']

const BRL = (c: number) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

function centsToInput(c: number) { return (c / 100).toFixed(2).replace('.', ',') }
function inputToCents(v: string) {
  const clean = v.replace(/[^\d,.]/g, '').replace(/\.(?=\d{3})/g, '').replace(',', '.')
  return Math.round((parseFloat(clean) || 0) * 100)
}
function maskDoc(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 14)
  if (d.length <= 11) {
    return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2')
  }
  return d.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2')
}
function errText(e: unknown) {
  if (!e) return 'Erro inesperado.'
  if (typeof e === 'string') return e
  if (typeof e === 'object') return Object.values(e as Record<string, string[]>).flat()[0] ?? 'Dados inválidos.'
  return 'Erro inesperado.'
}

export function PixUsdtChargeModal(props: Props) {
  // Monta só quando aberto → estado sempre começa limpo, sem reset via effect.
  return props.open ? <ChargeDialog {...props} /> : null
}

function ChargeDialog(props: Props) {
  const {
    open, onClose, title = 'Cobrar Pix', subtitle,
    defaultAmountCents, defaultPayerName, defaultPayerDocument,
    onCreate, onPoll, onPaid, existing,
  } = props

  const [amount, setAmount]   = useState(centsToInput(defaultAmountCents))
  const [name, setName]       = useState(defaultPayerName ?? '')
  const [doc, setDoc]         = useState(maskDoc(defaultPayerDocument ?? ''))
  const [busy, setBusy]       = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [charge, setCharge]   = useState<PixUsdtChargeView | null>(existing ?? null)
  const [qr, setQr]           = useState<string | null>(null)
  const [copied, setCopied]   = useState(false)
  const paidFired             = useRef(false)
  // Refs: callbacks inline do pai não reiniciam o polling a cada render
  const onPollRef = useRef(onPoll)
  const onPaidRef = useRef(onPaid)
  useEffect(() => { onPollRef.current = onPoll; onPaidRef.current = onPaid })


  // QR do copia-e-cola
  useEffect(() => {
    if (!charge?.pix_code) return
    let alive = true
    QRCodeLib.toDataURL(charge.pix_code, { width: 280, margin: 1 })
      .then(url => { if (alive) setQr(url) })
      .catch(() => { if (alive) setQr(null) })
    return () => { alive = false }
  }, [charge?.pix_code])

  const isPaid    = !!charge && PAID.includes(charge.status)
  const isDead    = !!charge && ['expired', 'error'].includes(charge.status)
  const isPending = !!charge && !isPaid && !isDead

  // Polling a cada 4s enquanto pendente
  useEffect(() => {
    if (!open || !charge || !isPending) return
    let alive = true
    const t = setInterval(async () => {
      const r = await onPollRef.current(charge.id).catch(() => ({} as Result))
      if (alive && r.data) setCharge(r.data)
    }, 4000)
    return () => { alive = false; clearInterval(t) }
  }, [open, charge?.id, isPending]) // eslint-disable-line react-hooks/exhaustive-deps

  // Dispara onPaid uma vez
  useEffect(() => {
    if (isPaid && charge && !paidFired.current) {
      paidFired.current = true
      void onPaidRef.current?.(charge)
    }
  }, [isPaid, charge])

  async function handleCreate() {
    setError(null)
    const cents = inputToCents(amount)
    if (cents < 100) { setError('Valor mínimo R$ 1,00.'); return }
    const d = doc.replace(/\D/g, '')
    if (d.length !== 11 && d.length !== 14) { setError('Informe o CPF/CNPJ de quem vai pagar.'); return }
    if (name.trim().length < 3) { setError('Informe o nome de quem vai pagar.'); return }
    setBusy(true)
    const r = await onCreate({ amountCents: cents, payerName: name.trim(), payerDocument: d })
    setBusy(false)
    if (r.error || !r.data) { setError(errText(r.error)); return }
    setCharge(r.data)
  }

  async function handleCopy() {
    if (!charge?.pix_code) return
    try {
      await navigator.clipboard.writeText(charge.pix_code)
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    } catch { /* ignore */ }
  }


  const field = 'w-full rounded-lg border border-[#2A3650] bg-[#131C2A] px-3 py-2 text-sm text-zinc-100 outline-none focus:border-[#22C55E]/60'

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/70 p-4" onClick={isPending ? undefined : onClose}>
      <div
        className="w-full max-w-sm rounded-2xl border border-[#2A3650] bg-[#1B2638] p-5 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-zinc-100">{title}</h2>
            {subtitle && <p className="text-xs text-zinc-400">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-zinc-400 hover:bg-white/5" aria-label="Fechar">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── 1. Formulário ── */}
        {!charge && (
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs text-zinc-400">Valor a cobrar (R$)</label>
              <input
                inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)}
                className={field + ' text-lg font-semibold'} autoFocus
              />
              {inputToCents(amount) !== defaultAmountCents && defaultAmountCents > 0 && (
                <button type="button" onClick={() => setAmount(centsToInput(defaultAmountCents))}
                  className="text-[11px] text-[#22C55E] hover:underline">
                  Voltar para o total ({BRL(defaultAmountCents)})
                </button>
              )}
            </div>
            <div className="space-y-1">
              <label className="text-xs text-zinc-400">Nome de quem paga</label>
              <input value={name} onChange={e => setName(e.target.value)} className={field} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-zinc-400">CPF/CNPJ de quem paga</label>
              <input inputMode="numeric" value={doc} onChange={e => setDoc(maskDoc(e.target.value))} className={field} placeholder="000.000.000-00" />
            </div>
            {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</p>}
            <button
              type="button" onClick={handleCreate} disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#22C55E] py-2.5 text-sm font-semibold text-black hover:bg-[#16A34A] disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Gerar QR Code Pix
            </button>
          </div>
        )}

        {/* ── 2. QR + status ── */}
        {charge && !isPaid && (
          <div className="space-y-3 text-center">
            <p className="text-2xl font-bold text-zinc-100">{BRL(charge.amount_cents)}</p>
            {isDead ? (
              <div className="space-y-3">
                <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
                  Cobrança {charge.status === 'expired' ? 'expirada' : 'com erro'}. Gere uma nova.
                </p>
                <button type="button" onClick={() => { setCharge(null); setQr(null) }}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#2A3650] py-2 text-sm text-zinc-200 hover:bg-white/5">
                  <RefreshCw className="h-4 w-4" /> Nova cobrança
                </button>
              </div>
            ) : (
              <>
                <div className="mx-auto flex h-[220px] w-[220px] items-center justify-center rounded-xl bg-white p-2">
                  {qr ? <img src={qr} alt="QR Code Pix" className="h-full w-full" /> : <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />}
                </div>
                <button type="button" onClick={handleCopy} disabled={!charge.pix_code}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#22C55E]/40 bg-[#22C55E]/10 py-2 text-sm font-medium text-[#22C55E] hover:bg-[#22C55E]/20">
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied ? 'Copiado!' : 'Copiar Pix copia e cola'}
                </button>
                <div className="flex items-center justify-center gap-2 rounded-lg bg-amber-500/10 py-2 text-sm text-amber-400">
                  <Loader2 className="h-4 w-4 animate-spin" /> Aguardando pagamento…
                </div>
                <p className="text-[11px] text-zinc-500">Pode deixar esta tela aberta, ela atualiza sozinha.</p>
              </>
            )}
          </div>
        )}

        {/* ── 3. Pago ── */}
        {charge && isPaid && (
          <div className="space-y-3 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#22C55E]/15">
              <Check className="h-8 w-8 text-[#22C55E]" />
            </div>
            <p className="text-lg font-semibold text-[#22C55E]">Pagamento confirmado ✅</p>
            <p className="text-2xl font-bold text-zinc-100">{BRL(charge.amount_cents)}</p>
            <p className="text-xs text-zinc-400">{charge.payer_name}</p>
            <button type="button" onClick={onClose}
              className="w-full rounded-xl bg-[#22C55E] py-2.5 text-sm font-semibold text-black hover:bg-[#16A34A]">
              Concluir
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
