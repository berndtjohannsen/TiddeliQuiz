import type { Category, Difficulty, QuizQuestion, QuizScore } from '../shared/types'
import { strings } from './strings'

/** Browser store so /play does not call the AI again on reload. */
export const ROUND_KEY = 'tiddeli-quiz-round'
/** guest | user:name | legacy 1. Cleared on Log out. */
export const SESSION_KEY = 'tiddeli-player'
/** Recent question texts this session, per topic. Cleared on log out. */
export const SEEN_KEY = 'tiddeli-seen-questions'
const SEEN_MAX = 40

/** Round size steps. Guest dropdowns only list values the bank can fill. */
export const COUNT_CHOICES = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50]
export const DIFFICULTY_ORDER: Difficulty[] = ['hard', 'medium', 'easy', 'children']

export function isDifficulty(value?: string): value is Difficulty {
  return value === 'hard' || value === 'medium' || value === 'easy' || value === 'children'
}

export type PlayerSession = { role: 'guest' | 'user'; username: string }

/** Right only if the first pick was correct. Skip counts separately. */
export type QuestionOutcome = { missed: boolean; skipped: boolean }

export type StoredRound = {
  topicId?: string
  categoryId?: string
  categoryName?: string
  topicName?: string
  difficulty?: string
  questions: QuizQuestion[]
  /** Full generated set. Retry (all) uses this after a failed-only replay. */
  allQuestions?: QuizQuestion[]
  /** Original requested length. Fler frågor asks for this, not the short-round size. */
  requestedCount?: number
  /** Shown when the bank had fewer unseen questions than requested. */
  shortNotice?: string
  /** Set after the summary is saved so a remount does not write twice. */
  attemptSaved?: boolean
}

export function emptyOutcomes(count: number): QuestionOutcome[] {
  return Array.from({ length: count }, () => ({ missed: false, skipped: false }))
}

/** One tally per question: right only if never missed and never skipped. */
export function tallyOutcomes(rows: QuestionOutcome[]): QuizScore {
  let good = 0
  let bad = 0
  let skipped = 0
  for (const row of rows) {
    if (row.skipped) {
      skipped += 1
    } else if (row.missed) {
      bad += 1
    } else {
      good += 1
    }
  }
  return { good, bad, skipped }
}

/** Questions saved after Start. Missing after a fresh tab or cleared storage. */
export function readStoredRound(): StoredRound | null {
  try {
    const raw = sessionStorage.getItem(ROUND_KEY)
    const data = raw
      ? (JSON.parse(raw) as StoredRound & { domainId?: string })
      : null
    if (!data?.questions?.length) {
      return null
    }
    return {
      topicId: data.topicId ?? data.domainId,
      categoryId: data.categoryId,
      categoryName: data.categoryName,
      topicName: data.topicName,
      difficulty: data.difficulty,
      questions: data.questions,
      allQuestions: data.allQuestions?.length ? data.allQuestions : data.questions,
      requestedCount: data.requestedCount,
      shortNotice: data.shortNotice ?? '',
      attemptSaved: data.attemptSaved === true,
    }
  } catch {
    return null
  }
}

export function writeStoredRound(round: StoredRound) {
  sessionStorage.setItem(ROUND_KEY, JSON.stringify(round))
}

export function readPlayerSession(): PlayerSession | null {
  const raw = sessionStorage.getItem(SESSION_KEY)
  if (raw === '1' || raw === 'guest') {
    return { role: 'guest', username: '' }
  }
  if (raw?.startsWith('user:')) {
    return { role: 'user', username: raw.slice(5) }
  }
  return null
}

export function hasPlayerSession() {
  const raw = sessionStorage.getItem(SESSION_KEY)
  return raw === '1' || raw === 'guest' || Boolean(raw?.startsWith('user:'))
}

export function writePlayerSession(next: PlayerSession) {
  sessionStorage.setItem(SESSION_KEY, next.role === 'user' ? `user:${next.username}` : 'guest')
}

export function readSeen(topicId: string): string[] {
  try {
    const raw = sessionStorage.getItem(SEEN_KEY)
    const all = raw ? (JSON.parse(raw) as Record<string, string[]>) : {}
    return Array.isArray(all[topicId]) ? all[topicId] : []
  } catch {
    return []
  }
}

export function rememberSeen(topicId: string, questions: QuizQuestion[]) {
  const extra = questions.map((q) => q.question.trim()).filter(Boolean)
  if (!extra.length) {
    return
  }
  let all: Record<string, string[]> = {}
  try {
    const raw = sessionStorage.getItem(SEEN_KEY)
    all = raw ? (JSON.parse(raw) as Record<string, string[]>) : {}
  } catch {
    all = {}
  }
  const prev = Array.isArray(all[topicId]) ? all[topicId] : []
  const seen = new Set(prev.map((q) => q.toLowerCase()))
  const next = [...prev]
  for (const q of extra) {
    const key = q.toLowerCase()
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    next.push(q)
  }
  all[topicId] = next.slice(-SEEN_MAX)
  sessionStorage.setItem(SEEN_KEY, JSON.stringify(all))
}

/** Clears play session only. Guest results in localStorage stay. */
export function clearPlayerContext() {
  sessionStorage.removeItem(SESSION_KEY)
  sessionStorage.removeItem(SEEN_KEY)
  sessionStorage.removeItem(ROUND_KEY)
}

export function isPrivateCategory(c: Pick<Category, 'ownerType'>) {
  return c.ownerType === 'user'
}

export function bankAvailable(counts: { topicId: string; difficulty: Difficulty; count: number }[], topicId: string, difficulty: Difficulty) {
  return counts.find((row) => row.topicId === topicId && row.difficulty === difficulty)?.count ?? 0
}

export type QuizStartResult =
  | { questions: QuizQuestion[]; requested: number; available: number }
  | { error: string; available?: number; requested?: number }

/** Draw a round from the bank. Unseen questions only; may be shorter than requested. */
export async function fetchQuizRound(
  topicId: string,
  count: number,
  difficulty: Difficulty,
  signal?: AbortSignal,
): Promise<QuizStartResult> {
  const res = await fetch('/api/quiz/start', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      topicId,
      count,
      difficulty,
      exclude: readSeen(topicId),
    }),
  })
  const data = (await res.json()) as {
    questions?: QuizQuestion[]
    error?: string
    available?: number
    requested?: number
  }
  if (!res.ok || !data.questions?.length) {
    return {
      error: data.error ?? 'start_failed',
      available: data.available,
      requested: data.requested ?? count,
    }
  }
  rememberSeen(topicId, data.questions)
  return {
    questions: data.questions,
    requested: data.requested ?? count,
    available: data.available ?? data.questions.length,
  }
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function copyFileSlug(text: string) {
  return (
    text
      .toLowerCase()
      .replace(/[åä]/g, 'a')
      .replace(/ö/g, 'o')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'quiz'
  )
}

/** Standalone HTML question sheet. Teacher copy marks the correct option. */
function buildQuizCopyHtml(opts: {
  categoryName: string
  topicName: string
  difficultyLabel: string
  questions: QuizQuestion[]
  forTeacher: boolean
}) {
  const subject = [opts.categoryName, opts.topicName].filter(Boolean).join(' / ') || strings.appName
  const when = new Date().toLocaleString('sv-SE')
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const questions = opts.questions
    .map((q, i) => {
      const options = `<ul class="opts">
${q.options
  .map((opt, n) => {
    const mark =
      opts.forTeacher && n === q.correctIndex
        ? ` <strong>(${strings.good.toLowerCase()})</strong>`
        : ''
    return `            <li>${letters[n] ?? n + 1}. ${escapeHtml(opt)}${mark}</li>`
  })
  .join('\n')}
          </ul>`
      return `        <section>
          <h2>${i + 1}. ${escapeHtml(q.question)}</h2>
          ${options}
        </section>`
    })
    .join('\n')
  const teacherNote = opts.forTeacher
    ? `\n    <p class="meta">${escapeHtml(strings.downloadTeacher)}</p>`
    : ''
  return `<!DOCTYPE html>
<html lang="sv">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(subject)}</title>
    <style>
      body { font-family: Georgia, serif; max-width: 44rem; margin: 1.5rem auto; padding: 0 1rem; color: #111; }
      h1 { font-size: 1.4rem; margin-bottom: 0.2rem; }
      .meta { color: #333; font-size: 0.95rem; }
      section { break-inside: avoid; margin: 1.4rem 0; padding-top: 0.6rem; border-top: 1px solid #ccc; }
      h2 { font-size: 1.05rem; margin: 0 0 0.5rem; }
      .opts { margin: 0.4rem 0 0.6rem 0; padding-left: 0; list-style: none; }
      .opts li { margin: 0.25rem 0; }
      @media print { body { margin: 0; } }
    </style>
  </head>
  <body>
    <h1>${escapeHtml(subject)}</h1>
    <p class="meta">${escapeHtml(opts.difficultyLabel)} · ${escapeHtml(when)}</p>${teacherNote}
${questions}
  </body>
</html>
`
}

/** Save a printable HTML copy of the finished round. */
export function downloadQuizCopy(opts: {
  categoryName: string
  topicName: string
  difficultyLabel: string
  questions: QuizQuestion[]
  forTeacher: boolean
}) {
  const html = buildQuizCopyHtml(opts)
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const subject = copyFileSlug(opts.topicName || opts.categoryName || 'quiz')
  const kind = opts.forTeacher ? 'larare' : 'elever'
  const a = document.createElement('a')
  a.href = url
  a.download = `tiddeli-${subject}-${kind}.html`
  a.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
