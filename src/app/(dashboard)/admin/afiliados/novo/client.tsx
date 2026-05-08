'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Save, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { createAffiliateManual } from '@/actions/affiliates-admin'

type PixType = '' | 'cpf' | 'cnpj' | 'email' | 'phone' | 'random'

export function NovoAfiliadoClient() {
  const router = useRouter()
  const [fullName, setFullName]       = useState('')
  const [email, setEmail]             = useState('')
  const [whatsapp, setWhatsapp]       = useState('')
  const [cpfCnpj, setCpfCnpj]         = useState('')
  const [pixKey, setPixKey]           = useState('')
  const [pixKeyType, setPixKeyType]   = useState<PixType>('')
  const [instagram, setInstagram]     = useState('')
  const [refCode, setRefCode]         = useState('')   // se vazio, server gera
  const [notes, setNotes]             = useState('')

  const [pending, startTransition] = useTransition()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      const res = await createAffiliateManual({
        fullName, email, whatsapp, cpfCnpj, pixKey,
        pixKeyType: (pixKeyType || undefined) as Exclude<PixType, ''>,
        instagram, refCode, notes,
      })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      if (!res.data) return
      toast.success(`Afiliado criado! Código: ${res.data.refCode}`)
      router.push(`/admin/afiliados/${res.data.id}`)
    })
  }

  const ready = fullName.trim().length >= 2 && /^\S+@\S+\.\S+$/.test(email.trim())

  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl border p-5"
      style={{ background: '#131C2A', borderColor: 'rgba(255,255,255,.06)' }}>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Nome completo *" required>
          <input
            type="text" value={fullName}
            onChange={e => setFullName(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Email *" required>
          <input
            type="email" value={email}
            onChange={e => setEmail(e.target.value.toLowerCase())}
            className={inputClass}
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="WhatsApp">
          <input
            type="tel" value={whatsapp}
            onChange={e => setWhatsapp(e.target.value.replace(/\D/g, ''))}
            placeholder="79999887766"
            className={inputClass}
          />
        </Field>
        <Field label="CPF/CNPJ">
          <input
            type="text" value={cpfCnpj}
            onChange={e => setCpfCnpj(e.target.value)}
            placeholder="Opcional — usado pra anti-fraude"
            className={inputClass}
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Chave PIX">
          <input
            type="text" value={pixKey}
            onChange={e => setPixKey(e.target.value)}
            placeholder="CPF, email, telefone ou aleatória"
            className={inputClass}
          />
        </Field>
        <Field label="Tipo da chave">
          <select
            value={pixKeyType}
            onChange={e => setPixKeyType(e.target.value as PixType)}
            className={inputClass}
          >
            <option value="">—</option>
            <option value="cpf">CPF</option>
            <option value="cnpj">CNPJ</option>
            <option value="email">Email</option>
            <option value="phone">Telefone</option>
            <option value="random">Aleatória</option>
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Instagram">
          <input
            type="text" value={instagram}
            onChange={e => setInstagram(e.target.value)}
            placeholder="@usuario"
            className={inputClass}
          />
        </Field>
        <Field label="Código (deixe vazio pra gerar)">
          <input
            type="text" value={refCode}
            onChange={e => setRefCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12))}
            placeholder="Ex: MARIA20"
            className={inputClass + ' font-mono uppercase'}
          />
        </Field>
      </div>

      <Field label="Notas internas">
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={2}
          placeholder="Anotação só pra você (canal, contato, observações)"
          className={inputClass + ' resize-none'}
        />
      </Field>

      <div className="rounded-md border p-2.5 text-[11px] leading-relaxed"
        style={{ background: 'rgba(16,185,129,.05)', borderColor: 'rgba(16,185,129,.2)', color: '#86EFAC' }}>
        <p>✓ Afiliado criado manual já fica <strong>ativo</strong> (sem confirmação por email)</p>
        <p>✓ Comissão padrão: 40% inicial + 10% recorrente nos primeiros 12 meses</p>
        <p>✓ Cookie de atribuição: 60 dias · Pagamento mínimo: R$ 30,00</p>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={() => router.push('/admin/afiliados')}
          className="px-3 py-2 text-xs hover:opacity-80"
          style={{ color: '#94A3B8' }}
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={!ready || pending}
          className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ background: '#10B981' }}
        >
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Criar afiliado
        </button>
      </div>
    </form>
  )
}

const inputClass = 'w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-emerald-500/50'
                   + ' bg-zinc-950 border-zinc-700 text-zinc-100'

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-wider mb-1 block"
        style={{ color: required ? '#10B981' : '#94A3B8' }}>
        {label}
      </label>
      {children}
    </div>
  )
}
