'use client'

import { useEffect } from 'react'
import { hydrateLcListSync } from '@/lib/leetcodeListSync'

/** Pull latest LeetCode AC sync from Supabase when the app opens or tab refocuses. */
export default function LcListSyncHydrate() {
  useEffect(() => {
    const run = () => { void hydrateLcListSync() }
    run()
    const onVisible = () => {
      if (document.visibilityState === 'visible') run()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('pageshow', run)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('pageshow', run)
    }
  }, [])
  return null
}
