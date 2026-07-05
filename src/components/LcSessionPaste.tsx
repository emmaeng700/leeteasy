'use client'

import { useState } from 'react'
import { Key } from 'lucide-react'
import toast from 'react-hot-toast'
import { parseStoredLcSession } from '@/lib/leetcodeHttp'

type Props = {
  open: boolean
  onSaved?: () => void
}

export default function LcSessionPaste({ open, onSaved }: Props) {
  const [session, setSession] = useState('')
  const [csrf, setCsrf] = useState('')
  const [saving, setSaving] = useState(false)

  if (!open) return null

  const save = () => {
    setSaving(true)
    try {
      const parsed = parseStoredLcSession(session, csrf)
      if (!parsed.session) {
        toast.error('Paste your LEETCODE_SESSION cookie from leetcode.com')
        return
      }
      localStorage.setItem('lc_session', parsed.session)
      if (parsed.csrf) localStorage.setItem('lc_csrf', parsed.csrf)
      toast.success('Cookie saved - syncing...')
      onSaved?.()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-2xl border border-indigo-200 bg-indigo-50/80 p-4 mb-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-indigo-900 mb-2">
        <Key size={14} />
        Optional: sync AC list from LeetCode
      </div>
      <p className="text-xs text-indigo-800/80 mb-3 leading-relaxed">
        Daily and Reviews use <strong>Mark done</strong> after you AC on LeetCode. Paste your cookie here only if you want the LeetCode list page to pull your AC counts.
      </p>
      <textarea
        value={session}
        onChange={e => setSession(e.target.value)}
        rows={3}
        placeholder="LEETCODE_SESSION=... from DevTools on leetcode.com"
        className="w-full text-xs font-mono rounded-xl border border-indigo-200 bg-white p-3 mb-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
      />
      <input
        value={csrf}
        onChange={e => setCsrf(e.target.value)}
        placeholder="csrftoken (optional if in cookie)"
        className="w-full text-xs font-mono rounded-xl border border-indigo-200 bg-white px-3 py-2 mb-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
      />
      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="w-full py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold disabled:opacity-50"
      >
        {saving ? 'Saving...' : 'Save cookie'}
      </button>
    </div>
  )
}
