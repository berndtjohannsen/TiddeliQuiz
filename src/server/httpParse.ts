import type { Context } from 'hono'
import type { Difficulty } from '../shared/types'
import { loadBankCounts, loadBankCountsForUser, type CatalogOwner } from './store'

export const difficulties: Difficulty[] = ['hard', 'medium', 'easy', 'children']

export function parseCategoryName(body: { name?: string }): { error: 'Each category needs a name' } | { name: string } {
  const name = String(body.name ?? '').trim()
  if (!name) {
    return { error: 'Each category needs a name' }
  }
  return { name }
}

export type TopicFields = {
  name: string
  optionCount: number
  prompt: string
  sourceUrl?: string
  sourceFocus?: string
}

/** Empty source is fine. A filled source must be http(s). */
export function parseSourceUrl(raw: unknown): { error: string } | { sourceUrl?: string } {
  const sourceUrl = String(raw ?? '').trim()
  if (!sourceUrl) {
    return {}
  }
  try {
    const url = new URL(sourceUrl)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return { error: 'Source must be an http(s) URL' }
    }
    return { sourceUrl: url.toString() }
  } catch {
    return { error: 'Source must be an http(s) URL' }
  }
}

export function parseTopicFields(
  body: { name?: string; optionCount?: number; prompt?: string; sourceUrl?: string; sourceFocus?: string },
): { error: string } | TopicFields {
  const name = String(body.name ?? '').trim()
  const prompt = String(body.prompt ?? '').trim()
  const optionCount = Math.max(2, Number(body.optionCount) || 4)
  if (!name || !prompt) {
    return { error: 'Each topic needs a name and a prompt' }
  }
  const source = parseSourceUrl(body.sourceUrl)
  if ('error' in source) {
    return source
  }
  return {
    name,
    optionCount,
    prompt,
    sourceUrl: source.sourceUrl,
    sourceFocus: body.sourceFocus,
  }
}

export function parseTopicBody(body: {
  categoryId?: string
  name?: string
  optionCount?: number
  prompt?: string
  sourceUrl?: string
  sourceFocus?: string
}): { error: string } | (TopicFields & { categoryId: string }) {
  const fields = parseTopicFields(body)
  if ('error' in fields) {
    return fields
  }
  const categoryId = String(body.categoryId ?? '')
  if (!categoryId) {
    return { error: 'Each topic needs a category' }
  }
  return { categoryId, ...fields }
}

export function countsForOwner(owner: CatalogOwner) {
  return owner.kind === 'user' ? loadBankCountsForUser(owner.userId) : loadBankCounts()
}

export function catalogErrorStatus(error: 'empty' | 'invalid' | 'not_found') {
  return error === 'not_found' ? (404 as const) : (400 as const)
}

export function catalogErrorMessage(error: 'empty' | 'invalid' | 'not_found') {
  if (error === 'empty') {
    return 'Each category needs a name'
  }
  if (error === 'invalid') {
    return 'Each topic needs a name and a prompt'
  }
  return 'Unknown category or subject'
}

export function catalogFail(c: Context, error: 'empty' | 'invalid' | 'not_found') {
  return c.json({ error: catalogErrorMessage(error) }, catalogErrorStatus(error))
}

export type CatalogAuth = { owner: CatalogOwner; who: string } | { error: string; status: 401 | 404 }

export function routeParam(c: Context, name: string) {
  return String(c.req.param(name) ?? '')
}

export function withCatalogAuth(
  resolve: (c: Context) => CatalogAuth,
  handler: (c: Context, owner: CatalogOwner, who: string) => Response | Promise<Response>,
) {
  return (c: Context) => {
    const gate = resolve(c)
    if ('error' in gate) {
      return c.json({ error: gate.error }, gate.status)
    }
    return handler(c, gate.owner, gate.who)
  }
}

export function parseDifficultyList(raw: unknown): Difficulty[] {
  if (!Array.isArray(raw)) {
    return [...difficulties]
  }
  return [...new Set(raw.filter((id): id is Difficulty => difficulties.includes(id as Difficulty)))]
}

export function parseGenerateBody(body: {
  topicId?: string
  difficulty?: string
  count?: number
  difficulties?: unknown
}) {
  const difficulty = difficulties.includes(body.difficulty as Difficulty)
    ? (body.difficulty as Difficulty)
    : 'medium'
  const rawCount = Number(body.count)
  const stepped = Math.round((Number.isFinite(rawCount) ? rawCount : 10) / 5) * 5
  const count = Math.min(20, Math.max(5, stepped))
  return {
    topicId: String(body.topicId ?? ''),
    difficulty,
    count,
    difficulties: parseDifficultyList(body.difficulties),
  }
}

export function parseQuestionIds(body: { ids?: unknown }): string[] {
  if (!Array.isArray(body.ids)) {
    return []
  }
  return [...new Set(body.ids.map((id) => String(id ?? '').trim()).filter(Boolean))]
}

export function parseOptionalDifficulty(raw: unknown): Difficulty | undefined {
  return difficulties.includes(raw as Difficulty) ? (raw as Difficulty) : undefined
}

export function bankCountsForQuestion(ownerType: string | undefined, ownerId: string | undefined) {
  if (ownerType === 'user' && ownerId) {
    return loadBankCountsForUser(ownerId)
  }
  return loadBankCounts()
}
