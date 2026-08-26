import { useEffect, useState } from 'react'

export type Theme = 'light' | 'dark'

const KEY = 'sp-theme'
const EVENT = 'sp-theme-change'

export function getTheme(): Theme {
  try {
    return localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

export function applyTheme(t: Theme) {
  document.documentElement.dataset.theme = t
}

export function toggleTheme(): Theme {
  const next: Theme = getTheme() === 'dark' ? 'light' : 'dark'
  try { localStorage.setItem(KEY, next) } catch { /* storage unavailable */ }
  applyTheme(next)
  window.dispatchEvent(new Event(EVENT))
  return next
}

export function initTheme() {
  applyTheme(getTheme())
}

export function isDarkMode(): boolean {
  return document.documentElement.dataset.theme === 'dark'
}

/** React hook — re-renders the component whenever the theme flips */
export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(getTheme)
  useEffect(() => {
    const on = () => setTheme(getTheme())
    window.addEventListener(EVENT, on)
    return () => window.removeEventListener(EVENT, on)
  }, [])
  return [theme, () => setTheme(toggleTheme())]
}
