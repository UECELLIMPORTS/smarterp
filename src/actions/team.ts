'use server'

/**
 * Server Actions de gerenciamento de equipe (multi-usuário no tenant).
 *
 * Roles suportadas:
 * - owner: dono do tenant, único que pode gerenciar equipe e assinatura
 * - manager: pode tudo no app exceto /configuracoes/assinatura e /equipe
 *
 * Fluxo de convite:
 * 1. Owner chama inviteMember(email, role='manager')
 * 2. Backend cria row em tenant_invites com token único, manda email
 * 3. Convidado clica no link, vai pra /aceitar-convite/[token]
 * 4. Define senha → backend cria user via admin com app_metadata
 *    apontando pro tenant do owner
 */

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAuth } from '@/lib/supabase/server'
import { getTenantId } from '@/lib/tenant'
import { sendEmail } from '@/lib/email'
import { randomBytes } from 'crypto'

export type TeamRole = 'owner' | 'manager'

export type TeamMember = {
  userId:      string
  email:       string
  fullName:    string | null
  role:        TeamRole
  createdAt:   string
}

export type PendingInvite = {
  id:        string
  email:     string
  role:      TeamRole
  expiresAt: string
  createdAt: string
  inviteUrl: string
}

// ── Helpers ─────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isOwner(user: { app_metadata?: any }): boolean {
  return user.app_metadata?.tenant_role === 'owner'
}

function appOrigin(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? 'https://smarterp-theta.vercel.app'
}

// ── Listar membros ──────────────────────────────────────────────────────────
// Lê todos os users do Supabase Auth que têm tenant_id igual ao do owner.

export async function listTeamMembers(): Promise<TeamMember[]> {
  const { user } = await requireAuth()
  const tenantId = getTenantId(user)
  if (!isOwner(user)) throw new Error('Apenas o dono pode listar a equipe.')

  const admin = createAdminClient()
  // listUsers traz até 50 por página por default. Pra tenant com >50 membros
  // precisaria paginar — não é caso comum por enquanto.
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 100 })
  if (error) throw new Error(error.message)

  return data.users
    .filter(u => u.app_metadata?.tenant_id === tenantId)
    .map(u => ({
      userId:    u.id,
      email:     u.email ?? '',
      fullName:  (u.user_metadata?.full_name as string | undefined) ?? null,
      role:      (u.app_metadata?.tenant_role as TeamRole) ?? 'manager',
      createdAt: u.created_at,
    }))
    .sort((a, b) => {
      // Owner primeiro, depois ordem de criação
      if (a.role === 'owner' && b.role !== 'owner') return -1
      if (b.role === 'owner' && a.role !== 'owner') return 1
      return a.createdAt.localeCompare(b.createdAt)
    })
}

// ── Listar convites pendentes ───────────────────────────────────────────────

export async function listPendingInvites(): Promise<PendingInvite[]> {
  const { supabase, user } = await requireAuth()
  const tenantId = getTenantId(user)
  if (!isOwner(user)) throw new Error('Apenas o dono pode listar convites.')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any
  const { data, error } = await sb
    .from('tenant_invites')
    .select('id, email, role, token, expires_at, created_at')
    .eq('tenant_id', tenantId)
    .is('accepted_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)

  type Row = { id: string; email: string; role: TeamRole; token: string; expires_at: string; created_at: string }
  return ((data ?? []) as Row[]).map(r => ({
    id:        r.id,
    email:     r.email,
    role:      r.role,
    expiresAt: r.expires_at,
    createdAt: r.created_at,
    inviteUrl: `${appOrigin()}/aceitar-convite/${r.token}`,
  }))
}

// ── Criar convite ───────────────────────────────────────────────────────────

export async function inviteMember(input: {
  email: string
  role:  TeamRole
}): Promise<{ ok: true; inviteUrl: string } | { ok: false; error: string }> {
  const { supabase, user } = await requireAuth()
  const tenantId = getTenantId(user)
  if (!isOwner(user)) return { ok: false, error: 'Apenas o dono pode convidar membros.' }

  const email = input.email.trim().toLowerCase()
  if (!/^\S+@\S+\.\S+$/.test(email)) return { ok: false, error: 'E-mail inválido.' }
  if (input.role !== 'manager') return { ok: false, error: 'Role inválida.' }

  // Verifica se o email já é membro
  const admin = createAdminClient()
  const { data: existing } = await admin.auth.admin.listUsers({ page: 1, perPage: 100 })
  const alreadyMember = existing?.users?.find(u =>
    u.email?.toLowerCase() === email && u.app_metadata?.tenant_id === tenantId
  )
  if (alreadyMember) return { ok: false, error: 'Esse email já é membro da equipe.' }

  // Gera token único (32 bytes hex = 64 chars)
  const token = randomBytes(32).toString('hex')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any
  const { error: insertErr } = await sb
    .from('tenant_invites')
    .insert({
      tenant_id:  tenantId,
      email,
      role:       input.role,
      token,
      invited_by: user.id,
    })

  if (insertErr) {
    console.error('[inviteMember] insert falhou:', insertErr)
    return { ok: false, error: 'Erro ao criar convite. Tente novamente.' }
  }

  const inviteUrl = `${appOrigin()}/aceitar-convite/${token}`

  // Email best-effort
  void sendEmail({
    to: email,
    subject: 'Você foi convidado pra equipe da Gestão Inteligente',
    html: `
      <p>Olá!</p>
      <p>Você foi convidado pra fazer parte da equipe no sistema <strong>Gestão Inteligente</strong>
      como <strong>${input.role}</strong>.</p>
      <p>Clique no link abaixo pra criar sua senha e começar a usar:</p>
      <p><a href="${inviteUrl}">${inviteUrl}</a></p>
      <p>Esse convite expira em 7 dias.</p>
    `,
  })

  revalidatePath('/configuracoes/equipe')
  return { ok: true, inviteUrl }
}

// ── Aceitar convite (público — chamado da página /aceitar-convite) ─────────

export async function acceptInvite(input: {
  token:    string
  fullName: string
  password: string
}): Promise<{ ok: true; email: string } | { ok: false; error: string }> {
  const fullName = input.fullName.trim()
  const password = input.password
  const token    = input.token

  if (fullName.length < 2)  return { ok: false, error: 'Informe seu nome completo.' }
  if (password.length < 8)  return { ok: false, error: 'Senha precisa ter pelo menos 8 caracteres.' }
  if (!token || token.length < 16) return { ok: false, error: 'Token inválido.' }

  const admin = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any

  // 1. Busca o convite (precisa ser válido + não aceito + não expirado)
  const { data: invite, error: inviteErr } = await sb
    .from('tenant_invites')
    .select('id, tenant_id, email, role, expires_at, accepted_at')
    .eq('token', token)
    .maybeSingle()

  if (inviteErr || !invite) return { ok: false, error: 'Convite não encontrado ou já utilizado.' }
  if (invite.accepted_at)   return { ok: false, error: 'Esse convite já foi aceito.' }
  if (new Date(invite.expires_at) < new Date()) return { ok: false, error: 'Convite expirado. Peça um novo.' }

  // 2. Cria user no Auth
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email:         invite.email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
    app_metadata:  { tenant_id: invite.tenant_id, tenant_role: invite.role },
  })

  if (createErr || !created?.user) {
    if (createErr?.message?.includes('already')) {
      return { ok: false, error: 'Esse email já tem conta. Faça login com sua senha.' }
    }
    console.error('[acceptInvite] createUser falhou:', createErr)
    return { ok: false, error: 'Erro ao criar conta. Tente novamente.' }
  }

  // 3. Marca invite como aceito
  await sb.from('tenant_invites')
    .update({ accepted_at: new Date().toISOString(), accepted_by: created.user.id })
    .eq('id', invite.id)

  return { ok: true, email: invite.email }
}

// ── Cancelar convite pendente ──────────────────────────────────────────────

export async function cancelInvite(inviteId: string): Promise<void> {
  const { supabase, user } = await requireAuth()
  const tenantId = getTenantId(user)
  if (!isOwner(user)) throw new Error('Apenas o dono pode cancelar convites.')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any
  const { error } = await sb
    .from('tenant_invites')
    .delete()
    .eq('id', inviteId)
    .eq('tenant_id', tenantId)

  if (error) throw new Error(error.message)
  revalidatePath('/configuracoes/equipe')
}

// ── Remover membro do tenant ───────────────────────────────────────────────
// Não deleta o user do Auth — apenas tira o vínculo (zera app_metadata).
// Assim user perde acesso mas histórico fica preservado.

export async function removeMember(targetUserId: string): Promise<void> {
  const { user } = await requireAuth()
  const tenantId = getTenantId(user)
  if (!isOwner(user)) throw new Error('Apenas o dono pode remover membros.')
  if (targetUserId === user.id) throw new Error('Você não pode remover a si mesmo.')

  const admin = createAdminClient()

  // Confirma que o target pertence ao mesmo tenant
  const { data: target } = await admin.auth.admin.getUserById(targetUserId)
  if (!target?.user || target.user.app_metadata?.tenant_id !== tenantId) {
    throw new Error('Usuário não pertence a este tenant.')
  }
  if (target.user.app_metadata?.tenant_role === 'owner') {
    throw new Error('Não é possível remover o dono.')
  }

  // Zera app_metadata pra cortar acesso
  const { error } = await admin.auth.admin.updateUserById(targetUserId, {
    app_metadata: { tenant_id: null, tenant_role: null },
  })
  if (error) throw new Error(error.message)

  revalidatePath('/configuracoes/equipe')
}
