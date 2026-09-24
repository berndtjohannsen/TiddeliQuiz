import { useEffect, useState, type FormEvent } from 'react'
import type { AdminConfig, BankCount, Category, PlayerPublic, Topic } from '../../../shared/types'
import { strings } from '../../strings'
import type { AdminCatalogLevel } from '../../catalogUi'
import { type AdminTab, type SettingsPage } from './adminTypes'
import { readAdminPlace, resolveAdminPlace, writeAdminPlace, clearAdminPlace } from './adminPlace'
import { useAdminBank } from './useAdminBank'
import { useAdminFolders } from './useAdminFolders'

export type { AdminTab, SettingsPage } from './adminTypes'

/** Admin session, catalog, generate, and question editor. */
export function useAdminPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loggedIn, setLoggedIn] = useState(false)
  const [config, setConfig] = useState<AdminConfig | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [logLines, setLogLines] = useState<string[]>([])
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [tab, setTab] = useState<AdminTab>('categories')
  const [catalogOwner, setCatalogOwner] = useState<PlayerPublic | null>(null)
  const [playerUsers, setPlayerUsers] = useState<PlayerPublic[]>([])
  const [level, setLevel] = useState<AdminCatalogLevel>('categories')
  const [selectedCategoryId, setSelectedCategoryId] = useState('')
  const [selectedTopicId, setSelectedTopicId] = useState('')
  const [query, setQuery] = useState('')
  const [renameDraft, setRenameDraft] = useState('')
  const [settingsPage, setSettingsPage] = useState<SettingsPage>('list')

  const bank = useAdminBank({
    catalogOwner,
    selectedTopicId,
    setConfig,
    setError,
    setMessage,
    setLevel,
    setQuery,
    query,
    level,
    getBankCounts: () => config?.bankCounts ?? [],
  })

  async function loadPlayerUsers() {
    const res = await fetch('/api/admin/users', { credentials: 'include' })
    if (!res.ok) {
      return
    }
    const data = (await res.json()) as { users?: PlayerPublic[] }
    setPlayerUsers(data.users ?? [])
  }

  async function fetchOwnerCatalog(user: PlayerPublic) {
    const res = await fetch(`/api/admin/users/${encodeURIComponent(user.id)}/catalog`, {
      credentials: 'include',
    })
    if (!res.ok) {
      setError(strings.loadFailed)
      return false
    }
    const data = (await res.json()) as {
      categories?: Category[]
      topics?: Topic[]
      bankCounts?: BankCount[]
    }
    setConfig((current) =>
      current
        ? {
            ...current,
            categories: data.categories ?? [],
            topics: data.topics ?? [],
            bankCounts: data.bankCounts ?? [],
          }
        : current,
    )
    return true
  }

  async function openUserCatalog(user: PlayerPublic) {
    const ok = await fetchOwnerCatalog(user)
    if (!ok) {
      return
    }
    setCatalogOwner(user)
    setSelectedCategoryId('')
    setSelectedTopicId('')
    setQuery('')
    setLevel('categories')
    setError('')
    bank.resetBank()
    setTab('users')
  }

  async function closeUserCatalog() {
    setCatalogOwner(null)
    setSelectedCategoryId('')
    setSelectedTopicId('')
    setQuery('')
    setLevel('categories')
    setError('')
    bank.resetBank()
    await loadConfig()
  }

  async function reloadActiveCatalog() {
    if (catalogOwner) {
      await fetchOwnerCatalog(catalogOwner)
      return
    }
    await loadConfig()
  }

  function restoreAdminPlace(data: AdminConfig) {
    const place = readAdminPlace()
    if (!place) {
      return
    }
    const resolved = resolveAdminPlace(place, data)
    if (resolved.kind === 'settings') {
      setTab('settings')
      return
    }
    if (resolved.kind === 'users') {
      setTab('users')
      if (resolved.owner) {
        void openUserCatalog(resolved.owner)
      }
      return
    }
    if (resolved.kind !== 'catalog') {
      return
    }
    setTab('categories')
    setSelectedCategoryId(resolved.categoryId)
    setSelectedTopicId(resolved.topicId)
    bank.setSelectedDifficulty(resolved.difficulty)
    setLevel(resolved.level)
    if (resolved.loadQuestions) {
      void bank.fetchBankQuestions(resolved.topicId, resolved.difficulty)
    }
  }

  async function loadConfig(opts?: { restorePlace?: boolean }) {
    const res = await fetch('/api/admin/config', { credentials: 'include' })
    if (res.status === 401) {
      setLoggedIn(false)
      setConfig(null)
      return
    }
    if (!res.ok) {
      setError(strings.loadFailed)
      return
    }
    const data = (await res.json()) as AdminConfig
    setConfig({ ...data, bankCounts: data.bankCounts ?? [] })
    setLoggedIn(true)
    setApiKey('')
    if (opts?.restorePlace) {
      restoreAdminPlace(data)
    }
    void loadPlayerUsers()
  }

  async function loadLog() {
    const res = await fetch('/api/admin/log', { credentials: 'include' })
    if (!res.ok) {
      return
    }
    const data = (await res.json()) as { lines: string[] }
    setLogLines(data.lines)
  }

  const folders = useAdminFolders({
    config,
    setConfig,
    catalogOwner,
    selectedCategoryId,
    setSelectedCategoryId,
    selectedTopicId,
    setSelectedTopicId,
    setLevel,
    query,
    setQuery,
    level,
    renameDraft,
    setRenameDraft,
    setError,
    setMessage,
    resetBank: bank.resetBank,
    reloadActiveCatalog,
  })

  useEffect(() => {
    void loadConfig({ restorePlace: true })
  }, [])

  useEffect(() => {
    if (!loggedIn) {
      return
    }
    writeAdminPlace({
      tab,
      level,
      selectedCategoryId,
      selectedTopicId,
      selectedDifficulty: bank.selectedDifficulty,
      catalogOwner,
    })
  }, [loggedIn, tab, level, selectedCategoryId, selectedTopicId, bank.selectedDifficulty, catalogOwner])

  useEffect(() => {
    if (!loggedIn) {
      return
    }
    let cancelled = false
    async function tick() {
      if (document.hidden) {
        return
      }
      const res = await fetch('/api/admin/log', { credentials: 'include' })
      if (!res.ok || cancelled) {
        return
      }
      const data = (await res.json()) as { lines: string[] }
      if (!cancelled) {
        setLogLines(data.lines)
      }
    }
    void tick()
    const id = window.setInterval(() => void tick(), 2000)
    const onVisible = () => {
      if (!document.hidden) {
        void tick()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [loggedIn])

  async function onLogin(e: FormEvent) {
    e.preventDefault()
    setError('')
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    if (!res.ok) {
      setError(strings.loginFailed)
      return
    }
    setPassword('')
    clearAdminPlace()
    setTab('categories')
    setCatalogOwner(null)
    setSelectedCategoryId('')
    setSelectedTopicId('')
    setQuery('')
    setRenameDraft('')
    setSettingsPage('list')
    setLevel('categories')
    setMessage('')
    bank.resetBank()
    await loadConfig()
    await loadLog()
  }

  async function onLogout() {
    clearAdminPlace()
    await fetch('/api/admin/logout', { method: 'POST', credentials: 'include' })
    window.location.assign('/')
  }

  async function onSaveAi(e: FormEvent) {
    e.preventDefault()
    if (!config) {
      return
    }
    setError('')
    const res = await fetch('/api/admin/ai', {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...config.ai,
        apiKey,
      }),
    })
    if (!res.ok) {
      setError(strings.loadFailed)
      return
    }
    const data = (await res.json()) as { ai: AdminConfig['ai'] }
    setConfig({ ...config, ai: data.ai })
    setApiKey('')
    setMessage(strings.saved)
  }

  async function onSaveLogLevel(e: FormEvent) {
    e.preventDefault()
    if (!config) {
      return
    }
    setError('')
    const res = await fetch('/api/admin/log-level', {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ logLevel: config.logLevel }),
    })
    if (!res.ok) {
      setError(strings.loadFailed)
      return
    }
    const data = (await res.json()) as { logLevel: AdminConfig['logLevel'] }
    setConfig({ ...config, logLevel: data.logLevel })
    setMessage(strings.saved)
    await loadLog()
  }

  function patchAi(patch: Partial<AdminConfig['ai']>) {
    if (!config) {
      return
    }
    setConfig({ ...config, ai: { ...config.ai, ...patch } })
  }

  function onAdminTab(id: AdminTab) {
    if (id === 'categories' && tab === 'categories') {
      folders.goContentHome()
      return
    }
    if (id === 'users' && tab === 'users') {
      if (catalogOwner) {
        void closeUserCatalog()
      }
      return
    }
    if (id === 'settings' && tab === 'settings') {
      setSettingsPage('list')
      setError('')
      return
    }
    if (id === 'categories' && catalogOwner) {
      void closeUserCatalog().then(() => {
        setTab('categories')
      })
      return
    }
    setTab(id)
    if (id === 'settings') {
      setSettingsPage('list')
    }
  }

  const userScope = catalogOwner
    ? { username: catalogOwner.username, onUsers: () => void closeUserCatalog() }
    : null
  const showCatalog = tab === 'categories' || (tab === 'users' && Boolean(catalogOwner))
  const showBankNotice =
    showCatalog && (level === 'questions' || level === 'question-list')

  return {
    username,
    setUsername,
    password,
    setPassword,
    loggedIn,
    config,
    apiKey,
    setApiKey,
    logLines,
    message,
    error,
    setError,
    tab,
    catalogOwner,
    playerUsers,
    level,
    setLevel,
    query,
    setQuery,
    renameDraft,
    setRenameDraft,
    settingsPage,
    setSettingsPage,
    generateCount: bank.generateCount,
    setGenerateCount: bank.setGenerateCount,
    generateDifficulties: bank.generateDifficulties,
    toggleGenerateDifficulty: bank.toggleGenerateDifficulty,
    generatingDifficulty: bank.generatingDifficulty,
    selectedDifficulty: bank.selectedDifficulty,
    listDifficulties: bank.listDifficulties,
    bankQuestions: bank.bankQuestions,
    questionDraft: bank.questionDraft,
    userScope,
    showCatalog,
    selectedCategory: folders.selectedCategory,
    selectedTopic: folders.selectedTopic,
    subjectsInCategory: folders.subjectsInCategory,
    showBankNotice,
    filteredCategories: folders.filteredCategories,
    filteredTopics: folders.filteredTopics,
    filteredBankQuestions: bank.filteredBankQuestions,
    selectedQuestionIds: bank.selectedQuestionIds,
    pendingRemoveIds: bank.pendingRemoveIds,
    onLogin,
    onLogout,
    onAdminTab,
    onSaveAi,
    onSaveLogLevel,
    patchAi,
    setConfig,
    addCategory: folders.addCategory,
    openCategory: folders.openCategory,
    confirmNewCategory: folders.confirmNewCategory,
    cancelNewCategory: folders.cancelNewCategory,
    patchCategory: folders.patchCategory,
    goContentHome: folders.goContentHome,
    startRename: folders.startRename,
    saveRename: folders.saveRename,
    cancelRename: folders.cancelRename,
    pendingRemove: folders.pendingRemove,
    askRemoveCategory: folders.askRemoveCategory,
    askRemoveCategoryFromList: folders.askRemoveCategoryFromList,
    cancelPendingRemove: folders.cancelPendingRemove,
    removeCategory: folders.removeCategory,
    askRemoveTopic: folders.askRemoveTopic,
    askClearQuestions: folders.askClearQuestions,
    askClearDifficulty: folders.askClearDifficulty,
    addTopic: folders.addTopic,
    openQuestions: folders.openQuestions,
    confirmNewSubject: folders.confirmNewSubject,
    goSubjects: folders.goSubjects,
    patchTopic: folders.patchTopic,
    openEditSubject: folders.openEditSubject,
    saveTopic: folders.saveTopic,
    startRenameTopic: folders.startRenameTopic,
    saveTopicRename: folders.saveTopicRename,
    cancelTopicRename: folders.cancelTopicRename,
    topicRenameId: folders.topicRenameId,
    topicRenameDraft: folders.topicRenameDraft,
    setTopicRenameDraft: folders.setTopicRenameDraft,
    cancelEditSubject: folders.cancelEditSubject,
    removeTopic: folders.removeTopic,
    openGenerateAll: bank.openGenerateAll,
    generateBank: bank.generateBank,
    openQuestionList: bank.openQuestionList,
    openSelectedQuestions: bank.openSelectedQuestions,
    openEditQuestion: bank.openEditQuestion,
    startRemoveQuestion: bank.startRemoveQuestion,
    toggleQuestionSelected: bank.toggleQuestionSelected,
    toggleAllFilteredQuestions: bank.toggleAllFilteredQuestions,
    startRemoveSelected: bank.startRemoveSelected,
    startRemoveAll: bank.startRemoveAll,
    askRemoveFromEdit: bank.askRemoveFromEdit,
    patchQuestionDraft: bank.patchQuestionDraft,
    patchQuestionOption: bank.patchQuestionOption,
    saveQuestion: bank.saveQuestion,
    removeQuestion: bank.removeQuestion,
    goQuestionList: bank.goQuestionList,
    cancelRemoveQuestion: bank.cancelRemoveQuestion,
    openUserCatalog,
    setRemoveQuestionFrom: bank.setRemoveQuestionFrom,
    clearTopicQuestions: bank.clearTopicQuestions,
  }
}
