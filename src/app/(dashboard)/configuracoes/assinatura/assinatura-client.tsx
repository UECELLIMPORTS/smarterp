'use client'

import Link from 'next/link'
import {
  Store, Users, TrendingUp, Wrench, Sparkles, ArrowLeft,
  Check, Plus, MessageCircle, AlertTriangle,
} from 'lucide-react'
import type { Subscription } from '@/lib/subscription'

const BRL = (cents: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100)

const DT = (date: Date | null) => {
  if (!date) return '—'
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
}

/** Link WhatsApp pra acionar mudança de plano (placeholder até Asaas integrar). */
function whatsappLink(message: string): string {
  return `https://wa.me/5579999998876?text=${encodeURIComponent(message)}`
}

type Data = {
  gestaoSmart: Subscription | null
  checkSmart:  Subscription | null
  crm:         Subscription | null
  metaAds:     Subscription | null
  trialDays:   number | null
  userEmail:   string
}

export function AssinaturaClient({ data }: { data: Data }) {
  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div>
        <Link href="/configuracoes" className="inline-flex items-center gap-1.5 text-xs hover:underline mb-2"
          style={{ color: '#5A7A9A' }}>
          <ArrowLeft className="h-3.5 w-3.5" /> Voltar pra Configurações
        </Link>
        <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: '#E8F0FE' }}>
          <Sparkles className="h-5 w-5" style={{ color: '#FFB800' }} />
          Minha Assinatura
        </h1>
        <p className="mt-1 text-sm" style={{ color: '#5A7A9A' }}>
          Gerencie os produtos contratados, mude de plano ou cancele.
        </p>
      </div>

      {/* Aviso: pagamento online não disponível */}
      <div className="rounded-xl border p-4 flex items-start gap-3"
        style={{ background: 'rgba(0,229,255,.04)', borderColor: 'rgba(0,229,255,.3)' }}>
        <MessageCircle className="h-5 w-5 mt-0.5 shrink-0" style={{ color: '#00E5FF' }} />
        <div className="text-sm" style={{ color: '#E8F0FE' }}>
          <p className="font-bold" style={{ color: '#00E5FF' }}>Pagamento online em breve</p>
          <p className="text-xs mt-1" style={{ color: '#8AA8C8' }}>
            Por enquanto, mudanças de plano são feitas via WhatsApp. Em até 1 hora útil você recebe
            o link de pagamento (PIX ou cartão).
          </p>
        </div>
      </div>

      {/* Banner de trial expirando, se for o caso */}
      {data.trialDays !== null && data.trialDays <= 3 && (
        <div className="rounded-xl border p-4 flex items-start gap-3"
          style={{ background: 'rgba(255,77,109,.06)', borderColor: 'rgba(255,77,109,.3)' }}>
          <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0" style={{ color: '#FF4D6D' }} />
          <div className="text-sm" style={{ color: '#E8F0FE' }}>
            <p className="font-bold" style={{ color: '#FF4D6D' }}>
              {data.trialDays === 0 ? 'Seu trial expira hoje!' : `Faltam ${data.trialDays} dias do seu trial`}
            </p>
            <p className="text-xs mt-1" style={{ color: '#8AA8C8' }}>
              Assine agora pra não perder acesso aos seus dados.
            </p>
          </div>
        </div>
      )}

      {/* Cards dos produtos */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ProductCard
          name="Gestão Smart"
          description="ERP completo: vendas, estoque, financeiro, dashboards"
          icon={Store}
          color="#00E5FF"
          sub={data.gestaoSmart}
          plansAvailable={['basico', 'pro', 'premium']}
          userEmail={data.userEmail}
        />
        <ProductCard
          name="CRM"
          description="Pipeline + inbox WhatsApp/Instagram unificado"
          icon={Users}
          color="#00FF94"
          sub={data.crm}
          plansAvailable={['premium']}   // por enquanto só "premium" como label
          userEmail={data.userEmail}
          comingSoon
        />
        <ProductCard
          name="Meta Ads"
          description="ROAS e CAC integrados ao seu ERP"
          icon={TrendingUp}
          color="#E4405F"
          sub={data.metaAds}
          plansAvailable={['premium']}
          userEmail={data.userEmail}
          note="Incluso no plano Premium do Gestão Smart"
        />
        <ProductCard
          name="CheckSmart"
          description="OS de assistência técnica com escudo jurídico"
          icon={Wrench}
          color="#FFB800"
          sub={data.checkSmart}
          plansAvailable={['plano_unico']}
          userEmail={data.userEmail}
        />
      </div>
    </div>
  )
}

// ── Card de produto ─────────────────────────────────────────────────────────

function ProductCard({
  name, description, icon: Icon, color, sub, plansAvailable, userEmail, comingSoon, note,
}: {
  name:           string
  description:    string
  icon:           React.ElementType
  color:          string
  sub:            Subscription | null
  plansAvailable: string[]
  userEmail:      string
  comingSoon?:    boolean
  note?:          string
}) {
  const isActive = !!sub && (sub.status === 'active' || sub.status === 'trial')
  const isTrial  = sub?.status === 'trial'

  // Mensagens pré-preenchidas
  const msgChange = `Olá! Quero mudar meu plano do ${name}. Conta: ${userEmail}`
  const msgCancel = `Olá! Quero cancelar meu plano do ${name}. Conta: ${userEmail}`
  const msgAdd    = `Olá! Quero contratar o ${name}. Conta: ${userEmail}`

  return (
    <article className="rounded-2xl border p-6"
      style={{ background: '#0D1320', borderColor: isActive ? `${color}40` : '#1E2D45' }}>
      {/* Header */}
      <div className="flex items-start gap-3 mb-4">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl shrink-0 border"
          style={{ background: `${color}15`, borderColor: `${color}40` }}>
          <Icon className="h-5 w-5" style={{ color }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-lg font-bold" style={{ color: '#E8F0FE' }}>{name}</h3>
            {isActive && (
              <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded"
                style={{ background: `${color}18`, color }}>
                {isTrial ? 'TRIAL' : 'ATIVO'}
              </span>
            )}
          </div>
          <p className="text-xs mt-1" style={{ color: '#8AA8C8' }}>{description}</p>
        </div>
      </div>

      {/* Estado: contratado vs não contratado */}
      {isActive && sub ? (
        <>
          <div className="rounded-lg border p-3 mb-4 space-y-1.5"
            style={{ background: '#0F1A2B', borderColor: '#1E2D45' }}>
            <Row label="Plano">
              <span className="font-bold capitalize" style={{ color: '#E8F0FE' }}>{sub.planName}</span>
            </Row>
            <Row label="Valor mensal">
              <span className="font-mono font-bold" style={{ color }}>{BRL(sub.priceCents)}</span>
            </Row>
            {isTrial && sub.trialEndsAt && (
              <Row label="Trial até">
                <span className="font-mono" style={{ color: '#FFAA00' }}>{DT(sub.trialEndsAt)}</span>
              </Row>
            )}
            {!isTrial && sub.currentPeriodEnd && (
              <Row label="Próxima cobrança">
                <span className="font-mono" style={{ color: '#E8F0FE' }}>{DT(sub.currentPeriodEnd)}</span>
              </Row>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <a href={whatsappLink(msgChange)} target="_blank" rel="noopener noreferrer"
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg py-2.5 text-xs font-bold transition-opacity hover:opacity-90"
              style={{ background: '#00E5FF', color: '#080C14' }}>
              {isTrial ? 'Assinar agora' : 'Mudar plano'}
            </a>
            {!isTrial && (
              <a href={whatsappLink(msgCancel)} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-1 rounded-lg border px-4 py-2.5 text-xs font-semibold transition-colors hover:bg-white/5"
                style={{ borderColor: '#1E2D45', color: '#8AA8C8' }}>
                Cancelar
              </a>
            )}
          </div>
        </>
      ) : (
        <>
          <p className="text-xs mb-4" style={{ color: '#5A7A9A' }}>
            {comingSoon
              ? '🚧 Em desenvolvimento — falaremos com você quando estiver disponível'
              : note
                ? note
                : 'Você ainda não contratou esse produto.'}
          </p>
          <a
            href={whatsappLink(msgAdd)}
            target="_blank" rel="noopener noreferrer"
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg py-2.5 text-xs font-bold transition-opacity hover:opacity-90"
            style={comingSoon
              ? { background: '#1E2D45', color: '#8AA8C8' }
              : { background: 'linear-gradient(135deg, #00E5FF, #00FF94)', color: '#080C14' }
            }
          >
            <Plus className="h-3.5 w-3.5" />
            {comingSoon ? 'Avise-me quando lançar' : `Contratar ${name}`}
          </a>
        </>
      )}

      {/* Lista de planos disponíveis (info) */}
      {!comingSoon && plansAvailable.length > 1 && (
        <div className="mt-4 pt-4 border-t" style={{ borderColor: '#1E2D45' }}>
          <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: '#5A7A9A' }}>
            Planos disponíveis
          </p>
          <div className="flex gap-2 flex-wrap">
            {plansAvailable.map(plan => (
              <span key={plan} className="text-[10px] font-bold uppercase px-2 py-0.5 rounded"
                style={sub?.planName === plan
                  ? { background: `${color}18`, color }
                  : { background: '#0F1A2B', color: '#5A7A9A' }
                }>
                <Check className="h-3 w-3 inline mr-1" />
                {plan}
              </span>
            ))}
          </div>
        </div>
      )}
    </article>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span style={{ color: '#8AA8C8' }}>{label}</span>
      {children}
    </div>
  )
}
