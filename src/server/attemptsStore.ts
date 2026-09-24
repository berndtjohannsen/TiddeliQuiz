import fs from 'node:fs'
import path from 'node:path'
import type { PlayDifficulty, QuizAttempt } from '../shared/types'

const attemptsFile = path.join(path.resolve(process.cwd(), 'data'), 'attempts.json')
const MAX_USER_ATTEMPTS = 50
const playDifficulties: PlayDifficulty[] = ['hard', 'medium', 'easy', 'children', 'all']

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
}): { error: string } | Omit<QuizAttempt, 'id' | 'finishedAt'> {
  const topicId = String(body.topicId ?? '').trim()
  const categoryId = String(body.categoryId ?? '').trim()
  const categoryName = String(body.categoryName ?? '').trim()
  const topicName = String(body.topicName ?? '').trim()
  const difficulty = playDifficulties.includes(body.difficulty as PlayDifficulty)
    ? (body.difficulty as PlayDifficulty)
    : null
  const count = asInt(body.count)
  if (!topicId || !categoryName || !topicName || !difficulty || count < 1) {
    return { error: 'Invalid attempt' }
  }
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
  }
}

/** Newest first. */
export function listPlayerAttempts(userId: string): QuizAttempt[] {
  return loadAttempts()
    .filter((row) => row.userId === userId)
    .sort((a, b) => b.finishedAt.localeCompare(a.finishedAt))
    .map(publicAttempt)
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
