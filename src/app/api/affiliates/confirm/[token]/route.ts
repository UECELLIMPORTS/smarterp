/**
 * Confirma email do afiliado público.
 *
 * GET /api/affiliates/confirm/[token] → ativa conta + redireciona pra
 * /afiliado-confirmado?ref=CODIGO. Se token inválido/expirado, redireciona
 * pra /afiliado-confirmado?error=token_invalido.
 */

import { NextResponse } from 'next/server'
import { confirmAffiliateEmail } from '@/actions/affiliates-public'

export const dynamic = 'force-dynamic'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  const baseUrl = new URL(request.url).origin

  const res = await confirmAffiliateEmail(token)
  if (!res.ok) {
    return NextResponse.redirect(`${baseUrl}/afiliado-confirmado?error=${encodeURIComponent(res.error)}`)
  }

  return NextResponse.redirect(
    `${baseUrl}/afiliado-confirmado?ref=${encodeURIComponent(res.refCode)}&nome=${encodeURIComponent(res.fullName.split(' ')[0])}`
  )
}
