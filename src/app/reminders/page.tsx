'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import EmailRemindersCard from '@/components/EmailRemindersCard'
import { PageShell } from '@/components/Navbar'

export default function RemindersPage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)

  useEffect(() => { setReady(true) }, [])

  if (!ready) return null

  return (
    <PageShell title="Reminders">
      <EmailRemindersCard open onClose={() => router.push('/daily')} />
      <p className="text-xs text-zinc-500 text-center mt-4">
        Daily tab also has a bell icon for quick access.
      </p>
    </PageShell>
  )
}
