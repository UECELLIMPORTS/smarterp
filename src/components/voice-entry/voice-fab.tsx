'use client'

/**
 * Voice Entry FAB (floating action button).
 * Botão flutuante no canto inferior direito visível em todas as telas
 * do dashboard. Ao clicar, abre o VoiceModal pra capturar áudio.
 */

import { useState } from 'react'
import { Mic } from 'lucide-react'
import { VoiceModal } from './voice-modal'

export function VoiceFAB() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Lançar comando por voz (despesa, estoque, balanço)"
        aria-label="Lançar comando por voz"
        className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/30 transition-all hover:scale-105 hover:bg-emerald-600 active:scale-95"
      >
        <Mic className="h-6 w-6" />
      </button>

      {open && <VoiceModal onClose={() => setOpen(false)} />}
    </>
  )
}
