'use client'

/**
 * Modal de assinatura — chamado quando user clica "Contratar" em algum
 * produto. Permite escolher plano + método de pagamento + CPF/CNPJ.
 *
 * Após sucesso, redireciona pro link de cobrança hospedado pelo Asaas
 * (página deles com QR PIX ou formulário de cartão).
 */

import { useState, useEffect, useMemo } from 'react'
import { X, Loader2, QrCode, CreditCard, ExternalLink, CheckCircle2 } from 'lucide-react'
import { subscribeToProduct } from '@/actions/billing'
import { fmtBRL, plansForProduct, type Product, type Plan } from '@/lib/pricing'
import { toast } from 'sonner'

type Props = {
  open:     boolean
  onClose:  () => void
  product:  Product
  productLabel: string
  /** Se tenant já tem CPF/CNPJ salvo, esconde o campo. */
  hasCpfCnpj: boolean
}

/** Formata CPF (000.000.000-00) ou CNPJ (00.000.000/0000-00) à medida que digita. */
function formatCpfCnpj(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 14)
  if (d.length <= 11) {
    // CPF
    return d
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
  }
  // CNPJ
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2')
}

export function SubscribeModal({ open, onClose, product, productLabel, hasCpfCnpj }: Props) {
  // useMemo evita recriar o array a cada render — sem isso, o useEffect
  // abaixo dispararia em loop e resetaria a seleção do plano
  const plans = useMemo(() => plansForProduct(product), [product])
  const [plan, setPlan] = useState<Plan>(plans[0]?.plan ?? 'basico')
  const [paymentMethod, setPaymentMethod] = useState<'PIX' | 'CREDIT_CARD'>('PIX')
  const [cpfCnpj, setCpfCnpj] = useState('')
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)
  // URL retornada pelo Asaas após criar a sub. Quando setada, mostra
  // estado de sucesso com botão pra abrir (popup blocker friendly).
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null)

  // Reset ao abrir (com produto novo)
  useEffect(() => {
    if (open) {
      setPlan(plans[0]?.plan ?? 'basico')
      setPaymentMethod('PIX')
      setCpfCnpj('')
      setPhone('')
      setPaymentUrl(null)
    }
  }, [open, product, plans])

  if (!open) return null

  const selected = plans.find(p => p.plan === plan)

  async function handleSubmit() {
    if (!hasCpfCnpj) {
      const digits = cpfCnpj.replace(/\D/g, '')
      if (digits.length !== 11 && digits.length !== 14) {
        toast.error('Informe um CPF (11 dígitos) ou CNPJ (14 dígitos) válido.')
        return
      }
    }

    setLoading(true)
    const res = await subscribeToProduct({
      product,
      plan,
      paymentMethod,
      cpfCnpj: hasCpfCnpj ? undefined : cpfCnpj,
      phone:   phone || undefined,
    })
    setLoading(false)

    if (!res.ok) {
      toast.error(res.error)
      return
    }

    if (res.paymentLinkHint) {
      // Popup blocker bloqueia window.open após operação async. Em vez
      // de tentar abrir aqui, mostramos um botão que o user clica → o
      // próprio click do user libera o open na nova aba.
      setPaymentUrl(res.paymentLinkHint)
    } else {
      toast.success('Assinatura criada! Em breve você verá o link de pagamento.')
      onClose()
    }
  }

  // Estado de sucesso: mostra botão pra abrir página do Asaas (evita
  // popup blocker — o click do user é gesto direto, browser permite)
  if (paymentUrl) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ background: 'rgba(0,0,0,0.7)' }}
        onClick={onClose}>
        <div
          className="rounded-2xl border w-full max-w-md"
          style={{ background: '#0F1A2B', borderColor: '#2A3D5C' }}
          onClick={e => e.stopPropagation()}>

          <div className="p-8 text-center space-y-5">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full"
              style={{ background: 'rgba(0,255,148,.15)', border: '2px solid #00FF94' }}>
              <CheckCircle2 className="h-8 w-8" style={{ color: '#00FF94' }} />
            </div>

            <div>
              <h3 className="text-xl font-bold" style={{ color: '#E8F0FE' }}>
                Assinatura criada!
              </h3>
              <p className="text-sm mt-2" style={{ color: '#8AA8C8' }}>
                Pra ativar sua assinatura de <strong>{productLabel}</strong>, finalize
                o pagamento na página segura do Asaas:
              </p>
            </div>

            <a href={paymentUrl} target="_blank" rel="noopener noreferrer"
              onClick={() => setTimeout(() => onClose(), 500)}
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg py-3 text-sm font-bold transition-opacity hover:opacity-90"
              style={{ background: 'linear-gradient(135deg, #00E5FF, #00FF94)', color: '#080C14' }}>
              <ExternalLink className="h-4 w-4" />
              {paymentMethod === 'PIX' ? 'Abrir QR Code PIX' : 'Abrir página do cartão'}
            </a>

            <p className="text-[10px]" style={{ color: '#5A7A9A' }}>
              Após o pagamento, sua assinatura é ativada automaticamente e você
              recebe uma notificação aqui no sistema.
            </p>

            <button onClick={onClose}
              className="text-xs hover:underline" style={{ color: '#8AA8C8' }}>
              Fechar e pagar depois
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={onClose}>
      <div
        className="rounded-2xl border w-full max-w-md max-h-[90vh] overflow-y-auto"
        style={{ background: '#0F1A2B', borderColor: '#2A3D5C' }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0"
          style={{ background: '#0F1A2B', borderColor: '#1E2D45' }}>
          <h3 className="text-lg font-bold" style={{ color: '#E8F0FE' }}>
            Assinar {productLabel}
          </h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/5"
            style={{ color: '#5A7A9A' }}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Plano */}
          <div>
            <label className="text-[11px] font-bold uppercase tracking-widest mb-2 block"
              style={{ color: '#5A7A9A' }}>
              Escolha o plano
            </label>
            <div className="space-y-2">
              {plans.map(p => (
                <button key={p.plan} type="button" onClick={() => setPlan(p.plan)}
                  className="w-full flex items-center justify-between rounded-lg border px-4 py-3 text-left transition-colors"
                  style={plan === p.plan
                    ? { background: 'rgba(0,229,255,.08)', borderColor: '#00E5FF' }
                    : { background: '#0D1320', borderColor: '#1E2D45' }
                  }>
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
              style={{ color: '#5A7A9A' }}>
              Forma de pagamento
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setPaymentMethod('PIX')}
                className="flex flex-col items-center gap-1 rounded-lg border py-3 px-2 transition-colors"
                style={paymentMethod === 'PIX'
                  ? { background: 'rgba(0,255,148,.08)', borderColor: '#00FF94' }
                  : { background: '#0D1320', borderColor: '#1E2D45' }
                }>
                <QrCode className="h-5 w-5" style={{ color: paymentMethod === 'PIX' ? '#00FF94' : '#8AA8C8' }} />
                <span className="text-xs font-bold" style={{ color: '#E8F0FE' }}>PIX</span>
                <span className="text-[10px]" style={{ color: '#5A7A9A' }}>Recomendado</span>
              </button>
              <button type="button" onClick={() => setPaymentMethod('CREDIT_CARD')}
                className="flex flex-col items-center gap-1 rounded-lg border py-3 px-2 transition-colors"
                style={paymentMethod === 'CREDIT_CARD'
                  ? { background: 'rgba(0,229,255,.08)', borderColor: '#00E5FF' }
                  : { background: '#0D1320', borderColor: '#1E2D45' }
                }>
                <CreditCard className="h-5 w-5" style={{ color: paymentMethod === 'CREDIT_CARD' ? '#00E5FF' : '#8AA8C8' }} />
                <span className="text-xs font-bold" style={{ color: '#E8F0FE' }}>Cartão</span>
                <span className="text-[10px]" style={{ color: '#5A7A9A' }}>Recorrente</span>
              </button>
            </div>
          </div>

          {/* CPF/CNPJ — só se tenant não tem ainda */}
          {!hasCpfCnpj && (
            <>
              <div>
                <label className="text-[11px] font-bold uppercase tracking-widest mb-2 block"
                  style={{ color: '#5A7A9A' }}>
                  CPF ou CNPJ <span style={{ color: '#FF4D6D' }}>*</span>
                </label>
                <input
                  type="text"
                  value={cpfCnpj}
                  onChange={e => setCpfCnpj(formatCpfCnpj(e.target.value))}
                  placeholder="000.000.000-00"
                  className="w-full rounded-lg border px-3 py-2 text-sm font-mono"
                  style={{ background: '#0D1320', borderColor: '#1E2D45', color: '#E8F0FE' }}
                />
              </div>

              <div>
                <label className="text-[11px] font-bold uppercase tracking-widest mb-2 block"
                  style={{ color: '#5A7A9A' }}>
                  Celular (opcional)
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="(79) 99999-9999"
                  className="w-full rounded-lg border px-3 py-2 text-sm font-mono"
                  style={{ background: '#0D1320', borderColor: '#1E2D45', color: '#E8F0FE' }}
                />
              </div>
            </>
          )}

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
              <>Assinar e ir pra pagamento</>
            )}
          </button>

          <p className="text-[10px] text-center" style={{ color: '#5A7A9A' }}>
            Você será redirecionado pro Asaas pra concluir o pagamento. Pode cancelar a
            qualquer momento na sua área de assinatura.
          </p>
        </div>
      </div>
    </div>
  )
}
