'use client'

import type { ReactNode } from 'react'
import { useCallback, useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Calendar, Zap, Brain, Code2, RefreshCw, Check, Key } from 'lucide-react'
import AppNavLink from '@/components/AppNavLink'
import { APP_BUILD_ID } from '@/lib/appVersion'
import { clearRefreshQueryParam, forceAppRefresh } from '@/lib/forceAppRefresh'

const LINKS = [
  { href: '/grind-offline.html', label: 'Grind', icon: Code2, match: '/grind' },
  { href: '/daily', label: 'Daily', icon: Calendar, match: '/daily' },
  { href: '/review', label: 'Reviews', icon: Brain, match: '/review' },
  { href: '/leetcode', label: 'LeetCode', icon: Zap, match: '/leetcode' },
  { href: '/clipboard', label: 'Tokens', icon: Key, match: '/clipboard' },
] as const

export default function Navbar() {
  const pathname = usePathname()
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'checking' | 'uptodate'>('idle')

  const checkForUpdate = useCallback(async () => {
    setUpdateStatus('checking')
    try {
      await forceAppRefresh()
    } catch {
      setUpdateStatus('idle')
    }
  }, [])

  useEffect(() => {
    clearRefreshQueryParam()
  }, [])

  return (
    <nav className="sticky top-0 z-50 border-b border-zinc-200/80 bg-white/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-lg items-center justify-between px-4 h-12 gap-2">
        <AppNavLink href="/" className="font-bold text-indigo-600 tracking-tight shrink-0 flex flex-col leading-none">
          <span>LeetEasy</span>
          <span className="text-[8px] font-mono text-zinc-400 tracking-normal">{APP_BUILD_ID}</span>
        </AppNavLink>
        <div className="flex items-center gap-0.5 min-w-0">
          {LINKS.map(({ href, label, icon: Icon, match }) => {
            const active = pathname.startsWith(match)
            return (
              <AppNavLink
                key={href}
                href={href}
                className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  active
                    ? 'bg-indigo-600 text-white'
                    : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100'
                }`}
              >
                <Icon size={13} />
                <span className="hidden sm:inline">{label}</span>
              </AppNavLink>
            )
          })}
          <button
            type="button"
            onClick={() => void checkForUpdate()}
            disabled={updateStatus === 'checking'}
            className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-bold border transition-colors disabled:opacity-60 shrink-0 ${
              updateStatus === 'uptodate'
                ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                : 'border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100'
            }`}
            title="Clear cache and reload latest build"
          >
            {updateStatus === 'checking' ? (
              <RefreshCw size={11} className="animate-spin" />
            ) : updateStatus === 'uptodate' ? (
              <Check size={11} />
            ) : (
              <RefreshCw size={11} />
            )}
            <span className="hidden sm:inline">Get Latest</span>
          </button>
        </div>
      </div>
    </nav>
  )
}

export function PageShell({ title, children, action }: {
  title: string
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="mx-auto max-w-lg px-4 py-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-zinc-900">{title}</h1>
        {action}
      </div>
      {children}
    </div>
  )
}
