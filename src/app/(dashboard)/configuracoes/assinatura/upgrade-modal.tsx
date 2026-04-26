'use client'

/**
 * Modal de upgrade — chamado quando o user clica "Mudar plano" em uma
 * assinatura ATIVA paga. Mostra a previsão de cobrança proporcional
 * e executa o upgrade ao confirmar.
 *
 * Fluxo:
 * 1. step='choose': lista os planos superiores disponíveis com cobrança calculada
 * 2. step='confirm': resumo do upgrade escolhido, botão executar
 * 3. step='pix-qr': QR code da cobrança avulsa (só PIX)
 * 4. step='success': confirmação (cartão cobrado ou upgrade sem cobrança extra)
 */

import { useState, useEffect } from 'react'
import { X, Loader2, CheckCircle2, ArrowRight, Copy, Check, QrCode } from 'lucide-react'
import { previewUpgrade, executeUpgrade } from '@/actions/billing'
import { fmtBRL, plansForProduct, type Product, type Plan } from '@/lib/pricing'
import { toast } from 'sonner'
import type { AsaasPixQrCode } from '@/lib/asaas'

type Props = {
  open:    boolean
  onClose: () => void
  product: Product
  productLabel: string
  currentPlan: Plan
}

type Preview = Awaited<ReturnType<typeof previewUpgrade>>

type Step = 'choose' | 'confirm' | 'pix-qr' | 'success'

export function UpgradeModal({ open, onClose, product, productLabel, currentPlan }: Props) {
  const [step, setStep] = useState<Step>('choose')
  const [previews, setPreviews] = useState<Record<Plan, Preview>>({} as Record<Plan, Preview>)
  const [loadingPreviews, setLoadingPreviews] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null)
  const [executing, setExecuting] = useState(false)
  const [pixQr, setPixQr] = useState<AsaasPixQrCode | null>(null)
  const [chargeValue, setChargeValue] = useState(0)
  const [successMode, setSuccessMode] = useState<'card' | 'free'>('card')
  const [successMsg, setSuccessMsg] = useState('')
  const [copied, setCopied] = useState(false)

  // Carrega previews dos planos superiores quando abre
  useEffect(() => {
    if (!open) return
    setStep('choose'); setSelectedPlan(null); setPixQr(null); setCopied(false)

    const RANK: Record<Plan, number> = { basico: 0, pro: 1, premium: 2 }
    const upgradeable = plansForProduct(product).filter(p => RANK[p.plan] > RANK[currentPlan])

    setLoadingPreviews(true)
    Promise.all(upgradeable.map(async p => [p.plan, await previewUpgrade(product, p.plan)] as const))
      .then(results => {
        const map = {} as Record<Plan, Preview>
        for (const [plan, prev] of results) map[plan] = prev
        setPreviews(map)
      })
      .finally(() => setLoadingPreviews(false))
  }, [open, product, currentPlan])

  if (!open) return null

  async function handleExecute() {
    if (!selectedPlan) return
    setExecuting(true)
    const res = await executeUpgrade(product, selectedPlan)
    setExecuting(false)

    if (!res.ok) {
      toast.error(res.error)
      return
    }

    if (res.mode === 'free') {
      setSuccessMode('free')
      setSuccessMsg(res.message)
      setStep('success')
    } else if (res.mode === 'card') {
      setSuccessMode('card')
      setChargeValue(res.chargeValueCents)
      setSuccessMsg(res.chargedNow
        ? `R$${(res.chargeValueCents/100).toFixed(2)} cobrado no cartão.`
        : 'Cobrança em processamento.')
      setStep('success')
    } else {
      setPixQr(res.pixQrCode)
      setChargeValue(res.chargeValueCents)
      setStep('pix-qr')
    }
  }

  function handleCopyPix() {
    if (!pixQr) return
    navigator.clipboard.writeText(pixQr.payload)
    setCopied(true)
    toast.success('Código PIX copiado!')
    setTimeout(() => setCopied(false), 2500)
  }

  // ── PIX QR step ─────────────────────────────────────────────────────────
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
              Pagar diferença do upgrade
            </h3>
            <button onClick={onClose} className="p-1 rounded hover:bg-white/5"
              style={{ color: '#5A7A9A' }}><X className="h-5 w-5" /></button>
          </div>

          <div className="p-6 space-y-4">
            <div className="text-center">
              <p className="text-xs" style={{ color: '#8AA8C8' }}>Total proporcional a pagar</p>
              <p className="text-3xl font-bold font-mono mt-1" style={{ color: '#00FF94' }}>
                {fmtBRL(chargeValue)}
              </p>
            </div>

            <div className="rounded-xl bg-white p-4 flex items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`data:image/png;base64,${pixQr.encodedImage}`}
                alt="QR Code PIX" className="w-56 h-56" />
            </div>

            <p className="text-xs text-center" style={{ color: '#8AA8C8' }}>
              Escaneie o QR Code com o app do seu banco
            </p>

            <div>
              <label className="text-[11px] font-bold uppercase tracking-widest mb-2 block"
                style={{ color: '#5A7A9A' }}>Ou copie o código</label>
              <div className="rounded-lg border p-3 flex items-center gap-2"
                style={{ background: '#0D1320', borderColor: '#1E2D45' }}>
                <code className="text-[10px] flex-1 truncate font-mono"
                  style={{ color: '#E8F0FE' }}>{pixQr.payload}</code>
                <button onClick={handleCopyPix}
                  className="shrink-0 p-2 rounded hover:bg-white/5 transition-colors"
                  style={{ color: copied ? '#00FF94' : '#00E5FF' }}>
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="rounded-lg border p-3"
              style={{ background: 'rgba(255,184,0,.06)', borderColor: 'rgba(255,184,0,.2)' }}>
              <p className="text-[11px]" style={{ color: '#FFB800' }}>
                ⏱ Seu plano novo já está ativo. Após pagar a diferença, o upgrade se completa.
                Pode fechar essa tela.
              </p>
            </div>

            <button onClick={onClose}
              className="w-full rounded-lg py-3 text-sm font-bold border transition-colors hover:bg-white/5"
              style={{ borderColor: '#1E2D45', color: '#E8F0FE' }}>Fechar</button>
          </div>
        </div>
      </div>
    )
  }

  // ── Success step (cartão ou free) ────────────────────────────────────────
  if (step === 'success') {
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
              <h3 className="text-xl font-bold" style={{ color: '#E8F0FE' }}>Upgrade concluído!</h3>
              <p className="text-sm mt-2" style={{ color: '#8AA8C8' }}>{successMsg}</p>
              {successMode === 'card' && chargeValue > 0 && (
                <p className="text-sm mt-2" style={{ color: '#8AA8C8' }}>
                  Diferença cobrada: <strong style={{ color: '#00FF94' }}>{fmtBRL(chargeValue)}</strong>
                </p>
              )}
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

  // ── Confirm step ────────────────────────────────────────────────────────
  if (step === 'confirm' && selectedPlan && previews[selectedPlan]?.ok) {
    const p = previews[selectedPlan] as Extract<Preview, { ok: true }>
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ background: 'rgba(0,0,0,0.7)' }} onClick={onClose}>
        <div className="rounded-2xl border w-full max-w-md max-h-[95vh] overflow-y-auto"
          style={{ background: '#0F1A2B', borderColor: '#2A3D5C' }}
          onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 z-10"
            style={{ background: '#0F1A2B', borderColor: '#1E2D45' }}>
            <h3 className="text-lg font-bold" style={{ color: '#E8F0FE' }}>Confirmar upgrade</h3>
            <button onClick={onClose} className="p-1 rounded hover:bg-white/5"
              style={{ color: '#5A7A9A' }}><X className="h-5 w-5" /></button>
          </div>

          <div className="p-6 space-y-4">
            <div className="rounded-lg border p-4 space-y-2"
              style={{ background: '#0D1320', borderColor: '#1E2D45' }}>
              <Row label="Plano atual">
                <span className="capitalize" style={{ color: '#E8F0FE' }}>{p.currentPlan}</span>
                <span className="text-xs ml-2" style={{ color: '#8AA8C8' }}>
                  ({fmtBRL(p.currentPriceCents)}/mês)
                </span>
              </Row>
              <Row label="Novo plano">
                <span className="capitalize font-bold" style={{ color: '#00E5FF' }}>{p.newPlan}</span>
                <span className="text-xs ml-2" style={{ color: '#8AA8C8' }}>
                  ({fmtBRL(p.newPriceCents)}/mês)
                </span>
              </Row>
              <div className="border-t pt-2" style={{ borderColor: '#1E2D45' }} />
              <Row label="Dias usados">
                <span style={{ color: '#E8F0FE' }}>{p.daysUsed} de 30</span>
              </Row>
              <Row label="Crédito proporcional">
                <span className="font-mono" style={{ color: '#00FF94' }}>
                  -{fmtBRL(p.creditCents)}
                </span>
              </Row>
              <Row label="Próxima cobrança">
                <span className="font-mono text-xs" style={{ color: '#8AA8C8' }}>
                  {new Date(p.nextDueDate).toLocaleDateString('pt-BR')}
                </span>
              </Row>
            </div>

            <div className="rounded-lg border p-4 flex justify-between items-center"
              style={{ background: 'rgba(0,255,148,.06)', borderColor: 'rgba(0,255,148,.3)' }}>
              <span className="text-sm font-bold" style={{ color: '#E8F0FE' }}>Total a pagar agora</span>
              <span className="text-2xl font-bold font-mono" style={{ color: '#00FF94' }}>
                {fmtBRL(p.proratedChargeCents)}
              </span>
            </div>

            <p className="text-[11px]" style={{ color: '#8AA8C8' }}>
              {p.paymentMethod === 'CREDIT_CARD'
                ? '💳 Será cobrado no cartão salvo. Pagamento processado imediatamente.'
                : '📱 Vamos gerar um QR code PIX pra você pagar a diferença proporcional.'}
            </p>

            <div className="flex gap-2">
              <button onClick={() => setStep('choose')}
                className="flex-1 rounded-lg py-3 text-sm font-bold border transition-colors hover:bg-white/5"
                style={{ borderColor: '#1E2D45', color: '#8AA8C8' }}>Voltar</button>
              <button onClick={handleExecute} disabled={executing}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg py-3 text-sm font-bold transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #00E5FF, #00FF94)', color: '#080C14' }}>
                {executing ? <><Loader2 className="h-4 w-4 animate-spin" /> Processando…</>
                            : 'Confirmar upgrade'}
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Choose step (default) ───────────────────────────────────────────────
  const RANK: Record<Plan, number> = { basico: 0, pro: 1, premium: 2 }
  const upgradeable = plansForProduct(product).filter(p => RANK[p.plan] > RANK[currentPlan])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)' }} onClick={onClose}>
      <div className="rounded-2xl border w-full max-w-md max-h-[95vh] overflow-y-auto"
        style={{ background: '#0F1A2B', borderColor: '#2A3D5C' }}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 z-10"
          style={{ background: '#0F1A2B', borderColor: '#1E2D45' }}>
          <h3 className="text-lg font-bold" style={{ color: '#E8F0FE' }}>
            Upgrade {productLabel}
          </h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/5"
            style={{ color: '#5A7A9A' }}><X className="h-5 w-5" /></button>
        </div>

        <div className="p-6 space-y-3">
          {upgradeable.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm" style={{ color: '#8AA8C8' }}>
                Você já está no plano mais alto disponível!
              </p>
            </div>
          ) : loadingPreviews ? (
            <div className="flex items-center justify-center py-12" style={{ color: '#5A7A9A' }}>
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : (
            <>
              <p className="text-xs mb-2" style={{ color: '#8AA8C8' }}>
                Escolha o novo plano. Calculamos crédito proporcional pelos dias não usados.
              </p>
              {upgradeable.map(plan => {
                const prev = previews[plan.plan]
                if (!prev?.ok) {
                  return (
                    <div key={plan.plan} className="rounded-lg border p-4"
                      style={{ background: '#0D1320', borderColor: '#1E2D45' }}>
                      <p className="text-sm font-bold capitalize" style={{ color: '#5A7A9A' }}>
                        {plan.plan}
                      </p>
                      <p className="text-xs mt-1" style={{ color: '#FF4D6D' }}>
                        {prev?.ok === false ? prev.error : 'Indisponível'}
                      </p>
                    </div>
                  )
                }
                return (
                  <button key={plan.plan} type="button"
                    onClick={() => { setSelectedPlan(plan.plan); setStep('confirm') }}
                    className="w-full rounded-lg border p-4 text-left transition-colors hover:bg-white/[0.02]"
                    style={{ background: '#0D1320', borderColor: '#1E2D45' }}>
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="text-base font-bold capitalize" style={{ color: '#E8F0FE' }}>
                          {plan.plan === 'pro' ? 'Pro' : 'Premium'}
                        </p>
                        <p className="text-xs mt-0.5" style={{ color: '#8AA8C8' }}>
                          {fmtBRL(plan.priceCents)}/mês
                        </p>
                      </div>
                      <ArrowRight className="h-5 w-5" style={{ color: '#00E5FF' }} />
                    </div>
                    <div className="text-xs space-y-1" style={{ color: '#8AA8C8' }}>
                      <p>Crédito disponível: <span className="font-mono" style={{ color: '#00FF94' }}>
                        {fmtBRL(prev.creditCents)}
                      </span></p>
                      <p className="font-bold">
                        Você paga agora: <span className="font-mono" style={{ color: '#00FF94' }}>
                          {fmtBRL(prev.proratedChargeCents)}
                        </span>
                      </p>
                    </div>
                  </button>
                )
              })}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span style={{ color: '#8AA8C8' }}>{label}</span>
      <span>{children}</span>
    </div>
  )
}
