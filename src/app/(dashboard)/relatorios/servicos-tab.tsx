'use client'

/**
 * Aba Serviços — rankings das OS. Cópia de
 * checksmart/src/components/reports/service-insights-panel.tsx — ao mudar
 * aqui, copiar pro outro repo.
 */

import { Download, Smartphone, Wrench, BatteryCharging, MonitorSmartphone, MapPin, Info } from 'lucide-react'
import type { RankRow, ServiceInsights } from '@/lib/service-insights'

type CardDef = {
  key:   keyof Pick<ServiceInsights, 'topDevices' | 'topRepairs' | 'batteryModels' | 'screenModels' | 'topDistricts'>
  title: string
  hint:  string
  icon:  React.ElementType
  color: string
}

const CARDS: CardDef[] = [
  { key: 'topDevices',    title: 'Top 10 aparelhos',          hint: 'Modelos com mais OS',            icon: Smartphone,        color: '#22C55E' },
  { key: 'topRepairs',    title: 'Top 10 reparos',            hint: 'Tipos de serviço mais feitos',   icon: Wrench,            color: '#38BDF8' },
  { key: 'batteryModels', title: 'Troca de bateria — modelos', hint: 'Aparelhos que mais trocaram bateria', icon: BatteryCharging, color: '#F59E0B' },
  { key: 'screenModels',  title: 'Troca de tela — modelos',   hint: 'Aparelhos que mais trocaram tela', icon: MonitorSmartphone, color: '#A78BFA' },
  { key: 'topDistricts',  title: 'Top 10 bairros',            hint: 'Bairro do cadastro do cliente',  icon: MapPin,            color: '#F472B6' },
]

function RankList({ rows, color }: { rows: RankRow[]; color: string }) {
  if (rows.length === 0) {
    return <p className="py-6 text-center text-xs text-zinc-500">Sem dados no período</p>
  }
  const max = rows[0].count || 1
  return (
    <ol className="space-y-2">
      {rows.map((r, i) => (
        <li key={r.label} className="text-xs">
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="flex items-center gap-2 min-w-0">
              <span className="w-4 shrink-0 text-right tabular-nums text-zinc-500">{i + 1}</span>
              <span className="truncate text-zinc-200" title={r.label}>{r.label}</span>
            </span>
            <span className="shrink-0 font-semibold tabular-nums text-zinc-100">{r.count}</span>
          </div>
          <div className="ml-6 h-1.5 rounded-full bg-zinc-800">
            <div className="h-1.5 rounded-full" style={{ width: `${Math.max(4, (r.count / max) * 100)}%`, background: color }} />
          </div>
        </li>
      ))}
    </ol>
  )
}

function exportCsv(data: ServiceInsights) {
  const lines: string[] = ['Ranking;Posição;Item;Quantidade de OS']
  for (const c of CARDS) {
    data[c.key].forEach((r, i) => lines.push([c.title, i + 1, `"${r.label.replace(/"/g, '""')}"`, r.count].join(';')))
  }
  const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `ranking-servicos-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export function ServiceInsightsPanel({ data, periodLabel }: { data: ServiceInsights; periodLabel?: string }) {
  const unclassified = data.totalOrders - data.classifiedOrders
  const noDistrict   = data.totalOrders - data.withDistrict

  return (
    <div className="rounded-xl border border-[#2A3650] bg-[#1B2638] p-4 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <Wrench className="h-4 w-4 text-[#22C55E]" />
            <p className="text-sm font-semibold text-zinc-200">Ranking de serviços</p>
          </div>
          <p className="mt-0.5 text-xs text-zinc-500">
            {data.totalOrders} OS{periodLabel ? ` · ${periodLabel}` : ''} · canceladas não entram
          </p>
        </div>
        <button
          onClick={() => exportCsv(data)}
          disabled={data.totalOrders === 0}
          className="flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800 disabled:opacity-40"
        >
          <Download className="h-3.5 w-3.5" />
          Baixar CSV
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {CARDS.map(c => {
          const Icon = c.icon
          return (
            <div key={c.key} className="rounded-lg border border-[#2A3650] bg-[#131C2A] p-3">
              <div className="mb-3 flex items-center gap-2">
                <Icon className="h-4 w-4 shrink-0" style={{ color: c.color }} />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-zinc-200">{c.title}</p>
                  <p className="text-[10px] text-zinc-500">{c.hint}</p>
                </div>
              </div>
              <RankList rows={data[c.key]} color={c.color} />
            </div>
          )
        })}
      </div>

      <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-zinc-500">
        <Info className="h-3.5 w-3.5 shrink-0 mt-px" />
        <span>
          O tipo de reparo é lido do texto da OS (problema relatado, diagnóstico, descrição do reparo) e do nome das peças —
          uma OS com &quot;tela e bateria&quot; conta nas duas.
          {unclassified > 0 && ` ${unclassified} OS sem descrição reconhecível ficaram fora do ranking de reparos.`}
          {noDistrict > 0 && ` ${noDistrict} OS de clientes sem bairro no cadastro ficaram fora do ranking de bairros.`}
        </span>
      </p>
    </div>
  )
}
