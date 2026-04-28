'use server'

/**
 * Server Actions de Comprovante de Venda.
 *
 * - getOrCreateShareToken: gera/recupera token público pra link wa.me
 * - sendComprovanteEmail: monta PDF e envia via Resend com anexo
 * - getCustomerContact: busca email/whatsapp do cliente da venda (pré-preenche modal)
 */

import crypto from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { requireAuth } from '@/lib/supabase/server'
import { getTenantId } from '@/lib/tenant'
import { createAdminClient } from '@/lib/supabase/admin'
import { getComprovanteData } from '@/lib/comprovante-data'
import { renderComprovantePdf } from '@/lib/comprovante-pdf'
import { sendEmailWithAttachment, htmlShell, escapeHtml } from '@/lib/email'

type Result<T = void> = { ok: true; data?: T } | { ok: false; error: string }

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL
      || process.env.APP_URL
      || 'https://app.gestaosmarterp.online'
}

// ──────────────────────────────────────────────────────────────────────────
// Pré-preenche modal: pega contato do cliente da venda
// ──────────────────────────────────────────────────────────────────────────

export async function getSaleContact(saleId: string): Promise<Result<{
  customerName: string
  email:        string | null
  whatsapp:     string | null
}>> {
  const { user } = await requireAuth()
  const tenantId = getTenantId(user)

  const admin = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any

  const { data } = await sb
    .from('sales')
    .select('id, customers ( full_name, email, whatsapp )')
    .eq('id', saleId)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (!data) return { ok: false, error: 'Venda não encontrada.' }

  const c = data.customers as { full_name: string; email: string | null; whatsapp: string | null } | null
  return {
    ok: true,
    data: {
      customerName: c?.full_name || 'Consumidor Final',
      email:        c?.email      ?? null,
      whatsapp:     c?.whatsapp   ?? null,
    },
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Token compartilhável (pra WhatsApp wa.me)
// ──────────────────────────────────────────────────────────────────────────

export async function getOrCreateShareToken(saleId: string): Promise<Result<{ url: string }>> {
  const { user } = await requireAuth()
  const tenantId = getTenantId(user)

  const admin = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any

  const { data: sale } = await sb
    .from('sales')
    .select('id')
    .eq('id', saleId)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (!sale) return { ok: false, error: 'Venda não encontrada.' }

  // Reutiliza token existente que ainda não expirou
  const nowIso = new Date().toISOString()
  const { data: existing } = await sb
    .from('sale_share_tokens')
    .select('token, expires_at')
    .eq('sale_id', saleId)
    .gt('expires_at', nowIso)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existing?.token) {
    return { ok: true, data: { url: `${appUrl()}/api/comprovante-publico/${existing.token}` } }
  }

  const token = crypto.randomBytes(24).toString('base64url')
  const { error } = await sb.from('sale_share_tokens').insert({
    token,
    sale_id:   saleId,
    tenant_id: tenantId,
  })
  if (error) return { ok: false, error: error.message }

  return { ok: true, data: { url: `${appUrl()}/api/comprovante-publico/${token}` } }
}

// ──────────────────────────────────────────────────────────────────────────
// Envio por email
// ──────────────────────────────────────────────────────────────────────────

export async function sendComprovanteEmail(input: {
  saleId:      string
  toEmail:     string
  observation?: string
}): Promise<Result> {
  const { user } = await requireAuth()
  const tenantId = getTenantId(user)

  const email = input.toEmail.trim()
  if (!email || !/.+@.+\..+/.test(email)) {
    return { ok: false, error: 'E-mail inválido.' }
  }

  const data = await getComprovanteData(tenantId, input.saleId, input.observation)
  if (!data) return { ok: false, error: 'Venda não encontrada.' }

  const pdfBuffer = await renderComprovantePdf(data)
  const filename = `comprovante-${data.saleNumber}.pdf`

  const greeting = data.customer.name && data.customer.name !== 'Consumidor Final'
    ? `Olá ${escapeHtml(data.customer.name.split(' ')[0])},`
    : 'Olá!'

  const html = htmlShell({
    title: `Comprovante de Compra · ${data.saleNumber}`,
    body: `
      <p>${greeting}</p>
      <p>Segue em anexo o <strong>comprovante</strong> da sua compra na
      <strong>${escapeHtml(data.tenant.name)}</strong>, junto com o
      <strong>termo de garantia</strong> dos produtos.</p>
      ${input.observation ? `<p style="margin-top: 16px; padding: 12px; background: #FEF9C3; border-left: 3px solid #EAB308;">
        <strong>Observação:</strong><br>${escapeHtml(input.observation)}
      </p>` : ''}
      <p style="margin-top: 24px;">Em caso de dúvidas sobre garantia, basta responder este e-mail
      ou entrar em contato com a loja.</p>
      <p style="color: #64748B; font-size: 13px;">Total da compra: <strong>${
        (data.totalCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
      }</strong></p>
    `,
  })

  const result = await sendEmailWithAttachment({
    to:      email,
    subject: `Comprovante de Compra · ${data.saleNumber}`,
    html,
    attachments: [{ filename, content: pdfBuffer }],
  })

  if (!result.ok) return { ok: false, error: result.error || 'Falha ao enviar e-mail.' }
  return { ok: true }
}

// ──────────────────────────────────────────────────────────────────────────
// Configuração de Branding (logo + termo + garantia padrão)
// ──────────────────────────────────────────────────────────────────────────

export type BrandingSettings = {
  logoUrl:           string | null
  warrantyDays:      number
  warrantyTerms:     string | null
}

export async function getBrandingSettings(): Promise<BrandingSettings> {
  const { user } = await requireAuth()
  const tenantId = getTenantId(user)

  const admin = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any

  const { data } = await sb
    .from('tenants')
    .select('logo_url, warranty_days, warranty_terms')
    .eq('id', tenantId)
    .maybeSingle()

  return {
    logoUrl:       data?.logo_url ?? null,
    warrantyDays:  data?.warranty_days ?? 90,
    warrantyTerms: data?.warranty_terms ?? null,
  }
}

export async function saveBrandingSettings(input: {
  warrantyDays:  number
  warrantyTerms: string | null
}): Promise<Result> {
  const { user } = await requireAuth()
  const tenantId = getTenantId(user)

  if (!Number.isFinite(input.warrantyDays) || input.warrantyDays < 0 || input.warrantyDays > 3650) {
    return { ok: false, error: 'Garantia padrão deve ser entre 0 e 3650 dias.' }
  }

  const admin = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any

  const { error } = await sb
    .from('tenants')
    .update({
      warranty_days:   Math.round(input.warrantyDays),
      warranty_terms:  input.warrantyTerms?.trim() || null,
    })
    .eq('id', tenantId)

  if (error) return { ok: false, error: error.message }
  revalidatePath('/configuracoes')
  return { ok: true }
}

export async function uploadTenantLogo(formData: FormData): Promise<Result<{ url: string }>> {
  const { user } = await requireAuth()
  const tenantId = getTenantId(user)

  const file = formData.get('file') as File | null
  if (!file) return { ok: false, error: 'Arquivo não enviado.' }
  if (file.size > 2 * 1024 * 1024) return { ok: false, error: 'Logo até 2MB.' }
  if (!file.type.startsWith('image/')) return { ok: false, error: 'Arquivo deve ser uma imagem.' }

  const ext = (file.name.split('.').pop() || 'png').toLowerCase().slice(0, 5)
  const path = `${tenantId}/logo-${Date.now()}.${ext}`

  const admin = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any

  const buffer = Buffer.from(await file.arrayBuffer())
  const { error: uploadErr } = await sb.storage
    .from('tenant-logos')
    .upload(path, buffer, { contentType: file.type, upsert: false })

  if (uploadErr) return { ok: false, error: `Upload: ${uploadErr.message}` }

  const { data: urlData } = sb.storage.from('tenant-logos').getPublicUrl(path)
  const publicUrl = urlData?.publicUrl as string | undefined
  if (!publicUrl) return { ok: false, error: 'URL pública não disponível.' }

  const { error: updateErr } = await sb
    .from('tenants')
    .update({ logo_url: publicUrl })
    .eq('id', tenantId)
  if (updateErr) return { ok: false, error: updateErr.message }

  revalidatePath('/configuracoes')
  return { ok: true, data: { url: publicUrl } }
}

export async function removeTenantLogo(): Promise<Result> {
  const { user } = await requireAuth()
  const tenantId = getTenantId(user)

  const admin = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any

  const { error } = await sb
    .from('tenants')
    .update({ logo_url: null })
    .eq('id', tenantId)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/configuracoes')
  return { ok: true }
}
