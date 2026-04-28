import { Construction } from 'lucide-react'

type Props = { title: string; subtitle?: string }

export function ComingSoon({ title, subtitle }: Props) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text">{title}</h1>
        <p className="mt-1 text-sm text-muted">Smart ERP</p>
      </div>
      <div
        className="flex flex-col items-center justify-center rounded-xl border gap-4 py-32"
        style={{ background: '#F8FAFC', borderColor: '#E2E8F0' }}
      >
        <div
          className="flex h-16 w-16 items-center justify-center rounded-2xl"
          style={{ background: '#1D4ED812', border: '1px solid #1D4ED830' }}
        >
          <Construction className="h-8 w-8 text-accent" />
        </div>
        <p className="text-base font-semibold text-text">Em desenvolvimento</p>
        <p className="text-sm text-muted">
          {subtitle ?? 'Esta funcionalidade estará disponível em breve.'}
        </p>
      </div>
    </div>
  )
}
