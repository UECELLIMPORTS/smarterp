'use client'

import { useCallback, useEffect, useState } from 'react'
import { setActiveStoreCookie, type Store } from '@/actions/stores'

const STORAGE_KEY = 'smarterp_active_store_v1'

export function useActiveStore(stores: Store[]) {
  const [activeId, setActiveId] = useState<string | null>(null)

  // Carrega do localStorage no mount
  useEffect(() => {
    if (typeof window === 'undefined') return
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved && stores.some(s => s.id === saved)) {
      setActiveId(saved)
    } else {
      const def = stores.find(s => s.is_default) ?? stores[0]
      if (def) setActiveId(def.id)
    }
  }, [stores])

  const setActive = useCallback(async (id: string) => {
    setActiveId(id)
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, id)
    }
    // Sincroniza com cookie no servidor (pra server actions filtrarem)
    try {
      await setActiveStoreCookie(id)
    } catch { /* noop */ }
    // Hard reload pra todos os componentes refetcharem com nova store
    if (typeof window !== 'undefined') {
      window.location.reload()
    }
  }, [])

  const active = stores.find(s => s.id === activeId) ?? null
  return { active, activeId, setActive }
}

/** Lê store ativa do localStorage SEM acessar o state — útil em handlers/actions */
export function getActiveStoreIdFromStorage(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(STORAGE_KEY)
}
