import type { AdminConfig, Difficulty } from '../../../shared/types'
import type { AdminCatalogLevel } from '../../catalogUi'
import { ADMIN_PLACE_KEY, type AdminPlace, type AdminTab } from './adminTypes'

export type ResolvedAdminPlace =
  | { kind: 'none' }
  | { kind: 'settings' }
  | { kind: 'users'; owner: { id: string; username: string } | null }
  | {
      kind: 'catalog'
      categoryId: string
      topicId: string
      level: AdminCatalogLevel
      difficulty: Difficulty
      loadQuestions: boolean
    }

export function readAdminPlace(): AdminPlace | null {
  let raw = ''
  try {
    raw = sessionStorage.getItem(ADMIN_PLACE_KEY) ?? ''
  } catch {
    return null
  }
  if (!raw) {
    return null
  }
  try {
    return JSON.parse(raw) as AdminPlace
  } catch {
    return null
  }
}

export function writeAdminPlace(place: {
  tab: AdminTab
  level: AdminCatalogLevel
  selectedCategoryId: string
  selectedTopicId: string
  selectedDifficulty: Difficulty
  catalogOwner: { id: string; username: string } | null
}) {
  sessionStorage.setItem(ADMIN_PLACE_KEY, JSON.stringify(place))
}

/** Drop saved drill-down so a new login starts at Categories. */
export function clearAdminPlace() {
  try {
    sessionStorage.removeItem(ADMIN_PLACE_KEY)
  } catch {
    /* ignore */
  }
}

/** Map a saved drill-down to a safe screen after reload. */
export function resolveAdminPlace(place: AdminPlace, data: AdminConfig): ResolvedAdminPlace {
  if (place.tab === 'settings') {
    return { kind: 'settings' }
  }
  if (place.tab === 'users') {
    const owner = place.catalogOwner
    if (owner?.id && owner.username) {
      return { kind: 'users', owner: { id: owner.id, username: owner.username } }
    }
    return { kind: 'users', owner: null }
  }
  const catId = place.selectedCategoryId ?? ''
  const topicId = place.selectedTopicId ?? ''
  const catOk = Boolean(catId && data.categories.some((c) => c.id === catId))
  const topicOk = Boolean(
    topicId && data.topics.some((t) => t.id === topicId && t.categoryId === catId),
  )
  let nextLevel: AdminCatalogLevel = place.level ?? 'categories'
  if (nextLevel === 'confirm-remove-topic') {
    nextLevel = catOk ? 'subjects' : 'categories'
  }
  if (nextLevel === 'edit-subject' || nextLevel === 'new-subject' || nextLevel === 'confirm-clear-questions') {
    nextLevel = topicOk ? 'questions' : 'subjects'
  }
  if (nextLevel === 'edit-question' || nextLevel === 'confirm-remove-question') {
    nextLevel = topicOk ? 'question-list' : 'questions'
  }
  if (
    nextLevel === 'new-category' ||
    nextLevel === 'rename-category' ||
    nextLevel === 'confirm-remove-category'
  ) {
    nextLevel = 'categories'
  }
  if (nextLevel === 'question-list' && !topicOk) {
    nextLevel = catOk ? 'subjects' : 'categories'
  }
  if (nextLevel === 'questions' && !topicOk) {
    nextLevel = catOk ? 'subjects' : 'categories'
  }
  if (nextLevel === 'subjects' && !catOk) {
    nextLevel = 'categories'
  }
  const difficulty: Difficulty =
    place.selectedDifficulty &&
    ['hard', 'medium', 'easy', 'children'].includes(place.selectedDifficulty)
      ? (place.selectedDifficulty as Difficulty)
      : 'medium'
  return {
    kind: 'catalog',
    categoryId: catOk ? catId : '',
    topicId: topicOk ? topicId : '',
    level: nextLevel,
    difficulty,
    loadQuestions: nextLevel === 'question-list' && topicOk,
  }
}
