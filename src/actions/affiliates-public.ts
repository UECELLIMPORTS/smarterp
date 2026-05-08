'use server'

/**
 * Cadastro público de afiliados via /seja-afiliado.
 *
 * Cria afiliado em status='pending_email' com token único, envia email
 * de confirmação. Email de confirmação chama /api/affiliates/confirm/[token]
 * que ativa a conta.
 *
 * Não pede auth — endpoint público propositalmente.
 */

import { randomBytes } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail } from '@/lib/email'

export type SignupAffiliateInput = {
  fullName:    string
  email:       string
  whatsapp?:   string
  pixKey?:     string
  pixKeyType?: 'cpf' | 'cnpj' | 'email' | 'phone' | 'random'
  instagram?:  string
}

export type SignupAffiliateResult =
  | { ok: true;  email: string }
  | { ok: false; error: string }

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL
      || process.env.APP_URL
      || 'https://app.gestaosmarterp.online'
}

export async function signupAffiliatePublic(input: SignupAffiliateInput): Promise<SignupAffiliateResult> {
  const fullName = input.fullName.trim()
  const email    = input.email.trim().toLowerCase()
  const whats    = input.whatsapp ? input.whatsapp.replace(/\D/g, '') : ''

  if (fullName.length < 2)            return { ok: false, error: 'Informe seu nome completo.' }
  if (!/^\S+@\S+\.\S+$/.test(email))  return { ok: false, error: 'Email inválido.' }
  if (whats && whats.length < 10)     return { ok: false, error: 'WhatsApp inválido.' }

  const admin = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any

  // Email duplicado? Bloqueia
  const { data: dup } = await sb.from('affiliates').select('id, status, email_confirmed_at').eq('email', email).maybeSingle()
  if (dup) {
    if (!dup.email_confirmed_at) {
      // Reenvia email se ainda não confirmou — não cria nova row
      return await regenerateAndResend(sb, dup.id, fullName, email)
    }
    return { ok: false, error: 'Esse email já está cadastrado como afiliado. Tente fazer login.' }
  }

  // Gera ref_code via RPC e token de confirmação
  const { data: refCode, error: rpcErr } = await sb.rpc('generate_ref_code')
  if (rpcErr || !refCode) return { ok: false, error: 'Erro ao gerar código. Tenta de novo.' }

  const token = randomBytes(32).toString('hex')

  const { error: insErr } = await sb.from('affiliates').insert({
    full_name:           fullName,
    email,
    whatsapp:            whats || null,
    pix_key:             input.pixKey?.trim() || null,
    pix_key_type:        input.pixKeyType ?? null,
    instagram:           input.instagram?.trim() || null,
    ref_code:            refCode,
    source:              'public',
    status:              'pending_email',
    email_confirm_token: token,
  })

  if (insErr) {
    if (insErr.code === '23505') return { ok: false, error: 'Email já em uso.' }
    return { ok: false, error: insErr.message }
  }

  // Envia email de confirmação (não bloqueia se falhar)
  await sendConfirmEmail(email, fullName, token, refCode as string)

  return { ok: true, email }
}

async function regenerateAndResend(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any, affiliateId: string, fullName: string, email: string,
): Promise<SignupAffiliateResult> {
  const token = randomBytes(32).toString('hex')
  const { data: aff, error } = await sb.from('affiliates')
    .update({ email_confirm_token: token })
    .eq('id', affiliateId)
    .select('ref_code')
    .single()
  if (error || !aff) return { ok: false, error: 'Erro ao reenviar confirmação.' }

  await sendConfirmEmail(email, fullName, token, aff.ref_code as string)
  return { ok: true, email }
}

async function sendConfirmEmail(to: string, fullName: string, token: string, refCode: string): Promise<void> {
  const link = `${appUrl()}/api/affiliates/confirm/${token}`
  const html = `
    <div style="font-family: -apple-system, sans-serif; max-width: 560px; margin: 0 auto; color: #1a1a1a;">
      <h1 style="font-size: 22px; color: #10B981; margin-bottom: 16px;">
        Olá, ${fullName.split(' ')[0]}! 👋
      </h1>
      <p style="font-size: 15px; line-height: 1.6;">
        Recebemos sua inscrição no programa de afiliados do <strong>Gestão Smart</strong>.
        Pra ativar sua conta, é só clicar no botão abaixo:
      </p>
      <p style="margin: 24px 0;">
        <a href="${link}"
           style="display: inline-block; background: #10B981; color: white;
                  padding: 12px 28px; border-radius: 8px; text-decoration: none;
                  font-weight: 600; font-size: 14px;">
          Confirmar minha conta
        </a>
      </p>
      <p style="font-size: 14px; line-height: 1.6; color: #555;">
        Depois de confirmar, seu link de divulgação único será:<br>
        <code style="background: #f4f4f4; padding: 4px 8px; border-radius: 4px; font-size: 13px;">
          ${appUrl().replace('app.', '')}?ref=${refCode}
        </code>
      </p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0;">
      <p style="font-size: 12px; color: #888;">
        Este link expira em 7 dias. Se não foi você quem se inscreveu, pode ignorar este email.
      </p>
    </div>
  `
  await sendEmail({
    to,
    subject: 'Confirme sua conta de afiliado — Gestão Smart',
    html,
  })
}

// ──────────────────────────────────────────────────────────────────────────
// Confirma email via token — chamado pelo route handler
// ──────────────────────────────────────────────────────────────────────────

export type ConfirmResult =
  | { ok: true;  refCode: string; fullName: string }
  | { ok: false; error: string }

export async function confirmAffiliateEmail(token: string): Promise<ConfirmResult> {
  if (!token || token.length < 32) return { ok: false, error: 'Token inválido.' }

  const admin = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any

  const { data: aff } = await sb.from('affiliates')
    .select('id, full_name, ref_code, status, email_confirmed_at')
    .eq('email_confirm_token', token)
    .maybeSingle()

  if (!aff)                              return { ok: false, error: 'Token não encontrado ou já usado.' }
  if (aff.email_confirmed_at)            return { ok: true, refCode: aff.ref_code, fullName: aff.full_name }

  const { error } = await sb.from('affiliates')
    .update({
      status:               'active',
      email_confirmed_at:   new Date().toISOString(),
      email_confirm_token:  null,
    })
    .eq('id', aff.id)

  if (error) return { ok: false, error: error.message }

  return { ok: true, refCode: aff.ref_code, fullName: aff.full_name }
}
