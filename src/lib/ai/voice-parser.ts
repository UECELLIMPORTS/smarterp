/**
 * Voice command parser.
 *
 * Recebe texto transcrito e usa LLM pra classificar em 3 tipos
 * (despesa | entrada estoque | balanço) e extrair campos estruturados.
 *
 * Modelo: gpt-4o-mini (R$ 0,003 por chamada típica).
 */

import OpenAI from 'openai'
import { VARIABLE_EXPENSE_CATEGORIES, type VariableExpenseCategory } from '@/lib/variable-expense-categories'

export type VoiceCommand =
  | {
      type:           'expense'
      occurredAt:     string                           // YYYY-MM-DD
      amountCents:    number
      category:       VariableExpenseCategory
      description?:   string | null
      paymentMethod?: 'cash' | 'pix' | 'card' | null
      confidence:     number                           // 0..1
    }
  | {
      type:               'stock_in'
      productQuery:       string                        // texto livre pra match fuzzy
      quantity:           number
      purchasePriceCents?: number | null
      salePriceCents?:    number | null
      notes?:             string | null
      confidence:         number
    }
  | {
      type:         'stock_balance'
      productQuery: string
      newQty:       number                              // quantidade FINAL no estoque
      notes?:       string | null
      confidence:   number
    }
  | {
      type:    'unknown'
      reason:  string
    }

export type ParseResult =
  | { ok: true;  command: VoiceCommand; tokensIn: number; tokensOut: number; costMicrosUsd: number }
  | { ok: false; error: string }

const PRICE_PER_1M_INPUT  = 0.15  // gpt-4o-mini input
const PRICE_PER_1M_OUTPUT = 0.60  // gpt-4o-mini output

function todayBR(): string {
  const tz = new Date().toLocaleString('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' })
  // en-CA já retorna YYYY-MM-DD
  return tz
}

const SYSTEM_PROMPT = `Você é um parser de comandos de voz pra um ERP de loja brasileira (UÉ Cell Imports).
O usuário diz comandos em português brasileiro informal. Você classifica em 3 tipos e extrai campos estruturados.

TIPOS DE COMANDO:

1) "expense" — lançar gasto/despesa variável
   Frases: "200 reais de tinta hoje", "paguei 50 de motoboy", "30 de lanche pro funcionário pix"
   Campos:
   - occurredAt: YYYY-MM-DD (use hoje se não falar; "ontem" = data ontem; "anteontem" = -2 dias)
   - amountCents: valor em centavos (200 reais → 20000)
   - category: ESCOLHE UMA dessas categorias EXATAS:
     {{CATEGORIES}}
   - description: descrição curta opcional (ex: "tinta pra parede da loja")
   - paymentMethod: "cash" (dinheiro) | "pix" | "card" (cartão) ou null se não falou

2) "stock_in" — dar entrada de produto no estoque (compra/recebimento)
   Frases: "deu entrada de 5 iPhone 13 hoje", "chegou 10 capinhas a 15 reais cada", "comprei 3 bateria a30 por 80"
   Campos:
   - productQuery: nome do produto livre, do jeito que falou (ex: "iPhone 13", "capinha samsung", "bateria a30")
   - quantity: quantos entraram (5, 10, 3)
   - purchasePriceCents: preço de COMPRA em centavos (opcional, se mencionou)
   - salePriceCents: preço de VENDA em centavos (opcional, raro)
   - notes: observação opcional

3) "stock_balance" — fazer balanço/ajuste de inventário
   Frases: "balanço, tem 3 capinhas", "no estoque tem só 2 iPhone 11", "fiz a contagem, tem 50 películas"
   Campos:
   - productQuery: nome livre
   - newQty: quantidade FINAL contada (não o delta)
   - notes: observação

REGRAS GERAIS:
- Sempre PT-BR.
- Se não tiver certeza do tipo, retorna { "type": "unknown", "reason": "explicação curta" }.
- confidence: 0.0 a 1.0. Use < 0.7 quando texto for ambíguo.
- amountCents/purchasePriceCents/salePriceCents/newQty: SEMPRE inteiros.
  - "200 reais" = 20000, "1500" = 150000, "50 mil" = 5000000
  - Frações: "1,50" = 150
- occurredAt OBRIGATÓRIO em "expense". Hoje = ${todayBR()}.

OUTPUT: APENAS JSON (sem markdown, sem texto antes/depois).`

const PROMPT_FILLED = SYSTEM_PROMPT.replace(
  '{{CATEGORIES}}',
  VARIABLE_EXPENSE_CATEGORIES.map(c => `   • ${c.value} → ${c.label}`).join('\n'),
)

export async function parseVoiceCommand(transcript: string): Promise<ParseResult> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return { ok: false, error: 'OPENAI_API_KEY não configurada' }

  const text = transcript.trim()
  if (!text) return { ok: false, error: 'Transcrição vazia' }

  const openai = new OpenAI({ apiKey })

  let completion
  try {
    completion = await openai.chat.completions.create({
      model:       'gpt-4o-mini',
      temperature: 0.1,
      max_tokens:  300,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: PROMPT_FILLED },
        { role: 'user',   content: `Comando: "${text}"\n\nDevolva o JSON.` },
      ],
    })
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erro ao chamar OpenAI' }
  }

  const raw = completion.choices[0]?.message?.content?.trim() ?? ''
  let parsed: VoiceCommand
  try {
    const obj = JSON.parse(raw)
    parsed = obj as VoiceCommand
  } catch {
    return { ok: false, error: `IA retornou JSON inválido: ${raw.slice(0, 100)}` }
  }

  const tokensIn  = completion.usage?.prompt_tokens     ?? 0
  const tokensOut = completion.usage?.completion_tokens ?? 0
  const costMicrosUsd = Math.round(tokensIn * PRICE_PER_1M_INPUT + tokensOut * PRICE_PER_1M_OUTPUT)

  return { ok: true, command: parsed, tokensIn, tokensOut, costMicrosUsd }
}
