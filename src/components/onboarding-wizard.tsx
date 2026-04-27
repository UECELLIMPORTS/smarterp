'use client'

/**
 * Onboarding wizard pra clientes recém-cadastrados.
 *
 * Aparece como banner sticky no topo do dashboard quando o tenant tá vazio
 * (zero produtos, zero clientes manualmente cadastrados além do Consumidor Final).
 *
 * 3 passos:
 * 1. Cadastrar primeiro produto
 * 2. Cadastrar primeiro cliente (ou fazer 1ª venda)
 * 3. Configurar canal de venda
 *
 * Cada passo vira um link clicável pra rota correspondente.
 *
 * O wizard some quando tenant deixa de estar vazio (não precisa flag persistida).
 */

import Link from 'next/link'
import { Sparkles, Package, UserPlus, Megaphone, Check, X } from 'lucide-react'
import { useState } from 'react'

type Props = {
  productCount:  number
  customerCount: number   // sem contar Consumidor Final
  hasChannels:   boolean  // se já configurou canais de venda
}

export function OnboardingWizard({ productCount, customerCount, hasChannels }: Props) {
  const [dismissed, setDismissed] = useState(false)

  const hasProduct  = productCount > 0
  const hasCustomer = customerCount > 0

  const stepsCompleted = [hasProduct, hasCustomer, hasChannels].filter(Boolean).length
  const allDone = stepsCompleted === 3

  // Se já completou tudo OU user dispensou, não mostra
  if (allDone || dismissed) return null

  return (
    <div className="rounded-2xl border-2 p-5 mb-6 relative"
      style={{
        background: 'linear-gradient(135deg, rgba(0,229,255,.06) 0%, rgba(0,255,148,.04) 100%)',
        borderColor: 'rgba(0,229,255,.3)',
      }}>
      <button onClick={() => setDismissed(true)}
        className="absolute top-3 right-3 p-1 rounded hover:bg-white/5"
        style={{ color: '#5A7A9A' }}>
        <X className="h-4 w-4" />
      </button>

      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl"
          style={{ background: 'linear-gradient(135deg, #00E5FF, #00FF94)', color: '#080C14' }}>
          <Sparkles className="h-6 w-6" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-widest mb-1"
            style={{ color: '#00E5FF' }}>
            Bem-vindo! · {stepsCompleted} de 3 passos
          </p>
          <h3 className="text-lg font-bold mb-1" style={{ color: '#E8F0FE' }}>
            Configure sua conta em poucos minutos
          </h3>
          <p className="text-xs mb-4" style={{ color: '#8AA8C8' }}>
            Esses 3 passos liberam tudo que o sistema oferece. Você pode começar agora.
          </p>

          <div className="space-y-2">
            <StepItem
              num={1}
              title="Cadastre seus primeiros produtos"
              desc="Importe ou cadastre o estoque inicial pra começar a vender"
              done={hasProduct}
              link="/estoque"
              cta="Ir pro Estoque"
              icon={Package}
            />
            <StepItem
              num={2}
              title="Cadastre seus clientes"
              desc="Ou deixe o sistema criar automaticamente quando você fizer uma venda"
              done={hasCustomer}
              link="/clientes"
              cta="Ir pra Clientes"
              icon={UserPlus}
            />
            <StepItem
              num={3}
              title="Configure seus canais de venda"
              desc="Defina os canais (Loja física, Instagram, WhatsApp, etc) pra rastrear origem das vendas"
              done={hasChannels}
              link="/canais"
              cta="Ir pra Canais"
              icon={Megaphone}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

function StepItem({
  num, title, desc, done, link, cta, icon: Icon,
}: {
  num: number; title: string; desc: string; done: boolean
  link: string; cta: string; icon: React.ElementType
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border p-3"
      style={{
        background: done ? 'rgba(0,255,148,.06)' : '#0D1320',
        borderColor: done ? 'rgba(0,255,148,.3)' : '#1E2D45',
      }}>
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
        style={done
          ? { background: 'rgba(0,255,148,.15)', color: '#00FF94' }
          : { background: 'rgba(0,229,255,.1)', color: '#00E5FF' }
        }>
        {done ? <Check className="h-5 w-5" /> : <Icon className="h-4 w-4" />}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold" style={{ color: '#E8F0FE' }}>
          {num}. {title}
        </p>
        <p className="text-[11px] mt-0.5" style={{ color: '#8AA8C8' }}>{desc}</p>
      </div>

      {!done && (
        <Link href={link}
          className="shrink-0 rounded-lg px-3 py-2 text-[11px] font-bold transition-opacity hover:opacity-90"
          style={{ background: '#00E5FF', color: '#080C14' }}>
          {cta} →
        </Link>
      )}
    </div>
  )
}
