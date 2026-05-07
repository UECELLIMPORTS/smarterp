'use server'

/**
 * Voice Entry — orquestrador.
 *
 * 1. Recebe áudio base64 do navegador
 * 2. Whisper transcreve
 * 3. LLM classifica + extrai JSON
 * 4. Pra stock_in/stock_balance: busca produtos top 5 que batem com o nome
 * 5. Retorna tudo pra UI fazer revisão e confirmar
 *
 * Após confirmação, UI chama as actions já existentes:
 *   - createVariableExpense (gastos)
 *   - createMovement (stock_movements)
 *   - adjustStock (products) — opcional pra balanço
 */

import { requireAuth } from '@/lib/supabase/server'
import { getTenantId } from '@/lib/tenant'
import { transcribeAudio } from '@/lib/ai/whisper'
import { parseVoiceCommand, type VoiceCommand } from '@/lib/ai/voice-parser'

export type VoiceProductMatch = {
  id:        string
  name:      string
  sku:       string | null
  stock_qty: number
  price_cents: number | null
}

export type ProcessVoiceResult =
  | {
      ok:          true
      transcript:  string
      command:     VoiceCommand
      productMatches?: VoiceProductMatch[]   // só pra stock_in / stock_balance
      costs: {
        whisperUsd: number
        parserUsd:  number
        totalUsd:   number
      }
    }
  | { ok: false; error: string; transcript?: string }

export async function processVoiceCommand(args: {
  audioBase64: string
  mimetype:    string
}): Promise<ProcessVoiceResult> {
  if (!args.audioBase64) return { ok: false, error: 'Áudio vazio' }

  const { supabase, user } = await requireAuth()
  const tenantId = getTenantId(user)

  // 1. Whisper
  const wh = await transcribeAudio(args.audioBase64, args.mimetype)
  if (!wh.ok) return { ok: false, error: `Whisper: ${wh.error}` }
  if (!wh.text) return { ok: false, error: 'Transcrição veio vazia. Tenta falar mais alto.', transcript: '' }

  // 2. Parser
  const pr = await parseVoiceCommand(wh.text)
  if (!pr.ok) return { ok: false, error: `Parser: ${pr.error}`, transcript: wh.text }

  // 3. Match de produto (só pra stock_in / stock_balance)
  let productMatches: VoiceProductMatch[] | undefined
  const cmd = pr.command
  if (cmd.type === 'stock_in' || cmd.type === 'stock_balance') {
    const q = cmd.productQuery.trim()
    if (q.length >= 2) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any
      const { data } = await sb
        .from('products')
        .select('id, name, sku, stock_qty, price_cents')
        .eq('tenant_id', tenantId)
        .eq('active', true)
        .ilike('name', `%${q}%`)
        .order('stock_qty', { ascending: false })
        .limit(5)
      productMatches = (data ?? []) as VoiceProductMatch[]
    } else {
      productMatches = []
    }
  }

  return {
    ok:         true,
    transcript: wh.text,
    command:    cmd,
    productMatches,
    costs: {
      whisperUsd: wh.costMicrosUsd / 1_000_000,
      parserUsd:  pr.costMicrosUsd / 1_000_000,
      totalUsd:   (wh.costMicrosUsd + pr.costMicrosUsd) / 1_000_000,
    },
  }
}
