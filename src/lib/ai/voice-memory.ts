/**
 * Memória de longo prazo do voice entry — get/save de fatos memoráveis.
 *
 * Após cada comando confirmado, IA mini-prompt extrai fatos como:
 *   - Cliente Maria sempre paga PIX
 *   - Capinha iPhone 13 vende muito de WhatsApp
 *   - João da Padaria compra na 1ª semana do mês
 *
 * Antes de cada comando, busca memórias relevantes pra incluir no prompt.
 */

import OpenAI from 'openai'

export type VoiceMemoryRow = {
  id:           string
  category:     'customer' | 'product' | 'routine' | 'general'
  subject_id:   string | null
  subject_name: string | null
  key:          string
  value:        string
  confidence:   number
  updated_at:   string
}

export type MemoryHint = {
  customerName?: string
  productNames?: string[]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getRelevantMemories(sb: any, tenantId: string, hint: MemoryHint = {}): Promise<VoiceMemoryRow[]> {
  const out: VoiceMemoryRow[] = []

  // Memórias de cliente (se mencionou nome)
  if (hint.customerName && hint.customerName.length >= 2) {
    const { data } = await sb
      .from('voice_memory')
      .select('id, category, subject_id, subject_name, key, value, confidence, updated_at')
      .eq('tenant_id', tenantId)
      .eq('category', 'customer')
      .ilike('subject_name', `%${hint.customerName}%`)
      .order('updated_at', { ascending: false })
      .limit(5)
    if (data) out.push(...(data as VoiceMemoryRow[]))
  }

  // Memórias de produtos (se mencionou itens)
  if (hint.productNames && hint.productNames.length > 0) {
    for (const pn of hint.productNames.slice(0, 3)) {
      if (pn.length < 2) continue
      const { data } = await sb
        .from('voice_memory')
        .select('id, category, subject_id, subject_name, key, value, confidence, updated_at')
        .eq('tenant_id', tenantId)
        .eq('category', 'product')
        .ilike('subject_name', `%${pn}%`)
        .order('updated_at', { ascending: false })
        .limit(3)
      if (data) out.push(...(data as VoiceMemoryRow[]))
    }
  }

  // Memórias de rotina (sempre incluir top 3 mais recentes)
  const { data: routine } = await sb
    .from('voice_memory')
    .select('id, category, subject_id, subject_name, key, value, confidence, updated_at')
    .eq('tenant_id', tenantId)
    .eq('category', 'routine')
    .order('updated_at', { ascending: false })
    .limit(3)
  if (routine) out.push(...(routine as VoiceMemoryRow[]))

  return out
}

export function formatMemoriesForPrompt(memories: VoiceMemoryRow[]): string {
  if (memories.length === 0) return ''
  const lines = memories.map(m => {
    const subj = m.subject_name ? ` [${m.subject_name}]` : ''
    return `- (${m.category})${subj} ${m.key}: ${m.value}`
  })
  return `MEMÓRIAS RELEVANTES (de comandos anteriores):\n${lines.join('\n')}`
}

// ──────────────────────────────────────────────────────────────────────────
// Extração: após cada comando confirmado, IA mini analisa e devolve facts
// ──────────────────────────────────────────────────────────────────────────

export type ExtractedFact = {
  category:     'customer' | 'product' | 'routine' | 'general'
  subject_name: string | null
  key:          string
  value:        string
  confidence:   number
}

const EXTRACT_PROMPT = `Analise a venda/despesa abaixo e extraia 0-3 fatos memoráveis sobre o cliente, produto ou rotina da loja. NÃO invente.

Categorias e exemplos:
- customer: "payment_preference" → "pix" | "card" | "cash"; "channel_preference" → "whatsapp" | "balcao"
- product: "popular_with" → "iPhone 13" (cliente que comprou esse produto)
- routine: "high_volume_day" → "segunda" (se houve muitas vendas no dia)
- general: qualquer outro insight relevante

REGRAS:
- Só retorne fatos que sejam realmente úteis pra futuros comandos
- subject_name = nome do cliente ou produto (ou null se for routine/general)
- confidence: 0.5-1.0 (use baixo se for inferência fraca)
- Se nada notável, retorna { "facts": [] }
- Output JSON: { "facts": [ { ... }, ... ] }`

export async function extractFactsFromCommand(commandSummary: string): Promise<ExtractedFact[]> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return []

  try {
    const openai = new OpenAI({ apiKey })
    const completion = await openai.chat.completions.create({
      model:           'gpt-4o-mini',
      temperature:     0.2,
      max_tokens:      300,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: EXTRACT_PROMPT },
        { role: 'user',   content: commandSummary },
      ],
    })
    const raw = completion.choices[0]?.message?.content?.trim() ?? '{}'
    const obj = JSON.parse(raw) as { facts?: ExtractedFact[] }
    return Array.isArray(obj.facts) ? obj.facts : []
  } catch (e) {
    console.error('[voice-memory] extract failed', e)
    return []
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function saveFacts(sb: any, tenantId: string, facts: ExtractedFact[], subjectIdMap?: Record<string, string>): Promise<number> {
  if (facts.length === 0) return 0
  const rows = facts.map(f => ({
    tenant_id:    tenantId,
    category:     f.category,
    subject_name: f.subject_name,
    subject_id:   f.subject_name && subjectIdMap ? (subjectIdMap[f.subject_name] ?? null) : null,
    key:          f.key,
    value:        f.value,
    confidence:   Math.max(0, Math.min(1, f.confidence ?? 0.7)),
    updated_at:   new Date().toISOString(),
  }))
  // Upsert por unique (tenant, category, subject_id, key)
  const { error } = await sb.from('voice_memory').upsert(rows, {
    onConflict: 'tenant_id,category,subject_id,key',
  })
  if (error) {
    console.error('[voice-memory] save failed', error)
    return 0
  }
  return rows.length
}
