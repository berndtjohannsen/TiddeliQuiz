import type { BankCount, Category, Difficulty, SourceFocus, Topic } from '../shared/types'
import { strings } from './strings'

export const inputClass = 'rounded bg-slate-800 p-2'
/** One main action per screen: OK, Save, Generate all, Log in. */
export const btnClass = 'rounded bg-sky-600 px-4 py-2 font-medium'
/** Other buttons: Cancel, Back, Add, Generate one, Logout. */
export const btnSecondary = 'rounded bg-slate-700 px-4 py-2 font-medium'
/** Open or go to another screen from a list/header (not breadcrumbs). */
export const btnLink = 'px-2 py-1 text-sm text-sky-400 hover:text-sky-300'
/** Ask to delete. The confirm popup uses a solid red button. */
export const btnDangerText = 'px-2 py-1 text-sm text-red-400 hover:text-red-300'
export const btnDanger = 'rounded bg-red-700 px-4 py-2 font-medium'

/** Folder screens shared by Admin and Mina kategorier. */
export type FolderLevel =
  | 'categories'
  | 'new-category'
  | 'rename-category'
  | 'confirm-remove-category'
  | 'confirm-remove-topic'
  | 'subjects'
  | 'new-subject'
  | 'edit-subject'
  | 'questions'
  | 'question-list'
  | 'confirm-remove-question'
  | 'confirm-clear-questions'

export type AdminCatalogLevel = FolderLevel | 'edit-question'

export const bankDifficulties: { id: Difficulty; label: string }[] = [
  { id: 'hard', label: strings.difficultyHard },
  { id: 'medium', label: strings.difficultyMedium },
  { id: 'easy', label: strings.difficultyEasy },
  { id: 'children', label: strings.difficultyChildren },
]

/** Same prompt shape as the first subjects, with the topic name as the subject. */
export function suggestedPrompt(topic: string, sourceUrl?: string) {
  const subject = topic.trim() || 'ämnet'
  const base = `Skapa {count} quizfrågor på svenska om ${subject}. Svårighetsgrad: {difficulty}. Varje fråga ska ha {optionCount} korta svarsalternativ och en mening som förklaring.`
  if (sourceUrl?.trim()) {
    return `${base} Utgå från källan som anges separat.`
  }
  return `${base} Wikipedia: bara artikelnamn, ingen URL.`
}

/** Fields sent when creating or updating a subject. */
export function topicApiFields(topic: Topic, prompt = topic.prompt.trim()) {
  const sourceUrl = topic.sourceUrl?.trim() ?? ''
  return {
    name: topic.name.trim(),
    optionCount: topic.optionCount,
    prompt,
    sourceUrl,
    sourceFocus: (sourceUrl && topic.sourceFocus === 'only' ? 'only' : 'mainly') as SourceFocus,
  }
}

export function isDraft(id: string) {
  return id.startsWith('draft-')
}

export function emptyCategory(kind: 'platform' | 'user' = 'platform'): Category {
  const row: Category = { id: `draft-${crypto.randomUUID()}`, name: '' }
  if (kind === 'user') {
    row.ownerType = 'user'
  }
  return row
}

export function emptyTopic(categoryId: string): Topic {
  return { id: `draft-${crypto.randomUUID()}`, categoryId, name: '', optionCount: 4, prompt: '' }
}

export function fillText(template: string, values: Record<string, string | number>) {
  let text = template
  for (const [key, value] of Object.entries(values)) {
    text = text.replaceAll(`{${key}}`, String(value))
  }
  return text
}

export function topicCountIn(topics: Topic[], categoryId: string) {
  return topics.filter((t) => t.categoryId === categoryId).length
}

export function bankCountIn(counts: BankCount[] | undefined, topicId: string, difficulty: Difficulty) {
  return counts?.find((c) => c.topicId === topicId && c.difficulty === difficulty)?.count ?? 0
}

export function bankCountForTopic(counts: BankCount[] | undefined, topicId: string) {
  return bankDifficulties.reduce((sum, d) => sum + bankCountIn(counts, topicId, d.id), 0)
}

export function bankCountForCategory(counts: BankCount[] | undefined, topics: Topic[], categoryId: string) {
  return topics
    .filter((t) => t.categoryId === categoryId)
    .reduce((sum, t) => sum + bankCountForTopic(counts, t.id), 0)
}

export function difficultyLabel(id: Difficulty) {
  return bankDifficulties.find((d) => d.id === id)?.label ?? id
}

/** Keep the auto prompt in sync while the name still matches the suggestion. */
export function withSuggestedPrompt(topic: Topic, patch: Partial<Topic>): Topic {
  const next = { ...topic, ...patch }
  if (patch.sourceUrl !== undefined) {
    const url = patch.sourceUrl.trim()
    if (url) {
      next.sourceUrl = url
      next.sourceFocus = patch.sourceFocus ?? topic.sourceFocus ?? 'mainly'
    } else {
      delete next.sourceUrl
      delete next.sourceFocus
    }
  }
  const stillSuggested = !topic.prompt || topic.prompt === suggestedPrompt(topic.name, topic.sourceUrl)
  if (stillSuggested && (patch.name !== undefined || patch.sourceUrl !== undefined)) {
    const name = next.name.trim()
    next.prompt = name ? suggestedPrompt(name, next.sourceUrl) : ''
  }
  return next
}

/** One catalog row change. Caller shows the error or success text. */
export async function catalogRequest<T>(
  base: string,
  method: string,
  path: string,
  body?: unknown,
  errorFallback = 'Request failed',
): Promise<{ data: T } | { error: string }> {
  const res = await fetch(`${base}${path}`, {
    method,
    credentials: 'include',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!res.ok) {
    const data = (await res.json()) as { error?: string }
    return { error: data.error ?? errorFallback }
  }
  return { data: (await res.json()) as T }
}
