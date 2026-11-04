import fs from 'node:fs'
import path from 'node:path'
import type { Difficulty, PlayDifficulty, QuizAttempt, QuizQuestion } from '../shared/types'

const attemptsFile = path.join(path.resolve(process.cwd(), 'data'), 'attempts.json')
const MAX_USER_ATTEMPTS = 50
const playDifficulties: PlayDifficulty[] = ['hard', 'medium', 'easy', 'children', 'all']
const levelOrder: Difficulty[] = ['hard', 'medium', 'easy', 'children']

/** all, one level, or a canonical mix such as hard,medium. */
function roundDifficultyKey(value?: string) {
  if (value === 'all' || (value && playDifficulties.includes(value as PlayDifficulty))) {
    return value
  }
  const parts = String(value ?? '').split(',')
  const levels = levelOrder.filter((d) => parts.includes(d))
  return levels.length >= 2 ? levels.join(',') : null
}

type StoredAttempt = QuizAttempt & { userId: string }

function readJson<T>(file: string, fallback: T): T {
  if (!fs.existsSync(file)) {
    return fallback
  }
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T
}

function writeJson(file: string, value: unknown) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function loadAttempts(): StoredAttempt[] {
  const raw = readJson<{ attempts?: unknown }>(attemptsFile, { attempts: [] })
  if (!Array.isArray(raw.attempts)) {
    return []
  }
  return raw.attempts.filter((row): row is StoredAttempt => {
    if (!row || typeof row !== 'object') {
      return false
    }
    const a = row as Partial<StoredAttempt>
    return Boolean(a.id && a.userId && a.topicId && a.finishedAt)
  })
}

function publicAttempt(row: StoredAttempt): QuizAttempt {
  const { userId: _userId, ...rest } = row
  return rest
}

const MAX_REPLAY = 500

/** Keep a replay payload only when every question is usable. Otherwise the score still saves. */
function parseReplay(questions: unknown, failed: unknown): Pick<QuizAttempt, 'questions' | 'failed'> | undefined {
  if (!Array.isArray(questions) || !Array.isArray(failed) || questions.length !== failed.length) {
    return undefined
  }
  if (questions.length < 1 || questions.length > MAX_REPLAY) {
    return undefined
  }
  const parsed: QuizQuestion[] = []
  const flags: boolean[] = []
  for (let i = 0; i < questions.length; i++) {
    const row = questions[i]
    if (!row || typeof row !== 'object') {
      return undefined
    }
    const q = row as Partial<QuizQuestion>
    const options = Array.isArray(q.options)
      ? q.options.filter((text): text is string => typeof text === 'string')
      : []
    const correctIndex = asInt(q.correctIndex, -1)
    if (
      typeof q.question !== 'string' ||
      !q.question.trim() ||
      options.length < 2 ||
      options.length > 20 ||
      correctIndex < 0 ||
      correctIndex >= options.length
    ) {
      return undefined
    }
    const next: QuizQuestion = {
      question: q.question.trim().slice(0, 2000),
      options: options.map((text) => text.trim().slice(0, 500)),
      correctIndex,
      explanation: typeof q.explanation === 'string' ? q.explanation.trim().slice(0, 4000) : '',
    }
    if (typeof q.sourceUrl === 'string' && q.sourceUrl.trim()) {
      next.sourceUrl = q.sourceUrl.trim().slice(0, 500)
    }
    if (q.difficulty && levelOrder.includes(q.difficulty)) {
      next.difficulty = q.difficulty
    }
    if (typeof q.publicCode === 'string' && q.publicCode.trim()) {
      next.publicCode = q.publicCode.trim().slice(0, 16)
    }
    parsed.push(next)
    flags.push(failed[i] === true)
  }
  return { questions: parsed, failed: flags }
}

function asInt(value: unknown, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback
}

/** Validate a finished-round body from the player. */
export function parseAttemptFields(body: {
  topicId?: string
  categoryId?: string
  categoryName?: string
  topicName?: string
  difficulty?: string
  count?: number
  good?: number
  bad?: number
  skipped?: number
  questions?: unknown
  failed?: unknown
}): { error: string } | Omit<QuizAttempt, 'id' | 'finishedAt'> {
  const topicId = String(body.topicId ?? '').trim()
  const categoryId = String(body.categoryId ?? '').trim()
  const categoryName = String(body.categoryName ?? '').trim()
  const topicName = String(body.topicName ?? '').trim()
  const difficulty = roundDifficultyKey(body.difficulty)
  const count = asInt(body.count)
  if (!topicId || !categoryName || !topicName || !difficulty || count < 1) {
    return { error: 'Invalid attempt' }
  }
  const replay = parseReplay(body.questions, body.failed)
  return {
    topicId,
    categoryId,
    categoryName,
    topicName,
    difficulty,
    count,
    good: asInt(body.good),
    bad: asInt(body.bad),
    skipped: asInt(body.skipped),
    ...(replay ?? {}),
  }
}

/** Newest first. */
export function listPlayerAttempts(userId: string): QuizAttempt[] {
  return loadAttempts()
    .filter((row) => row.userId === userId)
    .sort((a, b) => b.finishedAt.localeCompare(a.finishedAt))
    .map(publicAttempt)
}

export function deletePlayerAttempt(userId: string, id: string): boolean {
  const all = loadAttempts()
  const next = all.filter((row) => !(row.userId === userId && row.id === id))
  if (next.length === all.length) {
    return false
  }
  writeJson(attemptsFile, { attempts: next })
  return true
}

export function appendPlayerAttempt(
  userId: string,
  fields: Omit<QuizAttempt, 'id' | 'finishedAt'>,
): QuizAttempt {
  const row: StoredAttempt = {
    ...fields,
    id: crypto.randomUUID(),
    finishedAt: new Date().toISOString(),
    userId,
  }
  const others = loadAttempts().filter((a) => a.userId !== userId)
  const mine = [row, ...loadAttempts().filter((a) => a.userId === userId)].slice(0, MAX_USER_ATTEMPTS)
  writeJson(attemptsFile, { attempts: [...mine, ...others] })
  return publicAttempt(row)
}
