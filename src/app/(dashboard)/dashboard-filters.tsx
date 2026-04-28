'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'

type Period = 'today' | '7d' | '30d' | 'custom'
type Origin = 'all' | 'erp' | 'checksmart'
type OsStatus = 'delivered' | 'pending' | 'all'

const PERIODS: { id: Period; label: string }[] = [
  { id: 'today',  label: 'Hoje' },
  { id: '7d',     label: '7 dias' },
  { id: '30d',    label: '30 dias' },
  { id: 'custom', label: 'Personalizado' },
]

const ORIGINS: { id: Origin; label: string }[] = [
  { id: 'all',        label: 'Todos' },
  { id: 'erp',        label: 'Smart ERP' },
  { id: 'checksmart', label: 'CheckSmart' },
]

const OS_STATUSES: { id: OsStatus; label: string; hint: string }[] = [
  { id: 'delivered', label: 'OS entregues',    hint: 'Apenas faturamento já realizado (padrão)' },
  { id: 'pending',   label: 'OS pendentes',    hint: 'Em diagnóstico, aguardando peças, em reparo, prontas' },
  { id: 'all',       label: 'Todas as OS',     hint: 'Entregues + pendentes (exclui canceladas)' },
]

export function DashboardFilters() {
  const router = useRouter()
  const params = useSearchParams()

  const period   = (params.get('period') ?? 'today') as Period
  const origin   = (params.get('origin') ?? 'all') as Origin
  const osStatus = ((['delivered', 'pending', 'all'].includes(params.get('os_status') ?? '')
    ? params.get('os_status')
    : 'delivered') ?? 'delivered') as OsStatus

  const [showCustom, setShowCustom] = useState(period === 'custom')
  const [fromDate, setFromDate]     = useState(params.get('from') ?? '')
  const [toDate, setToDate]         = useState(params.get('to') ?? '')

  function navigate(p: Period, o: Origin, os: OsStatus, f?: string, t?: string) {
    const sp = new URLSearchParams({ period: p, origin: o, os_status: os })
    if (p === 'custom' && f && t) { sp.set('from', f); sp.set('to', t) }
    router.push(`/?${sp.toString()}`)
  }

  return (
    <div className="flex flex-wrap items-center gap-3">

      {/* Period */}
      <div className="flex rounded-xl border overflow-hidden" style={{ borderColor: '#3D3656' }}>
        {PERIODS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => {
              if (id === 'custom') { setShowCustom(v => !v); return }
              setShowCustom(false)
              navigate(id, origin, osStatus)
            }}
            className="border-r px-4 py-2 text-xs font-medium transition-colors last:border-0"
            style={{
              borderColor: '#3D3656',
              ...(period === id
                ? { background: '#A855F718', color: '#A855F7' }
                : { color: '#A78BFA' }),
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Custom date pickers */}
      {(period === 'custom' || showCustom) && (
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={fromDate}
            onChange={e => setFromDate(e.target.value)}
            className="rounded-lg border px-2.5 py-1.5 text-xs text-text outline-none focus:border-accent/60"
            style={{ background: '#2A2440', borderColor: '#3D3656' }}
          />
          <span className="text-xs text-muted">até</span>
          <input
            type="date"
            value={toDate}
            onChange={e => setToDate(e.target.value)}
            className="rounded-lg border px-2.5 py-1.5 text-xs text-text outline-none focus:border-accent/60"
            style={{ background: '#2A2440', borderColor: '#3D3656' }}
          />
          <button
            onClick={() => {
              if (!fromDate || !toDate) return
              setShowCustom(false)
              navigate('custom', origin, osStatus, fromDate, toDate)
            }}
            disabled={!fromDate || !toDate}
            className="rounded-lg px-3 py-1.5 text-xs font-semibold transition-opacity disabled:opacity-50"
            style={{ background: '#A855F7', color: '#1E1B2E' }}
          >
            Aplicar
          </button>
        </div>
      )}

      {/* Origin */}
      <div className="flex rounded-xl border overflow-hidden" style={{ borderColor: '#3D3656' }}>
        {ORIGINS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => navigate(period, id, osStatus, params.get('from') ?? undefined, params.get('to') ?? undefined)}
            className="border-r px-4 py-2 text-xs font-medium transition-colors last:border-0"
            style={{
              borderColor: '#3D3656',
              ...(origin === id
                ? { background: '#10B98118', color: '#10B981' }
                : { color: '#A78BFA' }),
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Status OS — só faz sentido quando origin inclui CheckSmart */}
      {origin !== 'erp' && (
        <div className="flex rounded-xl border overflow-hidden" style={{ borderColor: '#3D3656' }}>
          {OS_STATUSES.map(({ id, label, hint }) => (
            <button
              key={id}
              onClick={() => navigate(period, origin, id, params.get('from') ?? undefined, params.get('to') ?? undefined)}
              title={hint}
              className="border-r px-4 py-2 text-xs font-medium transition-colors last:border-0"
              style={{
                borderColor: '#3D3656',
                ...(osStatus === id
                  ? { background: '#F59E0B18', color: '#F59E0B' }
                  : { color: '#A78BFA' }),
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}

    </div>
  )
}
