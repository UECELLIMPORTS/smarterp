/**
 * Cron — Libera holds vencidos de comissões de afiliado.
 *
 * Roda diariamente às 03:00 UTC (= 00:00 BRT).
 *
 * Lógica: comissões em `pending_approval` que passaram do hold_until E
 * cuja referral não está em status under_review/rejected → vira `payable`.
 *
 * Comissões em `under_review` continuam paradas até admin liberar manual.
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const expected = `Bearer ${process.env.CRON_SECRET}`
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'CRON_SECRET não configurado' }, { status: 500 })
  }
  if (authHeader !== expected) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const admin = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any

  const now = new Date().toISOString()

  // Libera apenas comissões cujo referral está 'attributed' (não under_review nem rejected)
  const { data: candidates, error: fetchErr } = await sb
    .from('affiliate_commissions')
    .select('id, referral_id, amount_cents, affiliate_id, type')
    .eq('status', 'pending_approval')
    .lte('hold_until', now)
    .limit(500)

  if (fetchErr) {
    console.error('[affiliate-release-holds] fetch error:', fetchErr)
    return NextResponse.json({ ok: false, error: fetchErr.message }, { status: 500 })
  }

  if (!candidates || candidates.length === 0) {
    return NextResponse.json({ ok: true, released: 0 })
  }

  // Agrupa por referral pra checar status em 1 query
  const referralIds = Array.from(new Set(candidates.map((c: { referral_id: string }) => c.referral_id)))
  const { data: refs } = await sb
    .from('affiliate_referrals')
    .select('id, status')
    .in('id', referralIds)

  const refStatusMap: Record<string, string> = {}
  ;(refs ?? []).forEach((r: { id: string; status: string }) => { refStatusMap[r.id] = r.status })

  const toRelease = candidates
    .filter((c: { referral_id: string }) => refStatusMap[c.referral_id] === 'attributed')
    .map((c: { id: string }) => c.id)

  if (toRelease.length === 0) return NextResponse.json({ ok: true, released: 0, candidates: candidates.length })

  const { error: updErr } = await sb
    .from('affiliate_commissions')
    .update({ status: 'payable' })
    .in('id', toRelease)

  if (updErr) {
    console.error('[affiliate-release-holds] update error:', updErr)
    return NextResponse.json({ ok: false, error: updErr.message }, { status: 500 })
  }

  return NextResponse.json({
    ok:         true,
    released:   toRelease.length,
    candidates: candidates.length,
  })
}
