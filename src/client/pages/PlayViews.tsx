import { btnClass, btnSecondary, difficultyLabel } from '../catalogUi'
import { isDifficulty, isPlayDifficulty } from '../playerSession'
import { strings } from '../strings'
import type { PlayPageModel } from './usePlayPage'

const primaryBtn = `${btnClass} disabled:opacity-50`

/** Category / topic and difficulty above the questions. */
export function RoundHeading(props: { categoryName?: string; topicName?: string; difficulty?: string }) {
  const subject = [props.categoryName, props.topicName].filter(Boolean).join(' / ')
  const diff = isPlayDifficulty(props.difficulty) ? difficultyLabel(props.difficulty) : ''
  if (!subject && !diff) {
    return null
  }
  return (
    <p className="text-lg font-semibold">
      {subject || strings.appName}
      {diff ? <span className="font-normal text-slate-400"> · {diff}</span> : null}
    </p>
  )
}

export function PlayError(props: { message: string }) {
  return (
    <div>
      <p className="text-red-400">{props.message}</p>
      <a href="/" className="mt-4 inline-block text-sky-400">
        {strings.back}
      </a>
    </div>
  )
}

/** One question: reveal options, pick, skip, or continue. */
export function PlayQuestion(props: { play: PlayPageModel }) {
  const play = props.play
  const q = play.q
  if (!q) {
    return null
  }
  return (
    <div className="flex flex-col gap-4">
      <RoundHeading
        categoryName={play.heading.categoryName}
        topicName={play.heading.topicName}
        difficulty={play.heading.difficulty}
      />
      {play.shortNotice ? <p className="text-sm text-amber-300">{play.shortNotice}</p> : null}
      <p className="text-sm text-slate-400">
        {strings.questionOf} {play.index + 1} / {play.questions.length}
        {play.heading.difficulty === 'all' && isDifficulty(q.difficulty) ? (
          <span className="text-xs text-slate-500"> · {difficultyLabel(q.difficulty)}</span>
        ) : null}
      </p>
      <h1 className="text-xl font-semibold">{q.question}</h1>

      {play.showOptions ? (
        <ul className="flex flex-col gap-2">
          {q.options.map((opt, i) => {
            const dead = play.eliminated.includes(i)
            const correct = play.answered && i === q.correctIndex
            return (
              <li key={i}>
                <button
                  type="button"
                  disabled={play.answered || dead}
                  onClick={() => play.onPick(i)}
                  className={`w-full rounded p-3 text-left ${
                    correct
                      ? 'bg-emerald-700'
                      : dead
                        ? 'bg-slate-800 text-slate-500 line-through'
                        : 'bg-slate-800 hover:bg-slate-700'
                  }`}
                >
                  {opt}
                </button>
              </li>
            )
          })}
        </ul>
      ) : (
        <button type="button" className={primaryBtn} onClick={play.onShowOptions}>
          {strings.showOptions}
        </button>
      )}

      {play.answered ? (
        <div className="rounded bg-slate-900 p-3 text-sm">
          <p>{q.explanation}</p>
          {q.sourceUrl ? (
            <a
              href={q.sourceUrl}
              className="mt-2 inline-block text-sky-400"
              target="_blank"
              rel="noreferrer"
            >
              {strings.sourceLink}
            </a>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3">
        {!play.answered ? (
          <button type="button" className={btnSecondary} onClick={play.onSkip}>
            {strings.skip}
          </button>
        ) : (
          <button type="button" className={primaryBtn} onClick={play.goNext}>
            {strings.next}
          </button>
        )}
        <button type="button" className={btnSecondary} onClick={play.onQuit}>
          {strings.quit}
        </button>
      </div>
    </div>
  )
}

/** Score, printable copy, and retry after the last question. */
export function PlaySummary(props: { play: PlayPageModel }) {
  const play = props.play
  return (
    <div className="flex flex-col gap-3">
      <RoundHeading
        categoryName={play.heading.categoryName}
        topicName={play.heading.topicName}
        difficulty={play.heading.difficulty}
      />
      <h1 className="text-2xl font-semibold">{strings.summary}</h1>
      <p>
        {strings.good}: {play.score.good}
      </p>
      <p>
        {strings.bad}: {play.score.bad}
      </p>
      <p>
        {strings.skipped}: {play.score.skipped}
      </p>
      {play.saveError ? <p className="text-sm text-red-400">{play.saveError}</p> : null}
      {play.moreError ? <p className="text-sm text-red-400">{play.moreError}</p> : null}
      {play.bankExhausted && !play.moreError ? (
        <p className="text-sm text-amber-300">{strings.replayBankHint}</p>
      ) : null}
      <p className="mt-2 text-sm text-slate-400">{strings.downloadCopy}</p>
      <div className="flex flex-wrap gap-3">
        <button type="button" className={btnSecondary} onClick={() => play.onDownloadCopy(false)}>
          {strings.downloadStudent}
        </button>
        <button type="button" className={btnSecondary} onClick={() => play.onDownloadCopy(true)}>
          {strings.downloadTeacher}
        </button>
      </div>
      <div className="mt-4 flex flex-col gap-3">
        {play.bankExhausted ? (
          <button
            type="button"
            className={primaryBtn}
            disabled={play.moreBusy}
            onClick={() => void play.onReplayBank()}
          >
            {strings.replayBank}
          </button>
        ) : (
          <button
            type="button"
            className={primaryBtn}
            disabled={play.moreBusy}
            onClick={() => void play.onMoreQuestions()}
          >
            {strings.moreQuestions}
          </button>
        )}
        <button type="button" className={primaryBtn} onClick={play.onRetryAll}>
          {strings.retryAll}
        </button>
        <button
          type="button"
          className={primaryBtn}
          disabled={!play.outcomes.some((o) => o.skipped || o.missed)}
          onClick={play.onRetryFailed}
        >
          {strings.retryFailed}
        </button>
        <button type="button" className={btnSecondary} onClick={play.onQuit}>
          {strings.quit}
        </button>
      </div>
    </div>
  )
}
