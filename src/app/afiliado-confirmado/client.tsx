'use client'

import { useState } from 'react'
import { Copy, Check } from 'lucide-react'

export function ConfirmadoCopyButton({ link, refCode }: { link: string; refCode: string }) {
  const [copied, setCopied] = useState<'link' | 'code' | null>(null)

  function copyValue(value: string, kind: 'link' | 'code') {
    navigator.clipboard.writeText(value).then(
      () => {
        setCopied(kind)
        setTimeout(() => setCopied(null), 2000)
      },
      () => null,
    )
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      <button type="button" onClick={() => copyValue(link, 'link')}
        className="inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium hover:opacity-80"
        style={{ background: 'rgba(16,185,129,.1)', border: '1px solid rgba(16,185,129,.3)', color: '#10B981' }}>
        {copied === 'link' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        {copied === 'link' ? 'Copiado!' : 'Copiar link'}
      </button>
      <button type="button" onClick={() => copyValue(refCode, 'code')}
        className="inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium hover:opacity-80"
        style={{ background: 'rgba(59,130,246,.1)', border: '1px solid rgba(59,130,246,.3)', color: '#3B82F6' }}>
        {copied === 'code' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        {copied === 'code' ? 'Copiado!' : `Código: ${refCode}`}
      </button>
    </div>
  )
}
