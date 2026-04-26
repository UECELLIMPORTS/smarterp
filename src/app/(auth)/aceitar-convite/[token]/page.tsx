import { createAdminClient } from '@/lib/supabase/admin'
import { AceitarConviteClient } from './aceitar-convite-client'
import { Zap, AlertTriangle } from 'lucide-react'
import Link from 'next/link'

export const metadata = { title: 'Aceitar convite — Smart ERP' }

/**
 * Página pública (sem auth) — recebe token do convite e mostra:
 * - Form pra criar conta (nome + senha) se invite válido
 * - Mensagem de erro se token inválido/expirado/aceito
 */
export default async function AceitarConvitePage(props: {
  params: Promise<{ token: string }>
}) {
  const { token } = await props.params
  const admin = createAdminClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any
  const { data: invite } = await sb
    .from('tenant_invites')
    .select('id, tenant_id, email, role, expires_at, accepted_at, tenants(name)')
    .eq('token', token)
    .maybeSingle()

  // Estados de erro
  if (!invite) return <ConviteInvalido reason="Convite não encontrado." />
  if (invite.accepted_at) return <ConviteInvalido reason="Esse convite já foi aceito. Faça login normalmente." />
  if (new Date(invite.expires_at) < new Date()) {
    return <ConviteInvalido reason="Convite expirado. Peça um novo pro dono da conta." />
  }

  return (
    <AceitarConviteClient
      token={token}
      email={invite.email}
      role={invite.role}
      tenantName={invite.tenants?.name ?? 'a equipe'}
    />
  )
}

function ConviteInvalido({ reason }: { reason: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10"
      style={{ background: 'linear-gradient(135deg, #080C14 0%, #0D1320 50%, #080C14 100%)' }}>
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-400/30"
              style={{ background: 'linear-gradient(135deg, rgba(0,229,255,.15), rgba(0,255,148,.15))' }}>
              <Zap className="h-5 w-5" style={{ color: '#00E5FF' }} />
            </div>
            <span className="text-lg font-bold tracking-tight" style={{ color: '#E8F0FE' }}>
              Gestão <span style={{ color: '#00E5FF' }}>Inteligente</span>
            </span>
          </div>
        </div>

        <div className="rounded-2xl border p-7 text-center" style={{ background: '#0D1320', borderColor: '#1E2D45' }}>
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full"
            style={{ background: 'rgba(255,77,109,.1)' }}>
            <AlertTriangle className="h-7 w-7" style={{ color: '#FF5C5C' }} />
          </div>
          <h1 className="text-lg font-bold mb-2" style={{ color: '#E8F0FE' }}>Convite indisponível</h1>
          <p className="text-sm mb-6" style={{ color: '#8AA8C8' }}>{reason}</p>
          <Link href="/login"
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold transition-opacity hover:opacity-90"
            style={{ background: '#00E5FF', color: '#080C14' }}>
            Ir pra Login
          </Link>
        </div>
      </div>
    </div>
  )
}
