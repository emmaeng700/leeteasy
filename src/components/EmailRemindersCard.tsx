'use client'

import { useEffect, useState } from 'react'
import { Bell, Mail } from 'lucide-react'
import toast from 'react-hot-toast'

export default function EmailRemindersCard({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [enabled, setEnabled] = useState(true)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    void import('@/lib/db').then(({ getUserProfile }) =>
      getUserProfile().then(p => {
        const local = localStorage.getItem('lm_email_enabled')
        if (local != null) setEnabled(local !== 'false')
        else setEnabled(p?.emailEnabled !== false)
      }).finally(() => setLoading(false)),
    )
  }, [open])

  const save = async (next: boolean) => {
    setSaving(true)
    setEnabled(next)
    try {
      const { saveUserProfile } = await import('@/lib/db')
      await saveUserProfile({ emailEnabled: next })
      localStorage.setItem('lm_email_enabled', String(next))
      toast.success(next ? 'Daily emails on' : 'Daily emails off')
    } catch {
      toast.error('Could not save preference')
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div className="rounded-2xl border border-sky-200 bg-sky-50/70 p-4 mb-4">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <Mail size={16} className="text-sky-600" />
          <h2 className="text-sm font-bold text-sky-900">Daily email reminders</h2>
        </div>
        <button type="button" onClick={onClose} className="text-xs text-sky-600 font-semibold">Close</button>
      </div>

      <p className="text-xs text-sky-800/90 leading-relaxed mb-3">
        Cron sends every morning (~8 AM CT) with today&apos;s questions and due reviews.
      </p>

      <label className="flex items-center justify-between gap-3 rounded-xl border border-sky-200 bg-white px-3 py-2.5 mb-4">
        <span className="text-sm font-semibold text-zinc-800">Email me daily</span>
        <button
          type="button"
          disabled={loading || saving}
          onClick={() => void save(!enabled)}
          className={`relative w-11 h-6 rounded-full transition-colors disabled:opacity-50 ${enabled ? 'bg-sky-600' : 'bg-zinc-300'}`}
        >
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${enabled ? 'translate-x-5' : ''}`} />
        </button>
      </label>

      <div className="rounded-xl border border-sky-100 bg-white/80 p-3 text-[10px] text-zinc-600 leading-relaxed space-y-2">
        <p className="font-bold text-zinc-800 flex items-center gap-1">
          <Bell size={11} /> Vercel setup (one-time)
        </p>
        <p>Add these in Vercel - Project - Settings - Environment Variables, then redeploy:</p>
        <ul className="list-disc pl-4 space-y-0.5 font-mono text-[9px]">
          <li>RESEND_API_KEY</li>
          <li>NOTIFICATION_EMAIL (your inbox)</li>
          <li>CRON_SECRET (any random string)</li>
        </ul>
        <p>Run <code className="bg-zinc-100 px-1 rounded">supabase/step4-email.sql</code> in Supabase SQL Editor.</p>
        <p className="text-zinc-500">Preview: <code className="bg-zinc-100 px-1 rounded">/api/notify-daily?preview=1</code> (local dev)</p>
      </div>
    </div>
  )
}
