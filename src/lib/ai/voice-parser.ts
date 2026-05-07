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

export type VoiceSaleItem = {
  productQuery:    string  // texto livre, ex: "iPhone 13", "capinha samsung"
  quantity:        number
  unitPriceCents?: number | null  // se mencionou preço unitário
}

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
      type:           'sale'
      items:          VoiceSaleItem[]
      customerQuery?: string | null               // "Maria", "João da padaria", null se "consumidor final"
      totalCents?:    number | null               // se mencionou total geral
      discountCents?: number | null
      shippingCents?: number | null
      paymentMethod:  'cash' | 'pix' | 'card' | 'mixed' | null
      saleChannel?:   'fisica_balcao' | 'whatsapp' | 'instagram_dm' | 'delivery_online' | 'fisica_retirada' | 'outro' | null
      saleDate?:      string | null               // YYYY-MM-DD — null se for HOJE; preencha se mencionar data passada (ontem, dia 15, semana passada, etc)
      confidence:     number
    }
  | {
      type:     'needs_clarification'
      question: string                              // pergunta consolidada pra ser falada/exibida
      partial?: Partial<{                           // dados que já entendeu (pra preservar entre turnos)
        commandType:    'expense' | 'sale' | 'stock_in' | 'stock_balance'
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        fields:         Record<string, any>
      }>
    }
  | {
      type:    'unknown'
      reason:  string
    }

export type ParseResult =
  | { ok: true;  command: VoiceCommand; tokensIn: number; tokensOut: number; costMicrosUsd: number; raw: string }
  | { ok: false; error: string; raw?: string }

const PRICE_PER_1M_INPUT  = 0.15  // gpt-4o-mini input
const PRICE_PER_1M_OUTPUT = 0.60  // gpt-4o-mini output

function todayBR(): string {
  const tz = new Date().toLocaleString('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' })
  // en-CA já retorna YYYY-MM-DD
  return tz
}

const SYSTEM_PROMPT = `Você é um parser de comandos de voz pra um ERP de loja brasileira (UÉ Cell Imports).
O usuário diz comandos em português brasileiro informal. Você classifica em 4 tipos e extrai campos estruturados.

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

4) "sale" — lançar VENDA (saída de produto + entrada de receita)
   Frases:
   - "vendi um iPhone 13 pra Maria, 1500 reais pix balcão"
   - "vendi 2 capinhas a 30 reais cada, total 60, dinheiro, consumidor final"
   - "vendi um carregador e uma película pro João da padaria, 80 reais cartão WhatsApp"
   - "vendi um iPhone 11 e uma capinha pro José, 1200 com 50 de desconto, frete 20, pix"
   Campos:
   - items: ARRAY de itens. Cada item:
     • productQuery: nome do produto (string)
     • quantity: quantos (1 se não disse)
     • unitPriceCents: preço unitário em centavos (opcional, só se mencionou explicitamente "a 30 cada", "a 1500 cada")
   - customerQuery: nome do cliente (string ou null se "consumidor final"/"balcão"/sem nome)
   - totalCents: valor total da venda em centavos (se mencionou)
   - discountCents: desconto em centavos (se mencionou "X de desconto")
   - shippingCents: frete em centavos (se mencionou)
   - paymentMethod: "cash" | "pix" | "card" | "mixed" | null
     • "dinheiro" → cash
     • "pix" → pix
     • "cartão", "cartão de crédito", "cartão de débito" → card
     • "metade dinheiro metade pix" / múltiplas formas → mixed
   - saleChannel: canal de venda (opcional)
     • "balcão", "loja física", "presencial" → fisica_balcao
     • "WhatsApp" → whatsapp
     • "Instagram", "DM" → instagram_dm
     • "delivery", "ifood", "site" → delivery_online
     • "retirada" → fisica_retirada
   - saleDate: data da venda em YYYY-MM-DD (OPCIONAL)
     • Se NÃO mencionar data ou disser "hoje" → deixa null (vai usar fluxo POS normal)
     • Se mencionar data passada ("ontem", "dia 15", "semana passada", "no domingo", "dia 02/05") → preenche YYYY-MM-DD
     • Hoje = ${todayBR()}. "ontem" = ${todayBR()} -1 dia.
     • Quando saleDate != null, vai pro fluxo "venda manual" (módulo financeiro), sem precisar caixa aberto.

QUANDO PEDIR CLARIFICAÇÃO (modo conversação):
- Se você tem certeza do TIPO mas falta info essencial pra completar, retorna:
  {"type":"needs_clarification","question":"<pergunta consolidada em PT-BR>","partial":{"commandType":"sale","fields":{...campos que já entendeu...}}}
- Junte TODAS as faltas em UMA só pergunta natural (não pergunte 1 por vez).
- Exemplos de info essencial faltando:
  • sale: sem cliente E sem valor E sem pagamento → "Pra qual cliente, quanto custou e qual a forma de pagamento?"
  • sale: tem produto + cliente, falta só pagamento → "Qual a forma de pagamento? Dinheiro, pix ou cartão?"
  • expense: sem categoria identificável → "Qual a categoria? (ex: motoboy, combustível, lanche...)"
  • stock_in: sem produto → "Qual o produto que entrou no estoque?"
- Se o histórico tem múltiplos turnos, COMBINE todos os dados antes de retornar JSON final.

REGRAS GERAIS:
- Sempre PT-BR.
- Use "unknown" APENAS se for IMPOSSÍVEL classificar (ex: "oi", "como vai"). Comandos relacionados a venda/gasto/estoque DEVEM ser tentados — confidence baixo é melhor que unknown.
- Frase começa com "vendi" → quase sempre é "sale".
- Frase tem "paguei", "gastei", "X reais de Y" → quase sempre "expense".
- Frase tem "deu entrada", "chegou", "recebi", "comprei pra estoque" → "stock_in".
- Frase tem "tem X no estoque", "balanço", "contagem", "fiz inventário" → "stock_balance".
- confidence: 0.0 a 1.0. Use < 0.7 quando texto for ambíguo.
- amountCents/purchasePriceCents/salePriceCents/newQty/totalCents/discountCents/shippingCents/unitPriceCents: SEMPRE inteiros.
  - "200 reais" = 20000, "1500" = 150000, "50 mil" = 5000000
  - Frações: "1,50" = 150
- occurredAt OBRIGATÓRIO em "expense". Hoje = ${todayBR()}.
- VENDAS:
  • Se o usuário falar só 1 produto sem quantidade, assume quantity=1.
  • Se NÃO mencionar preço algum (nem unitário, nem total): deixa unitPriceCents=null E totalCents=null. O sistema vai usar o valor cadastrado do produto.
  • Se mencionar SÓ total: deixa unitPriceCents=null e preenche totalCents.
  • Se mencionar SÓ unitário ("a 30 reais cada"): preenche unitPriceCents, deixa totalCents=null (sistema calcula).
  • Se mencionar AMBOS ("30 cada, total 60"): preenche os dois.

EXEMPLOS:

Input: "vendi um iPhone 13 pra Maria por 1500 pix"
Output: {"type":"sale","items":[{"productQuery":"iPhone 13","quantity":1}],"customerQuery":"Maria","totalCents":150000,"paymentMethod":"pix","confidence":0.9}

Input: "200 reais de tinta hoje"
Output: {"type":"expense","occurredAt":"${todayBR()}","amountCents":20000,"category":"manutencao","description":"tinta","confidence":0.85}

Input: "deu entrada de 5 capinhas a 15 reais cada"
Output: {"type":"stock_in","productQuery":"capinhas","quantity":5,"purchasePriceCents":1500,"confidence":0.9}

Input: "balanço, tem 3 iPhone 11 no estoque"
Output: {"type":"stock_balance","productQuery":"iPhone 11","newQty":3,"confidence":0.95}

Input: "vendi um carregador e duas películas pro José, total 80 reais cartão"
Output: {"type":"sale","items":[{"productQuery":"carregador","quantity":1},{"productQuery":"película","quantity":2}],"customerQuery":"José","totalCents":8000,"paymentMethod":"card","confidence":0.85}

Input: "vendi ontem uma capinha pra Pedro por 30 dinheiro"
Output: {"type":"sale","items":[{"productQuery":"capinha","quantity":1}],"customerQuery":"Pedro","totalCents":3000,"paymentMethod":"cash","saleDate":"<ontem>","confidence":0.85}

Input: "venda do dia 15 do mês: 1 película iPhone 13 pro João, 25 pix"
Output: {"type":"sale","items":[{"productQuery":"película iPhone 13","quantity":1}],"customerQuery":"João","totalCents":2500,"paymentMethod":"pix","saleDate":"<ano-mês-15>","confidence":0.85}

Input: "paguei 50 de motoboy"
Output: {"type":"expense","occurredAt":"${todayBR()}","amountCents":5000,"category":"motoboy","confidence":0.95}

Input: "vendi um iPhone 13 128GB roxo seminovo pra cliente nova, 1800 metade pix metade dinheiro"
Output: {"type":"sale","items":[{"productQuery":"iPhone 13 128GB roxo","quantity":1}],"customerQuery":null,"totalCents":180000,"paymentMethod":"mixed","confidence":0.8}

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
      temperature: 0.2,
      max_tokens:  500,
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
  console.log('[voice-parser] input:', text, '| raw output:', raw)

  let parsed: VoiceCommand
  try {
    const obj = JSON.parse(raw)
    parsed = obj as VoiceCommand
  } catch {
    return { ok: false, error: `IA retornou JSON inválido: ${raw.slice(0, 200)}`, raw }
  }

  const tokensIn  = completion.usage?.prompt_tokens     ?? 0
  const tokensOut = completion.usage?.completion_tokens ?? 0
  const costMicrosUsd = Math.round(tokensIn * PRICE_PER_1M_INPUT + tokensOut * PRICE_PER_1M_OUTPUT)

  return { ok: true, command: parsed, tokensIn, tokensOut, costMicrosUsd, raw }
}

/**
 * Versão multi-turn: aceita histórico de mensagens.
 * Cada turn do user vai sendo concatenado pro LLM completar os dados aos poucos.
 *
 * Aceita contexto opcional (sessão, operacional, memórias) que é prependado
 * ao system prompt pra IA usar referências ("mesmo cliente", "mais 1 igual").
 */
export type ConversationTurn = { role: 'user' | 'assistant'; content: string }

export async function parseConversation(turns: ConversationTurn[], contextBlock = ''): Promise<ParseResult> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return { ok: false, error: 'OPENAI_API_KEY não configurada' }
  if (turns.length === 0) return { ok: false, error: 'Histórico vazio' }

  const openai = new OpenAI({ apiKey })

  const systemContent = contextBlock
    ? `${PROMPT_FILLED}\n\n────────────\n${contextBlock}\n────────────\n\nUse o contexto acima quando o user fizer referências ("mesmo cliente", "mais 1 igual", "como ontem"). Se o user mencionar um cliente que aparece nas memórias, considere as preferências.`
    : PROMPT_FILLED

  const messages = [
    { role: 'system' as const, content: systemContent },
    ...turns.map(t => ({ role: t.role, content: t.content })),
    { role: 'user' as const, content: 'Com base no acima, devolva o JSON (estruturado se completo, ou needs_clarification se faltar info).' },
  ]

  let completion
  try {
    completion = await openai.chat.completions.create({
      model:       'gpt-4o-mini',
      temperature: 0.2,
      max_tokens:  500,
      response_format: { type: 'json_object' },
      messages,
    })
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erro ao chamar OpenAI' }
  }

  const raw = completion.choices[0]?.message?.content?.trim() ?? ''
  console.log('[voice-parser] conversation turns:', turns.length, '| raw:', raw)

  let parsed: VoiceCommand
  try {
    parsed = JSON.parse(raw) as VoiceCommand
  } catch {
    return { ok: false, error: `IA retornou JSON inválido: ${raw.slice(0, 200)}`, raw }
  }

  const tokensIn  = completion.usage?.prompt_tokens     ?? 0
  const tokensOut = completion.usage?.completion_tokens ?? 0
  const costMicrosUsd = Math.round(tokensIn * PRICE_PER_1M_INPUT + tokensOut * PRICE_PER_1M_OUTPUT)

  return { ok: true, command: parsed, tokensIn, tokensOut, costMicrosUsd, raw }
}
