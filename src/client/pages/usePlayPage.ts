import { useEffect, useRef, useState } from 'react'
import type { QuizQuestion, QuizScore } from '../../shared/types'
import { recordFinishedAttempt } from '../attemptHistory'
import { difficultyLabel, fillText } from '../catalogUi'
import {
  clearSeen,
  downloadQuizCopy,
  emptyOutcomes,
  fetchQuizRound,
  hasPlayerSession,
  isPlayDifficulty,
  readStoredRound,
  tallyOutcomes,
  unseenLeftAfterDraw,
  writeStoredRound,
  type QuestionOutcome,
} from '../playerSession'
import { strings } from '../strings'

/** Simple generated tones. No sound files. */
function beep(freq: number, ms: number, type: OscillatorType) {
  const ctx = new AudioContext()
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = type
  osc.frequency.value = freq
  gain.gain.value = 0.08
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start()
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + ms / 1000)
  osc.stop(ctx.currentTime + ms / 1000)
}

function playSuccess() {
  beep(523, 120, 'triangle')
  window.setTimeout(() => beep(784, 180, 'triangle'), 90)
}

function playError() {
  beep(180, 220, 'sawtooth')
}

/** Fisher–Yates so Retry does not keep the previous question order. */
function shuffleList<T>(items: T[]): T[] {
  const next = [...items]
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = next[i]
    next[i] = next[j]
    next[j] = tmp
  }
  return next
}

/** Same idea as the server shuffle: mix options and keep the correct index in sync. */
function shuffleOptions(q: QuizQuestion): QuizQuestion {
  const pairs = q.options.map((text, i) => ({ text, correct: i === q.correctIndex }))
  for (let i = pairs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = pairs[i]
    pairs[i] = pairs[j]
    pairs[j] = tmp
  }
  return {
    ...q,
    options: pairs.map((p) => p.text),
    correctIndex: pairs.findIndex((p) => p.correct),
  }
}

/** Play, retry, and summary actions for a stored quiz round. */
export function usePlayPage() {
  const stored = readStoredRound()
  const [status, setStatus] = useState<'error' | 'play' | 'summary'>(stored ? 'play' : 'error')
  const [error] = useState(stored ? '' : strings.roundMissing)
  const [heading, setHeading] = useState({
    categoryName: stored?.categoryName ?? '',
    topicName: stored?.topicName ?? '',
    difficulty: stored?.difficulty ?? '',
  })
  const [questions, setQuestions] = useState<QuizQuestion[]>(stored?.questions ?? [])
  const [allQuestions, setAllQuestions] = useState<QuizQuestion[]>(
    stored?.allQuestions ?? stored?.questions ?? [],
  )
  const [outcomes, setOutcomes] = useState<QuestionOutcome[]>(() =>
    emptyOutcomes(stored?.questions?.length ?? 0),
  )
  const [index, setIndex] = useState(0)
  const [showOptions, setShowOptions] = useState(false)
  const [eliminated, setEliminated] = useState<number[]>([])
  const [answered, setAnswered] = useState(false)
  const [score, setScore] = useState<QuizScore>({ good: 0, bad: 0, skipped: 0 })
  const [saveError, setSaveError] = useState('')
  const [shortNotice, setShortNotice] = useState(stored?.shortNotice ?? '')
  const [moreError, setMoreError] = useState('')
  const [bankExhausted, setBankExhausted] = useState(stored?.unseenLeft === 0)
  const [moreBusy, setMoreBusy] = useState(false)
  const savingAttempt = useRef(false)

  const hasSession = hasPlayerSession()
  const q = questions[index]
  const isLast = index >= questions.length - 1

  // Back-forward cache can restore an old /play page after you started another topic.
  useEffect(() => {
    if (!hasSession) {
      window.location.replace('/')
      return
    }
    function onShow(e: PageTransitionEvent) {
      if (!hasPlayerSession()) {
        window.location.replace('/')
        return
      }
      if (!e.persisted) {
        return
      }
      const latest = readStoredRound()
      if (!latest) {
        return
      }
      setHeading({
        categoryName: latest.categoryName ?? '',
        topicName: latest.topicName ?? '',
        difficulty: latest.difficulty ?? '',
      })
      setQuestions(latest.questions)
      setAllQuestions(latest.allQuestions ?? latest.questions)
      setOutcomes(emptyOutcomes(latest.questions.length))
      setIndex(0)
      setShowOptions(false)
      setEliminated([])
      setAnswered(false)
      setScore({ good: 0, bad: 0, skipped: 0 })
      setShortNotice(latest.shortNotice ?? '')
      setMoreError('')
      setMoreBusy(false)
      setStatus('play')
    }
    window.addEventListener('pageshow', onShow)
    return () => window.removeEventListener('pageshow', onShow)
  }, [hasSession])

  function goNext() {
    if (isLast) {
      void finishRound(outcomes)
      return
    }
    setIndex((i) => i + 1)
    setShowOptions(false)
    setEliminated([])
    setAnswered(false)
  }

  function onSkip() {
    const nextOutcomes = outcomes.map((o, i) => (i === index ? { ...o, skipped: true } : o))
    setOutcomes(nextOutcomes)
    if (isLast) {
      void finishRound(nextOutcomes)
      return
    }
    setScore(tallyOutcomes(nextOutcomes))
    goNext()
  }

  function startReplay(list: QuizQuestion[], fullSet: QuizQuestion[]) {
    const latest = readStoredRound()
    const shuffled = shuffleList(list.map(shuffleOptions))
    const keptAll = fullSet.length ? fullSet : shuffled
    writeStoredRound({
      topicId: latest?.topicId,
      categoryId: latest?.categoryId,
      categoryName: latest?.categoryName ?? heading.categoryName,
      topicName: latest?.topicName ?? heading.topicName,
      difficulty: latest?.difficulty ?? heading.difficulty,
      questions: shuffled,
      allQuestions: keptAll,
      requestedCount: latest?.requestedCount,
      shortNotice: '',
      attemptSaved: false,
    })
    setSaveError('')
    setMoreError('')
    setShortNotice('')
    setQuestions(shuffled)
    setAllQuestions(keptAll)
    setOutcomes(emptyOutcomes(shuffled.length))
    setIndex(0)
    setShowOptions(false)
    setEliminated([])
    setAnswered(false)
    setScore({ good: 0, bad: 0, skipped: 0 })
    setStatus('play')
  }

  /** New draw of unseen questions. Same subject, difficulty, and original requested count. */
  async function drawMore(resetSeen: boolean) {
    const latest = readStoredRound()
    const topicId = latest?.topicId
    const difficulty = latest?.difficulty ?? heading.difficulty
    const requested = latest?.requestedCount ?? questions.length
    if (!topicId || !isPlayDifficulty(difficulty)) {
      setMoreError(strings.startFailed)
      return
    }
    if (resetSeen) {
      clearSeen(topicId)
    }
    setMoreBusy(true)
    setMoreError('')
    try {
      const data = await fetchQuizRound(topicId, requested, difficulty)
      if ('error' in data) {
        const exhausted = data.error === 'no_new_questions'
        setBankExhausted(exhausted)
        setMoreError(
          exhausted
            ? strings.replayBankHint
            : data.error === 'bank_too_small'
              ? fillText(strings.bankTooSmall, {
                  available: data.available ?? 0,
                  requested: data.requested ?? requested,
                })
              : strings.startFailed,
        )
        return
      }
      const left = unseenLeftAfterDraw(data.available, data.questions.length)
      const notice =
        data.questions.length < data.requested
          ? fillText(strings.roundShort, {
              count: data.questions.length,
              requested: data.requested,
            })
          : ''
      writeStoredRound({
        topicId,
        categoryId: latest?.categoryId,
        categoryName: latest?.categoryName ?? heading.categoryName,
        topicName: latest?.topicName ?? heading.topicName,
        difficulty,
        questions: data.questions,
        allQuestions: data.questions,
        requestedCount: data.requested,
        shortNotice: notice,
        attemptSaved: false,
        unseenLeft: left,
      })
      setBankExhausted(left === 0)
      setSaveError('')
      setShortNotice(notice)
      setQuestions(data.questions)
      setAllQuestions(data.questions)
      setOutcomes(emptyOutcomes(data.questions.length))
      setIndex(0)
      setShowOptions(false)
      setEliminated([])
      setAnswered(false)
      setScore({ good: 0, bad: 0, skipped: 0 })
      setStatus('play')
    } catch {
      setMoreError(strings.startFailed)
    } finally {
      setMoreBusy(false)
    }
  }

  function onMoreQuestions() {
    return drawMore(false)
  }

  function onReplayBank() {
    return drawMore(true)
  }

  function onRetryAll() {
    const latest = readStoredRound()
    const full = latest?.allQuestions?.length
      ? latest.allQuestions
      : allQuestions.length
        ? allQuestions
        : questions
    startReplay(full, full)
  }

  function onRetryFailed() {
    const failed = questions.filter((_, i) => outcomes[i]?.skipped || outcomes[i]?.missed)
    if (!failed.length) {
      return
    }
    const latest = readStoredRound()
    const full = latest?.allQuestions?.length
      ? latest.allQuestions
      : allQuestions.length
        ? allQuestions
        : questions
    startReplay(failed, full)
  }

  function onQuit() {
    window.location.assign('/')
  }

  function onDownloadCopy(forTeacher: boolean) {
    downloadQuizCopy({
      categoryName: heading.categoryName,
      topicName: heading.topicName,
      difficultyLabel: isPlayDifficulty(heading.difficulty) ? difficultyLabel(heading.difficulty) : '',
      questions,
      forTeacher,
    })
  }

  /** Persist this finished round once, then show the summary. */
  async function finishRound(finalOutcomes: QuestionOutcome[]) {
    const latest = readStoredRound()
    const finalScore = tallyOutcomes(finalOutcomes)
    setScore(finalScore)
    setStatus('summary')
    if (latest?.attemptSaved || savingAttempt.current) {
      return
    }
    const difficulty = latest?.difficulty ?? heading.difficulty
    if (!latest?.topicId || !isPlayDifficulty(difficulty)) {
      return
    }
    savingAttempt.current = true
    setSaveError('')
    const result = await recordFinishedAttempt({
      topicId: latest.topicId,
      categoryId: latest.categoryId ?? '',
      categoryName: latest.categoryName ?? heading.categoryName,
      topicName: latest.topicName ?? heading.topicName,
      difficulty,
      count: questions.length,
      good: finalScore.good,
      bad: finalScore.bad,
      skipped: finalScore.skipped,
    })
    if (result.error) {
      setSaveError(strings.myResultsSaveFailed)
      savingAttempt.current = false
      return
    }
    if (latest) {
      writeStoredRound({ ...latest, attemptSaved: true })
    }
    savingAttempt.current = false
  }

  function onPick(optionIndex: number) {
    if (!q || answered || eliminated.includes(optionIndex)) {
      return
    }
    if (optionIndex === q.correctIndex) {
      playSuccess()
      setAnswered(true)
      setShowOptions(true)
      return
    }
    playError()
    setOutcomes((prev) =>
      prev.map((o, i) => (i === index ? { ...o, missed: true } : o)),
    )
    setEliminated((prev) => [...prev, optionIndex])
  }

  return {
    hasSession,
    status,
    error,
    heading,
    questions,
    q,
    index,
    showOptions,
    eliminated,
    answered,
    score,
    saveError,
    shortNotice,
    moreError,
    bankExhausted,
    moreBusy,
    outcomes,
    onShowOptions: () => setShowOptions(true),
    onPick,
    onSkip,
    goNext,
    onQuit,
    onDownloadCopy,
    onMoreQuestions,
    onReplayBank,
    onRetryAll,
    onRetryFailed,
  }
}

export type PlayPageModel = ReturnType<typeof usePlayPage>
