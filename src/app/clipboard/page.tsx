'use client'

import { useState, useEffect, useRef } from 'react'
import {
  Copy, Check, Trash2, Plus, Loader2, Eye, EyeOff,
  ClipboardList, Key, Sparkles, Zap,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { PageShell } from '@/components/Navbar'
import { persistLcSessionFromPaste } from '@/lib/leetcodeListSync'

interface ClipItem {
  id: number
  label: string
  content: string
  is_token: boolean
  created_at: string
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  const hours = Math.floor(diff / 3_600_000)
  const days = Math.floor(diff / 86_400_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  return `${days}d ago`
}

function cleanToken(raw: string) {
  return raw.replace(/\r?\n|\r/g, ' ').replace(/\s+/g, ' ').trim()
}

function TokenCleaner({ onSaved }: { onSaved: (item: ClipItem) => void }) {
  const [raw, setRaw] = useState('')
  const [cleaned, setCleaned] = useState('')
  const [copied, setCopied] = useState(false)
  const [saving, setSaving] = useState(false)
  const [label, setLabel] = useState('LeetCode Session')

  const handleClean = () => {
    setCleaned(cleanToken(raw))
    setCopied(false)
  }

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text).catch(() => {})
    setCopied(true)
    toast.success('Copied!')
    setTimeout(() => setCopied(false), 2000)
  }

  const save = async () => {
    const toSave = cleaned || cleanToken(raw)
    if (!toSave) return
    setSaving(true)
    try {
      const res = await fetch('/api/clipboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label, content: toSave, is_token: true }),
      })
      const d = await res.json()
      if (res.ok && d.item) {
        onSaved(d.item)
        const applied = await persistLcSessionFromPaste(toSave)
        if (applied.ok) toast.success('Token saved + applied for LeetCode sync')
        else toast.success('Token saved to clipboard')
        setRaw('')
        setCleaned('')
      } else if (res.status === 409 && d.error === 'duplicate') {
        const applied = await persistLcSessionFromPaste(toSave)
        if (applied.ok) toast.success('Token already saved - applied for sync on this device')
        else toast.error('This token is already saved')
      } else {
        toast.error(d.error ?? 'Could not save')
      }
    } catch {
      toast.error('Network error')
    } finally {
      setSaving(false)
    }
  }

  const isDirty = raw.length > 0
  const hasClean = cleaned.length > 0

  return (
    <div className="rounded-2xl border border-orange-200 bg-orange-50/80 p-4 space-y-3 mb-6">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Key size={14} className="text-orange-600 shrink-0" />
        <span className="text-sm font-bold text-orange-900">Token / Session Cleaner</span>
        <span className="text-[10px] text-orange-700/70 font-normal">paste messy, get clean</span>
      </div>

      <input
        value={label}
        onChange={e => setLabel(e.target.value)}
        placeholder="Label - e.g. LeetCode Session"
        className="w-full px-3 py-2 text-xs bg-white border border-orange-200 rounded-xl text-zinc-800 placeholder-zinc-400 focus:outline-none focus:border-orange-400"
      />

      <textarea
        value={raw}
        onChange={e => { setRaw(e.target.value); setCleaned('') }}
        placeholder="Paste raw LEETCODE_SESSION or cookie header - spaces, newlines, anything-"
        rows={3}
        className="w-full px-3 py-2 text-[11px] font-mono bg-white border border-orange-200 rounded-xl text-zinc-800 placeholder-zinc-400 focus:outline-none focus:border-orange-400 resize-none"
      />

      {isDirty && (
        <button
          type="button"
          onClick={handleClean}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl bg-orange-100 text-orange-800 hover:bg-orange-200 border border-orange-200 transition-colors"
        >
          <Sparkles size={12} /> Clean
        </button>
      )}

      {hasClean && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold text-emerald-700 uppercase tracking-wider">
              Cleaned - {cleaned.length} chars
            </span>
            <button
              type="button"
              onClick={() => void copy(cleaned)}
              className="flex items-center gap-1 text-[10px] text-zinc-500 hover:text-emerald-700 transition-colors"
            >
              {copied ? <Check size={10} className="text-emerald-600" /> : <Copy size={10} />}
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <div className="font-mono text-[10px] text-emerald-800 bg-white border border-emerald-200 rounded-xl px-3 py-2 break-all leading-relaxed max-h-20 overflow-y-auto">
            {cleaned}
          </div>
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl bg-orange-600 hover:bg-orange-500 text-white transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
              {saving ? 'Saving-' : 'Save + apply sync'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function ItemCard({ item, onDelete }: { item: ClipItem; onDelete: (id: number) => void }) {
  const [copied, setCopied] = useState(false)
  const [revealed, setRevealed] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [applying, setApplying] = useState(false)

  const copy = async () => {
    await navigator.clipboard.writeText(item.content).catch(() => {})
    setCopied(true)
    toast.success('Copied!')
    setTimeout(() => setCopied(false), 2000)
  }

  const applyForSync = async () => {
    setApplying(true)
    try {
      const result = await persistLcSessionFromPaste(item.content)
      if (result.ok) toast.success('LeetCode session applied - sync ready')
      else toast.error('Could not apply session - check token format')
    } finally {
      setApplying(false)
    }
  }

  const del = async () => {
    setDeleting(true)
    try {
      const res = await fetch('/api/clipboard', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id }),
      })
      if (res.ok) onDelete(item.id)
      else toast.error('Could not delete')
    } catch {
      toast.error('Network error')
    } finally {
      setDeleting(false)
    }
  }

  const isSensitive = item.is_token || (item.content.length > 40 && !item.content.includes('\n'))
  const displayContent = isSensitive && !revealed
    ? item.content.slice(0, 24) + '----------------'
    : item.content

  return (
    <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3 space-y-2 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {item.label && (
            <span className="text-xs font-semibold text-zinc-800 truncate">{item.label}</span>
          )}
          <span className="text-[10px] text-zinc-400 shrink-0">{timeAgo(item.created_at)}</span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {isSensitive && (
            <button
              type="button"
              onClick={() => setRevealed(v => !v)}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors"
              title={revealed ? 'Hide' : 'Reveal'}
            >
              {revealed ? <EyeOff size={13} /> : <Eye size={13} />}
            </button>
          )}
          {item.is_token && (
            <button
              type="button"
              onClick={() => void applyForSync()}
              disabled={applying}
              className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors disabled:opacity-50"
              title="Use this token for LeetCode sync on this device"
            >
              {applying ? <Loader2 size={11} className="animate-spin" /> : <Zap size={11} />}
              Use
            </button>
          )}
          <button
            type="button"
            onClick={() => void copy()}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-zinc-100 hover:bg-zinc-200 text-zinc-700 transition-colors"
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? 'Copied!' : 'Copy'}
          </button>
          <button
            type="button"
            onClick={() => void del()}
            disabled={deleting}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40"
          >
            {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
          </button>
        </div>
      </div>

      <div className="font-mono text-[11px] text-zinc-600 break-all leading-relaxed bg-zinc-50 rounded-lg px-3 py-2 select-all border border-zinc-100">
        {displayContent}
      </div>
    </div>
  )
}

export default function ClipboardPage() {
  const [items, setItems] = useState<ClipItem[]>([])
  const [loading, setLoading] = useState(true)
  const [tableReady, setTableReady] = useState(true)
  const [content, setContent] = useState('')
  const [label, setLabel] = useState('')
  const [saving, setSaving] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    fetch('/api/clipboard')
      .then(r => r.json())
      .then(d => {
        setItems(d.items ?? [])
        setTableReady(d.tableReady !== false)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const handleTokenSaved = (item: ClipItem) => setItems(prev => [item, ...prev])

  const save = async () => {
    if (!content.trim() || saving) return
    setSaving(true)
    try {
      const res = await fetch('/api/clipboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label, content }),
      })
      const d = await res.json()
      if (res.ok && d.item) {
        setItems(prev => [d.item, ...prev])
        setContent('')
        setLabel('')
        textareaRef.current?.focus()
        toast.success('Saved!')
      } else {
        toast.error(d.error ?? 'Could not save')
      }
    } catch {
      toast.error('Network error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = (id: number) => setItems(prev => prev.filter(i => i.id !== id))

  const tokens = items.filter(i => i.is_token)
  const general = items.filter(i => !i.is_token)

  return (
    <PageShell title="Clipboard">
      <p className="text-xs text-zinc-500 mb-5 -mt-2">
        Paste LeetCode tokens here on desktop - open on your phone, tap <strong>Use</strong>, then sync.
        Synced across all devices via Supabase.
      </p>

      {!tableReady && (
        <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm font-semibold text-amber-900">One-time setup needed</p>
          <p className="text-xs text-amber-800/80 mt-1">
            Run <code className="bg-amber-100 px-1 rounded">supabase/step7-clipboard.sql</code> in your Supabase SQL Editor.
          </p>
        </div>
      )}

      <TokenCleaner onSaved={handleTokenSaved} />

      <div className="rounded-xl border border-zinc-200 bg-white p-4 mb-6 space-y-3 shadow-sm">
        <p className="text-xs font-semibold text-zinc-500 flex items-center gap-1.5">
          <ClipboardList size={12} /> General Clipboard
        </p>
        <input
          value={label}
          onChange={e => setLabel(e.target.value)}
          placeholder="Label (optional)"
          className="w-full px-3 py-2 text-sm bg-zinc-50 border border-zinc-200 rounded-xl text-zinc-900 placeholder-zinc-400 focus:outline-none focus:border-indigo-400"
        />
        <textarea
          ref={textareaRef}
          value={content}
          onChange={e => setContent(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void save() }}
          placeholder="Paste anything here-"
          rows={3}
          className="w-full px-3 py-2 text-sm font-mono bg-zinc-50 border border-zinc-200 rounded-xl text-zinc-900 placeholder-zinc-400 focus:outline-none focus:border-indigo-400 resize-none"
        />
        <div className="flex items-center justify-between">
          <p className="text-[10px] text-zinc-400">?Enter to save</p>
          <button
            type="button"
            onClick={() => void save()}
            disabled={!content.trim() || saving}
            className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold rounded-xl transition-colors disabled:opacity-40"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Save
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 gap-2 text-zinc-400">
          <Loader2 size={18} className="animate-spin" />
          <span className="text-sm">Loading-</span>
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-12">
          <ClipboardList size={28} className="text-zinc-300 mx-auto mb-3" />
          <p className="text-sm text-zinc-500">Nothing saved yet.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {tokens.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Key size={12} className="text-orange-500" />
                <span className="text-[10px] font-black text-orange-600 uppercase tracking-widest">
                  Tokens &amp; Sessions
                </span>
                <span className="text-[10px] text-zinc-400">- newest first</span>
              </div>
              {tokens.map(item => (
                <ItemCard key={item.id} item={item} onDelete={handleDelete} />
              ))}
            </div>
          )}
          {general.length > 0 && (
            <div className="space-y-3">
              {tokens.length > 0 && (
                <div className="flex items-center gap-2">
                  <ClipboardList size={12} className="text-zinc-400" />
                  <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">
                    General
                  </span>
                </div>
              )}
              {general.map(item => (
                <ItemCard key={item.id} item={item} onDelete={handleDelete} />
              ))}
            </div>
          )}
        </div>
      )}
    </PageShell>
  )
}
