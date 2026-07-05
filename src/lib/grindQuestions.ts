export type GrindQuestion = {
  set: 1 | 2 | 3
  id: number
  title: string
  slug: string
  difficulty: string
  pattern: string | null
  section: string | null
  starterPython?: string
  starterCpp?: string
  interviewApproach?: string
  description?: string
  descriptionHtml?: string
}

const SW_CACHE_FALLBACKS = ['lm-v26', 'lm-v25', 'lm-v24', 'lm-v23', 'lm-v22', 'lm-v16']

/** Prebuilt 727-question catalog (Sets 1-3, patterns, sections). */
export async function loadGrindQuestionsBundle(): Promise<GrindQuestion[]> {
  try {
    const res = await fetch('/grind_questions.json', { cache: 'no-store' })
    if (res.ok) return res.json() as Promise<GrindQuestion[]>
  } catch {
    /* offline */
  }

  if (typeof caches !== 'undefined') {
    for (const cacheName of SW_CACHE_FALLBACKS) {
      try {
        const cache = await caches.open(cacheName)
        const cached = await cache.match('/grind_questions.json')
        if (cached) return cached.json() as Promise<GrindQuestion[]>
      } catch {
        /* ignore */
      }
    }
  }

  return []
}
