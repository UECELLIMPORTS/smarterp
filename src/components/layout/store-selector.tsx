'use client'

import { useEffect, useRef, useState } from 'react'
import { Store as StoreIcon, ChevronDown, Check, Settings } from 'lucide-react'
import Link from 'next/link'
import type { Store } from '@/actions/stores'
import { useActiveStore } from '@/hooks/use-active-store'

export function StoreSelector({ stores }: { stores: Store[] }) {
  const { active, setActive } = useActiveStore(stores)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Fecha ao clicar fora
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) {
      document.addEventListener('mousedown', handler)
      return () => document.removeEventListener('mousedown', handler)
    }
  }, [open])

  if (stores.length === 0 || !active) return null

  // Se só 1 loja, mostra estática (não clicável)
  if (stores.length === 1) {
    return (
      <div className="hidden sm:flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs"
        style={{ background: `${active.color}20`, color: active.color, border: `1px solid ${active.color}40` }}>
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: active.color }} />
        <span className="font-medium">{active.name}</span>
      </div>
    )
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors hover:opacity-90"
        style={{
          background: `${active.color}15`,
          color:      active.color,
          border:     `1px solid ${active.color}40`,
        }}
        title={`Loja ativa: ${active.name}. Clique pra trocar.`}
      >
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: active.color }} />
        <span className="hidden sm:inline">{active.name}</span>
        <span className="sm:hidden">{active.code}</span>
        <ChevronDown className="h-3 w-3 opacity-70" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 w-64 rounded-lg border shadow-xl"
          style={{ background: '#1E293B', borderColor: '#2D3F55' }}>
          <div className="px-3 py-2 border-b" style={{ borderColor: '#2D3F55' }}>
            <p className="text-[10px] uppercase tracking-wider text-zinc-500">Trocar loja</p>
          </div>
          <ul className="py-1">
            {stores.filter(s => s.is_active).map(s => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => { setOpen(false); setActive(s.id) }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-zinc-800/50 text-left"
                  style={{ color: s.id === active.id ? s.color : '#F1F5F9' }}
                >
                  <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: s.color }} />
                  <span className="flex-1 truncate">
                    {s.name}
                    {s.is_default && <span className="ml-1 text-[10px] text-zinc-500">(padrão)</span>}
                  </span>
                  {s.id === active.id && <Check className="h-3.5 w-3.5" />}
                </button>
              </li>
            ))}
          </ul>
          <div className="border-t" style={{ borderColor: '#2D3F55' }}>
            <Link
              href="/configuracoes/lojas"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2 text-xs text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50"
            >
              <Settings className="h-3 w-3" /> Gerenciar lojas
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}

/** Versão simples só pra mostrar a loja ativa (sem dropdown), pra páginas internas */
export function ActiveStoreBadge({ stores }: { stores: Store[] }) {
  const { active } = useActiveStore(stores)
  if (!active) return null
  return (
    <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium"
      style={{ background: `${active.color}15`, color: active.color, border: `1px solid ${active.color}40` }}>
      <StoreIcon className="h-2.5 w-2.5" />
      {active.code}
    </span>
  )
}
