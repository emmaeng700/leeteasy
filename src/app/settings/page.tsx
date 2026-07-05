'use client'

import { useEffect, useState } from 'react'
import { Check, Key, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { PageShell } from '@/components/Navbar'
import { parseStoredLcSession } from '@/lib/leetcodeHttp'

export default function SettingsPage() {
  const [session, setSession] = useState('')
  const [csrf, setCsrf] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    const local = parseStoredLcSession(
      localStorage.getItem('lc_session'),
      localStorage.getItem('lc_csrf'),
    )
    if (local.session) {
      setSession(local.session)
      setCsrf(local.csrf)
      setConnected(true)
      setLoading(false)
      return
    }
    fetch('/api/lc-session')
      .then(r => r.json())
      .then(d => {
        const parsed = parseStoredLcSession(d.lc_session, d.lc_csrf)
        if (parsed.session) {
          setSession(parsed.session)
          setCsrf(parsed.csrf)
          setConnected(true)
        }
      })
      .catch(() => { /* optional backup */ })
      .finally(() => setLoading(false))
  }, [])

  const save = async () => {
    setSaving(true)
    try {
      const parsed = parseStoredLcSession(session, csrf)
      if (!parsed.session) {
        toast.error('Paste your LeetCode session cookie')
        return
      }
      localStorage.setItem('lc_session', parsed.session)
      if (parsed.csrf) localStorage.setItem('lc_csrf', parsed.csrf)

      const res = await fetch('/api/lc-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lc_session: parsed.session, lc_csrf: parsed.csrf }),
      })
      if (!res.ok) throw new Error('Save failed')
      setConnected(true)
      toast.success('Session saved - Sync can detect ACs')
    } catch (e) {
      toast.error(String(e))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <PageShell title="Settings">
        <div className="flex justify-center py-20 text-zinc-400">
          <Loader2 className="animate-spin" size={24} />
        </div>
      </PageShell>
    )
  }

  return (
    <PageShell title="Settings">
      <div className="rounded-2xl border border-zinc-200 bg-white p-4 mb-4">
        <p className="text-sm font-semibold text-zinc-900">You solve on LeetCode</p>
        <p className="mt-2 text-xs text-zinc-600 leading-relaxed">
          Daily and Reviews work without anything here — open a question in LeetCode, then tap <strong>Mark done</strong> when you are finished.
        </p>
      </div>

      <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4 mb-4">
        <div className="flex items-center gap-2 text-indigo-800 font-semibold text-sm">
          <Key size={16} />
          Optional: auto-sync
          {connected && <Check size={14} className="text-emerald-600" />}
        </div>
        <p className="mt-2 text-xs text-indigo-700/80 leading-relaxed">
          Paste your leetcode.com session cookie once if you want <strong>Sync</strong> to detect Accepted submissions automatically (instead of Mark done).
        </p>
      </div>

      <label className="block text-xs font-semibold text-zinc-600 mb-1">Session / cookie header</label>
      <textarea
        value={session}
        onChange={e => setSession(e.target.value)}
        rows={4}
        placeholder="LEETCODE_SESSION=... or full cookie header"
        className="w-full text-xs font-mono rounded-xl border border-zinc-200 p-3 mb-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
      />

      <label className="block text-xs font-semibold text-zinc-600 mb-1">CSRF token (optional if in cookie)</label>
      <input
        value={csrf}
        onChange={e => setCsrf(e.target.value)}
        placeholder="csrftoken"
        className="w-full text-xs font-mono rounded-xl border border-zinc-200 px-3 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
      />

      <button
        type="button"
        onClick={() => void save()}
        disabled={saving}
        className="w-full py-3 rounded-xl bg-indigo-600 text-white font-bold text-sm disabled:opacity-50"
      >
        {saving ? 'Saving...' : 'Save session'}
      </button>
    </PageShell>
  )
}
