'use client'

import { useEffect, useState } from 'react'
import { Key } from 'lucide-react'
import toast from 'react-hot-toast'
import { persistLcSessionFromPaste } from '@/lib/leetcodeListSync'
import { parseStoredLcSession } from '@/lib/leetcodeHttp'
import { clearLcPasteDraft, readLcPasteDraft, writeLcPasteDraft } from '@/lib/lcPasteDraft'

type Props = {
  open: boolean
  onSaved?: () => void
}

export default function LcSessionPaste({ open, onSaved }: Props) {
  const [session, setSession] = useState('')
  const [csrf, setCsrf] = useState('')
  const [saving, setSaving] = useState(false)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    const d = readLcPasteDraft()
    setSession(d.session)
    setCsrf(d.csrf)
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    writeLcPasteDraft(session, csrf)
  }, [session, csrf, hydrated])

  useEffect(() => {
    const refresh = () => {
      const d = readLcPasteDraft()
      setSession(d.session)
      setCsrf(d.csrf)
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    window.addEventListener('pageshow', refresh)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('pageshow', refresh)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  if (!open) return null

  const save = async () => {
    setSaving(true)
    try {
      const parsed = parseStoredLcSession(session, csrf)
      if (!parsed.session) {
        toast.error('Paste LEETCODE_SESSION from leetcode.com (Application -> Cookies)')
        return
      }

      const result = await persistLcSessionFromPaste(session, csrf)
      if (!result.ok) {
        toast.error('Saved locally but Supabase save failed - try Tokens page')
        return
      }

      clearLcPasteDraft()
      setSession('')
      setCsrf('')
      toast.success('Cookie saved - syncing...')
      onSaved?.()
    } catch (e) {
      toast.error(String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-2xl border border-indigo-200 bg-indigo-50/80 p-4 mb-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-indigo-900 mb-2">
        <Key size={14} />
        LeetCode session (one-time)
      </div>
      <p className="text-xs text-indigo-800/80 mb-3 leading-relaxed">
        On leetcode.com: DevTools, Application tab, Cookies, copy <strong>LEETCODE_SESSION</strong>.
        Draft is kept if you switch tabs to copy values. Or use <strong>Tokens</strong> in the nav.
      </p>
      <textarea
        value={session}
        onChange={e => setSession(e.target.value)}
        rows={3}
        placeholder="LEETCODE_SESSION=... or full Cookie: header"
        className="w-full text-xs font-mono rounded-xl border border-indigo-200 bg-white p-3 mb-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
      />
      <input
        value={csrf}
        onChange={e => setCsrf(e.target.value)}
        placeholder="csrftoken (optional - auto-fetched if omitted)"
        className="w-full text-xs font-mono rounded-xl border border-indigo-200 bg-white px-3 py-2 mb-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
      />
      <button
        type="button"
        onClick={() => void save()}
        disabled={saving}
        className="w-full py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold disabled:opacity-50"
      >
        {saving ? 'Saving...' : 'Save & sync'}
      </button>
    </div>
  )
}
