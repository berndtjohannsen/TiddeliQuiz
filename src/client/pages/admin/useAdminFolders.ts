import { useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import type { AdminConfig, BankCount, Category, Difficulty, PlayerPublic, Topic } from '../../../shared/types'
import {
  emptyCategory,
  emptyTopic,
  isDraft,
  suggestedPrompt,
  topicApiFields,
  topicCountIn,
  withSuggestedPrompt,
  type AdminCatalogLevel,
} from '../../catalogUi'
import { strings } from '../../strings'
import { adminCatalogJson } from './adminCatalogApi'

/** Add, rename, and remove folders and subjects. */
export function useAdminFolders(opts: {
  config: AdminConfig | null
  setConfig: Dispatch<SetStateAction<AdminConfig | null>>
  catalogOwner: PlayerPublic | null
  selectedCategoryId: string
  setSelectedCategoryId: (id: string) => void
  selectedTopicId: string
  setSelectedTopicId: (id: string) => void
  setLevel: (level: AdminCatalogLevel) => void
  query: string
  setQuery: (value: string) => void
  level: AdminCatalogLevel
  renameDraft: string
  setRenameDraft: (value: string) => void
  setError: (value: string) => void
  setMessage: (value: string) => void
  resetBank: () => void
  reloadActiveCatalog: () => Promise<void>
}) {
  const {
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
    resetBank,
    reloadActiveCatalog,
  } = opts

  const selectedCategory = config?.categories.find((c) => c.id === selectedCategoryId) ?? null
  const selectedTopic = config?.topics.find((t) => t.id === selectedTopicId) ?? null
  const subjectsInCategory = config ? topicCountIn(config.topics, selectedCategoryId) : 0
  /** Overlay confirm; do not change the current catalog screen. */
  const [pendingRemove, setPendingRemove] = useState<
    | { kind: 'category'; id: string }
    | { kind: 'topic'; id: string }
    | { kind: 'clear'; difficulty?: Difficulty }
    | null
  >(null)
  const [topicRenameId, setTopicRenameId] = useState('')
  const [topicRenameDraft, setTopicRenameDraft] = useState('')

  async function catalogJson<T>(method: string, path: string, body?: unknown): Promise<T | null> {
    return adminCatalogJson<T>(
      catalogOwner,
      method,
      path,
      body,
      setError,
      () => setMessage(strings.saved),
    )
  }

  async function confirmNewCategory() {
    const name = selectedCategory?.name.trim()
    if (!name || !config || !selectedCategory) {
      setError(strings.categoryNameRequired)
      return
    }
    setError('')
    const data = await catalogJson<{ category: Category }>('POST', '/categories', { name })
    if (!data) {
      return
    }
    const draftId = selectedCategory.id
    setConfig({
      ...config,
      categories: config.categories.map((c) => (c.id === draftId ? data.category : c)),
    })
    setSelectedCategoryId(data.category.id)
    setLevel('subjects')
  }

  function startRename() {
    if (!selectedCategory) {
      return
    }
    setRenameDraft(selectedCategory.name)
    setLevel('rename-category')
    setError('')
  }

  function askRemoveCategoryFromList(id: string) {
    setPendingRemove({ kind: 'category', id })
    setError('')
  }

  function askRemoveCategory() {
    if (!selectedCategoryId) {
      return
    }
    setPendingRemove({ kind: 'category', id: selectedCategoryId })
    setError('')
  }

  function cancelPendingRemove() {
    setPendingRemove(null)
    setError('')
  }

  function askRemoveTopic(id: string) {
    setPendingRemove({ kind: 'topic', id })
    setError('')
  }

  function askClearQuestions() {
    setPendingRemove({ kind: 'clear' })
    setError('')
  }

  function askClearDifficulty(difficulty: Difficulty) {
    setPendingRemove({ kind: 'clear', difficulty })
    setError('')
  }

  async function saveRename() {
    const name = renameDraft.trim()
    if (!name || !config || !selectedCategory) {
      setError(strings.categoryNameRequired)
      return
    }
    setError('')
    const data = await catalogJson<{ category: Category }>(
      'PUT',
      `/categories/${encodeURIComponent(selectedCategory.id)}`,
      { name },
    )
    if (!data) {
      return
    }
    setConfig({
      ...config,
      categories: config.categories.map((c) => (c.id === data.category.id ? data.category : c)),
    })
    setSelectedCategoryId(data.category.id)
    setLevel('subjects')
  }

  function cancelRename() {
    setRenameDraft('')
    setLevel('subjects')
    setError('')
  }

  async function confirmNewSubject() {
    if (!config || !selectedTopic) {
      return
    }
    const name = selectedTopic.name.trim()
    if (!name) {
      setError(strings.topicNameHint)
      return
    }
    const prompt = selectedTopic.prompt.trim() || suggestedPrompt(name, selectedTopic.sourceUrl)
    setError('')
    const data = await catalogJson<{ topic: Topic }>('POST', '/topics', {
      categoryId: selectedTopic.categoryId,
      ...topicApiFields(selectedTopic, prompt),
    })
    if (!data) {
      return
    }
    const draftId = selectedTopic.id
    setConfig({
      ...config,
      topics: config.topics.map((t) => (t.id === draftId ? data.topic : t)),
    })
    setSelectedTopicId(data.topic.id)
    setLevel('questions')
  }

  function startRenameTopic(id: string) {
    const topic = config?.topics.find((t) => t.id === id)
    if (!topic) {
      return
    }
    setTopicRenameId(id)
    setTopicRenameDraft(topic.name)
    setError('')
  }

  function cancelTopicRename() {
    setTopicRenameId('')
    setTopicRenameDraft('')
    setError('')
  }

  async function saveTopicRename() {
    const name = topicRenameDraft.trim()
    const topic = config?.topics.find((t) => t.id === topicRenameId)
    if (!name || !config || !topic) {
      setError(strings.topicNameHint)
      return
    }
    const next = withSuggestedPrompt(topic, { name })
    setError('')
    const data = await catalogJson<{ topic: Topic }>(
      'PUT',
      `/topics/${encodeURIComponent(topic.id)}`,
      topicApiFields(next),
    )
    if (!data) {
      return
    }
    setConfig({
      ...config,
      topics: config.topics.map((t) => (t.id === data.topic.id ? data.topic : t)),
    })
    setTopicRenameId('')
    setTopicRenameDraft('')
  }

  async function saveTopic() {
    if (!config || !selectedTopic) {
      return
    }
    if (!selectedTopic.name.trim() || !selectedTopic.prompt.trim()) {
      setError(strings.topicNameHint)
      return
    }
    setError('')
    const data = await catalogJson<{ topic: Topic }>(
      'PUT',
      `/topics/${encodeURIComponent(selectedTopic.id)}`,
      topicApiFields(selectedTopic),
    )
    if (!data) {
      return
    }
    setConfig({
      ...config,
      topics: config.topics.map((t) => (t.id === data.topic.id ? data.topic : t)),
    })
    setSelectedTopicId(data.topic.id)
    setLevel('questions')
  }

  function patchCategory(id: string, name: string) {
    if (!config) {
      return
    }
    setConfig({
      ...config,
      categories: config.categories.map((c) => (c.id === id ? { ...c, name } : c)),
    })
  }

  function patchTopic(id: string, patch: Partial<Topic>) {
    if (!config) {
      return
    }
    const topics = config.topics.map((t) => (t.id === id ? withSuggestedPrompt(t, patch) : t))
    setConfig({ ...config, topics })
  }

  function addCategory() {
    if (!config) {
      return
    }
    const cat = emptyCategory()
    setConfig({ ...config, categories: [...config.categories, cat] })
    setSelectedCategoryId(cat.id)
    setSelectedTopicId('')
    setQuery('')
    setLevel('new-category')
    setError('')
  }

  /** Categories tab root: the category list. Drops unsaved new-category and incomplete new-subject drafts. */
  function goContentHome() {
    if (config) {
      let categories = config.categories
      let topics = config.topics
      const topic = topics.find((t) => t.id === selectedTopicId)
      if (selectedCategoryId && isDraft(selectedCategoryId)) {
        if (!topics.some((t) => t.categoryId === selectedCategoryId)) {
          categories = categories.filter((c) => c.id !== selectedCategoryId)
        }
      }
      if (topic && isDraft(topic.id) && (!topic.name.trim() || !topic.prompt.trim())) {
        topics = topics.filter((t) => t.id !== topic.id)
      }
      if (categories !== config.categories || topics !== config.topics) {
        setConfig({ ...config, categories, topics })
      }
    }
    setRenameDraft('')
    setTopicRenameId('')
    setTopicRenameDraft('')
    setSelectedCategoryId('')
    setSelectedTopicId('')
    setPendingRemove(null)
    setQuery('')
    setLevel('categories')
    setError('')
    resetBank()
  }

  function cancelNewCategory() {
    goContentHome()
  }

  /** Delete a category and every subject in it. Call only after the warning screen. */
  async function removeCategory(id: string) {
    if (!config) {
      return
    }
    setError('')
    if (isDraft(id)) {
      setConfig({
        ...config,
        categories: config.categories.filter((c) => c.id !== id),
        topics: config.topics.filter((t) => t.categoryId !== id),
      })
      setSelectedCategoryId('')
      setSelectedTopicId('')
      setPendingRemove(null)
      setLevel('categories')
      return
    }
    const data = await catalogJson<{ ok: boolean; bankCounts?: BankCount[] }>(
      'DELETE',
      `/categories/${encodeURIComponent(id)}`,
    )
    if (!data) {
      return
    }
    setConfig({
      ...config,
      categories: config.categories.filter((c) => c.id !== id),
      topics: config.topics.filter((t) => t.categoryId !== id),
      bankCounts: data.bankCounts ?? config.bankCounts ?? [],
    })
    setSelectedCategoryId('')
    setSelectedTopicId('')
    setPendingRemove(null)
    setLevel('categories')
  }

  function openCategory(id: string) {
    setSelectedCategoryId(id)
    setSelectedTopicId('')
    setQuery('')
    setLevel('subjects')
    setError('')
  }

  function addTopic() {
    if (!config || !selectedCategoryId) {
      return
    }
    const topic = emptyTopic(selectedCategoryId)
    setConfig({ ...config, topics: [...config.topics, topic] })
    setSelectedTopicId(topic.id)
    setQuery('')
    setLevel('new-subject')
    setError('')
  }

  async function removeTopic(id: string) {
    if (!config) {
      return
    }
    if (isDraft(id)) {
      setConfig({
        ...config,
        topics: config.topics.filter((t) => t.id !== id),
      })
      setSelectedTopicId('')
      setPendingRemove(null)
      setLevel('subjects')
      return
    }
    const data = await catalogJson<{ ok: boolean; bankCounts?: BankCount[] }>(
      'DELETE',
      `/topics/${encodeURIComponent(id)}`,
    )
    if (!data) {
      return
    }
    setConfig({
      ...config,
      topics: config.topics.filter((t) => t.id !== id),
      bankCounts: data.bankCounts ?? config.bankCounts ?? [],
    })
    setSelectedTopicId('')
    setPendingRemove(null)
    setLevel('subjects')
  }

  /** Leave a subject folder. Drops an incomplete new-subject draft. */
  function goSubjects() {
    if (config && selectedTopic && isDraft(selectedTopic.id)) {
      if (!selectedTopic.name.trim() || !selectedTopic.prompt.trim()) {
        setConfig({
          ...config,
          topics: config.topics.filter((t) => t.id !== selectedTopic.id),
        })
      }
    }
    setSelectedTopicId('')
    setQuery('')
    setLevel('subjects')
    setError('')
  }

  function openQuestions(id: string) {
    setSelectedTopicId(id)
    setLevel('questions')
    setError('')
  }

  async function cancelEditSubject() {
    setError('')
    await reloadActiveCatalog()
    setLevel('questions')
  }

  const filteredCategories = useMemo(() => {
    if (!config) {
      return []
    }
    const q = query.trim().toLowerCase()
    return config.categories
      .filter((c) => !q || c.name.toLowerCase().includes(q))
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, 'sv'))
  }, [config, query, level])

  const filteredTopics = useMemo(() => {
    if (!config) {
      return []
    }
    const q = query.trim().toLowerCase()
    return config.topics
      .filter((t) => t.categoryId === selectedCategoryId)
      .filter((t) => !q || t.name.toLowerCase().includes(q))
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, 'sv'))
  }, [config, query, selectedCategoryId, level])

  return {
    selectedCategory,
    selectedTopic,
    subjectsInCategory,
    filteredCategories,
    filteredTopics,
    addCategory,
    openCategory,
    confirmNewCategory,
    cancelNewCategory,
    patchCategory,
    goContentHome,
    startRename,
    saveRename,
    cancelRename,
    pendingRemove,
    askRemoveCategory,
    askRemoveCategoryFromList,
    cancelPendingRemove,
    removeCategory,
    askRemoveTopic,
    askClearQuestions,
    askClearDifficulty,
    addTopic,
    openQuestions,
    confirmNewSubject,
    goSubjects,
    patchTopic,
    saveTopic,
    startRenameTopic,
    saveTopicRename,
    cancelTopicRename,
    topicRenameId,
    topicRenameDraft,
    setTopicRenameDraft,
    cancelEditSubject,
    removeTopic,
  }
}
