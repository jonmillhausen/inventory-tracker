'use client'

import { useState, useEffect } from 'react'

function todayStr(): string {
  return new Date().toISOString().split('T')[0]
}

/**
 * Like useState for a date string, but persists the value to sessionStorage
 * so it survives client-side navigation. Each page uses a unique key.
 * Starts with today to avoid SSR hydration mismatches, then syncs from
 * sessionStorage after mount.
 */
export function usePersistedDate(storageKey: string): [string, (d: string) => void] {
  const [date, setDateState] = useState<string>(todayStr)

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(storageKey)
      if (stored) setDateState(stored)
    } catch {}
  }, [storageKey])

  function setDate(d: string) {
    setDateState(d)
    try { sessionStorage.setItem(storageKey, d) } catch {}
  }

  return [date, setDate]
}
