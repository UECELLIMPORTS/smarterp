'use client'

import { useState, useTransition } from 'react'
import {
  Package, CheckCircle, AlertTriangle, Ban, Loader2, Save, Store,
} from 'lucide-react'
import { saveSettings, type TenantSettings, type StockControlMode } from '@/actions/settings'

type Props = {
  initialSettings: TenantSettings
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
    color: '#64748B',
  },
  {
    value: 'warn',
    label: 'Avisar (recomendado)',
    description: 'Exibe um aviso ao tentar vender produto com estoque zero ou negativo, mas permite continuar a venda.',
    icon: <AlertTriangle className="h-5 w-5" />,
    color: '#FFB800',
  },
  {
    value: 'block',
    label: 'Bloquear',
    description: 'Impede completamente a venda de produtos sem estoque disponível (quantidade ≤ 0).',
    icon: <Ban className="h-5 w-5" />,
    color: '#FF5C5C',
  },
]

export function ConfiguracoesClient({ initialSettings }: Props) {
  const [settings, setSettings] = useState<TenantSettings>(initialSettings)
  const [custoFixoStr, setCustoFixoStr] = useState(
    initialSettings.fisica_fixed_cost_cents != null
      ? (initialSettings.fisica_fixed_cost_cents / 100).toFixed(2).replace('.', ',')
      : ''
  )
  const [saving, startSave]     = useTransition()
  const [saved, setSaved]       = useState(false)
  const [error, setError]       = useState('')

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

      {/* Estoque section */}
      <div className="rounded-xl border overflow-hidden" style={{ background: '#111827', borderColor: '#1E2D45' }}>
        <div className="flex items-center gap-3 border-b px-5 py-4" style={{ borderColor: '#1E2D45' }}>
          <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: '#00FF9418' }}>
            <Package className="h-4 w-4" style={{ color: '#00FF94' }} />
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
                  : { borderColor: '#1E2D45', background: 'transparent' }
                }
              >
                {/* Radio indicator */}
                <div
                  className="mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 flex items-center justify-center"
                  style={{ borderColor: active ? opt.color : '#374151' }}
                >
                  {active && (
                    <div className="h-2 w-2 rounded-full" style={{ background: opt.color }} />
                  )}
                </div>

                {/* Icon */}
                <div
                  className="mt-0.5 shrink-0"
                  style={{ color: active ? opt.color : '#64748B' }}
                >
                  {opt.icon}
                </div>

                {/* Text */}
                <div className="min-w-0">
                  <p className="text-sm font-semibold" style={{ color: active ? opt.color : '#E2E8F0' }}>
                    {opt.label}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">{opt.description}</p>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Custo fixo da loja física */}
      <div className="rounded-xl border overflow-hidden" style={{ background: '#111827', borderColor: '#1E2D45' }}>
        <div className="flex items-center gap-3 border-b px-5 py-4" style={{ borderColor: '#1E2D45' }}>
          <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: '#FFAA0018' }}>
            <Store className="h-4 w-4" style={{ color: '#FFAA00' }} />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-text">Custo fixo da loja física</h2>
            <p className="text-xs text-muted">Usado no dashboard de Canais pra calcular break-even</p>
          </div>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: '#5A7A9A' }}>
              Valor mensal
            </label>
            <div className="relative max-w-xs">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: '#8AA8C8' }}>R$</span>
              <input
                value={custoFixoStr}
                onChange={e => setCustoFixoStr(e.target.value.replace(/[^0-9.,]/g, ''))}
                placeholder="15.000,00"
                className="w-full rounded-lg border pl-10 pr-3 py-2.5 text-sm outline-none font-mono"
                style={{ background: '#0D1320', borderColor: '#1E2D45', color: '#E8F0FE' }}
                inputMode="decimal"
              />
            </div>
            <p className="text-[11px] mt-2" style={{ color: '#8AA8C8' }}>
              <strong>Inclua:</strong> aluguel + luz + água + internet + salários alocados à física + contabilidade + outros recorrentes.
              Deixe em branco se ainda não souber — o break-even só aparece quando estiver preenchido.
            </p>
          </div>

          <div className="rounded-lg border px-3 py-2.5 flex items-start gap-2 text-[11px]"
            style={{ background: 'rgba(0,229,255,.05)', borderColor: 'rgba(0,229,255,.25)' }}>
            <CheckCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" style={{ color: '#00E5FF' }} />
            <span style={{ color: '#8AA8C8' }}>
              No futuro, dará pra cadastrar cada despesa recorrente separadamente (aluguel, salário, conta de luz) e esse total vai ser calculado automático.
              Por enquanto, <strong>soma tudo e coloca o valor aqui</strong>.
            </span>
          </div>
        </div>
      </div>

      {/* Save button */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm" style={{ background: '#FF5C5C18', color: '#FF5C5C', border: '1px solid #FF5C5C40' }}>
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="flex items-center justify-end gap-3">
        {saved && (
          <span className="flex items-center gap-1.5 text-sm" style={{ color: '#00FF94' }}>
            <CheckCircle className="h-4 w-4" />
            Configurações salvas!
          </span>
        )}
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold text-black disabled:opacity-60"
          style={{ background: '#00FF94' }}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? 'Salvando…' : 'Salvar Configurações'}
        </button>
      </div>
    </div>
  )
}
