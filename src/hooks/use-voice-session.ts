'use client'

/**
 * Sessão local do Voice Entry (browser-only, localStorage).
 * Guarda os últimos comandos confirmados nesta sessão pra IA usar como
 * contexto em "mesmo cliente de antes", "mais 1 igual", etc.
 *
 * Janela: 4h (limpa entradas antigas).
 */

const STORAGE_KEY = 'smarterp_voice_session_v1'
const WINDOW_MS   = 4 * 3600 * 1000  // 4 horas
const MAX_ENTRIES = 10

export type VoiceSessionTurn = {
  type:        'expense' | 'sale' | 'stock_in' | 'stock_balance'
  summary:     string                          // descrição curta legível
  rawTranscript: string                        // o que o user disse
  customerName?: string | null
  customerId?:   string | null
  productNames?: string[]                      // pra "mais 1 igual"
  paymentMethod?: string | null
  totalCents?:   number | null
  timestamp:     number                         // Date.now()
}

function readAll(): VoiceSessionTurn[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw) as VoiceSessionTurn[]
    if (!Array.isArray(arr)) return []
    const cutoff = Date.now() - WINDOW_MS
    return arr.filter(t => typeof t.timestamp === 'number' && t.timestamp > cutoff)
  } catch {
    return []
  }
}

function writeAll(items: VoiceSessionTurn[]) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(-MAX_ENTRIES)))
  } catch { /* quota cheia ou disabled — ignora */ }
}

export const voiceSession = {
  list(): VoiceSessionTurn[] {
    return readAll()
  },

  append(turn: Omit<VoiceSessionTurn, 'timestamp'>) {
    const list = readAll()
    list.push({ ...turn, timestamp: Date.now() })
    writeAll(list)
  },

  clear() {
    if (typeof window === 'undefined') return
    localStorage.removeItem(STORAGE_KEY)
  },

  /** Pega o último turn de venda (pra "mesmo cliente", "mais 1 igual") */
  lastSale(): VoiceSessionTurn | null {
    const list = readAll()
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i].type === 'sale') return list[i]
    }
    return null
  },
}
