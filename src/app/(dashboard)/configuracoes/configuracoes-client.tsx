'use client'

import { useRef, useState, useTransition } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import {
  Package, CheckCircle, AlertTriangle, Ban, Loader2, Save,
  Sparkles, ChevronRight, Users, FileText, ImageIcon, Shield, Trash2, Upload,
} from 'lucide-react'
import { toast } from 'sonner'
import { saveSettings, type TenantSettings, type StockControlMode } from '@/actions/settings'
import {
  saveBrandingSettings, uploadTenantLogo, removeTenantLogo,
  type BrandingSettings,
} from '@/actions/comprovante'
import type { RecurringExpense } from '@/lib/expense-categories'
import { RecurringExpensesSection } from './recurring-expenses-section'

type Props = {
  initialSettings: TenantSettings
  isOwner?:        boolean
  initialExpenses: RecurringExpense[]
  initialBranding: BrandingSettings
}

const STOCK_OPTIONS: {
  value: StockControlMode
  label: string
  description: string
  icon: React.ReactNode
  color: string
}[] = [
  {
    value: 'off',
    label: 'Desativado',
    description: 'Sem controle de estoque. Qualquer produto pode ser vendido independente da quantidade disponível.',
    icon: <CheckCircle className="h-5 w-5" />,
    color: '#94A3B8',
  },
  {
    value: 'warn',
    label: 'Avisar (recomendado)',
    description: 'Exibe um aviso ao tentar vender produto com estoque zero ou negativo, mas permite continuar a venda.',
    icon: <AlertTriangle className="h-5 w-5" />,
    color: '#F59E0B',
  },
  {
    value: 'block',
    label: 'Bloquear',
    description: 'Impede completamente a venda de produtos sem estoque disponível (quantidade ≤ 0).',
    icon: <Ban className="h-5 w-5" />,
    color: '#EF4444',
  },
]

export function ConfiguracoesClient({ initialSettings, isOwner = false, initialExpenses, initialBranding }: Props) {
  const [settings, setSettings] = useState<TenantSettings>(initialSettings)
  const [custoFixoStr, setCustoFixoStr] = useState(
    initialSettings.fisica_fixed_cost_cents != null
      ? (initialSettings.fisica_fixed_cost_cents / 100).toFixed(2).replace('.', ',')
      : ''
  )
  const [saving, startSave]     = useTransition()
  const [saved, setSaved]       = useState(false)
  const [error, setError]       = useState('')

  // ── Branding (logo + garantia padrão + termo) ─────────────────────────
  const [logoUrl, setLogoUrl]                 = useState<string | null>(initialBranding.logoUrl)
  const [warrantyDays, setWarrantyDays]       = useState<number>(initialBranding.warrantyDays)
  const [warrantyTerms, setWarrantyTerms]     = useState<string>(initialBranding.warrantyTerms ?? '')
  const [savingBranding, startSaveBranding]   = useTransition()
  const [uploadingLogo, setUploadingLogo]     = useState(false)
  const fileInputRef                          = useRef<HTMLInputElement>(null)

  function handleSaveBranding() {
    startSaveBranding(async () => {
      const res = await saveBrandingSettings({ warrantyDays, warrantyTerms: warrantyTerms || null })
      if (res.ok) toast.success('Branding salvo.')
      else toast.error(res.error)
    })
  }

  async function handleUploadLogo(file: File) {
    setUploadingLogo(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await uploadTenantLogo(fd)
      if (res.ok) {
        setLogoUrl(res.data?.url ?? null)
        toast.success('Logo atualizada.')
      } else {
        toast.error(res.error)
      }
    } finally {
      setUploadingLogo(false)
    }
  }

  async function handleRemoveLogo() {
    if (!confirm('Remover a logo da empresa?')) return
    const res = await removeTenantLogo()
    if (res.ok) { setLogoUrl(null); toast.success('Logo removida.') }
    else toast.error(res.error)
  }

  function handleSave() {
    setError('')
    setSaved(false)

    // Converte custoFixoStr em cents (ou null se vazio)
    const parsed = parseFloat(custoFixoStr.replace(/\./g, '').replace(',', '.'))
    const custoFixoCents = custoFixoStr.trim() === ''
      ? null
      : Number.isFinite(parsed) && parsed >= 0
        ? Math.round(parsed * 100)
        : -1
    if (custoFixoCents === -1) {
      setError('Custo fixo da loja física inválido. Use formato 15.000,00')
      return
    }

    const toSave: TenantSettings = { ...settings, fisica_fixed_cost_cents: custoFixoCents }

    startSave(async () => {
      try {
        await saveSettings(toSave)
        setSettings(toSave)
        setSaved(true)
        setTimeout(() => setSaved(false), 3000)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Erro ao salvar configurações.')
      }
    })
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-text">Configurações</h1>
        <p className="mt-1 text-sm text-muted">Personalize o comportamento do sistema</p>
      </div>

      {/* Cards de gestão (owner-only) */}
      {isOwner && (
        <div className="space-y-3">
          <Link href="/configuracoes/assinatura"
            className="block rounded-xl border p-4 transition-all hover:border-cyan-400/40"
            style={{ background: '#1B2638', borderColor: '#2A3650' }}>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg shrink-0"
                style={{ background: 'rgba(255,184,0,.15)' }}>
                <Sparkles className="h-5 w-5" style={{ color: '#F59E0B' }} />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-sm font-semibold text-text">Minha Assinatura</h2>
                <p className="text-xs text-muted mt-0.5">
                  Veja seu plano, mude de plano ou contrate outros produtos
                </p>
              </div>
              <ChevronRight className="h-5 w-5 shrink-0" style={{ color: '#94A3B8' }} />
            </div>
          </Link>

          <Link href="/configuracoes/equipe"
            className="block rounded-xl border p-4 transition-all hover:border-green-400/40"
            style={{ background: '#1B2638', borderColor: '#2A3650' }}>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg shrink-0"
                style={{ background: 'rgba(16,185,129,.15)' }}>
                <Users className="h-5 w-5" style={{ color: '#10B981' }} />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-sm font-semibold text-text">Equipe</h2>
                <p className="text-xs text-muted mt-0.5">
                  Convide membros pra trabalhar com você na mesma conta
                </p>
              </div>
              <ChevronRight className="h-5 w-5 shrink-0" style={{ color: '#94A3B8' }} />
            </div>
          </Link>

          <Link href="/configuracoes/fiscal"
            className="block rounded-xl border p-4 transition-all hover:border-blue-400/40"
            style={{ background: '#1B2638', borderColor: '#2A3650' }}>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg shrink-0"
                style={{ background: 'rgba(59,130,246,.15)' }}>
                <FileText className="h-5 w-5" style={{ color: '#3B82F6' }} />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-sm font-semibold text-text">Fiscal — NF-e, NFC-e, NFS-e</h2>
                <p className="text-xs text-muted mt-0.5">
                  Configure regime tributário, certificado A1 e ative emissão de notas fiscais
                </p>
              </div>
              <ChevronRight className="h-5 w-5 shrink-0" style={{ color: '#94A3B8' }} />
            </div>
          </Link>
        </div>
      )}

      {/* Estoque section */}
      <div className="rounded-xl border overflow-hidden" style={{ background: '#1B2638', borderColor: '#2A3650' }}>
        <div className="flex items-center gap-3 border-b px-5 py-4" style={{ borderColor: '#2A3650' }}>
          <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: '#10B98118' }}>
            <Package className="h-4 w-4" style={{ color: '#10B981' }} />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-text">Controle de Estoque</h2>
            <p className="text-xs text-muted">Define o que acontece ao vender produto com estoque insuficiente</p>
          </div>
        </div>

        <div className="p-5 space-y-3">
          {STOCK_OPTIONS.map(opt => {
            const active = settings.stock_control_mode === opt.value
            return (
              <button
                key={opt.value}
                onClick={() => setSettings(s => ({ ...s, stock_control_mode: opt.value }))}
                className="w-full flex items-start gap-4 rounded-xl border p-4 text-left transition-all"
                style={active
                  ? { borderColor: opt.color, background: `${opt.color}0D` }
                  : { borderColor: '#2A3650', background: 'transparent' }
                }
              >
                {/* Radio indicator */}
                <div
                  className="mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 flex items-center justify-center"
                  style={{ borderColor: active ? opt.color : '#3A4868' }}
                >
                  {active && (
                    <div className="h-2 w-2 rounded-full" style={{ background: opt.color }} />
                  )}
                </div>

                {/* Icon */}
                <div
                  className="mt-0.5 shrink-0"
                  style={{ color: active ? opt.color : '#94A3B8' }}
                >
                  {opt.icon}
                </div>

                {/* Text */}
                <div className="min-w-0">
                  <p className="text-sm font-semibold" style={{ color: active ? opt.color : '#F8FAFC' }}>
                    {opt.label}
                  </p>
                  <p className="mt-0.5 text-xs" style={{ color: '#94A3B8' }}>{opt.description}</p>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Branding & Comprovante de Venda ─────────────────────────── */}
      <div className="rounded-xl border overflow-hidden" style={{ background: '#1B2638', borderColor: '#2A3650' }}>
        <div className="flex items-center gap-3 border-b px-5 py-4" style={{ borderColor: '#2A3650' }}>
          <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: 'rgba(168, 139, 250, 0.18)' }}>
            <Shield className="h-4 w-4" style={{ color: '#A78BFA' }} />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-text">Comprovante de Venda & Garantia</h2>
            <p className="text-xs text-muted">Logo da empresa, garantia padrão e termo que vai no PDF</p>
          </div>
        </div>

        <div className="p-5 space-y-5">
          {/* Logo */}
          <div>
            <label className="mb-2 block text-xs font-medium text-muted">Logo da empresa</label>
            <div className="flex items-center gap-4">
              <div
                className="flex h-20 w-20 items-center justify-center rounded-lg border overflow-hidden shrink-0"
                style={{ background: '#0F172A', borderColor: '#2A3650' }}
              >
                {logoUrl ? (
                  <Image src={logoUrl} alt="Logo" width={80} height={80} className="h-full w-full object-contain" unoptimized />
                ) : (
                  <ImageIcon className="h-8 w-8" style={{ color: '#475569' }} />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted mb-2">PNG, JPG, SVG ou WEBP. Até 2MB. Aparece no topo do comprovante.</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingLogo}
                    className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                    style={{ background: '#A78BFA', color: '#0F172A' }}
                  >
                    {uploadingLogo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                    {uploadingLogo ? 'Enviando…' : (logoUrl ? 'Trocar logo' : 'Enviar logo')}
                  </button>
                  {logoUrl && (
                    <button
                      onClick={handleRemoveLogo}
                      disabled={uploadingLogo}
                      className="flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs disabled:opacity-50"
                      style={{ borderColor: '#3A4868', color: '#EF4444' }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Remover
                    </button>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  className="hidden"
                  onChange={e => {
                    const f = e.target.files?.[0]
                    if (f) handleUploadLogo(f)
                    e.target.value = ''
                  }}
                />
              </div>
            </div>
          </div>

          {/* Garantia padrão */}
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Garantia padrão (em dias)</label>
            <input
              type="number"
              min={0} max={3650}
              value={warrantyDays}
              onChange={e => setWarrantyDays(Math.max(0, Math.min(3650, parseInt(e.target.value, 10) || 0)))}
              className="w-full max-w-xs rounded-lg border bg-transparent px-3 py-2 text-sm text-text"
              style={{ borderColor: '#2A3650' }}
            />
            <p className="mt-1 text-xs text-muted">
              Usado quando o produto não tem garantia específica. Sugestão: <strong>90</strong> dias (acessórios eletrônicos, semi-novos) ou <strong>365</strong> (celulares novos lacrados).
            </p>
          </div>

          {/* Termo de garantia */}
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Termo de garantia (texto do PDF)</label>
            <textarea
              value={warrantyTerms}
              onChange={e => setWarrantyTerms(e.target.value)}
              placeholder="Vazio = usa template padrão CDC com cláusulas de cobertura, exclusões e foro."
              rows={8}
              className="w-full rounded-lg border bg-transparent px-3 py-2 text-sm text-text font-mono"
              style={{ borderColor: '#2A3650' }}
            />
            <p className="mt-1 text-xs text-muted">
              Aparece na 2ª página do comprovante. Deixe vazio pra usar nosso template padrão (Lei 8.078/90).
            </p>
          </div>

          <div className="flex justify-end">
            <button
              onClick={handleSaveBranding}
              disabled={savingBranding}
              className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-60"
              style={{ background: '#A78BFA', color: '#0F172A' }}
            >
              {savingBranding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {savingBranding ? 'Salvando…' : 'Salvar branding'}
            </button>
          </div>
        </div>
      </div>

      {/* Custos fixos detalhados (substitui o campo único) */}
      <RecurringExpensesSection initial={initialExpenses} />

      {/* Save button */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm" style={{ background: '#EF444418', color: '#EF4444', border: '1px solid #EF444440' }}>
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="flex items-center justify-end gap-3">
        {saved && (
          <span className="flex items-center gap-1.5 text-sm" style={{ color: '#10B981' }}>
            <CheckCircle className="h-4 w-4" />
            Configurações salvas!
          </span>
        )}
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold text-black disabled:opacity-60"
          style={{ background: '#10B981' }}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? 'Salvando…' : 'Salvar Configurações'}
        </button>
      </div>
    </div>
  )
}
