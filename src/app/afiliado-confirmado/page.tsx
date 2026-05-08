import { CheckCircle2, Copy, AlertTriangle } from 'lucide-react'
import Link from 'next/link'
import { ConfirmadoCopyButton } from './client'

export const metadata = { title: 'Afiliado confirmado — Gestão Smart' }

type Props = { searchParams: Promise<{ ref?: string; nome?: string; error?: string }> }

export default async function AfiliadoConfirmadoPage({ searchParams }: Props) {
  const sp = await searchParams
  const error  = sp.error
  const refCode = sp.ref
  const nome    = sp.nome

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.gestaosmarterp.online'
  const link    = refCode ? `${baseUrl.replace('app.', '')}?ref=${refCode}` : ''

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-10"
        style={{ background: '#0F172A' }}>
        <div className="max-w-md w-full rounded-2xl border p-8 text-center"
          style={{ background: '#131C2A', borderColor: 'rgba(239,68,68,.3)' }}>
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl"
            style={{ background: 'rgba(239,68,68,.15)' }}>
            <AlertTriangle className="h-8 w-8" style={{ color: '#EF4444' }} />
          </div>
          <h1 className="text-xl font-bold mb-2" style={{ color: '#F8FAFC' }}>Link inválido</h1>
          <p className="text-sm" style={{ color: '#CBD5E1' }}>{error}</p>
          <Link href="/seja-afiliado"
            className="inline-block mt-5 text-xs underline" style={{ color: '#10B981' }}>
            Tentar de novo
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10"
      style={{ background: '#0F172A' }}>
      <div className="max-w-lg w-full rounded-2xl border p-8 text-center"
        style={{ background: '#131C2A', borderColor: 'rgba(16,185,129,.3)' }}>

        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl"
          style={{ background: 'rgba(16,185,129,.15)' }}>
          <CheckCircle2 className="h-8 w-8" style={{ color: '#10B981' }} />
        </div>

        <h1 className="text-2xl font-bold mb-2" style={{ color: '#F8FAFC' }}>
          {nome ? `Bem-vindo, ${nome}!` : 'Conta confirmada!'}
        </h1>
        <p className="text-sm leading-relaxed mb-6" style={{ color: '#CBD5E1' }}>
          Sua conta de afiliado tá ativa. Use o link abaixo pra divulgar
          o Gestão Smart e começar a ganhar comissão.
        </p>

        {link && (
          <>
            <div className="rounded-lg border p-3 mb-2 text-left"
              style={{ background: '#0F172A', borderColor: 'rgba(255,255,255,.08)' }}>
              <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: '#94A3B8' }}>
                Seu link de divulgação
              </p>
              <code className="text-xs font-mono break-all" style={{ color: '#10B981' }}>
                {link}
              </code>
            </div>
            <ConfirmadoCopyButton link={link} refCode={refCode!} />
          </>
        )}

        <div className="mt-6 pt-6 border-t text-left"
          style={{ borderColor: 'rgba(255,255,255,.08)' }}>
          <p className="text-[10px] uppercase tracking-wider mb-2" style={{ color: '#94A3B8' }}>
            Próximos passos
          </p>
          <ul className="text-xs space-y-1.5" style={{ color: '#CBD5E1' }}>
            <li>✓ Compartilhe o link nas suas redes / WhatsApp / email</li>
            <li>✓ Cada cliente que assinar pelo seu link vira comissão</li>
            <li>✓ 40% no 1º pagamento + comissão recorrente nos meses seguintes</li>
            <li>✓ Pagamento via PIX dia 5 de cada mês (mínimo R$ 30)</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
