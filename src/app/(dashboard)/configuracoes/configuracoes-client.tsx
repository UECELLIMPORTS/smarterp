'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import {
  Package, CheckCircle, AlertTriangle, Ban, Loader2, Save, Store,
  Sparkles, ChevronRight, Users,
} from 'lucide-react'
import { saveSettings, type TenantSettings, type StockControlMode } from '@/actions/settings'
import type { RecurringExpense } from '@/lib/expense-categories'
import { RecurringExpensesSection } from './recurring-expenses-section'

type Props = {
  initialSettings: TenantSettings
  isOwner?:        boolean
  initialExpenses: RecurringExpense[]
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
    color: '#A78BFA',
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

export function ConfiguracoesClient({ initialSettings, isOwner = false, initialExpenses }: Props) {
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

      {/* Cards de gestão (owner-only) */}
      {isOwner && (
        <div className="space-y-3">
          <Link href="/configuracoes/assinatura"
            className="block rounded-xl border p-4 transition-all hover:border-cyan-400/40"
            style={{ background: '#2A2440', borderColor: '#3D3656' }}>
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
              <ChevronRight className="h-5 w-5 shrink-0" style={{ color: '#A78BFA' }} />
            </div>
          </Link>

          <Link href="/configuracoes/equipe"
            className="block rounded-xl border p-4 transition-all hover:border-green-400/40"
            style={{ background: '#2A2440', borderColor: '#3D3656' }}>
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
              <ChevronRight className="h-5 w-5 shrink-0" style={{ color: '#A78BFA' }} />
            </div>
          </Link>
        </div>
      )}

      {/* Estoque section */}
      <div className="rounded-xl border overflow-hidden" style={{ background: '#2A2440', borderColor: '#3D3656' }}>
        <div className="flex items-center gap-3 border-b px-5 py-4" style={{ borderColor: '#3D3656' }}>
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
                  : { borderColor: '#3D3656', background: 'transparent' }
                }
              >
                {/* Radio indicator */}
                <div
                  className="mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 flex items-center justify-center"
                  style={{ borderColor: active ? opt.color : '#4C4470' }}
                >
                  {active && (
                    <div className="h-2 w-2 rounded-full" style={{ background: opt.color }} />
                  )}
                </div>

                {/* Icon */}
                <div
                  className="mt-0.5 shrink-0"
                  style={{ color: active ? opt.color : '#A78BFA' }}
                >
                  {opt.icon}
                </div>

                {/* Text */}
                <div className="min-w-0">
                  <p className="text-sm font-semibold" style={{ color: active ? opt.color : '#F8FAFC' }}>
                    {opt.label}
                  </p>
                  <p className="mt-0.5 text-xs" style={{ color: '#A78BFA' }}>{opt.description}</p>
                </div>
              </button>
            )
          })}
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
