/**
 * Página de "Obrigado" pós-pagamento. Cliente cai aqui após assinar
 * (cartão aprovado ou PIX confirmado pelo webhook).
 *
 * Funções:
 * - Celebra a conversão (com gradient + confetti visual)
 * - Confirma plano e próxima cobrança
 * - Lista 3 próximos passos pra começar a usar
 * - CTA único pro Dashboard
 */

import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  CheckCircle2, Sparkles, Package, UserPlus, Megaphone, ArrowRight, Crown,
} from 'lucide-react'
import { requireAuth } from '@/lib/supabase/server'
import { getTenantSubscriptions, getProductSubscription } from '@/lib/subscription'
import { fmtBRL } from '@/lib/pricing'

export const metadata = { title: 'Bem-vindo! — Smart ERP' }

export default async function ObrigadoPage() {
  let auth: Awaited<ReturnType<typeof requireAuth>>
  try { auth = await requireAuth() } catch { redirect('/login') }

  const subs = await getTenantSubscriptions(auth.user)
  const gestaoSub = getProductSubscription(subs, 'gestao_smart')

  const planLabel = gestaoSub?.planName === 'premium' ? 'Premium'
                  : gestaoSub?.planName === 'pro'     ? 'Pro'
                  : 'Básico'

  const isYearly = gestaoSub?.billingCycle === 'YEARLY'
  const nextDueText = gestaoSub?.currentPeriodEnd
    ? `Próxima cobrança em ${gestaoSub.currentPeriodEnd.toLocaleDateString('pt-BR')}`
    : 'Próxima cobrança em 30 dias'

  return (
    <div className="max-w-3xl mx-auto space-y-6 py-6">
      {/* Hero celebratório */}
      <div className="rounded-3xl border-2 p-10 text-center"
        style={{
          background: 'linear-gradient(135deg, rgba(16,185,129,.12) 0%, rgba(168,85,247,.06) 100%)',
          borderColor: 'rgba(16,185,129,.3)',
        }}>
        <div className="mx-auto mb-5 flex h-24 w-24 items-center justify-center rounded-full"
          style={{
            background: 'linear-gradient(135deg, #10B981, #A855F7)',
            boxShadow: '0 12px 48px rgba(16, 185, 129, 0.5)',
          }}>
          <CheckCircle2 className="h-12 w-12" style={{ color: '#1E1B2E' }} strokeWidth={2.5} />
        </div>

        <p className="text-[11px] font-bold uppercase tracking-widest mb-2"
          style={{ color: '#10B981' }}>
          Pagamento confirmado
        </p>
        <h1 className="text-4xl font-bold mb-3" style={{ color: '#F8FAFC' }}>
          Bem-vindo ao plano {planLabel}! 🎉
        </h1>
        <p className="text-base" style={{ color: '#CBD5E1' }}>
          Sua assinatura está ativa e todos os recursos liberados.
        </p>

        {/* Detalhes do plano */}
        {gestaoSub && (
          <div className="mt-6 inline-flex items-center gap-2 rounded-full border px-4 py-2"
            style={{ background: 'rgba(16,185,129,.08)', borderColor: 'rgba(16,185,129,.3)' }}>
            <Crown className="h-4 w-4" style={{ color: '#10B981' }} />
            <span className="text-sm font-bold" style={{ color: '#F8FAFC' }}>
              {planLabel} {isYearly ? 'Anual' : 'Mensal'}
            </span>
            <span className="text-sm font-mono" style={{ color: '#10B981' }}>
              {fmtBRL(gestaoSub.priceCents)}{isYearly ? '/ano' : '/mês'}
            </span>
          </div>
        )}
        <p className="text-[11px] mt-2" style={{ color: '#A78BFA' }}>
          {nextDueText}
        </p>
      </div>

      {/* Próximos passos */}
      <div className="rounded-2xl border p-6"
        style={{ background: '#1E1B2E', borderColor: '#3D3656' }}>
        <p className="text-[11px] font-bold uppercase tracking-widest mb-4"
          style={{ color: '#A855F7' }}>
          <Sparkles className="inline h-3 w-3 mb-0.5" /> Próximos passos pra começar
        </p>

        <div className="space-y-3">
          <NextStep
            num={1} icon={Package}
            title="Cadastre seus produtos"
            desc="Importe ou cadastre o estoque inicial pra começar a vender"
            href="/estoque"
            cta="Ir pro Estoque"
          />
          <NextStep
            num={2} icon={UserPlus}
            title="Cadastre seus clientes"
            desc="Ou deixe o sistema criar automaticamente nas vendas"
            href="/clientes"
            cta="Ir pra Clientes"
          />
          <NextStep
            num={3} icon={Megaphone}
            title="Configure seus canais de venda"
            desc="Loja física, Instagram, WhatsApp, etc. Pra rastrear de onde vêm as vendas"
            href="/canais"
            cta="Ir pra Canais"
          />
        </div>
      </div>

      {/* CTA principal */}
      <div className="text-center pt-2">
        <Link href="/"
          className="inline-flex items-center gap-2 rounded-xl px-8 py-4 text-base font-bold transition-opacity hover:opacity-90"
          style={{
            background: 'linear-gradient(135deg, #A855F7, #10B981)',
            color: '#1E1B2E',
            boxShadow: '0 8px 24px rgba(16, 185, 129, 0.25)',
          }}>
          Começar agora <ArrowRight className="h-5 w-5" />
        </Link>
        <p className="text-[11px] mt-3" style={{ color: '#A78BFA' }}>
          Você pode acessar tudo isso depois pelo menu lateral. Sem pressa! 😊
        </p>
      </div>
    </div>
  )
}

function NextStep({ num, icon: Icon, title, desc, href, cta }: {
  num: number; icon: React.ElementType; title: string; desc: string
  href: string; cta: string
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border p-4"
      style={{ background: '#2A2440', borderColor: '#3D3656' }}>
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
        style={{ background: 'rgba(168,85,247,.12)', color: '#A855F7' }}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold" style={{ color: '#F8FAFC' }}>
          {num}. {title}
        </p>
        <p className="text-[11px] mt-0.5" style={{ color: '#CBD5E1' }}>{desc}</p>
      </div>
      <Link href={href}
        className="shrink-0 rounded-lg px-3 py-2 text-[11px] font-bold transition-opacity hover:opacity-90"
        style={{ background: '#A855F7', color: '#1E1B2E' }}>
        {cta} →
      </Link>
    </div>
  )
}
