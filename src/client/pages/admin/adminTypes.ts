import type { AdminCatalogLevel } from '../../catalogUi'

export type AdminTab = 'categories' | 'users' | 'settings'
export type SettingsPage = 'list' | 'ai' | 'log'

/** Remember where Admin was drilling down (survives a remount after a long Generate). Cleared on login and logout. */
export const ADMIN_PLACE_KEY = 'tiddeli-admin-place'

export type AdminPlace = {
  tab?: AdminTab
  level?: AdminCatalogLevel
  selectedCategoryId?: string
  selectedTopicId?: string
  selectedDifficulty?: string
  catalogOwner?: { id: string; username: string } | null
}
