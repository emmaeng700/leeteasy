export type Question = {
  id: number
  title: string
  slug: string
  difficulty: 'Easy' | 'Medium' | 'Hard'
  tags?: string[]
}

let cache: Question[] | null = null

export async function loadQuestions(): Promise<Question[]> {
  if (cache) return cache
  const res = await fetch('/questions_full.json')
  const data = await res.json() as Question[]
  cache = data
  return data
}

export function questionById(questions: Question[], id: number): Question | undefined {
  return questions.find(q => q.id === id)
}
