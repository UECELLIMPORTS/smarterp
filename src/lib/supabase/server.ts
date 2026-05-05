import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { cache } from 'react'

export async function createClient() {
  const cookieStore = await cookies()
  const cookieDomain = process.env.NEXT_PUBLIC_COOKIE_DOMAIN

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll()      { return cookieStore.getAll() },
        setAll(toSet) {
          try {
            toSet.forEach(({ name, value, options }) => {
              const finalOpts = cookieDomain ? { ...options, domain: cookieDomain } : options
              cookieStore.set(name, value, finalOpts)
            })
          } catch { /* ignorado em Server Components */ }
        },
      },
    },
  )
}

// cache() deduplica chamadas dentro do mesmo request — layout + página compartilham o mesmo resultado
export const requireAuth = cache(async () => {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) throw new Error('UNAUTHENTICATED')

  return { supabase, user }
})
