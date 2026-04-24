'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Key, ExternalLink, CheckCircle2, XCircle, Loader2, Trash2, ArrowLeft,
  AlertTriangle, BookOpen,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  saveMetaAdsCredentials,
  testMetaAdsConnection,
  deleteMetaAdsCredentials,
  type MetaAdsCredentialsSafe,
} from '@/actions/meta-ads'

type Props = { current: MetaAdsCredentialsSafe | null }

export function ConfiguracoesClient({ current }: Props) {
  const router = useRouter()
  const [form, setForm] = useState({
    appId:       current?.appId ?? '',
    appSecret:   '',  // nunca pré-populado (segurança)
    accessToken: '',  // nunca pré-populado
    adAccountId: current?.adAccountId ?? '',
    businessId:  current?.businessId ?? '',
  })
  const [saving, setSaving]     = useState(false)
  const [testing, setTesting]   = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)

  async function handleSave() {
    if (!form.appId || !form.appSecret || !form.accessToken || !form.adAccountId) {
      toast.error('Preencha todos os campos obrigatórios')
      return
    }
    setSaving(true)
    try {
      await saveMetaAdsCredentials(form)
      toast.success('Credenciais salvas!')
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  async function handleTest() {
    setTesting(true)
    setTestResult(null)
    try {
      const result = await testMetaAdsConnection()
      setTestResult(result)
      if (result.ok) toast.success('Conexão OK!')
      else           toast.error('Falha na conexão')
    } catch (err) {
      setTestResult({ ok: false, message: err instanceof Error ? err.message : 'Erro' })
    } finally {
      setTesting(false)
    }
  }

  async function handleDelete() {
    if (!confirm('Remover as credenciais do Meta Ads? O dashboard vai parar de funcionar até você configurar de novo.')) return
    try {
      await deleteMetaAdsCredentials()
      toast.success('Credenciais removidas')
      setForm({ appId: '', appSecret: '', accessToken: '', adAccountId: '', businessId: '' })
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro')
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-start justify-between">
        <div>
          <Link href="/meta-ads" className="mb-2 inline-flex items-center gap-1 text-xs" style={{ color: '#5A7A9A' }}>
            <ArrowLeft className="h-3 w-3" /> Voltar ao Dashboard
          </Link>
          <h1 className="text-2xl font-bold" style={{ color: '#E8F0FE' }}>Configurações do Meta Ads</h1>
          <p className="mt-1 text-sm" style={{ color: '#5A7A9A' }}>
            Cole as credenciais da sua conta Meta Business para ativar o dashboard
          </p>
        </div>
      </div>

      {/* Status atual */}
      {current && (
        <div
          className="rounded-xl border p-4"
          style={{
            background: current.lastError ? 'rgba(255,77,109,.08)' : 'rgba(0,255,148,.06)',
            borderColor: current.lastError ? 'rgba(255,77,109,.3)' : 'rgba(0,255,148,.3)',
          }}
        >
          <div className="flex items-start gap-3">
            {current.lastError
              ? <XCircle className="h-4 w-4 mt-0.5 shrink-0" style={{ color: '#FF4D6D' }} />
              : <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" style={{ color: '#00FF94' }} />
            }
            <div className="flex-1">
              <p className="text-sm font-semibold" style={{ color: '#E8F0FE' }}>
                {current.lastError ? 'Erro na última sincronização' : 'Credenciais configuradas'}
              </p>
              <p className="mt-1 text-xs" style={{ color: '#8AA8C8' }}>
                Conta: <span className="font-mono">{current.adAccountId}</span>
                {current.lastSyncAt && <> · Última sync: {new Date(current.lastSyncAt).toLocaleString('pt-BR')}</>}
              </p>
              {current.lastError && (
                <p className="mt-2 text-xs font-mono" style={{ color: '#FF4D6D' }}>{current.lastError}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Guia */}
      <div
        className="rounded-xl border p-5"
        style={{ background: 'rgba(0,229,255,.04)', borderColor: 'rgba(0,229,255,.25)' }}
      >
        <div className="flex items-start gap-3 mb-3">
          <BookOpen className="h-5 w-5 mt-0.5 shrink-0" style={{ color: '#00E5FF' }} />
          <div>
            <h2 className="text-sm font-semibold" style={{ color: '#E8F0FE' }}>Como pegar cada credencial</h2>
            <p className="text-xs" style={{ color: '#8AA8C8' }}>Siga a ordem — ~15 minutos no total</p>
          </div>
        </div>
        <ol className="space-y-2 text-xs pl-8 list-decimal" style={{ color: '#8AA8C8' }}>
          <li>
            <strong className="text-text">App ID e App Secret</strong>: crie um app em{' '}
            <a href="https://developers.facebook.com/apps/" target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 underline" style={{ color: '#00E5FF' }}>
              developers.facebook.com/apps <ExternalLink className="h-2.5 w-2.5" />
            </a>
            {' '}→ tipo <em>Business</em> → adicione o produto <em>Marketing API</em>. Dashboard do app mostra o ID e o Secret.
          </li>
          <li>
            <strong className="text-text">Access Token</strong>: no{' '}
            <a href="https://business.facebook.com/settings/" target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 underline" style={{ color: '#00E5FF' }}>
              Business Settings <ExternalLink className="h-2.5 w-2.5" />
            </a>
            {' '}→ Users → <em>System Users</em> → gerar token com permissões <code className="px-1 rounded" style={{ background: '#1E2D45', color: '#00E5FF' }}>ads_read</code> e <code className="px-1 rounded" style={{ background: '#1E2D45', color: '#00E5FF' }}>ads_management</code>.
            Token de System User não expira — mais estável que token de usuário.
          </li>
          <li>
            <strong className="text-text">Ad Account ID</strong>: abra o{' '}
            <a href="https://business.facebook.com/adsmanager/" target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 underline" style={{ color: '#00E5FF' }}>
              Ads Manager <ExternalLink className="h-2.5 w-2.5" />
            </a>
            {' '}→ canto superior esquerdo mostra a conta ativa. Copie o ID e adicione o prefixo <code className="px-1 rounded" style={{ background: '#1E2D45', color: '#00E5FF' }}>act_</code>.
            Exemplo: <code className="px-1 rounded font-mono" style={{ background: '#1E2D45', color: '#00FF94' }}>act_1234567890</code>
          </li>
          <li>
            <strong className="text-text">Business ID (opcional)</strong>: Business Settings → Informações do Negócio. Útil se você tem múltiplas contas.
          </li>
        </ol>

        <div className="mt-4 flex items-start gap-2 rounded-lg px-3 py-2 text-[11px]"
          style={{ background: 'rgba(255,170,0,.06)', borderLeft: '2px solid #FFAA00' }}>
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" style={{ color: '#FFAA00' }} />
          <span style={{ color: '#8AA8C8' }}>
            <strong style={{ color: '#FFAA00' }}>Segurança:</strong> essas credenciais dão acesso à sua conta de anúncios.
            Não compartilhe. Elas são armazenadas com RLS por tenant — só esta loja tem acesso.
          </span>
        </div>
      </div>

      {/* Formulário */}
      <div className="rounded-xl border p-6 space-y-5" style={{ background: '#111827', borderColor: '#1E2D45' }}>
        <div className="flex items-center gap-2">
          <Key className="h-4 w-4" style={{ color: '#FFAA00' }} />
          <h2 className="text-sm font-semibold" style={{ color: '#E8F0FE' }}>Credenciais</h2>
        </div>

        <Field
          label="App ID *"
          hint="Número do seu app no Meta for Developers"
          value={form.appId}
          onChange={v => setForm(f => ({ ...f, appId: v }))}
          placeholder="1234567890123456"
        />

        <Field
          label="App Secret *"
          hint={current ? 'Em branco = manter o atual; preencha só para alterar' : 'Secret do app — nunca compartilhe'}
          value={form.appSecret}
          onChange={v => setForm(f => ({ ...f, appSecret: v }))}
          placeholder="••••••••••••••••••••••••••••••••"
          type="password"
        />

        <Field
          label="Access Token *"
          hint={current ? 'Em branco = manter o atual; preencha só para alterar' : 'Token longo gerado no Business Settings'}
          value={form.accessToken}
          onChange={v => setForm(f => ({ ...f, accessToken: v }))}
          placeholder="EAAxxxxxxxxxxxx..."
          type="password"
          mono
        />

        <Field
          label="Ad Account ID *"
          hint="Formato act_XXXXXXXXX — ID da conta no Ads Manager"
          value={form.adAccountId}
          onChange={v => setForm(f => ({ ...f, adAccountId: v }))}
          placeholder="act_1234567890"
          mono
        />

        <Field
          label="Business ID"
          hint="Opcional — Business Settings → Informações do Negócio"
          value={form.businessId}
          onChange={v => setForm(f => ({ ...f, businessId: v }))}
          placeholder="1234567890"
          mono
        />

        {/* Resultado do teste */}
        {testResult && (
          <div
            className="flex items-start gap-2 rounded-lg px-3 py-2 text-xs"
            style={{
              background: testResult.ok ? 'rgba(0,255,148,.08)' : 'rgba(255,77,109,.08)',
              borderLeft: `2px solid ${testResult.ok ? '#00FF94' : '#FF4D6D'}`,
            }}
          >
            {testResult.ok
              ? <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{ color: '#00FF94' }} />
              : <XCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{ color: '#FF4D6D' }} />
            }
            <span style={{ color: testResult.ok ? '#00FF94' : '#FF4D6D' }}>{testResult.message}</span>
          </div>
        )}

        {/* Ações */}
        <div className="flex items-center gap-3 flex-wrap border-t pt-5" style={{ borderColor: '#1E2D45' }}>
          <button
            onClick={handleSave}
            disabled={saving || !form.appId || (!current && (!form.appSecret || !form.accessToken)) || !form.adAccountId}
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold text-black transition-opacity disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #00E5FF, #00FF94)' }}
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar credenciais
          </button>
          {current && (
            <>
              <button
                onClick={handleTest}
                disabled={testing}
                className="flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-bold transition-opacity disabled:opacity-50 hover:bg-white/5"
                style={{ borderColor: '#1E2D45', color: '#00E5FF' }}
              >
                {testing && <Loader2 className="h-4 w-4 animate-spin" />}
                Testar conexão
              </button>
              <button
                onClick={handleDelete}
                className="ml-auto flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold transition-colors hover:bg-red-500/10"
                style={{ borderColor: 'rgba(255,77,109,.3)', color: '#FF4D6D' }}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Remover credenciais
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function Field({
  label, hint, value, onChange, placeholder, type = 'text', mono = false,
}: {
  label: string; hint?: string
  value: string; onChange: (v: string) => void
  placeholder?: string; type?: string; mono?: boolean
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#5A7A9A' }}>
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full rounded-lg border px-3.5 py-2.5 text-sm text-text outline-none transition-colors focus:border-accent/60 placeholder:text-muted ${mono ? 'font-mono' : ''}`}
        style={{ background: '#0D1320', borderColor: '#1E2D45' }}
        autoComplete="off"
      />
      {hint && <p className="text-[10px]" style={{ color: '#5A7A9A' }}>{hint}</p>}
    </div>
  )
}
