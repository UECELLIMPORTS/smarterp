import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const REF_COOKIE        = 'smartgestao_ref'
const REF_COOKIE_MAXAGE = 60 * 60 * 24 * 60   // 60 dias
const REF_VALID_REGEX   = /^[A-Z0-9]{4,12}$/i

export async function proxy(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl

  // Webhooks externos (Asaas, etc) não passam pelo auth do Supabase — o
  // auth deles é feito por token no header dentro do próprio route handler.
  // Sem essa exceção, requests de webhook são redirecionados pra /login (307)
  // e nunca chegam no handler. Causou bug onde Asaas marcava webhook como
  // "Penalização aplicada" (15 tentativas com 307) e parava de enviar.
  if (pathname.startsWith('/api/webhooks/') || pathname.startsWith('/api/cron/')) {
    return NextResponse.next({ request })
  }

  let response = NextResponse.next({ request })

  // ── Atribuição de afiliado: ?ref=CODIGO seta cookie cross-subdomain ──────
  // Cobre os 4 SaaS via domínio .gestaosmarterp.online. Em dev, sem domain.
  // Cookie só é gravado se ainda não existir (last-touch é o primeiro clique).
  const refParam = searchParams.get('ref')
  if (refParam && REF_VALID_REGEX.test(refParam) && !request.cookies.get(REF_COOKIE)) {
    const isProd = process.env.NODE_ENV === 'production'
    response.cookies.set(REF_COOKIE, refParam.toUpperCase(), {
      maxAge:   REF_COOKIE_MAXAGE,
      path:     '/',
      sameSite: 'lax',
      secure:   isProd,
      domain:   isProd ? '.gestaosmarterp.online' : undefined,
      httpOnly: false,                       // signup client-side precisa ler
    })
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll()      { return request.cookies.getAll() },
        setAll(toSet) {
          toSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    },
  )

  const { data: { user } } = await supabase.auth.getUser()

  // Rotas públicas — redireciona usuário autenticado pro dashboard.
  // /reset-password e /aceitar-convite são exceções: precisam receber sessão
  // temporária do Supabase mesmo se já tem outro user logado.
  if (pathname === '/login' || pathname === '/signup' || pathname === '/forgot-password') {
    if (user) return NextResponse.redirect(new URL('/', request.url))
    return response
  }
  if (pathname === '/reset-password' || pathname.startsWith('/aceitar-convite')) {
    return response
  }

  // Captação pública de afiliados — não exige auth
  if (pathname === '/seja-afiliado' || pathname.startsWith('/afiliado-confirmado') || pathname === '/termos-afiliado') {
    return response
  }

  // Rotas protegidas — redireciona não-autenticado pro login
  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
