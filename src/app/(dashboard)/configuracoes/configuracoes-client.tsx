'use client'

import { useState, useTransition } from 'react'
import {
  Settings, Package, CheckCircle, AlertTriangle, Ban, Loader2, Save,
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
  const [saving, startSave]     = useTransition()
  const [saved, setSaved]       = useState(false)
  const [error, setError]       = useState('')

  function handleSave() {
    setError('')
    setSaved(false)
    startSave(async () => {
      try {
        await saveSettings(settings)
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

      {/* More settings sections can be added here */}
      <div className="rounded-xl border overflow-hidden" style={{ background: '#111827', borderColor: '#1E2D45' }}>
        <div className="flex items-center gap-3 border-b px-5 py-4" style={{ borderColor: '#1E2D45' }}>
          <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: '#00E5FF18' }}>
            <Settings className="h-4 w-4" style={{ color: '#00E5FF' }} />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-text">Mais configurações</h2>
            <p className="text-xs text-muted">Em breve — novas opções serão adicionadas aqui</p>
          </div>
        </div>
        <div className="px-5 py-8 text-center">
          <p className="text-sm text-muted">Novas configurações serão disponibilizadas em atualizações futuras.</p>
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
