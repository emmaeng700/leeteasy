import { redirect } from 'next/navigation'

/** Grind uses the static offline shell (same UI online or offline after cache). */
export default function GrindPage() {
  redirect('/grind-offline.html')
}
