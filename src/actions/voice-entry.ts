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
import { parseVoiceCommand, parseConversation, type VoiceCommand, type ConversationTurn } from '@/lib/ai/voice-parser'
import { getOperationalContext, formatContextForPrompt } from '@/lib/ai/voice-context'
import { getRelevantMemories, formatMemoriesForPrompt, extractFactsFromCommand, saveFacts, type ExtractedFact } from '@/lib/ai/voice-memory'
import { resolveActiveStoreId } from '@/lib/active-store'
import type { VoiceSessionTurn } from '@/hooks/use-voice-session'

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
 * Versão multi-turn: aceita histórico de conversação.
 * Útil pra IA pedir clarificação e completar dados aos poucos.
 *
 * audioBase64 é o áudio do TURN ATUAL do user (será transcrito).
 * Se transcript for fornecido (modo texto), pula Whisper.
 * pastTurns são os turnos anteriores (user + assistant).
 */
export async function processConversation(args: {
  audioBase64?: string
  mimetype?:    string
  transcript?:  string
  pastTurns:    ConversationTurn[]                     // turnos anteriores (sem o atual)
  sessionRecent?: VoiceSessionTurn[]                   // últimos comandos do localStorage do user
  customerHint?: string                                // pra recuperar memórias do cliente
  productHint?:  string[]                              // pra recuperar memórias dos produtos
}): Promise<ProcessVoiceResult> {
  const { supabase, user } = await requireAuth()
  const tenantId = getTenantId(user)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any

  // 1. Transcreve se for áudio
  let userText = args.transcript?.trim() ?? ''
  let whisperCostMicros = 0
  if (!userText) {
    if (!args.audioBase64) return { ok: false, error: 'Áudio ou texto obrigatório' }
    const wh = await transcribeAudio(args.audioBase64, args.mimetype ?? 'audio/webm')
    if (!wh.ok)        return { ok: false, error: `Whisper: ${wh.error}` }
    if (!wh.text)      return { ok: false, error: 'Transcrição vazia.', transcript: '' }
    userText = wh.text
    whisperCostMicros = wh.costMicrosUsd
  }

  // 2. Constrói contexto rico pra IA (operacional + sessão + memórias longo prazo)
  const activeStoreId = await resolveActiveStoreId(sb, tenantId)
  const contextParts: string[] = []
  try {
    const opContext = await getOperationalContext(sb, tenantId, activeStoreId)
    contextParts.push(formatContextForPrompt(opContext))
  } catch (e) { console.warn('[voice-entry] op context failed', e) }

  if (args.sessionRecent && args.sessionRecent.length > 0) {
    const recent = args.sessionRecent.slice(-5).map((t, i) => `${i + 1}. (${t.type}) ${t.summary}`).join('\n')
    contextParts.push(`COMANDOS RECENTES NESTA SESSÃO:\n${recent}`)
  }

  try {
    const memories = await getRelevantMemories(sb, tenantId, {
      customerName: args.customerHint,
      productNames: args.productHint,
    })
    const memBlock = formatMemoriesForPrompt(memories)
    if (memBlock) contextParts.push(memBlock)
  } catch (e) { console.warn('[voice-entry] memories failed', e) }

  const contextBlock = contextParts.join('\n\n')

  // 3. Adiciona turn atual do user no histórico e chama parser
  const turns: ConversationTurn[] = [...args.pastTurns, { role: 'user', content: userText }]
  const pr = await parseConversation(turns, contextBlock)
  if (!pr.ok) return { ok: false, error: `Parser: ${pr.error}`, transcript: userText, raw: pr.raw }

  const cmd = pr.command
  let productMatches:   VoiceProductMatch[] | undefined
  let saleItemsMatched: VoiceSaleItemMatched[] | undefined
  let customerMatches:  VoiceCustomerMatch[] | undefined
  let cashSessionOpen:  boolean | undefined

  // 3. Match só se for tipo finalizado (não needs_clarification)
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
    transcript:       userText,
    command:          cmd,
    productMatches,
    saleItemsMatched,
    customerMatches,
    cashSessionOpen,
    raw:              pr.raw,
    costs: {
      whisperUsd: whisperCostMicros / 1_000_000,
      parserUsd:  pr.costMicrosUsd / 1_000_000,
      totalUsd:   (whisperCostMicros + pr.costMicrosUsd) / 1_000_000,
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

/**
 * Extrai e grava memórias de longo prazo após confirmação de comando.
 * Roda em background (UI não espera). Custo ~R$ 0,003 por chamada.
 */
export async function extractAndSaveMemories(args: {
  commandSummary: string
  customerName?: string | null
  customerId?:   string | null
}): Promise<{ saved: number }> {
  const { supabase, user } = await requireAuth()
  const tenantId = getTenantId(user)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any

  const facts: ExtractedFact[] = await extractFactsFromCommand(args.commandSummary)
  if (facts.length === 0) return { saved: 0 }

  // Mapa pra resolver subject_id quando subject_name == customer name
  const subjectIdMap: Record<string, string> = {}
  if (args.customerName && args.customerId) {
    subjectIdMap[args.customerName] = args.customerId
  }

  const saved = await saveFacts(sb, tenantId, facts, subjectIdMap)
  return { saved }
}

// ──────────────────────────────────────────────────────────────────────────

/**
 * Criação de cliente via comando de voz.
 * Usa apenas os campos essenciais coletados pela IA + defaults sensatos.
 * Reutiliza as validações de duplicidade (CPF/WhatsApp) feitas pelo Supabase.
 */
export async function createCustomerFromVoice(args: {
  fullName:   string
  whatsapp?:  string | null
  email?:     string | null
  cpfCnpj?:   string | null
  birthDate?: string | null
  notes?:     string | null
}): Promise<{ ok: true; id: string; name: string } | { ok: false; error: string }> {
  const { supabase, user } = await requireAuth()
  const tenantId = getTenantId(user)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any

  const name = args.fullName.trim()
  if (name.length < 2) return { ok: false, error: 'Nome muito curto' }

  const whatsDigits = (args.whatsapp ?? '').replace(/\D/g, '') || null
  const cpfDigits   = (args.cpfCnpj  ?? '').replace(/\D/g, '') || null

  // Checa duplicidade WhatsApp (se fornecido)
  if (whatsDigits) {
    const { data: dups } = await sb
      .from('customers')
      .select('id, full_name')
      .eq('tenant_id', tenantId)
      .eq('whatsapp', whatsDigits)
      .limit(1)
    if (dups && dups.length > 0) {
      return { ok: false, error: `Esse WhatsApp já está cadastrado pra ${dups[0].full_name}` }
    }
  }

  // Checa duplicidade CPF
  if (cpfDigits) {
    const { data: dups } = await sb
      .from('customers')
      .select('id, full_name')
      .eq('tenant_id', tenantId)
      .eq('cpf_cnpj', cpfDigits)
      .limit(1)
    if (dups && dups.length > 0) {
      return { ok: false, error: `Esse CPF já está cadastrado pra ${dups[0].full_name}` }
    }
  }

  const { data, error } = await sb
    .from('customers')
    .insert({
      tenant_id:   tenantId,
      full_name:   name,
      person_type: 'fisica',
      is_active:   true,
      whatsapp:    whatsDigits,
      email:       (args.email ?? '').trim() || null,
      cpf_cnpj:    cpfDigits,
      birth_date:  args.birthDate ?? null,
      notes:       (args.notes ?? '').trim() || null,
      origin:      'voice',
    })
    .select('id, full_name')
    .single()

  if (error) return { ok: false, error: error.message }
  return { ok: true, id: data.id as string, name: data.full_name as string }
}

/**
 * Match fuzzy de produto:
 * 1. Busca em `products` E `parts_catalog` (igual ao searchProducts do POS)
 * 2. Faz OR em name + code/sku
 * 3. Tokeniza query: se a busca completa não acha, tenta com tokens
 *    individuais (ex: "iPhone 13 Pro Max" → testa "iPhone", "13", "Pro", "Max")
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function matchProducts(sb: any, tenantId: string, query: string, limit: number): Promise<VoiceProductMatch[]> {
  const q = query.trim()
  if (q.length < 2) return []

  // Tenta com a query completa primeiro
  const exact = await runProductSearch(sb, tenantId, q, limit)
  if (exact.length > 0) return exact

  // Fallback: pega o token mais distintivo (mais longo)
  const tokens = q.split(/\s+/).filter(t => t.length >= 2)
  // Ordena tokens do maior pro menor (mais distintivo primeiro)
  tokens.sort((a, b) => b.length - a.length)
  for (const token of tokens.slice(0, 3)) {
    const partial = await runProductSearch(sb, tenantId, token, limit)
    if (partial.length > 0) return partial
  }

  return []
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function runProductSearch(sb: any, tenantId: string, q: string, limit: number): Promise<VoiceProductMatch[]> {
  // Busca em products (com code) + parts_catalog (com sku) em paralelo
  const [productsRes, partsRes] = await Promise.all([
    sb
      .from('products')
      .select('id, name, code, stock_qty, price_cents')
      .eq('tenant_id', tenantId)
      .eq('active', true)
      .or(`name.ilike.%${q}%,code.ilike.%${q}%`)
      .order('stock_qty', { ascending: false })
      .limit(limit),
    sb
      .from('parts_catalog')
      .select('id, name, sku, cost_cents')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .or(`name.ilike.%${q}%,sku.ilike.%${q}%`)
      .order('name')
      .limit(limit),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const products: VoiceProductMatch[] = ((productsRes.data ?? []) as any[]).map(p => ({
    id:          p.id,
    name:        p.name,
    sku:         p.code ?? null,
    stock_qty:   p.stock_qty ?? 0,
    price_cents: p.price_cents ?? null,
  }))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parts: VoiceProductMatch[] = ((partsRes.data ?? []) as any[]).map(p => ({
    id:          p.id,
    name:        p.name,
    sku:         p.sku ?? null,
    stock_qty:   0,                   // peças não têm estoque rastreado
    price_cents: p.cost_cents ?? null,
  }))

  return [...products, ...parts].slice(0, limit)
}
