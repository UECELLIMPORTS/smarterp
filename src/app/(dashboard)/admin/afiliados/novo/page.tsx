import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Lock } from 'lucide-react'
import { requireAuth } from '@/lib/supabase/server'
import { NovoAfiliadoClient } from './client'

export const metadata = { title: 'Novo afiliado — Smart ERP' }

const ADMIN_EMAILS = [
  'uedsonfelipepessoal@gmail.com',
  'uedsonfelipeprofissional@gmail.com',
]

export default async function NovoAfiliadoPage() {
  let auth: Awaited<ReturnType<typeof requireAuth>>
  try { auth = await requireAuth() } catch { redirect('/login') }

  if (!ADMIN_EMAILS.includes(auth.user.email ?? '')) {
    return (
      <div className="max-w-2xl mx-auto mt-12">
        <div className="rounded-2xl border p-12 text-center"
          style={{ background: '#131C2A', borderColor: 'rgba(255,77,109,.3)' }}>
          <Lock className="h-7 w-7 mx-auto mb-3" style={{ color: '#EF4444' }} />
          <h1 className="text-xl font-bold" style={{ color: '#F8FAFC' }}>Acesso restrito</h1>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 md:px-6">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin/afiliados" className="text-zinc-400 hover:text-zinc-100">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="text-lg font-semibold" style={{ color: '#F8FAFC' }}>Novo afiliado</h1>
      </div>

      <NovoAfiliadoClient />
    </div>
  )
}
