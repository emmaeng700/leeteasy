'use client'

import type { ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { Calendar, Zap, Brain, Code2 } from 'lucide-react'
import AppNavLink from '@/components/AppNavLink'

const LINKS = [
  { href: '/grind-offline.html', label: 'Grind', icon: Code2, match: '/grind' },
  { href: '/daily', label: 'Daily', icon: Calendar, match: '/daily' },
  { href: '/review', label: 'Reviews', icon: Brain, match: '/review' },
  { href: '/leetcode', label: 'LeetCode', icon: Zap, match: '/leetcode' },
] as const

export default function Navbar() {
  const pathname = usePathname()

  return (
    <nav className="sticky top-0 z-50 border-b border-zinc-200/80 bg-white/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-lg items-center justify-between px-4 h-12">
        <AppNavLink href="/" className="font-bold text-indigo-600 tracking-tight">
          LeetEasy
        </AppNavLink>
        <div className="flex items-center gap-0.5">
          {LINKS.map(({ href, label, icon: Icon, match }) => {
            const active = pathname.startsWith(match)
            return (
              <AppNavLink
                key={href}
                href={href}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
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
