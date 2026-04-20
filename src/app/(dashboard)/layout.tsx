import { redirect } from 'next/navigation'
import { requireAuth } from '@/lib/supabase/server'
import { Sidebar } from '@/components/layout/sidebar'
import { Topbar } from '@/components/layout/topbar'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  let auth: Awaited<ReturnType<typeof requireAuth>>

  try {
    auth = await requireAuth()
  } catch {
    redirect('/login')
  }

  const { user } = auth
  const userName  = user.user_metadata?.full_name ?? user.user_metadata?.name ?? ''
  const userEmail = user.email ?? ''

  return (
    <div className="min-h-screen" style={{ background: '#080C14' }}>
      <Sidebar />
      <Topbar userName={userName} userEmail={userEmail} />

      {/* Conteúdo principal */}
      <main className="pt-16" style={{ marginLeft: '240px' }}>
        <div className="min-h-[calc(100vh-4rem)] p-6">
          {children}
        </div>
      </main>
    </div>
  )
}
