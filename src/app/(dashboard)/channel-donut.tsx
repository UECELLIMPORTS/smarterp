'use client'

import Link from 'next/link'
import { Store } from 'lucide-react'
import { channelLabel, channelColor } from '@/lib/sale-channels'

type ChannelItem = {
  value:        string | null
  totalCents:   number
  transactions: number
  sharePercent: number
}

const BRL = (c: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(c / 100)

export function ChannelDonut({ breakdown }: { breakdown: ChannelItem[] }) {
  const total = breakdown.reduce((s, b) => s + b.totalCents, 0)
  const top = breakdown[0]

  // Conic gradient a partir dos segmentos
  let acc = 0
  const segments: string[] = []
  for (const b of breakdown) {
    const color = b.value == null ? '#64748B' : channelColor(b.value)
    const startDeg = Math.round((acc / 100) * 360)
    const endDeg   = Math.round(((acc + b.sharePercent) / 100) * 360)
    segments.push(`${color} ${startDeg}deg ${endDeg}deg`)
    acc += b.sharePercent
  }
  const gradient = segments.length > 0
    ? `conic-gradient(${segments.join(', ')})`
    : '#E2E8F0'

  if (breakdown.length === 0 || total === 0) {
    return (
      <div className="rounded-xl border p-6" style={{ background: '#F8FAFC', borderColor: '#E2E8F0' }}>
        <div className="flex items-center gap-2 mb-4">
          <Store className="h-4 w-4" style={{ color: '#1D4ED8' }} />
          <h2 className="text-sm font-semibold text-text">Faturamento por Canal</h2>
        </div>
        <p className="py-6 text-center text-sm" style={{ color: '#64748B' }}>
          Sem vendas com canal preenchido no período
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border p-6" style={{ background: '#F8FAFC', borderColor: '#E2E8F0' }}>
      <div className="flex items-start justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Store className="h-4 w-4" style={{ color: '#1D4ED8' }} />
          <div>
            <h2 className="text-sm font-semibold text-text">Faturamento por Canal</h2>
            <p className="text-xs" style={{ color: '#64748B' }}>
              Onde as vendas foram fechadas no período
            </p>
          </div>
        </div>
        <Link
          href="/analytics/canais"
          className="text-xs font-semibold hover:underline"
          style={{ color: '#1D4ED8' }}
        >
          Ver análise completa →
        </Link>
      </div>

      {top && top.value != null && (
        <div className="mb-4 rounded-lg border p-3 flex items-center gap-2"
          style={{ background: 'rgba(29,78,216,.06)', borderColor: 'rgba(29,78,216,.3)' }}>
          <span className="h-3 w-3 rounded shrink-0" style={{ background: channelColor(top.value) }} />
          <p className="text-xs" style={{ color: '#0F172A' }}>
            <strong style={{ color: '#1D4ED8' }}>{channelLabel(top.value)}</strong> é o canal principal —{' '}
            {top.sharePercent}% ({BRL(top.totalCents)})
          </p>
        </div>
      )}

      <div className="flex items-center gap-6 flex-wrap">
        <div className="h-40 w-40 rounded-full shrink-0 relative" style={{ background: gradient }}>
          <div className="absolute inset-5 rounded-full flex flex-col items-center justify-center"
            style={{ background: '#F8FAFC' }}>
            <span className="text-[10px] uppercase tracking-wider" style={{ color: '#64748B' }}>Total</span>
            <span className="text-base font-bold font-mono mt-0.5" style={{ color: '#0F172A' }}>
              {BRL(total)}
            </span>
          </div>
        </div>

        <div className="flex-1 min-w-[220px] space-y-1.5">
          {breakdown.map(b => {
            const color = b.value == null ? '#64748B' : channelColor(b.value)
            const label = b.value == null ? 'Não informado' : channelLabel(b.value)
            return (
              <div key={b.value ?? '__no__'} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="h-3 w-3 rounded shrink-0" style={{ background: color }} />
                  <span style={{ color: '#0F172A' }} className="truncate">{label}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                    style={{ background: `${color}26`, color }}>
                    {b.sharePercent}%
                  </span>
                  <span className="font-mono font-semibold" style={{ color: '#475569' }}>
                    {BRL(b.totalCents)}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
