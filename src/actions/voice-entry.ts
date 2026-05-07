'use server'

/**
 * Voice Entry — orquestrador.
 *
 * 1. Recebe áudio base64 do navegador
 * 2. Whisper transcreve
 * 3. LLM classifica + extrai JSON
 * 4. Pra stock_in/stock_balance: busca produtos top 5 que batem com o nome
 * 5. Pra sale: busca produtos pra cada item + cliente + valida caixa aberto
 * 6. Retorna tudo pra UI fazer revisão e confirmar
 *
 * Após confirmação, UI chama as actions já existentes:
 *   - createVariableExpense (gastos)
 *   - createMovement (stock_movements)
 *   - adjustStock (products) — opcional pra balanço
 *   - createSale (vendas POS)
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

export type VoiceCustomerMatch = {
  id:        string
  full_name: string
  whatsapp:  string | null
  cpf_cnpj:  string | null
}

export type VoiceSaleItemMatched = {
  productQuery: string
  quantity:     number
  unitPriceCents: number | null
  candidates:   VoiceProductMatch[]      // top 3 que batem com productQuery
}

export type ProcessVoiceResult =
  | {
      ok:          true
      transcript:  string
      command:     VoiceCommand
      productMatches?:    VoiceProductMatch[]    // stock_in / stock_balance
      saleItemsMatched?:  VoiceSaleItemMatched[] // sale
      customerMatches?:   VoiceCustomerMatch[]   // sale (top 5)
      cashSessionOpen?:   boolean                // sale
      raw?:        string                        // raw JSON do LLM pra debug
      costs: {
        whisperUsd: number
        parserUsd:  number
        totalUsd:   number
      }
    }
  | { ok: false; error: string; transcript?: string; raw?: string }

export async function processVoiceCommand(args: {
  audioBase64: string
  mimetype:    string
}): Promise<ProcessVoiceResult> {
  if (!args.audioBase64) return { ok: false, error: 'Áudio vazio' }

  const { supabase, user } = await requireAuth()
  const tenantId = getTenantId(user)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any

  // 1. Whisper
  const wh = await transcribeAudio(args.audioBase64, args.mimetype)
  if (!wh.ok) return { ok: false, error: `Whisper: ${wh.error}` }
  if (!wh.text) return { ok: false, error: 'Transcrição veio vazia. Tenta falar mais alto.', transcript: '' }

  // 2. Parser
  const pr = await parseVoiceCommand(wh.text)
  if (!pr.ok) return { ok: false, error: `Parser: ${pr.error}`, transcript: wh.text, raw: pr.raw }

  const cmd = pr.command
  const rawJson = pr.raw
  let productMatches:   VoiceProductMatch[] | undefined
  let saleItemsMatched: VoiceSaleItemMatched[] | undefined
  let customerMatches:  VoiceCustomerMatch[] | undefined
  let cashSessionOpen:  boolean | undefined

  // 3. Match pra stock_in / stock_balance (1 produto)
  if (cmd.type === 'stock_in' || cmd.type === 'stock_balance') {
    productMatches = await matchProducts(sb, tenantId, cmd.productQuery, 5)
  }

  // 4. Match pra sale (múltiplos produtos + cliente + caixa)
  if (cmd.type === 'sale') {
    // 4a. Match cada item (top 3 candidatos por item)
    saleItemsMatched = []
    for (const it of cmd.items) {
      const candidates = await matchProducts(sb, tenantId, it.productQuery, 3)
      saleItemsMatched.push({
        productQuery:   it.productQuery,
        quantity:       it.quantity,
        unitPriceCents: it.unitPriceCents ?? null,
        candidates,
      })
    }

    // 4b. Match cliente (se mencionou)
    if (cmd.customerQuery && cmd.customerQuery.trim().length >= 2) {
      const q = cmd.customerQuery.trim()
      const { data: custs } = await sb
        .from('customers')
        .select('id, full_name, whatsapp, cpf_cnpj')
        .eq('tenant_id', tenantId)
        .ilike('full_name', `%${q}%`)
        .order('full_name', { ascending: true })
        .limit(5)
      customerMatches = (custs ?? []) as VoiceCustomerMatch[]
    } else {
      customerMatches = []
    }

    // 4c. Verifica caixa aberto
    const { data: activeSession } = await sb
      .from('cash_sessions')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('status', 'open')
      .maybeSingle()
    cashSessionOpen = !!activeSession
  }

  return {
    ok:               true,
    transcript:       wh.text,
    command:          cmd,
    productMatches,
    saleItemsMatched,
    customerMatches,
    cashSessionOpen,
    raw:              rawJson,
    costs: {
      whisperUsd: wh.costMicrosUsd / 1_000_000,
      parserUsd:  pr.costMicrosUsd / 1_000_000,
      totalUsd:   (wh.costMicrosUsd + pr.costMicrosUsd) / 1_000_000,
    },
  }
}

/**
 * Mesma coisa que processVoiceCommand mas pula Whisper (input já é texto).
 */
export async function processTextCommand(text: string): Promise<ProcessVoiceResult> {
  const trimmed = (text || '').trim()
  if (trimmed.length < 3) return { ok: false, error: 'Digite um comando.' }

  const { supabase, user } = await requireAuth()
  const tenantId = getTenantId(user)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any

  const pr = await parseVoiceCommand(trimmed)
  if (!pr.ok) return { ok: false, error: `Parser: ${pr.error}`, transcript: trimmed, raw: pr.raw }

  const cmd = pr.command
  let productMatches:   VoiceProductMatch[] | undefined
  let saleItemsMatched: VoiceSaleItemMatched[] | undefined
  let customerMatches:  VoiceCustomerMatch[] | undefined
  let cashSessionOpen:  boolean | undefined

  if (cmd.type === 'stock_in' || cmd.type === 'stock_balance') {
    productMatches = await matchProducts(sb, tenantId, cmd.productQuery, 5)
  }

  if (cmd.type === 'sale') {
    saleItemsMatched = []
    for (const it of cmd.items) {
      const candidates = await matchProducts(sb, tenantId, it.productQuery, 3)
      saleItemsMatched.push({
        productQuery:   it.productQuery,
        quantity:       it.quantity,
        unitPriceCents: it.unitPriceCents ?? null,
        candidates,
      })
    }

    if (cmd.customerQuery && cmd.customerQuery.trim().length >= 2) {
      const q = cmd.customerQuery.trim()
      const { data: custs } = await sb
        .from('customers')
        .select('id, full_name, whatsapp, cpf_cnpj')
        .eq('tenant_id', tenantId)
        .ilike('full_name', `%${q}%`)
        .order('full_name', { ascending: true })
        .limit(5)
      customerMatches = (custs ?? []) as VoiceCustomerMatch[]
    } else {
      customerMatches = []
    }

    const { data: activeSession } = await sb
      .from('cash_sessions')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('status', 'open')
      .maybeSingle()
    cashSessionOpen = !!activeSession
  }

  return {
    ok:               true,
    transcript:       trimmed,
    command:          cmd,
    productMatches,
    saleItemsMatched,
    customerMatches,
    cashSessionOpen,
    raw:              pr.raw,
    costs: {
      whisperUsd: 0,
      parserUsd:  pr.costMicrosUsd / 1_000_000,
      totalUsd:   pr.costMicrosUsd / 1_000_000,
    },
  }
}

// ──────────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function matchProducts(sb: any, tenantId: string, query: string, limit: number): Promise<VoiceProductMatch[]> {
  const q = query.trim()
  if (q.length < 2) return []
  const { data } = await sb
    .from('products')
    .select('id, name, sku, stock_qty, price_cents')
    .eq('tenant_id', tenantId)
    .eq('active', true)
    .ilike('name', `%${q}%`)
    .order('stock_qty', { ascending: false })
    .limit(limit)
  return (data ?? []) as VoiceProductMatch[]
}
