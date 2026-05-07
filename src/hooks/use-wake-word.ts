'use client'

/**
 * Wake word "Smart" — escuta contínua via Web Speech API do navegador.
 *
 * Quando o usuário diz a palavra "smart" (ou variações como "smarte"),
 * dispara onWake com o texto que veio depois (pra processar como comando).
 *
 * Funciona apenas com a aba do SmartERP em foco (limitação do browser).
 * Custo: zero — tudo client-side, nada vai pra API externa.
 *
 * iOS Safari: suporte parcial e instável. Chrome/Edge funcionam bem.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

const WAKE_REGEX = /\b(?:smart|smarte|esmart|smartie)\b/i
const DEBOUNCE_MS = 2500

export type WakeResult = {
  fullTranscript: string
  command:        string  // texto APÓS a palavra "smart" (vazio se só falou a wake)
}

interface UseWakeWordOptions {
  onWake:  (result: WakeResult) => void
  enabled: boolean
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SR = any

export function useWakeWord({ onWake, enabled }: UseWakeWordOptions) {
  const recognitionRef    = useRef<SR | null>(null)
  const lastFiredRef      = useRef<number>(0)
  const stoppedManuallyRef = useRef(false)
  const restartTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onWakeRef         = useRef(onWake)
  const [supported, setSupported] = useState(false)
  const [listening, setListening] = useState(false)
  const [error, setError]         = useState<string | null>(null)

  useEffect(() => { onWakeRef.current = onWake }, [onWake])

  useEffect(() => {
    if (typeof window === 'undefined') return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    setSupported(!!Ctor)
  }, [])

  const start = useCallback(() => {
    if (typeof window === 'undefined') return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!Ctor) { setError('Navegador não suporta reconhecimento contínuo'); return }
    if (recognitionRef.current) return  // já rodando

    const r = new Ctor()
    r.continuous     = true
    r.interimResults = true
    r.lang           = 'pt-BR'

    r.onresult = (e: SR) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i]
        if (!result.isFinal) continue
        const text = (result[0].transcript as string) ?? ''
        const match = text.match(WAKE_REGEX)
        if (!match) continue

        const now = Date.now()
        if (now - lastFiredRef.current < DEBOUNCE_MS) continue
        lastFiredRef.current = now

        const tail = text
          .slice((match.index ?? 0) + match[0].length)
          .trim()
          .replace(/^[,.\s]+/, '')

        onWakeRef.current({ fullTranscript: text, command: tail })
      }
    }

    r.onerror = (e: SR) => {
      const code = e?.error ?? 'unknown'
      console.warn('[wake-word] error', code)
      // Erros fatais — para de tentar
      if (code === 'not-allowed' || code === 'service-not-allowed') {
        setError('Microfone bloqueado. Permita o acesso e recarregue.')
        stoppedManuallyRef.current = true
        setListening(false)
      } else if (code === 'audio-capture') {
        setError('Sem microfone disponível')
        stoppedManuallyRef.current = true
        setListening(false)
      }
      // 'no-speech', 'aborted', 'network' — onend reinicia
    }

    r.onend = () => {
      const current = recognitionRef.current
      if (!stoppedManuallyRef.current && current === r) {
        // Browser para após silêncio prolongado — reinicia
        if (restartTimerRef.current) clearTimeout(restartTimerRef.current)
        restartTimerRef.current = setTimeout(() => {
          if (stoppedManuallyRef.current) return
          try { r.start() } catch { /* concorrência: já startou */ }
        }, 250)
      } else {
        setListening(false)
      }
    }

    try {
      stoppedManuallyRef.current = false
      r.start()
      recognitionRef.current = r
      setListening(true)
      setError(null)
    } catch (e) {
      console.warn('[wake-word] start failed', e)
      setError('Falha ao iniciar escuta')
    }
  }, [])

  const stop = useCallback(() => {
    stoppedManuallyRef.current = true
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current)
      restartTimerRef.current = null
    }
    const r = recognitionRef.current
    recognitionRef.current = null
    if (r) {
      try { r.onend = null } catch { /* noop */ }
      try { r.stop() } catch { /* noop */ }
      try { r.abort?.() } catch { /* noop */ }
    }
    setListening(false)
  }, [])

  useEffect(() => {
    if (!supported) return
    if (enabled) start()
    else stop()
    return () => stop()
  }, [enabled, supported, start, stop])

  return { supported, listening, error, start, stop }
}
