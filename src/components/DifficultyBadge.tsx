export default function DifficultyBadge({ difficulty }: { difficulty: string }) {
  const styles: Record<string, string> = {
    Easy:   'bg-green-100 text-green-700 border border-green-300   ',
    Medium: 'bg-yellow-100 text-yellow-700 border border-yellow-300   ',
    Hard:   'bg-red-100 text-red-700 border border-red-300   ',
  }
  const cls = styles[difficulty] ?? 'bg-slate-100 text-slate-600 border border-slate-200   '
  return (
    <span className={`inline-flex shrink-0 items-center whitespace-nowrap text-[11px] sm:text-xs leading-none font-semibold px-2 py-1 rounded-full ${cls}`}>
      {difficulty}
    </span>
  )
}
