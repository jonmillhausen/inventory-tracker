'use client'

import { createContext, useContext, useEffect, useState } from 'react'

type Theme = 'light' | 'dark'

const ThemeContext = createContext<{
  theme: Theme
  toggleTheme: () => void
}>({ theme: 'light', toggleTheme: () => {} })

export function useTheme() {
  return useContext(ThemeContext)
}

export function ThemeProvider({
  children,
  initialTheme = 'light',
}: {
  children: React.ReactNode
  initialTheme?: Theme
}) {
  const [theme, setTheme] = useState<Theme>(initialTheme)

  // Keep <html> class in sync with theme state
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  // On mount: resolve from localStorage or system preference
  useEffect(() => {
    const stored = localStorage.getItem('theme') as Theme | null
    if (stored === 'light' || stored === 'dark') {
      setTheme(stored)
    } else if (initialTheme === 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      setTheme('dark')
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function toggleTheme() {
    const next: Theme = theme === 'light' ? 'dark' : 'light'
    setTheme(next)
    try { localStorage.setItem('theme', next) } catch {}
    fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme: next }),
    }).catch(() => {})
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}
