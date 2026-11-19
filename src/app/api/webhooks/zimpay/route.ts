/**
 * Webhook ZimPay (Pix → USDT). Público, mas:
 *  1. exige X-Signature = HMAC-SHA256(body, ZIMPAY_CALLBACK_SECRET)
 *  2. NÃO confia no corpo: re-consulta a ZimPay via GET antes de gravar.
 */
import { NextResponse }      from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyZimpaySignature, syncCharge, type PixUsdtCharge } from '@/lib/zimpay'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const raw = await req.text()
  if (!verifyZimpaySignature(raw, req.headers.get('x-signature'))) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  let body: Record<string, unknown> = {}
  try { body = JSON.parse(raw) } catch { /* ignore */ }
  const d = (body.data ?? body) as Record<string, unknown>
  const orderId     = d.order_id ?? d.id
  const externalRef = d.external_ref

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db: any = createAdminClient()
  let q = db.from('pix_usdt_charges').select('*').eq('product', 'smarterp')
  if (externalRef)  q = q.eq('external_ref', String(externalRef))
  else if (orderId) q = q.eq('zimpay_order_id', String(orderId))
  else return NextResponse.json({ ok: true })

  const { data: row } = await q.maybeSingle()
  if (row) await syncCharge(db, row as PixUsdtCharge, { force: true })
  return NextResponse.json({ ok: true })
}
