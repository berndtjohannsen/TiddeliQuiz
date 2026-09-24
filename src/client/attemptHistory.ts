import type { QuizAttempt } from '../shared/types'
import { newId } from './catalogShared'
import { SESSION_KEY } from './playerSession'

const GUEST_KEY = 'tiddeli-guest-attempts'
const MAX_GUEST = 20

export function isLoggedInPlayer() {
  return Boolean(sessionStorage.getItem(SESSION_KEY)?.startsWith('user:'))
}

function readGuestAttempts(): QuizAttempt[] {
  try {
    const raw = localStorage.getItem(GUEST_KEY)
    const parsed = raw ? (JSON.parse(raw) as { attempts?: QuizAttempt[] }) : null
    return Array.isArray(parsed?.attempts) ? parsed.attempts : []
  } catch {
    return []
  }
}

function writeGuestAttempts(attempts: QuizAttempt[]) {
  try {
    localStorage.setItem(GUEST_KEY, JSON.stringify({ attempts }))
  } catch {
    // Private mode can block localStorage.
  }
}

/** Guest history stays in this browser. Log out does not clear it. */
export function listGuestAttempts(): QuizAttempt[] {
  return readGuestAttempts().slice().sort((a, b) => b.finishedAt.localeCompare(a.finishedAt))
}

export function appendGuestAttempt(fields: Omit<QuizAttempt, 'id' | 'finishedAt'>): QuizAttempt {
  const row: QuizAttempt = {
    ...fields,
    id: newId(),
    finishedAt: new Date().toISOString(),
  }
  writeGuestAttempts([row, ...readGuestAttempts()].slice(0, MAX_GUEST))
  return row
}

/** Logged-in: server. Guest: localStorage. */
export async function recordFinishedAttempt(
  fields: Omit<QuizAttempt, 'id' | 'finishedAt'>,
): Promise<{ error?: string }> {
  if (!isLoggedInPlayer()) {
    appendGuestAttempt(fields)
    return {}
  }
  const res = await fetch('/api/player/attempts', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  })
  if (!res.ok) {
    const data = (await res.json()) as { error?: string }
    return { error: data.error ?? 'save failed' }
  }
  return {}
}

export async function loadAttemptHistory(): Promise<QuizAttempt[]> {
  if (!isLoggedInPlayer()) {
    return listGuestAttempts()
  }
  const res = await fetch('/api/player/attempts', { credentials: 'include' })
  if (!res.ok) {
    return []
  }
  const data = (await res.json()) as { attempts?: QuizAttempt[] }
  return Array.isArray(data.attempts) ? data.attempts : []
}
