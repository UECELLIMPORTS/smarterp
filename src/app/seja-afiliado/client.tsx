'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Sparkles, TrendingUp, Wallet, Loader2, CheckCircle2, ArrowRight } from 'lucide-react'
import { signupAffiliatePublic } from '@/actions/affiliates-public'

type PixType = '' | 'cpf' | 'cnpj' | 'email' | 'phone' | 'random'

export function SejaAfiliadoClient() {
  const [step, setStep]               = useState<'form' | 'sent'>('form')
  const [fullName, setFullName]       = useState('')
  const [email, setEmail]             = useState('')
  const [whatsapp, setWhatsapp]       = useState('')
  const [pixKey, setPixKey]           = useState('')
  const [pixKeyType, setPixKeyType]   = useState<PixType>('')
  const [instagram, setInstagram]     = useState('')
  const [accept, setAccept]           = useState(false)
  const [error, setError]             = useState<string | null>(null)
  const [pending, startTransition]    = useTransition()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const res = await signupAffiliatePublic({
        fullName, email, whatsapp,
        pixKey,
        pixKeyType: (pixKeyType || undefined) as Exclude<PixType, ''>,
        instagram,
      })
      if (!res.ok) {
        setError(res.error)
        return
      }
      setStep('sent')
    })
  }

  const ready =
    fullName.trim().length >= 2 &&
    /^\S+@\S+\.\S+$/.test(email) &&
    accept

  if (step === 'sent') {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-10"
        style={{ background: '#0F172A' }}>
        <div className="max-w-md w-full rounded-2xl border p-8 text-center"
          style={{ background: '#131C2A', borderColor: 'rgba(16,185,129,.3)' }}>
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl"
            style={{ background: 'rgba(16,185,129,.15)' }}>
            <CheckCircle2 className="h-8 w-8" style={{ color: '#10B981' }} />
          </div>
          <h1 className="text-xl font-bold mb-2" style={{ color: '#F8FAFC' }}>Quase lá!</h1>
          <p className="text-sm leading-relaxed" style={{ color: '#CBD5E1' }}>
            Mandamos um email pra <strong style={{ color: '#F8FAFC' }}>{email}</strong>.
            Clica no link de confirmação e sua conta de afiliado tá pronta.
          </p>
          <p className="text-xs mt-4" style={{ color: '#94A3B8' }}>
            Não chegou? Olha a caixa de spam.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen px-4 py-10 md:py-16" style={{ background: '#0F172A' }}>
      <div className="max-w-3xl mx-auto">
        {/* Hero */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] uppercase tracking-wider mb-4"
            style={{ background: 'rgba(16,185,129,.1)', border: '1px solid rgba(16,185,129,.3)', color: '#10B981' }}>
            <Sparkles className="h-3 w-3" /> Programa de Afiliados
          </div>
          <h1 className="text-3xl md:text-4xl font-bold mb-3" style={{ color: '#F8FAFC' }}>
            Ganhe <span style={{ color: '#10B981' }}>40% de comissão</span><br />
            indicando o Gestão Smart
          </h1>
          <p className="text-sm md:text-base max-w-xl mx-auto" style={{ color: '#CBD5E1' }}>
            Lojistas, contadores e influencers de varejo: cada cliente que assina pelo seu link
            gera comissão direto na sua conta. Sem burocracia.
          </p>
        </div>

        {/* Benefícios */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-10">
          <Benefit
            icon={Wallet}
            title="40% no primeiro pagamento"
            desc="Comissão alta no momento que mais importa. Pagamento via PIX no início de cada mês."
          />
          <Benefit
            icon={TrendingUp}
            title="Comissão recorrente"
            desc="Continua ganhando todo mês enquanto seu indicado for cliente. Renda passiva."
          />
          <Benefit
            icon={Sparkles}
            title="Cookie de 60 dias"
            desc="Indicou hoje, fechou em 50 dias? Continua sendo sua. Atribuição justa."
          />
        </div>

        {/* Form */}
        <form onSubmit={submit} className="rounded-2xl border p-6 md:p-8 space-y-4"
          style={{ background: '#131C2A', borderColor: 'rgba(255,255,255,.08)' }}>

          <h2 className="text-lg font-semibold mb-2" style={{ color: '#F8FAFC' }}>
            Cadastre-se em 1 minuto
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Nome completo *">
              <input type="text" value={fullName} onChange={e => setFullName(e.target.value)}
                className={inputClass} required />
            </Field>
            <Field label="Email *">
              <input type="email" value={email} onChange={e => setEmail(e.target.value.toLowerCase())}
                className={inputClass} required />
            </Field>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="WhatsApp">
              <input type="tel" value={whatsapp}
                onChange={e => setWhatsapp(e.target.value.replace(/\D/g, ''))}
                placeholder="79999887766" className={inputClass} />
            </Field>
            <Field label="Instagram (opcional)">
              <input type="text" value={instagram}
                onChange={e => setInstagram(e.target.value)}
                placeholder="@seu_perfil" className={inputClass} />
            </Field>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <Field label="Chave PIX (pra receber)">
                <input type="text" value={pixKey} onChange={e => setPixKey(e.target.value)}
                  placeholder="CPF, email, telefone ou aleatória"
                  className={inputClass} />
              </Field>
            </div>
            <Field label="Tipo">
              <select value={pixKeyType} onChange={e => setPixKeyType(e.target.value as PixType)}
                className={inputClass}>
                <option value="">—</option>
                <option value="cpf">CPF</option>
                <option value="cnpj">CNPJ</option>
                <option value="email">Email</option>
                <option value="phone">Telefone</option>
                <option value="random">Aleatória</option>
              </select>
            </Field>
          </div>

          <label className="flex items-start gap-2 text-xs cursor-pointer pt-2"
            style={{ color: '#CBD5E1' }}>
            <input type="checkbox" checked={accept} onChange={e => setAccept(e.target.checked)}
              className="mt-0.5" />
            <span className="leading-relaxed">
              Li e concordo com as <Link href="/termos-afiliado" className="underline"
                style={{ color: '#10B981' }}>regras do programa</Link>:
              comissões só são pagas após 30 dias da venda;
              auto-indicação não conta; pagamento mínimo R$ 30,00.
            </span>
          </label>

          {error && (
            <div className="rounded-md border p-2.5 text-xs"
              style={{ background: 'rgba(239,68,68,.1)', borderColor: 'rgba(239,68,68,.3)', color: '#FCA5A5' }}>
              {error}
            </div>
          )}

          <button type="submit" disabled={!ready || pending}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
            style={{ background: '#10B981' }}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {pending ? 'Enviando...' : 'Quero ser afiliado'}
            {!pending && <ArrowRight className="h-4 w-4" />}
          </button>
        </form>

        <p className="text-center text-xs mt-6" style={{ color: '#94A3B8' }}>
          Já é afiliado?{' '}
          <Link href="/login" className="underline hover:opacity-80" style={{ color: '#CBD5E1' }}>
            Volte pro Gestão Smart
          </Link>
        </p>
      </div>
    </div>
  )
}

const inputClass = 'w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-emerald-500/50'
                   + ' bg-zinc-950/50 border-zinc-700 text-zinc-100'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-wider mb-1 block"
        style={{ color: '#94A3B8' }}>
        {label}
      </label>
      {children}
    </div>
  )
}

function Benefit({ icon: Icon, title, desc }: { icon: typeof Sparkles; title: string; desc: string }) {
  return (
    <div className="rounded-xl border p-4"
      style={{ background: '#131C2A', borderColor: 'rgba(255,255,255,.06)' }}>
      <Icon className="h-5 w-5 mb-2" style={{ color: '#10B981' }} />
      <h3 className="text-sm font-semibold mb-1" style={{ color: '#F8FAFC' }}>{title}</h3>
      <p className="text-xs leading-relaxed" style={{ color: '#94A3B8' }}>{desc}</p>
    </div>
  )
}
