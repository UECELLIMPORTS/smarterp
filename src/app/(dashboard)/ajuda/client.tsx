'use client'

import { MessageCircle } from 'lucide-react'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare global { interface Window { Tawk_API?: any } }

export function ChatButton() {
  function open() {
    if (typeof window === 'undefined') return
    if (window.Tawk_API?.maximize) {
      window.Tawk_API.maximize()
    } else {
      alert('Chat ainda não foi configurado. Use o email enquanto isso.')
    }
  }

  return (
    <button type="button" onClick={open}
      className="rounded-xl border p-3 hover:border-emerald-500/40 transition-colors text-left"
      style={{ background: '#131C2A', borderColor: 'rgba(255,255,255,.06)' }}>
      <MessageCircle className="h-5 w-5 mb-2" style={{ color: '#10B981' }} />
      <p className="text-sm font-semibold mb-0.5" style={{ color: '#F8FAFC' }}>Chat ao vivo</p>
      <p className="text-[11px]" style={{ color: '#94A3B8' }}>Atendimento em horário comercial</p>
    </button>
  )
}
