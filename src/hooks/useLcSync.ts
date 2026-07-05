'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { syncAndApplyProgress } from '@/lib/syncEngine'
import type { DailyQueueItem } from '@/lib/dailyQueue'
import type { Question } from '@/lib/questions'

export function useLcSync(opts: {
  questions: Question[]
  dailyQueue: DailyQueueItem[]
  reviewIds: number[]
  enabled?: boolean
  onApplied?: () => void
}) {
  const [syncing, setSyncing] = useState(false)
  const [lastError, setLastError] = useState<string | null>(null)
  const optsRef = useRef(opts)
  optsRef.current = opts

  const runSync = useCallback(async () => {
    if (!optsRef.current.enabled) return
    setSyncing(true)
    setLastError(null)
    try {
      const result = await syncAndApplyProgress({
        questions: optsRef.current.questions,
        dailyQueue: optsRef.current.dailyQueue,
        reviewIds: optsRef.current.reviewIds,
      })
      if (result.error) setLastError(result.error)
      if (result.dailyUpdates.length || result.reviewUpdates.length) {
        optsRef.current.onApplied?.()
      }
    } catch (e) {
      setLastError(String(e))
    } finally {
      setSyncing(false)
    }
  }, [opts.enabled, opts.onApplied])

  useEffect(() => {
    if (!opts.enabled) return

    const onVisible = () => {
      if (document.visibilityState === 'visible') void runSync()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [opts.enabled, runSync])

  return { syncing, lastError, runSync }
}
