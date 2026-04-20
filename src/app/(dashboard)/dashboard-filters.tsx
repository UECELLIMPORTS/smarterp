'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'

type Period = 'today' | '7d' | '30d' | 'custom'
type Origin = 'all' | 'erp' | 'checksmart'

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

export function DashboardFilters() {
  const router = useRouter()
  const params = useSearchParams()

  const period = (params.get('period') ?? 'today') as Period
  const origin = (params.get('origin') ?? 'all') as Origin

  const [showCustom, setShowCustom] = useState(period === 'custom')
  const [fromDate, setFromDate]     = useState(params.get('from') ?? '')
  const [toDate, setToDate]         = useState(params.get('to') ?? '')

  function navigate(p: Period, o: Origin, f?: string, t?: string) {
    const sp = new URLSearchParams({ period: p, origin: o })
    if (p === 'custom' && f && t) { sp.set('from', f); sp.set('to', t) }
    router.push(`/?${sp.toString()}`)
  }

  return (
    <div className="flex flex-wrap items-center gap-3">

      {/* Period */}
      <div className="flex rounded-xl border overflow-hidden" style={{ borderColor: '#1E2D45' }}>
        {PERIODS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => {
              if (id === 'custom') { setShowCustom(v => !v); return }
              setShowCustom(false)
              navigate(id, origin)
            }}
            className="border-r px-4 py-2 text-xs font-medium transition-colors last:border-0"
            style={{
              borderColor: '#1E2D45',
              ...(period === id
                ? { background: '#00E5FF18', color: '#00E5FF' }
                : { color: '#64748B' }),
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
            style={{ background: '#111827', borderColor: '#1E2D45' }}
          />
          <span className="text-xs text-muted">até</span>
          <input
            type="date"
            value={toDate}
            onChange={e => setToDate(e.target.value)}
            className="rounded-lg border px-2.5 py-1.5 text-xs text-text outline-none focus:border-accent/60"
            style={{ background: '#111827', borderColor: '#1E2D45' }}
          />
          <button
            onClick={() => {
              if (!fromDate || !toDate) return
              setShowCustom(false)
              navigate('custom', origin, fromDate, toDate)
            }}
            disabled={!fromDate || !toDate}
            className="rounded-lg px-3 py-1.5 text-xs font-semibold transition-opacity disabled:opacity-50"
            style={{ background: '#00E5FF', color: '#080C14' }}
          >
            Aplicar
          </button>
        </div>
      )}

      {/* Origin */}
      <div className="flex rounded-xl border overflow-hidden" style={{ borderColor: '#1E2D45' }}>
        {ORIGINS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => navigate(period, id, params.get('from') ?? undefined, params.get('to') ?? undefined)}
            className="border-r px-4 py-2 text-xs font-medium transition-colors last:border-0"
            style={{
              borderColor: '#1E2D45',
              ...(origin === id
                ? { background: '#00FF9418', color: '#00FF94' }
                : { color: '#64748B' }),
            }}
          >
            {label}
          </button>
        ))}
      </div>

    </div>
  )
}
