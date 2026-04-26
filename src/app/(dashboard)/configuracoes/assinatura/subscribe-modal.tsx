'use client'

/**
 * Modal de assinatura — checkout in-app (Opção B).
 *
 * Fluxo:
 * 1. Etapa "form": user escolhe plano + método + (cartão ou PIX)
 *    - Se PIX: precisa só de CPF/CNPJ + celular
 *    - Se Cartão: precisa cartão completo + endereço (CEP + número)
 * 2. Submit chama subscribeToProduct (server action)
 *    - PIX: retorna QR code → mostra inline no modal
 *    - Cartão: retorna chargedNow=true → mostra sucesso
 * 3. Etapa "pix-qr": mostra QR code + código copia-e-cola + valor
 *    - Botão "Já paguei" fecha o modal
 *    - Webhook vai atualizar status pra 'active' quando Asaas confirmar
 * 4. Etapa "card-success": mostra confirmação + status="processando"
 */

import { useState, useEffect, useMemo } from 'react'
import { X, Loader2, QrCode, CreditCard, CheckCircle2, Copy, Check } from 'lucide-react'
import { subscribeToProduct } from '@/actions/billing'
import { fmtBRL, plansForProduct, type Product, type Plan } from '@/lib/pricing'
import { toast } from 'sonner'
import type { AsaasPixQrCode } from '@/lib/asaas'

type Props = {
  open:     boolean
  onClose:  () => void
  product:  Product
  productLabel: string
  hasCpfCnpj: boolean
}

/** Formata CPF (000.000.000-00) ou CNPJ (00.000.000/0000-00). */
function formatCpfCnpj(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 14)
  if (d.length <= 11) {
    return d
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
  }
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2')
}

/** Formata número de cartão em grupos de 4. */
function formatCardNumber(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, 19).replace(/(\d{4})(?=\d)/g, '$1 ')
}

/** Formata CEP 00000-000. */
function formatCep(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 8)
  return d.replace(/(\d{5})(\d)/, '$1-$2')
}

/** Formata validade MM/AA enquanto digita. */
function formatExpiry(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 4)
  if (d.length < 3) return d
  return `${d.slice(0, 2)}/${d.slice(2)}`
}

type Step = 'form' | 'pix-qr' | 'card-success'

export function SubscribeModal({ open, onClose, product, productLabel, hasCpfCnpj }: Props) {
  const plans = useMemo(() => plansForProduct(product), [product])
  const [step, setStep] = useState<Step>('form')

  // Form state
  const [plan, setPlan] = useState<Plan>(plans[0]?.plan ?? 'basico')
  const [paymentMethod, setPaymentMethod] = useState<'PIX' | 'CREDIT_CARD'>('PIX')
  const [cpfCnpj, setCpfCnpj] = useState('')
  const [phone, setPhone] = useState('')
  // Card fields
  const [cardNumber, setCardNumber] = useState('')
  const [cardHolder, setCardHolder] = useState('')
  const [cardExpiry, setCardExpiry] = useState('')
  const [cardCcv, setCardCcv] = useState('')
  const [cep, setCep] = useState('')
  const [addressNumber, setAddressNumber] = useState('')
  const [loading, setLoading] = useState(false)

  // PIX QR state
  const [pixQr, setPixQr] = useState<AsaasPixQrCode | null>(null)
  const [pixValue, setPixValue] = useState(0)
  const [copiedPix, setCopiedPix] = useState(false)

  useEffect(() => {
    if (open) {
      setStep('form')
      setPlan(plans[0]?.plan ?? 'basico')
      setPaymentMethod('PIX')
      setCpfCnpj('')
      setPhone('')
      setCardNumber(''); setCardHolder(''); setCardExpiry(''); setCardCcv('')
      setCep(''); setAddressNumber('')
      setPixQr(null); setPixValue(0); setCopiedPix(false)
    }
  }, [open, product, plans])

  if (!open) return null

  const selected = plans.find(p => p.plan === plan)

  async function handleSubmit() {
    // Validações pré-server
    if (!hasCpfCnpj) {
      const digits = cpfCnpj.replace(/\D/g, '')
      if (digits.length !== 11 && digits.length !== 14) {
        toast.error('Informe um CPF (11 dígitos) ou CNPJ (14 dígitos) válido.')
        return
      }
    }
    if (paymentMethod === 'CREDIT_CARD') {
      if (cardNumber.replace(/\D/g, '').length < 13) {
        toast.error('Número do cartão inválido.')
        return
      }
      if (!cardHolder.trim()) { toast.error('Informe o nome impresso no cartão.'); return }
      const exp = cardExpiry.replace(/\D/g, '')
      if (exp.length !== 4) { toast.error('Validade do cartão inválida (MM/AA).'); return }
      if (cardCcv.length < 3) { toast.error('CCV inválido.'); return }
      if (cep.replace(/\D/g, '').length !== 8) { toast.error('CEP inválido.'); return }
      if (!addressNumber.trim()) { toast.error('Informe o número do endereço.'); return }
    }

    setLoading(true)
    const exp = cardExpiry.replace(/\D/g, '')
    const expMonth = exp.slice(0, 2)
    const expYear  = exp.slice(2, 4) ? `20${exp.slice(2, 4)}` : ''

    const res = await subscribeToProduct({
      product, plan, paymentMethod,
      cpfCnpj: hasCpfCnpj ? undefined : cpfCnpj,
      phone:   phone || undefined,
      creditCard: paymentMethod === 'CREDIT_CARD' ? {
        holderName:  cardHolder,
        number:      cardNumber.replace(/\D/g, ''),
        expiryMonth: expMonth,
        expiryYear:  expYear,
        ccv:         cardCcv,
      } : undefined,
      postalCode:    paymentMethod === 'CREDIT_CARD' ? cep : undefined,
      addressNumber: paymentMethod === 'CREDIT_CARD' ? addressNumber : undefined,
    })
    setLoading(false)

    if (!res.ok) {
      toast.error(res.error)
      return
    }

    if (res.mode === 'pix') {
      setPixQr(res.pixQrCode)
      setPixValue(res.paymentValue)
      setStep('pix-qr')
    } else {
      // Cartão cobrado imediatamente
      toast.success('Pagamento processado!')
      setStep('card-success')
    }
  }

  function handleCopyPix() {
    if (!pixQr) return
    navigator.clipboard.writeText(pixQr.payload)
    setCopiedPix(true)
    toast.success('Código PIX copiado!')
    setTimeout(() => setCopiedPix(false), 2500)
  }

  // ── Render: PIX QR step ───────────────────────────────────────────────
  if (step === 'pix-qr' && pixQr) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ background: 'rgba(0,0,0,0.7)' }} onClick={onClose}>
        <div className="rounded-2xl border w-full max-w-md max-h-[95vh] overflow-y-auto"
          style={{ background: '#0F1A2B', borderColor: '#2A3D5C' }}
          onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between px-6 py-4 border-b"
            style={{ borderColor: '#1E2D45' }}>
            <h3 className="text-lg font-bold flex items-center gap-2" style={{ color: '#E8F0FE' }}>
              <QrCode className="h-5 w-5" style={{ color: '#00FF94' }} />
              Pagar com PIX
            </h3>
            <button onClick={onClose} className="p-1 rounded hover:bg-white/5"
              style={{ color: '#5A7A9A' }}><X className="h-5 w-5" /></button>
          </div>

          <div className="p-6 space-y-4">
            <div className="text-center">
              <p className="text-xs" style={{ color: '#8AA8C8' }}>Total a pagar</p>
              <p className="text-3xl font-bold font-mono mt-1" style={{ color: '#00FF94' }}>
                {fmtBRL(pixValue * 100)}
              </p>
            </div>

            {/* QR code */}
            <div className="rounded-xl bg-white p-4 flex items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`data:image/png;base64,${pixQr.encodedImage}`}
                alt="QR Code PIX" className="w-56 h-56" />
            </div>

            <p className="text-xs text-center" style={{ color: '#8AA8C8' }}>
              Escaneie o QR Code com o app do seu banco
            </p>

            {/* Código copia-e-cola */}
            <div>
              <label className="text-[11px] font-bold uppercase tracking-widest mb-2 block"
                style={{ color: '#5A7A9A' }}>
                Ou copie o código
              </label>
              <div className="rounded-lg border p-3 flex items-center gap-2"
                style={{ background: '#0D1320', borderColor: '#1E2D45' }}>
                <code className="text-[10px] flex-1 truncate font-mono"
                  style={{ color: '#E8F0FE' }}>{pixQr.payload}</code>
                <button onClick={handleCopyPix}
                  className="shrink-0 p-2 rounded hover:bg-white/5 transition-colors"
                  style={{ color: copiedPix ? '#00FF94' : '#00E5FF' }}>
                  {copiedPix ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="rounded-lg border p-3"
              style={{ background: 'rgba(255,184,0,.06)', borderColor: 'rgba(255,184,0,.2)' }}>
              <p className="text-[11px]" style={{ color: '#FFB800' }}>
                ⏱ Após pagar, sua assinatura é ativada em poucos segundos. Pode fechar
                essa tela — você verá uma notificação no sino quando confirmar.
              </p>
            </div>

            <button onClick={onClose}
              className="w-full rounded-lg py-3 text-sm font-bold border transition-colors hover:bg-white/5"
              style={{ borderColor: '#1E2D45', color: '#E8F0FE' }}>
              Fechar
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Render: Card success step ─────────────────────────────────────────
  if (step === 'card-success') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ background: 'rgba(0,0,0,0.7)' }} onClick={onClose}>
        <div className="rounded-2xl border w-full max-w-md"
          style={{ background: '#0F1A2B', borderColor: '#2A3D5C' }}
          onClick={e => e.stopPropagation()}>
          <div className="p-8 text-center space-y-5">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full"
              style={{ background: 'rgba(0,255,148,.15)', border: '2px solid #00FF94' }}>
              <CheckCircle2 className="h-8 w-8" style={{ color: '#00FF94' }} />
            </div>
            <div>
              <h3 className="text-xl font-bold" style={{ color: '#E8F0FE' }}>Pagamento aprovado!</h3>
              <p className="text-sm mt-2" style={{ color: '#8AA8C8' }}>
                Sua assinatura de <strong>{productLabel}</strong> está sendo ativada.
                Em alguns instantes você recebe a confirmação aqui no sino.
              </p>
            </div>
            <button onClick={() => { onClose(); window.location.reload() }}
              className="w-full rounded-lg py-3 text-sm font-bold transition-opacity hover:opacity-90"
              style={{ background: 'linear-gradient(135deg, #00E5FF, #00FF94)', color: '#080C14' }}>
              Continuar
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Render: Form step (default) ───────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)' }} onClick={onClose}>
      <div className="rounded-2xl border w-full max-w-md max-h-[95vh] overflow-y-auto"
        style={{ background: '#0F1A2B', borderColor: '#2A3D5C' }}
        onClick={e => e.stopPropagation()}>

        <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 z-10"
          style={{ background: '#0F1A2B', borderColor: '#1E2D45' }}>
          <h3 className="text-lg font-bold" style={{ color: '#E8F0FE' }}>Assinar {productLabel}</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/5"
            style={{ color: '#5A7A9A' }}><X className="h-5 w-5" /></button>
        </div>

        <div className="p-6 space-y-5">
          {/* Plano */}
          <div>
            <label className="text-[11px] font-bold uppercase tracking-widest mb-2 block"
              style={{ color: '#5A7A9A' }}>Escolha o plano</label>
            <div className="space-y-2">
              {plans.map(p => (
                <button key={p.plan} type="button" onClick={() => setPlan(p.plan)}
                  className="w-full flex items-center justify-between rounded-lg border px-4 py-3 text-left transition-colors"
                  style={plan === p.plan
                    ? { background: 'rgba(0,229,255,.08)', borderColor: '#00E5FF' }
                    : { background: '#0D1320', borderColor: '#1E2D45' }}>
                  <div>
                    <p className="text-sm font-bold capitalize" style={{ color: '#E8F0FE' }}>
                      {p.plan === 'basico' ? 'Básico' : p.plan === 'pro' ? 'Pro' : 'Premium'}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: '#8AA8C8' }}>{p.description}</p>
                  </div>
                  <p className="text-base font-bold font-mono shrink-0 ml-4"
                    style={{ color: plan === p.plan ? '#00E5FF' : '#E8F0FE' }}>
                    {fmtBRL(p.priceCents)}
                    <span className="text-[10px] font-normal" style={{ color: '#5A7A9A' }}>/mês</span>
                  </p>
                </button>
              ))}
            </div>
          </div>

          {/* Pagamento */}
          <div>
            <label className="text-[11px] font-bold uppercase tracking-widest mb-2 block"
              style={{ color: '#5A7A9A' }}>Forma de pagamento</label>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setPaymentMethod('PIX')}
                className="flex flex-col items-center gap-1 rounded-lg border py-3 px-2 transition-colors"
                style={paymentMethod === 'PIX'
                  ? { background: 'rgba(0,255,148,.08)', borderColor: '#00FF94' }
                  : { background: '#0D1320', borderColor: '#1E2D45' }}>
                <QrCode className="h-5 w-5" style={{ color: paymentMethod === 'PIX' ? '#00FF94' : '#8AA8C8' }} />
                <span className="text-xs font-bold" style={{ color: '#E8F0FE' }}>PIX</span>
                <span className="text-[10px]" style={{ color: '#5A7A9A' }}>Recomendado</span>
              </button>
              <button type="button" onClick={() => setPaymentMethod('CREDIT_CARD')}
                className="flex flex-col items-center gap-1 rounded-lg border py-3 px-2 transition-colors"
                style={paymentMethod === 'CREDIT_CARD'
                  ? { background: 'rgba(0,229,255,.08)', borderColor: '#00E5FF' }
                  : { background: '#0D1320', borderColor: '#1E2D45' }}>
                <CreditCard className="h-5 w-5" style={{ color: paymentMethod === 'CREDIT_CARD' ? '#00E5FF' : '#8AA8C8' }} />
                <span className="text-xs font-bold" style={{ color: '#E8F0FE' }}>Cartão</span>
                <span className="text-[10px]" style={{ color: '#5A7A9A' }}>Recorrente</span>
              </button>
            </div>
          </div>

          {/* CPF/CNPJ — só se tenant não tem ainda */}
          {!hasCpfCnpj && (
            <div>
              <label className="text-[11px] font-bold uppercase tracking-widest mb-2 block"
                style={{ color: '#5A7A9A' }}>
                CPF ou CNPJ <span style={{ color: '#FF4D6D' }}>*</span>
              </label>
              <input type="text" value={cpfCnpj}
                onChange={e => setCpfCnpj(formatCpfCnpj(e.target.value))}
                placeholder="000.000.000-00"
                className="w-full rounded-lg border px-3 py-2 text-sm font-mono"
                style={{ background: '#0D1320', borderColor: '#1E2D45', color: '#E8F0FE' }} />
            </div>
          )}

          {/* Campos do cartão (só se CREDIT_CARD) */}
          {paymentMethod === 'CREDIT_CARD' && (
            <>
              <div>
                <label className="text-[11px] font-bold uppercase tracking-widest mb-2 block"
                  style={{ color: '#5A7A9A' }}>
                  Número do cartão <span style={{ color: '#FF4D6D' }}>*</span>
                </label>
                <input type="text" inputMode="numeric" value={cardNumber}
                  onChange={e => setCardNumber(formatCardNumber(e.target.value))}
                  placeholder="0000 0000 0000 0000"
                  className="w-full rounded-lg border px-3 py-2 text-sm font-mono"
                  style={{ background: '#0D1320', borderColor: '#1E2D45', color: '#E8F0FE' }} />
              </div>

              <div>
                <label className="text-[11px] font-bold uppercase tracking-widest mb-2 block"
                  style={{ color: '#5A7A9A' }}>
                  Nome impresso <span style={{ color: '#FF4D6D' }}>*</span>
                </label>
                <input type="text" value={cardHolder}
                  onChange={e => setCardHolder(e.target.value.toUpperCase())}
                  placeholder="NOME COMO ESTÁ NO CARTÃO"
                  className="w-full rounded-lg border px-3 py-2 text-sm uppercase"
                  style={{ background: '#0D1320', borderColor: '#1E2D45', color: '#E8F0FE' }} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-widest mb-2 block"
                    style={{ color: '#5A7A9A' }}>
                    Validade <span style={{ color: '#FF4D6D' }}>*</span>
                  </label>
                  <input type="text" inputMode="numeric" value={cardExpiry}
                    onChange={e => setCardExpiry(formatExpiry(e.target.value))}
                    placeholder="MM/AA"
                    className="w-full rounded-lg border px-3 py-2 text-sm font-mono"
                    style={{ background: '#0D1320', borderColor: '#1E2D45', color: '#E8F0FE' }} />
                </div>
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-widest mb-2 block"
                    style={{ color: '#5A7A9A' }}>
                    CCV <span style={{ color: '#FF4D6D' }}>*</span>
                  </label>
                  <input type="text" inputMode="numeric" value={cardCcv}
                    onChange={e => setCardCcv(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="000"
                    className="w-full rounded-lg border px-3 py-2 text-sm font-mono"
                    style={{ background: '#0D1320', borderColor: '#1E2D45', color: '#E8F0FE' }} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-widest mb-2 block"
                    style={{ color: '#5A7A9A' }}>
                    CEP <span style={{ color: '#FF4D6D' }}>*</span>
                  </label>
                  <input type="text" inputMode="numeric" value={cep}
                    onChange={e => setCep(formatCep(e.target.value))}
                    placeholder="00000-000"
                    className="w-full rounded-lg border px-3 py-2 text-sm font-mono"
                    style={{ background: '#0D1320', borderColor: '#1E2D45', color: '#E8F0FE' }} />
                </div>
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-widest mb-2 block"
                    style={{ color: '#5A7A9A' }}>
                    Número <span style={{ color: '#FF4D6D' }}>*</span>
                  </label>
                  <input type="text" value={addressNumber}
                    onChange={e => setAddressNumber(e.target.value.slice(0, 10))}
                    placeholder="123"
                    className="w-full rounded-lg border px-3 py-2 text-sm"
                    style={{ background: '#0D1320', borderColor: '#1E2D45', color: '#E8F0FE' }} />
                </div>
              </div>
            </>
          )}

          {/* Celular (sempre opcional) */}
          <div>
            <label className="text-[11px] font-bold uppercase tracking-widest mb-2 block"
              style={{ color: '#5A7A9A' }}>Celular (opcional)</label>
            <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
              placeholder="(79) 99999-9999"
              className="w-full rounded-lg border px-3 py-2 text-sm font-mono"
              style={{ background: '#0D1320', borderColor: '#1E2D45', color: '#E8F0FE' }} />
          </div>

          {/* Resumo */}
          {selected && (
            <div className="rounded-lg border p-3 flex justify-between items-center"
              style={{ background: '#0D1320', borderColor: '#1E2D45' }}>
              <span className="text-xs" style={{ color: '#8AA8C8' }}>Total mensal</span>
              <span className="text-xl font-bold font-mono" style={{ color: '#00FF94' }}>
                {fmtBRL(selected.priceCents)}
              </span>
            </div>
          )}

          <button onClick={handleSubmit} disabled={loading}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg py-3 text-sm font-bold transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #00E5FF, #00FF94)', color: '#080C14' }}>
            {loading ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Processando…</>
            ) : (
              paymentMethod === 'PIX' ? 'Gerar QR Code PIX' : 'Pagar com cartão'
            )}
          </button>

          <p className="text-[10px] text-center" style={{ color: '#5A7A9A' }}>
            🔒 Pagamento seguro processado pelo Asaas. Você pode cancelar a qualquer
            momento na sua área de assinatura.
          </p>
        </div>
      </div>
    </div>
  )
}
