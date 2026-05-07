/**
 * Text-to-Speech via Web Speech API (browser nativo).
 *
 * Grátis, suporta PT-BR. Qualidade varia:
 * - Android Chrome / Desktop Chrome: boa
 * - iOS Safari: mais robótica em PT-BR
 *
 * Pra qualidade premium, trocar pra OpenAI TTS (custo ~R$ 0,04/min).
 */

export type SpeakOptions = {
  rate?:   number  // 0.1 - 10 (default 1, ~1.05 sonha um pouco mais natural)
  pitch?:  number  // 0 - 2  (default 1)
  volume?: number  // 0 - 1
  onEnd?:  () => void
}

let currentUtterance: SpeechSynthesisUtterance | null = null

export function ttsSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.speechSynthesis !== 'undefined'
}

export function ttsCancel() {
  if (!ttsSupported()) return
  try {
    window.speechSynthesis.cancel()
  } catch { /* noop */ }
  currentUtterance = null
}

export function ttsSpeak(text: string, opts: SpeakOptions = {}): boolean {
  if (!ttsSupported() || !text.trim()) {
    opts.onEnd?.()
    return false
  }
  // Cancela qualquer fala anterior
  try { window.speechSynthesis.cancel() } catch { /* noop */ }

  const utt = new SpeechSynthesisUtterance(text)
  utt.lang   = 'pt-BR'
  utt.rate   = opts.rate   ?? 1.05
  utt.pitch  = opts.pitch  ?? 1
  utt.volume = opts.volume ?? 1

  // Tenta achar voz pt-BR (varia por OS)
  const voices = window.speechSynthesis.getVoices()
  const ptBR = voices.find(v => v.lang === 'pt-BR') ||
               voices.find(v => v.lang.startsWith('pt'))
  if (ptBR) utt.voice = ptBR

  utt.onend   = () => { currentUtterance = null; opts.onEnd?.() }
  utt.onerror = () => { currentUtterance = null; opts.onEnd?.() }

  currentUtterance = utt
  window.speechSynthesis.speak(utt)
  return true
}

/**
 * Workaround pra Chrome — getVoices() pode retornar [] no primeiro acesso.
 * Chama uma vez ao montar o app pra forçar carregamento.
 */
export function ttsWarmup() {
  if (!ttsSupported()) return
  // Força evento voiceschanged a popular a lista
  window.speechSynthesis.getVoices()
  if (window.speechSynthesis.onvoiceschanged === null) {
    window.speechSynthesis.onvoiceschanged = () => {
      window.speechSynthesis.getVoices()
    }
  }
}
