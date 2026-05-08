/**
 * Cron — Trials de gestao_smart vencidos viram Free.
 *
 * Roda diariamente. Subscriptions com:
 *  - product='gestao_smart'
 *  - status in ('trial', 'trialing')
 *  - trial_ends_at < now
 *  - sem asaas_subscription_id (não pagou)
 *
 * Vão pra status='active', plan_name='free', com limites do Free
 * (50 vendas/mês, 1 usuário, sem CRM/Meta Ads/relatórios).
 *
 * Quem pagou no trial é promovido pra plan_name pago via webhook do Asaas.
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'CRON_SECRET não configurado' }, { status: 500 })
  }
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createAdminClient() as any

  const now = new Date().toISOString()

  const { data: expired, error } = await sb
    .from('subscriptions')
    .select('id, tenant_id, asaas_subscription_id')
    .eq('product', 'gestao_smart')
    .in('status', ['trial', 'trialing'])
    .lte('trial_ends_at', now)
    .limit(500)

  if (error) {
    console.error('[expire-trial-to-free] fetch error:', error.message)
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  if (!expired || expired.length === 0) {
    return NextResponse.json({ ok: true, expired: 0 })
  }

  let promotedToFree = 0
  let kept = 0

  for (const sub of expired as { id: string; tenant_id: string; asaas_subscription_id: string | null }[]) {
    if (sub.asaas_subscription_id) { kept++; continue }

    const { error: upErr } = await sb.from('subscriptions')
      .update({
        status:        'active',
        plan_name:     'free',
        trial_ends_at: null,
      })
      .eq('id', sub.id)

    if (upErr) {
      console.error(`[expire-trial-to-free] update sub ${sub.id} falhou:`, upErr.message)
      continue
    }
    promotedToFree++

    const { data: tenant } = await sb
      .from('tenants')
      .select('owner_user_id')
      .eq('id', sub.tenant_id)
      .maybeSingle()

    if (tenant?.owner_user_id) {
      await sb.from('notifications').insert({
        user_id:   tenant.owner_user_id,
        tenant_id: sub.tenant_id,
        type:      'trial_ended_free',
        title:     'Seu trial acabou — você está no Grátis',
        body:      'Seu trial de 7 dias terminou. Você continua usando o Gestão Smart no plano Grátis (50 vendas/mês, 1 usuário). Pra desbloquear vendas ilimitadas, equipe, relatórios, CRM e Meta Ads, faça upgrade em Configurações → Assinatura.',
        link:      '/configuracoes/assinatura',
      }).then(() => null, () => null)
    }
  }

  return NextResponse.json({
    ok: true,
    total:           expired.length,
    promotedToFree,
    keptForWebhook:  kept,
  })
}
