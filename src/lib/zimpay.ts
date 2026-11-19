/**
 * ZimPay — Pix → USDT (pix-usdt-order.php)
 *
 * SERVER-ONLY. Arquivo idêntico no CheckSmart e no Gestão Smart (smarterp).
 *
 * Fluxo:
 *   1. createCharge()  → cria pedido na ZimPay (QR/copia-e-cola) e grava em pix_usdt_charges
 *   2. syncCharge()    → consulta GET na ZimPay (fonte da verdade) e atualiza o status
 *   3. webhook         → ZimPay avisa quando o USDT é enviado; validamos HMAC e
 *                        mesmo assim re-consultamos via GET antes de gravar.
 *
 * Env (Vercel + .env.local — nunca no client):
 *   ZIMPAY_CLIENT_ID          Apikey
 *   ZIMPAY_CLIENT_SECRET      X-API-SECRET
 *   ZIMPAY_USDT_WALLET        carteira Polygon (0x...) que recebe o USDT
 *   ZIMPAY_CALLBACK_SECRET    segredo do HMAC do callback (>= 16 chars)
 *   ZIMPAY_ENABLED_TENANTS    tenant_ids liberados, separados por vírgula
 *   ZIMPAY_CALLBACK_BASE_URL  (opcional) ex.: https://app.gestaosmarterp.online
 */
import 'server-only'
import crypto from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

const BASE_URL = 'https://dex.zimpay.com.br/api/v1'

export type PixUsdtStatus =
  | 'creating' | 'pending' | 'pix_paid' | 'queued' | 'processing'
  | 'sent' | 'confirmed' | 'failed' | 'expired' | 'error'

/** Pix já caiu (cliente pagou). `failed` aqui = falha no envio do USDT, mas o Pix foi pago. */
export const PAID_STATUSES: PixUsdtStatus[] = ['pix_paid', 'queued', 'processing', 'sent', 'confirmed', 'failed']
export const FINAL_STATUSES: PixUsdtStatus[] = ['confirmed', 'failed', 'expired', 'error']

export type PixUsdtCharge = {
  id:              string
  tenant_id:       string
  product:         'smarterp' | 'checksmart'
  source_type:     'sale' | 'service_order' | 'avulso'
  source_id:       string | null
  amount_cents:    number
  payer_name:      string
  payer_document:  string
  external_ref:    string
  zimpay_order_id: string | null
  pix_code:        string | null
  status:          PixUsdtStatus
  usdt_estimated:  number | null
  rate:            number | null
  paid_at:         string | null
  last_checked_at: string | null
  created_at:      string
}

/** Campos seguros pra devolver ao navegador do colaborador (sem raw / sem dados internos). */
export type PixUsdtChargePublic = Pick<
  PixUsdtCharge,
  'id' | 'source_type' | 'source_id' | 'amount_cents' | 'payer_name' | 'pix_code' |
  'status' | 'usdt_estimated' | 'paid_at' | 'created_at'
>

export function toPublic(c: PixUsdtCharge): PixUsdtChargePublic {
  return {
    id: c.id, source_type: c.source_type, source_id: c.source_id, amount_cents: c.amount_cents,
    payer_name: c.payer_name, pix_code: c.pix_code, status: c.status,
    usdt_estimated: c.usdt_estimated, paid_at: c.paid_at, created_at: c.created_at,
  }
}

// ── Config ────────────────────────────────────────────────────────────────

function cfg() {
  const clientId     = process.env.ZIMPAY_CLIENT_ID
  const clientSecret = process.env.ZIMPAY_CLIENT_SECRET
  const wallet       = process.env.ZIMPAY_USDT_WALLET
  if (!clientId || !clientSecret || !wallet) {
    throw new Error('ZimPay não configurada (ZIMPAY_CLIENT_ID / ZIMPAY_CLIENT_SECRET / ZIMPAY_USDT_WALLET).')
  }
  if (!/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
    throw new Error('ZIMPAY_USDT_WALLET inválida (esperado endereço Polygon 0x... com 40 hex).')
  }
  return { clientId, clientSecret, wallet }
}

export function isZimpayEnabledForTenant(tenantId: string | null | undefined): boolean {
  if (!tenantId) return false
  if (!process.env.ZIMPAY_CLIENT_ID || !process.env.ZIMPAY_CLIENT_SECRET || !process.env.ZIMPAY_USDT_WALLET) return false
  const list = (process.env.ZIMPAY_ENABLED_TENANTS ?? '').split(',').map(s => s.trim()).filter(Boolean)
  return list.includes(tenantId)
}

function headers() {
  const { clientId, clientSecret } = cfg()
  return {
    Accept:         'application/json',
    'Content-Type': 'application/json',
    Apikey:         clientId,
    'X-API-SECRET': clientSecret,
  }
}

// ── HTTP ──────────────────────────────────────────────────────────────────

type ZimpayOrderData = {
  order_id?:       string | number
  id?:             string | number
  status?:         string
  pix_code?:       string
  usdt_estimated?: number | string
  rate?:           number | string
  [k: string]: unknown
}

type ZimpayEnvelope = {
  success?: boolean
  data?:    ZimpayOrderData
  message?: string
  error?:   { code?: string; message?: string }
}

async function zimpayFetch(path: string, init: RequestInit): Promise<ZimpayOrderData> {
  const res = await fetch(`${BASE_URL}/${path}`, {
    ...init,
    headers: headers(),
    cache:   'no-store',
    signal:  AbortSignal.timeout(15_000),
  })
  const text = await res.text()
  let body: ZimpayEnvelope
  try { body = JSON.parse(text) as ZimpayEnvelope } catch {
    console.error('[zimpay] resposta não-JSON', res.status, text.slice(0, 300))
    throw new Error(`ZimPay respondeu HTTP ${res.status} (não-JSON).`)
  }
  if (!res.ok || body.success === false || !body.data) {
    const msg = body.error?.message ?? body.message ?? `HTTP ${res.status}`
    console.error('[zimpay] erro', res.status, body.error?.code, msg)
    throw new Error(`ZimPay: ${msg}`)
  }
  return body.data
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

function normalizeStatus(s: unknown): PixUsdtStatus {
  const v = String(s ?? '').toLowerCase()
  const known: PixUsdtStatus[] = ['pending', 'pix_paid', 'queued', 'processing', 'sent', 'confirmed', 'failed', 'expired']
  return (known as string[]).includes(v) ? (v as PixUsdtStatus) : 'pending'
}

// ── Assinatura do webhook ─────────────────────────────────────────────────

/** HMAC-SHA256(rawBody, ZIMPAY_CALLBACK_SECRET). Aceita hex ou base64 (doc não especifica). */
export function verifyZimpaySignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.ZIMPAY_CALLBACK_SECRET
  if (!secret || !signature) return false
  const sig = signature.trim().replace(/^sha256=/i, '')
  const mac = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest()
  const candidates = [Buffer.from(mac.toString('hex')), Buffer.from(mac.toString('base64'))]
  const given = Buffer.from(sig)
  return candidates.some(c => c.length === given.length && crypto.timingSafeEqual(c, given))
}

// ── Operações ─────────────────────────────────────────────────────────────

export function onlyDigits(s: string) { return s.replace(/\D/g, '') }

export async function createCharge(admin: SupabaseClient, input: {
  tenantId:      string
  userId:        string
  product:       'smarterp' | 'checksmart'
  sourceType:    'sale' | 'service_order' | 'avulso'
  sourceId:      string | null
  amountCents:   number
  payerName:     string
  payerDocument: string
}): Promise<PixUsdtCharge> {
  const { wallet } = cfg()
  const externalRef = `${input.product}-${crypto.randomUUID()}`

  const { data: row, error: insErr } = await admin
    .from('pix_usdt_charges')
    .insert({
      tenant_id:      input.tenantId,
      product:        input.product,
      source_type:    input.sourceType,
      source_id:      input.sourceId,
      amount_cents:   input.amountCents,
      payer_name:     input.payerName,
      payer_document: input.payerDocument,
      external_ref:   externalRef,
      status:         'creating',
      created_by:     input.userId,
    })
    .select('*')
    .single()
  if (insErr || !row) throw new Error('Erro ao registrar cobrança: ' + (insErr?.message ?? ''))

  const callbackBase = (process.env.ZIMPAY_CALLBACK_BASE_URL ?? '').replace(/\/$/, '')
  const callbackSecret = process.env.ZIMPAY_CALLBACK_SECRET
  const withCallback = callbackBase.startsWith('https://') && !!callbackSecret && callbackSecret.length >= 16

  try {
    const data = await zimpayFetch('pix-usdt-order.php', {
      method: 'POST',
      body: JSON.stringify({
        amount_brl:     Number((input.amountCents / 100).toFixed(2)),
        wallet,
        network:        'POLYGON',
        payer_name:     input.payerName,
        payer_document: input.payerDocument,
        external_ref:   externalRef,
        ...(withCallback ? {
          callback_url:    `${callbackBase}/api/webhooks/zimpay`,
          callback_secret: callbackSecret,
        } : {}),
      }),
    })

    const orderId = data.order_id ?? data.id
    if (!orderId || !data.pix_code) throw new Error('ZimPay não devolveu order_id/pix_code.')

    const { data: updated, error: upErr } = await admin
      .from('pix_usdt_charges')
      .update({
        zimpay_order_id: String(orderId),
        pix_code:        data.pix_code,
        status:          normalizeStatus(data.status),
        usdt_estimated:  num(data.usdt_estimated),
        rate:            num(data.rate),
        raw:             data,
        last_checked_at: new Date().toISOString(),
        updated_at:      new Date().toISOString(),
      })
      .eq('id', row.id)
      .select('*')
      .single()
    if (upErr || !updated) throw new Error('Erro ao salvar cobrança: ' + (upErr?.message ?? ''))
    return updated as PixUsdtCharge
  } catch (e) {
    await admin.from('pix_usdt_charges')
      .update({ status: 'error', raw: { error: (e as Error).message }, updated_at: new Date().toISOString() })
      .eq('id', row.id)
    throw e
  }
}

/**
 * Re-consulta a ZimPay (com throttle de 4s) e grava a mudança.
 * Retorna { charge, becamePaid } — becamePaid=true só na 1ª vez que o Pix aparece pago.
 */
export async function syncCharge(
  admin: SupabaseClient,
  charge: PixUsdtCharge,
  opts: { force?: boolean } = {},
): Promise<{ charge: PixUsdtCharge; becamePaid: boolean }> {
  if (!charge.zimpay_order_id || FINAL_STATUSES.includes(charge.status)) {
    return { charge, becamePaid: false }
  }
  const last = charge.last_checked_at ? new Date(charge.last_checked_at).getTime() : 0
  if (!opts.force && Date.now() - last < 4_000) return { charge, becamePaid: false }

  let data: ZimpayOrderData
  try {
    data = await zimpayFetch(`pix-usdt-order.php?id=${encodeURIComponent(charge.zimpay_order_id)}`, { method: 'GET' })
  } catch (e) {
    console.error('[zimpay] sync falhou', charge.id, (e as Error).message)
    return { charge, becamePaid: false }
  }

  const newStatus  = normalizeStatus(data.status)
  const wasPaid    = PAID_STATUSES.includes(charge.status)
  const isPaid     = PAID_STATUSES.includes(newStatus)
  const becamePaid = !wasPaid && isPaid
  const now        = new Date().toISOString()

  // Update condicional no status antigo → se 2 polls simultâneos, só um "vira pago".
  const { data: updated } = await admin
    .from('pix_usdt_charges')
    .update({
      status:          newStatus,
      usdt_estimated:  num(data.usdt_estimated) ?? charge.usdt_estimated,
      rate:            num(data.rate) ?? charge.rate,
      paid_at:         becamePaid ? now : charge.paid_at,
      raw:             data,
      last_checked_at: now,
      updated_at:      now,
    })
    .eq('id', charge.id)
    .eq('status', charge.status)
    .select('*')
    .maybeSingle()

  if (!updated) {
    // Outro processo atualizou antes — relê e não dispara efeitos de novo.
    const { data: fresh } = await admin.from('pix_usdt_charges').select('*').eq('id', charge.id).single()
    return { charge: (fresh ?? charge) as PixUsdtCharge, becamePaid: false }
  }
  return { charge: updated as PixUsdtCharge, becamePaid }
}
