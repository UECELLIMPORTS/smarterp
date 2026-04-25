'use client'

import { useRouter } from 'next/navigation'
import { LogOut, Bell } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { MobileNav } from './mobile-nav'

type Props = { userName: string; userEmail: string }

export function Topbar({ userName, userEmail }: Props) {
  const router = useRouter()

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    toast.success('Sessão encerrada.')
    router.push('/login')
    router.refresh()
  }

  const initials = userName
    ? userName.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()
    : userEmail?.slice(0, 2).toUpperCase() ?? 'U'

  return (
    <header
      // No mobile (left:0) ocupa tela toda; em lg+ recua 240px pra dar espaço pra Sidebar.
      className="fixed right-0 top-0 z-30 flex h-16 items-center justify-between border-b px-4 sm:px-6 left-0 lg:left-60"
      style={{ background: '#080C14', borderColor: '#1E2D45' }}
    >
      {/* Slot esquerdo: hamburger no mobile */}
      <MobileNav />

      <div className="flex items-center gap-3">
        {/* Notificações */}
        <button
          className="relative flex h-9 w-9 items-center justify-center rounded-lg border transition-colors hover:bg-card"
          style={{ borderColor: '#1E2D45', color: '#64748B' }}
        >
          <Bell className="h-4 w-4" />
        </button>

        {/* Usuário */}
        <div className="flex items-center gap-2.5">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold"
            style={{ background: 'linear-gradient(135deg, #00E5FF, #00FF94)', color: '#080C14' }}
          >
            {initials}
          </div>
          <div className="hidden sm:block">
            <p className="text-sm font-medium text-text leading-none">{userName || userEmail}</p>
            <p className="mt-0.5 text-xs leading-none" style={{ color: '#64748B' }}>{userEmail}</p>
          </div>
        </div>

        {/* Sair */}
        <button
          onClick={handleSignOut}
          className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium
            transition-colors hover:bg-card"
          style={{ borderColor: '#1E2D45', color: '#64748B' }}
        >
          <LogOut className="h-3.5 w-3.5" />
          Sair
        </button>
      </div>
    </header>
  )
}
