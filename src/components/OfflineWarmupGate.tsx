'use client'

import { useEffect, useState } from 'react'
import { Download, CheckCircle2, Loader2 } from 'lucide-react'
import {
  isOfflineWarmupComplete,
  markOfflineWarmupComplete,
  runOfflineWarmup,
  type WarmupProgress,
} from '@/lib/offlineWarmup'

export default function OfflineWarmupGate({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState(false)
  const [progress, setProgress] = useState<WarmupProgress | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const host = typeof window !== 'undefined' ? window.location.hostname : ''
    const isLocalDev =
      process.env.NODE_ENV === 'development' ||
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host.endsWith('.local')
    if (isLocalDev) {
      markOfflineWarmupComplete('dev-skip')
      return
    }

    if (isOfflineWarmupComplete()) return
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      markOfflineWarmupComplete('skipped-offline')
      return
    }

    let cancelled = false
    setActive(true)

    runOfflineWarmup(p => {
      if (!cancelled) setProgress(p)
    })
      .then(() => {
        if (!cancelled) setTimeout(() => setActive(false), 600)
      })
      .catch(() => {
        if (!cancelled) {
          markOfflineWarmupComplete('partial')
          setFailed(true)
          setTimeout(() => setActive(false), 1200)
        }
      })

    return () => { cancelled = true }
  }, [])

  const pct =
    progress && progress.total > 0
      ? Math.min(100, Math.round((progress.done / progress.total) * 100))
      : 0

  return (
    <>
      {children}
      {active && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-zinc-50/95 backdrop-blur-sm px-5"
          style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white shadow-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center shrink-0">
                {progress?.phase === 'done' ? (
                  <CheckCircle2 size={20} className="text-green-600" />
                ) : (
                  <Download size={20} className="text-indigo-600" />
                )}
              </div>
              <div>
                <p className="font-bold text-zinc-900 text-sm">Preparing offline Grind</p>
                <p className="text-xs text-zinc-500">One-time download (~25 MB)</p>
              </div>
            </div>

            <div className="h-2 rounded-full bg-zinc-100 overflow-hidden mb-3">
              <div
                className="h-full bg-indigo-600 transition-all duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>

            <p className="text-xs text-zinc-600 flex items-center gap-2">
              {progress?.phase !== 'done' && <Loader2 size={12} className="animate-spin shrink-0" />}
              {failed ? 'Partial cache - Grind may still work online' : progress?.label ?? 'Starting...'}
            </p>
          </div>
        </div>
      )}
    </>
  )
}
