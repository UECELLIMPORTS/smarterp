'use server'

/**
 * Server Actions de emissão fiscal — NFC-e, NF-e (futuro), NFS-e (futuro).
 *
 * Foco da Fase 2: emitir NFC-e a partir de uma venda existente. O ID da
 * `fiscal_emissions` row vira o `ref` enviado pra Focus NFe (idempotência).
 */

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAuth } from '@/lib/supabase/server'
import { getTenantId } from '@/lib/tenant'
import {
  emitirNfce, getEmissao, cancelarEmissao,
  FocusNfeError,
  type FocusNfceItem, type Ambiente,
} from '@/lib/focus-nfe'

type Result<T = void> = { ok: true; data?: T } | { ok: false; error: string }

// ──────────────────────────────────────────────────────────────────────────
// Mapeia forma_pagamento do nosso schema pro código Focus/SEFAZ
// 01 = Dinheiro · 02 = Cheque · 03 = Cartão Crédito · 04 = Cartão Débito
// 05 = Crédito Loja · 10 = Vale Alimentação · 11 = Vale Refeição
// 12 = Vale Presente · 13 = Vale Combustível · 15 = Boleto · 16 = Depósito
// 17 = PIX · 18 = Transferência · 19 = Programa Fidelidade · 90 = Sem pagamento
// 99 = Outros
// ──────────────────────────────────────────────────────────────────────────

function mapPaymentToFocus(method: string | null): string {
  const m = (method ?? '').toLowerCase()
  if (m === 'dinheiro' || m === 'cash') return '01'
  if (m === 'pix')                       return '17'
  if (m === 'credito' || m === 'credit') return '03'
  if (m === 'debito'  || m === 'debit')  return '04'
  if (m === 'boleto')                    return '15'
  if (m === 'transferencia')             return '18'
  return '99'
}

function onlyDigits(s: string | null | undefined): string {
  return (s ?? '').replace(/\D/g, '')
}

// ──────────────────────────────────────────────────────────────────────────
// Emite NFC-e a partir de uma venda
// ──────────────────────────────────────────────────────────────────────────

export type EmitNfceResult = {
  emissionId: string
  status:     string
  ref:        string
  message?:   string
}

export async function emitNfceFromSale(saleId: string): Promise<Result<EmitNfceResult>> {
  const { user } = await requireAuth()
  const tenantId = getTenantId(user)

  const admin = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any

  // 1. Lê config fiscal — precisa estar enabled
  const { data: config } = await sb
    .from('fiscal_configs')
    .select('*')
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (!config) return { ok: false, error: 'Configuração fiscal não encontrada. Configure em /configuracoes/fiscal.' }
  if (!config.enabled) return { ok: false, error: 'Emissão fiscal desabilitada. Habilite em /configuracoes/fiscal.' }

  // 2. Lê venda + items + cliente + tenant
  const { data: sale, error: saleErr } = await sb
    .from('sales')
    .select(`
      id, customer_id, total_cents, subtotal_cents, discount_cents, shipping_cents,
      payment_method, status, created_at,
      customers ( full_name, cpf_cnpj, email ),
      sale_items ( name, product_id, quantity, unit_price_cents, subtotal_cents )
    `)
    .eq('id', saleId)
    .eq('tenant_id', tenantId)
    .single()

  if (saleErr || !sale) return { ok: false, error: 'Venda não encontrada.' }
  if (sale.status === 'cancelled') return { ok: false, error: 'Não é possível emitir NFC-e pra venda cancelada.' }

  // Carrega NCM dos produtos referenciados
  const productIds = sale.sale_items
    .map((i: { product_id: string | null }) => i.product_id)
    .filter(Boolean) as string[]
  type Prod = { id: string; ncm: string | null; cfop: string | null; cst_csosn: string | null; unidade: string | null; origem: string | null }
  const productMap = new Map<string, Prod>()
  if (productIds.length > 0) {
    const { data: prods } = await sb
      .from('products')
      .select('id, ncm, cfop, cst_csosn, unidade, origem')
      .in('id', productIds)
    for (const p of (prods ?? []) as Prod[]) productMap.set(p.id, p)
  }

  // 3. Lê CNPJ do tenant
  const { data: tenant } = await sb
    .from('tenants')
    .select('cpf_cnpj')
    .eq('id', tenantId)
    .single()

  const cnpjEmitente = onlyDigits(tenant?.cpf_cnpj)
  if (cnpjEmitente.length !== 14) {
    return { ok: false, error: 'CNPJ do emitente inválido. Atualize em Configurações > Empresa.' }
  }

  // 4. Verifica se já existe emissão pra essa venda (evita duplicata)
  const { data: existing } = await sb
    .from('fiscal_emissions')
    .select('id, status')
    .eq('sale_id', saleId)
    .neq('status', 'rejected')
    .maybeSingle()

  if (existing && existing.status !== 'rejected') {
    return { ok: false, error: `Já existe NFC-e ${existing.status} pra essa venda.` }
  }

  // 5. Cria row em fiscal_emissions com status 'draft'
  type ItemRow = { name: string; product_id: string | null; quantity: number; unit_price_cents: number; subtotal_cents: number }
  type CustomerRow = { full_name: string; cpf_cnpj: string | null; email: string | null }
  const customer = sale.customers as CustomerRow | null
  const items = sale.sale_items as ItemRow[]

  const { data: emission, error: emErr } = await sb
    .from('fiscal_emissions')
    .insert({
      tenant_id:              tenantId,
      sale_id:                saleId,
      type:                   'nfce',
      status:                 'draft',
      ambiente:               config.ambiente,
      total_cents:            sale.total_cents,
      destinatario_nome:      customer?.full_name,
      destinatario_documento: customer?.cpf_cnpj ? onlyDigits(customer.cpf_cnpj) : null,
      destinatario_email:     customer?.email,
    })
    .select('id')
    .single()

  if (emErr || !emission) return { ok: false, error: `Erro ao criar emissão: ${emErr?.message ?? 'desconhecido'}` }
  const emissionId = emission.id as string
  const ref        = `nfce-${emissionId}`

  // 6. Monta payload Focus
  const focusItems: FocusNfceItem[] = items.map((it, idx) => {
    const prod = it.product_id ? productMap.get(it.product_id) : null
    const ncm = prod?.ncm || '00000000'
    const cfop = prod?.cfop || config.cfop_padrao || '5102'
    const cstCsosn = prod?.cst_csosn || config.cst_csosn_padrao || '102'
    const unidade  = prod?.unidade  || 'UN'
    const origem   = prod?.origem   || '0'

    const valorUnit = it.unit_price_cents / 100
    const valorTotal = (it.subtotal_cents ?? it.unit_price_cents * it.quantity) / 100

    return {
      numero_item:                  idx + 1,
      codigo_produto:               it.product_id ?? `manual-${idx + 1}`,
      descricao:                    it.name,
      cfop:                         cfop,
      unidade_comercial:            unidade,
      quantidade_comercial:         it.quantity,
      valor_unitario_comercial:     valorUnit,
      valor_bruto:                  valorTotal,
      unidade_tributavel:           unidade,
      quantidade_tributavel:        it.quantity,
      valor_unitario_tributario:    valorUnit,
      ncm:                          ncm,
      origem_mercadoria:            origem,
      icms_situacao_tributaria:     cstCsosn,
      icms_origem:                  origem,
    }
  })

  const valorTotal = sale.total_cents / 100

  const payload = {
    cnpj_emitente:        cnpjEmitente,
    natureza_operacao:    'Venda de mercadoria',
    data_emissao:         new Date(sale.created_at).toISOString(),
    presenca_comprador:   1,                    // 1 = presencial
    modalidade_frete:     9,                    // 9 = sem frete (NFC-e padrão)
    local_destino:        1,                    // 1 = operação interna
    nome_destinatario:    customer?.full_name,
    cpf_destinatario:     customer?.cpf_cnpj && onlyDigits(customer.cpf_cnpj).length === 11 ? onlyDigits(customer.cpf_cnpj) : undefined,
    cnpj_destinatario:    customer?.cpf_cnpj && onlyDigits(customer.cpf_cnpj).length === 14 ? onlyDigits(customer.cpf_cnpj) : undefined,
    formas_pagamento:     [{
      forma_pagamento: mapPaymentToFocus(sale.payment_method),
      valor_pagamento: valorTotal,
    }],
    items:                focusItems,
    valor_produtos:       valorTotal,
    valor_total:          valorTotal,
  }

  // 7. Chama Focus
  await sb.from('fiscal_emissions')
    .update({ status: 'processing', focus_reference: ref, updated_at: new Date().toISOString() })
    .eq('id', emissionId)

  try {
    const focusRes = await emitirNfce(ref, payload, config.ambiente as Ambiente)

    // Focus retorna 'processando_autorizacao' inicialmente. Vamos consultar.
    await sb.from('fiscal_emissions')
      .update({
        status:         'processing',
        focus_response: focusRes,
        updated_at:     new Date().toISOString(),
      })
      .eq('id', emissionId)

    // Tenta consulta imediata (às vezes vem autorizada de cara)
    try {
      const status = await getEmissao('nfce', ref, config.ambiente as Ambiente)
      await applyFocusStatusUpdate(emissionId, status)

      revalidatePath('/financeiro')
      revalidatePath('/notas-fiscais')

      return {
        ok: true,
        data: {
          emissionId,
          status:  status.status,
          ref,
          message: status.mensagem_sefaz ?? undefined,
        },
      }
    } catch {
      // Consulta falhou — vamos confiar no webhook ou polling depois
      revalidatePath('/financeiro')
      revalidatePath('/notas-fiscais')
      return {
        ok: true,
        data: {
          emissionId,
          status:  'processing',
          ref,
          message: 'Emissão enviada. Aguarde autorização da SEFAZ (~30-90s).',
        },
      }
    }
  } catch (e) {
    const message = e instanceof FocusNfeError ? `Focus NFe: ${e.message}` : 'Erro ao chamar Focus NFe.'
    await sb.from('fiscal_emissions')
      .update({
        status:            'rejected',
        rejection_message: message,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        focus_response:    e instanceof FocusNfeError ? (e.payload as any) : null,
        updated_at:        new Date().toISOString(),
      })
      .eq('id', emissionId)

    return { ok: false, error: message }
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Atualiza fiscal_emissions row a partir da resposta do Focus
// (usado tanto após emitir quanto pelo webhook)
// ──────────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function applyFocusStatusUpdate(emissionId: string, focusRes: any) {
  const admin = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any

  let status: string = 'processing'
  switch (focusRes?.status) {
    case 'autorizado':                 status = 'authorized'; break
    case 'cancelado':                  status = 'cancelled';  break
    case 'inutilizado':                status = 'inutilizada';break
    case 'erro_autorizacao':
    case 'denegado':                   status = 'rejected';   break
    case 'processando_autorizacao':    status = 'processing'; break
  }

  const update = {
    status,
    focus_response:    focusRes,
    chave_acesso:      focusRes.chave_nfe ?? undefined,
    numero:            focusRes.numero ?? undefined,
    serie:             focusRes.serie ?? undefined,
    protocolo:         focusRes.protocolo ?? undefined,
    rejection_message: status === 'rejected' ? (focusRes.mensagem_sefaz || focusRes.mensagem_status) : null,
    emitted_at:        status === 'authorized' ? new Date().toISOString() : undefined,
    updated_at:        new Date().toISOString(),
  }

  await sb.from('fiscal_emissions').update(update).eq('id', emissionId)
}

// ──────────────────────────────────────────────────────────────────────────
// Consulta status atualizado de uma emissão (refresh manual)
// ──────────────────────────────────────────────────────────────────────────

export async function refreshEmissionStatus(emissionId: string): Promise<Result<{ status: string }>> {
  const { user } = await requireAuth()
  const tenantId = getTenantId(user)

  const admin = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any
  const { data: emission } = await sb
    .from('fiscal_emissions')
    .select('id, type, focus_reference, ambiente')
    .eq('id', emissionId)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (!emission || !emission.focus_reference) {
    return { ok: false, error: 'Emissão não encontrada.' }
  }

  try {
    const focusRes = await getEmissao(
      emission.type as 'nfce' | 'nfe' | 'nfse',
      emission.focus_reference,
      emission.ambiente as Ambiente,
    )
    await applyFocusStatusUpdate(emission.id, focusRes)
    revalidatePath('/notas-fiscais')
    return { ok: true, data: { status: focusRes.status } }
  } catch (e) {
    if (e instanceof FocusNfeError) return { ok: false, error: `Focus NFe: ${e.message}` }
    return { ok: false, error: 'Erro ao consultar status.' }
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Cancelamento de NFC-e (até 30min após autorização)
// ──────────────────────────────────────────────────────────────────────────

export async function cancelEmission(emissionId: string, reason: string): Promise<Result> {
  const { user } = await requireAuth()
  const tenantId = getTenantId(user)
  if (reason.trim().length < 15) {
    return { ok: false, error: 'Justificativa precisa ter pelo menos 15 caracteres (regra SEFAZ).' }
  }

  const admin = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any
  const { data: emission } = await sb
    .from('fiscal_emissions')
    .select('id, type, focus_reference, ambiente, status')
    .eq('id', emissionId)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (!emission) return { ok: false, error: 'Emissão não encontrada.' }
  if (emission.status !== 'authorized') return { ok: false, error: 'Só é possível cancelar nota autorizada.' }
  if (!emission.focus_reference)        return { ok: false, error: 'Reference Focus ausente.' }

  try {
    await cancelarEmissao(
      emission.type as 'nfce' | 'nfe' | 'nfse',
      emission.focus_reference,
      emission.ambiente as Ambiente,
      reason,
    )

    await sb.from('fiscal_emissions')
      .update({
        status:                'cancelled',
        cancelled_at:          new Date().toISOString(),
        cancellation_reason:   reason,
        updated_at:            new Date().toISOString(),
      })
      .eq('id', emissionId)

    revalidatePath('/notas-fiscais')
    revalidatePath('/financeiro')
    return { ok: true }
  } catch (e) {
    const message = e instanceof FocusNfeError ? `Focus NFe: ${e.message}` : 'Erro ao cancelar.'
    return { ok: false, error: message }
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Listagem de emissões pra página /notas-fiscais
// ──────────────────────────────────────────────────────────────────────────

export type EmissionListItem = {
  id:                  string
  type:                'nfce' | 'nfe' | 'nfse'
  status:              string
  numero:              number | null
  serie:               number | null
  chaveAcesso:         string | null
  totalCents:          number
  destinatarioNome:    string | null
  destinatarioDoc:     string | null
  ambiente:            'homologacao' | 'producao'
  emittedAt:           string | null
  cancelledAt:         string | null
  rejectionMessage:    string | null
  saleId:              string | null
  serviceOrderId:      string | null
  createdAt:           string
}

export async function listEmissions(filters?: {
  status?:  string
  type?:    'nfce' | 'nfe' | 'nfse'
  startISO?: string
  endISO?:   string
}): Promise<EmissionListItem[]> {
  const { user } = await requireAuth()
  const tenantId = getTenantId(user)

  const admin = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any

  let q = sb
    .from('fiscal_emissions')
    .select('id, type, status, numero, serie, chave_acesso, total_cents, destinatario_nome, destinatario_documento, ambiente, emitted_at, cancelled_at, rejection_message, sale_id, service_order_id, created_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(500)

  if (filters?.status)   q = q.eq('status', filters.status)
  if (filters?.type)     q = q.eq('type', filters.type)
  if (filters?.startISO) q = q.gte('created_at', filters.startISO)
  if (filters?.endISO)   q = q.lte('created_at', filters.endISO)

  const { data, error } = await q
  if (error) throw new Error(error.message)

  type Row = {
    id: string; type: 'nfce' | 'nfe' | 'nfse'; status: string
    numero: number | null; serie: number | null; chave_acesso: string | null
    total_cents: number; destinatario_nome: string | null; destinatario_documento: string | null
    ambiente: 'homologacao' | 'producao'; emitted_at: string | null; cancelled_at: string | null
    rejection_message: string | null; sale_id: string | null; service_order_id: string | null
    created_at: string
  }

  return ((data ?? []) as Row[]).map(r => ({
    id:                 r.id,
    type:               r.type,
    status:             r.status,
    numero:             r.numero,
    serie:              r.serie,
    chaveAcesso:        r.chave_acesso,
    totalCents:         r.total_cents,
    destinatarioNome:   r.destinatario_nome,
    destinatarioDoc:    r.destinatario_documento,
    ambiente:           r.ambiente,
    emittedAt:          r.emitted_at,
    cancelledAt:        r.cancelled_at,
    rejectionMessage:   r.rejection_message,
    saleId:             r.sale_id,
    serviceOrderId:     r.service_order_id,
    createdAt:          r.created_at,
  }))
}
