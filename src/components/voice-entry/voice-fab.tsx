'use client'

/**
 * Voice Entry FAB (floating action button).
 *
 * Botão flutuante no canto inferior direito visível em todas as telas
 * do dashboard. Dois modos:
 *
 *   1. Clicar → abre o VoiceModal manualmente
 *   2. Wake word "Smart" → abre o modal sozinho (hands-free, escuta contínua)
 *
 * O toggle de wake word fica num botão pequeno colado no FAB e a
 * preferência persiste em localStorage.
 */

import { useEffect, useState } from 'react'
import { Mic, Ear, EarOff } from 'lucide-react'
import { VoiceModal } from './voice-modal'
import { useWakeWord, type WakeResult } from '@/hooks/use-wake-word'

const WAKE_PREF_KEY = 'smarterp_wake_word_enabled_v1'

export function VoiceFAB() {
  const [open, setOpen]                             = useState(false)
  const [initialText, setInitialText]               = useState<string | undefined>(undefined)
  const [autoConversation, setAutoConversation]    = useState(false)
  const [wakeEnabled, setWakeEnabled]               = useState(false)
  const [hydrated, setHydrated]                     = useState(false)

  // Hidrata preferência (default: desligado, evita pedir mic sem usuário querer)
  useEffect(() => {
    if (typeof window === 'undefined') return
    setWakeEnabled(localStorage.getItem(WAKE_PREF_KEY) === '1')
    setHydrated(true)
  }, [])

  function toggleWake() {
    const next = !wakeEnabled
    setWakeEnabled(next)
    if (typeof window !== 'undefined') {
      localStorage.setItem(WAKE_PREF_KEY, next ? '1' : '0')
    }
  }

  function handleWake(res: WakeResult) {
    // Se modal já aberto, ignora
    if (open) return
    // Beep curto pra dar feedback que ouviu (sem TTS pra não atrasar)
    try {
      const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain); gain.connect(ctx.destination)
      osc.frequency.value = 880
      gain.gain.setValueAtTime(0.08, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.15)
      osc.start(); osc.stop(ctx.currentTime + 0.15)
    } catch { /* noop */ }

    if (res.command.length >= 3) {
      // "smart, vendi um iPhone 13 pra Maria por 1500 pix"
      // → processa direto como texto, pula a captura de áudio
      setInitialText(res.command)
      setAutoConversation(false)
    } else {
      // "smart" sozinho → abre em modo conversation pra perguntar o que fazer
      setInitialText(undefined)
      setAutoConversation(true)
    }
    setOpen(true)
  }

  // Pausa wake word enquanto o modal estiver aberto (libera mic)
  const { supported, listening, error } = useWakeWord({
    onWake:  handleWake,
    enabled: hydrated && wakeEnabled && !open,
  })

  function closeModal() {
    setOpen(false)
    setInitialText(undefined)
    setAutoConversation(false)
  }

  return (
    <>
      <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-2">
        {/* Toggle wake word — só aparece se browser suporta */}
        {supported && (
          <button
            type="button"
            onClick={toggleWake}
            title={
              error
                ? error
                : wakeEnabled
                  ? `Escuta ativa — diga "Smart" pra ativar${listening ? '' : ' (reconectando...)'}`
                  : 'Ativar escuta hands-free ("Smart")'
            }
            aria-label="Alternar escuta por wake word"
            className={`flex h-10 w-10 items-center justify-center rounded-full border shadow-md transition-all hover:scale-105 active:scale-95 ${
              wakeEnabled
                ? 'border-emerald-400/40 bg-zinc-900 text-emerald-400'
                : 'border-zinc-700 bg-zinc-900 text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {wakeEnabled ? <Ear className="h-4 w-4" /> : <EarOff className="h-4 w-4" />}
            {wakeEnabled && listening && (
              <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse ring-2 ring-zinc-950" />
            )}
          </button>
        )}

        <button
          type="button"
          onClick={() => { setInitialText(undefined); setAutoConversation(false); setOpen(true) }}
          title='Lançar comando por voz (ou diga "Smart")'
          aria-label="Lançar comando por voz"
          className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/30 transition-all hover:scale-105 hover:bg-emerald-600 active:scale-95"
        >
          <Mic className="h-6 w-6" />
        </button>
      </div>

      {open && (
        <VoiceModal
          onClose={closeModal}
          initialText={initialText}
          autoStartConversation={autoConversation}
        />
      )}
    </>
  )
}
