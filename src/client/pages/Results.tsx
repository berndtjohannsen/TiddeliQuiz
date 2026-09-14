import { useEffect, useState } from 'react'
import type { QuizAttempt } from '../../shared/types'
import { loadAttemptHistory } from '../attemptHistory'
import { difficultyLabel, fillText } from '../catalogUi'
import { strings } from '../strings'

function formatWhen(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) {
    return iso
  }
  return d.toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' })
}

function percent(row: QuizAttempt) {
  return row.count ? Math.round((row.good / row.count) * 100) : 0
}

/** Finished quizzes. Play again starts a new draw with the same settings. */
export function Results(props: {
  onBack: () => void
  onPlayAgain: (row: QuizAttempt) => void
}) {
  const [rows, setRows] = useState<QuizAttempt[] | null>(null)

  useEffect(() => {
    let cancelled = false
    void loadAttemptHistory().then((list) => {
      if (!cancelled) {
        setRows(list)
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  const good = rows?.reduce((sum, r) => sum + r.good, 0) ?? 0
  const bad = rows?.reduce((sum, r) => sum + r.bad, 0) ?? 0
  const skipped = rows?.reduce((sum, r) => sum + r.skipped, 0) ?? 0

  return (
    <div className="mt-8 flex flex-col gap-4">
      <button type="button" className="self-start text-sm text-sky-400" onClick={props.onBack}>
        {strings.back}
      </button>
      <h2 className="text-lg font-medium">{strings.myResults}</h2>
      {rows === null ? (
        <p className="text-sm text-slate-400">{strings.loadingCatalog}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-400">{strings.myResultsEmpty}</p>
      ) : (
        <>
          <p className="text-xs text-slate-400">
            {fillText(strings.myResultsCount, { count: rows.length })}
            {' · '}
            {fillText(strings.myResultsTotals, { good, bad, skipped })}
          </p>
          <ul className="rounded border border-slate-700">
            {rows.map((row) => (
              <li
                key={row.id}
                className="flex items-start gap-2 border-b border-slate-800 last:border-b-0"
              >
                <div className="min-w-0 flex-1 px-3 py-2 text-sm">
                  <span className="block font-medium">
                    {[row.categoryName, row.topicName].filter(Boolean).join(' / ')}
                    <span className="font-normal text-slate-400">
                      {' · '}
                      {difficultyLabel(row.difficulty)}
                    </span>
                  </span>
                  <span className="mt-1 block text-xs text-slate-400">
                    {formatWhen(row.finishedAt)}
                    {' · '}
                    {fillText(strings.myResultsScore, {
                      good: row.good,
                      count: row.count,
                      percent: percent(row),
                    })}
                  </span>
                </div>
                <div className="px-2 py-2">
                  <button
                    type="button"
                    className="px-2 py-1 text-sm text-sky-400 hover:text-sky-300"
                    onClick={() => props.onPlayAgain(row)}
                  >
                    {strings.myPlayAgain}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
