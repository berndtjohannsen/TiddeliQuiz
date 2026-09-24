import { useEffect, useMemo, useRef, useState } from 'react'
import type { BankCount, Category, Difficulty, StoredQuestion, Topic } from '../../shared/types'
import {
  applyGenerateAllCounts,
  bankDifficulties,
  catalogRequest,
  emptyCategory,
  emptyGenerateAllRows,
  emptyTopic,
  fillText,
  getGenerateAllUi,
  isDraft,
  patchGenerateAllUi,
  runGenerateAllJob,
  setGenerateAllApplyCounts,
  setGenerateAllStart,
  suggestedPrompt,
  topicApiFields,
  topicCountIn,
  withSuggestedPrompt,
  type FolderLevel,
} from '../catalogUi'
import { strings } from '../strings'

export type PlayerPendingRemove =
  | { kind: 'category' }
  | { kind: 'topic'; id: string }
  | { kind: 'clear'; difficulty: Difficulty }

/** Folder, generate, and question-list logic for Mina kategorier. */
export function usePlayerCatalog() {
  const [categories, setCategories] = useState<Category[]>([])
  const [topics, setTopics] = useState<Topic[]>([])
  const [bankCounts, setBankCounts] = useState<BankCount[]>([])
  const [level, setLevel] = useState<FolderLevel>('categories')
  const [selectedCategoryId, setSelectedCategoryId] = useState('')
  const [selectedTopicId, setSelectedTopicId] = useState('')
  const [renameDraft, setRenameDraft] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loadError, setLoadError] = useState('')
  const [generateCount, setGenerateCount] = useState(10)
  const [generateDifficulties, setGenerateDifficulties] = useState<Difficulty[]>(() =>
    bankDifficulties.map((d) => d.id),
  )
  const [generatingDifficulty, setGeneratingDifficulty] = useState<Difficulty | null>(null)
  const generatingAllRef = useRef(false)
  const [selectedDifficulty, setSelectedDifficulty] = useState<Difficulty>('medium')
  const [bankQuestions, setBankQuestions] = useState<StoredQuestion[]>([])
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<string[]>([])
  const [pendingRemoveIds, setPendingRemoveIds] = useState<string[]>([])
  const [pendingRemove, setPendingRemove] = useState<PlayerPendingRemove | null>(null)
  const [topicRenameId, setTopicRenameId] = useState('')
  const [topicRenameDraft, setTopicRenameDraft] = useState('')
  const [questionQuery, setQuestionQuery] = useState('')

  const selectedCategory = categories.find((c) => c.id === selectedCategoryId) ?? null
  const selectedTopic = topics.find((t) => t.id === selectedTopicId) ?? null
  const subjectsInCategory = topicCountIn(topics, selectedCategoryId)

  const sortedCategories = useMemo(
    () => categories.slice().sort((a, b) => a.name.localeCompare(b.name, 'sv')),
    [categories],
  )
  const filteredBankQuestions = useMemo(() => {
    const q = questionQuery.trim().toLowerCase()
    return bankQuestions.filter((row) => !q || row.question.toLowerCase().includes(q))
  }, [bankQuestions, questionQuery])
  const subjectsHere = useMemo(
    () =>
      topics
        .filter((t) => t.categoryId === selectedCategoryId)
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name, 'sv')),
    [topics, selectedCategoryId],
  )

  useEffect(() => {
    void loadMine()
  }, [])

  useEffect(() => {
    setGenerateDifficulties(bankDifficulties.map((d) => d.id))
  }, [selectedTopicId])

  async function loadMine() {
    const res = await fetch('/api/player/catalog', { credentials: 'include' })
    if (res.status === 401) {
      setLoadError(strings.playerLoginFailed)
      return
    }
    if (!res.ok) {
      setLoadError(strings.catalogLoadFailed)
      return
    }
    const data = (await res.json()) as {
      categories?: Category[]
      topics?: Topic[]
      bankCounts?: BankCount[]
    }
    setCategories(data.categories ?? [])
    setTopics(data.topics ?? [])
    setBankCounts(data.bankCounts ?? [])
    setLoadError('')
  }

  async function catalogJson<T>(method: string, path: string, body?: unknown): Promise<T | null> {
    const result = await catalogRequest<T>('/api/player', method, path, body, strings.catalogLoadFailed)
    if ('error' in result) {
      setError(result.error)
      return null
    }
    setMessage(strings.mySaved)
    return result.data
  }

  async function confirmNewCategory() {
    const name = selectedCategory?.name.trim()
    if (!name || !selectedCategory) {
      setError(strings.myCategoryNameRequired)
      return
    }
    setError('')
    const data = await catalogJson<{ category: Category }>('POST', '/categories', { name })
    if (!data) {
      return
    }
    const draftId = selectedCategory.id
    setCategories(categories.map((c) => (c.id === draftId ? data.category : c)))
    setSelectedCategoryId(data.category.id)
    setLevel('subjects')
  }

  function goHome() {
    let nextCats = categories
    let nextTopics = topics
    const topic = nextTopics.find((t) => t.id === selectedTopicId)
    if (selectedCategoryId && isDraft(selectedCategoryId)) {
      if (!nextTopics.some((t) => t.categoryId === selectedCategoryId)) {
        nextCats = nextCats.filter((c) => c.id !== selectedCategoryId)
      }
    }
    if (topic && isDraft(topic.id) && (!topic.name.trim() || !topic.prompt.trim())) {
      nextTopics = nextTopics.filter((t) => t.id !== topic.id)
    }
    if (nextCats !== categories || nextTopics !== topics) {
      setCategories(nextCats)
      setTopics(nextTopics)
    }
    setRenameDraft('')
    setTopicRenameId('')
    setTopicRenameDraft('')
    setSelectedCategoryId('')
    setSelectedTopicId('')
    setBankQuestions([])
    setSelectedQuestionIds([])
    setPendingRemoveIds([])
    setLevel('categories')
    setError('')
  }

  function addCategory() {
    const cat = emptyCategory('user')
    setCategories([...categories, cat])
    setSelectedCategoryId(cat.id)
    setSelectedTopicId('')
    setLevel('new-category')
    setError('')
  }

  function openCategory(id: string) {
    setSelectedCategoryId(id)
    setSelectedTopicId('')
    setLevel('subjects')
    setError('')
  }

  function startRename() {
    if (!selectedCategory) {
      return
    }
    setRenameDraft(selectedCategory.name)
    setLevel('rename-category')
    setError('')
  }

  async function saveRename() {
    const name = renameDraft.trim()
    if (!name || !selectedCategory) {
      setError(strings.myCategoryNameRequired)
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
    setCategories(categories.map((c) => (c.id === data.category.id ? data.category : c)))
    setSelectedCategoryId(data.category.id)
    setLevel('subjects')
  }

  async function removeCategory(id: string) {
    if (isDraft(id)) {
      setCategories(categories.filter((c) => c.id !== id))
      setTopics(topics.filter((t) => t.categoryId !== id))
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
    setCategories(categories.filter((c) => c.id !== id))
    setTopics(topics.filter((t) => t.categoryId !== id))
    setBankCounts(data.bankCounts ?? bankCounts)
    setSelectedCategoryId('')
    setSelectedTopicId('')
    setPendingRemove(null)
    setLevel('categories')
  }

  function addTopic() {
    if (!selectedCategoryId) {
      return
    }
    const topic = emptyTopic(selectedCategoryId)
    setTopics([...topics, topic])
    setSelectedTopicId(topic.id)
    setLevel('new-subject')
    setError('')
  }

  function goSubjects() {
    if (selectedTopic && isDraft(selectedTopic.id)) {
      if (!selectedTopic.name.trim() || !selectedTopic.prompt.trim()) {
        setTopics(topics.filter((t) => t.id !== selectedTopic.id))
      }
    }
    setSelectedTopicId('')
    setBankQuestions([])
    setSelectedQuestionIds([])
    setPendingRemoveIds([])
    setLevel('subjects')
    setError('')
  }

  async function fetchBankQuestions(topicId: string, difficulty: Difficulty) {
    const res = await fetch(
      `/api/player/bank/questions?topicId=${encodeURIComponent(topicId)}&difficulty=${encodeURIComponent(difficulty)}`,
      { credentials: 'include', cache: 'no-store' },
    )
    if (!res.ok) {
      setError(strings.catalogLoadFailed)
      return
    }
    const data = (await res.json()) as { questions?: StoredQuestion[] }
    setBankQuestions(data.questions ?? [])
    setSelectedQuestionIds([])
  }

  async function openQuestionList(difficulty: Difficulty) {
    if (!selectedTopicId) {
      return
    }
    setSelectedDifficulty(difficulty)
    setQuestionQuery('')
    setLevel('question-list')
    setError('')
    await fetchBankQuestions(selectedTopicId, difficulty)
  }

  function toggleQuestionSelected(id: string) {
    setSelectedQuestionIds((current) =>
      current.includes(id) ? current.filter((rowId) => rowId !== id) : [...current, id],
    )
  }

  function toggleAllFilteredQuestions() {
    const visible = filteredBankQuestions.map((row) => row.id)
    const allOn = visible.length > 0 && visible.every((id) => selectedQuestionIds.includes(id))
    if (allOn) {
      setSelectedQuestionIds((current) => current.filter((id) => !visible.includes(id)))
      return
    }
    setSelectedQuestionIds((current) => [...new Set([...current, ...visible])])
  }

  function startRemoveQuestion(row: StoredQuestion) {
    setPendingRemoveIds([row.id])
    setError('')
  }

  function startRemoveSelected() {
    if (!selectedQuestionIds.length) {
      return
    }
    setPendingRemoveIds(selectedQuestionIds)
    setError('')
  }

  function startRemoveAll() {
    if (!bankQuestions.length) {
      return
    }
    setPendingRemoveIds(bankQuestions.map((row) => row.id))
    setError('')
  }

  function cancelRemoveQuestions() {
    setPendingRemoveIds([])
    setError('')
  }

  async function confirmRemoveQuestions() {
    if (!pendingRemoveIds.length) {
      return
    }
    setError('')
    const res = await fetch('/api/player/bank/questions/delete', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: pendingRemoveIds }),
    })
    const data = (await res.json()) as { error?: string; bankCounts?: BankCount[]; removed?: number }
    if (!res.ok) {
      setError(data.error ?? strings.catalogLoadFailed)
      return
    }
    setBankCounts(data.bankCounts ?? bankCounts)
    const gone = new Set(pendingRemoveIds)
    setBankQuestions((current) => current.filter((row) => !gone.has(row.id)))
    setPendingRemoveIds([])
    setSelectedQuestionIds([])
    setLevel('question-list')
    setMessage(fillText(strings.myRemovedQuestions, { count: data.removed ?? 0 }))
    if (selectedTopicId) {
      await fetchBankQuestions(selectedTopicId, selectedDifficulty)
    }
  }

  /** Empty one difficulty in this subject's bank. */
  async function clearTopicQuestions(difficulty: Difficulty) {
    if (!selectedTopicId) {
      return
    }
    setError('')
    const res = await fetch('/api/player/bank/questions/clear', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topicId: selectedTopicId, difficulty }),
    })
    const data = (await res.json()) as { error?: string; bankCounts?: BankCount[]; removed?: number }
    if (!res.ok) {
      setError(data.error ?? strings.catalogLoadFailed)
      return
    }
    setBankCounts(data.bankCounts ?? bankCounts)
    setPendingRemove(null)
    setMessage(fillText(strings.myRemovedQuestions, { count: data.removed ?? 0 }))
  }

  async function confirmNewSubject() {
    if (!selectedTopic) {
      return
    }
    const name = selectedTopic.name.trim()
    if (!name) {
      setError(strings.myTopicNameHint)
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
    setTopics(topics.map((t) => (t.id === draftId ? data.topic : t)))
    setSelectedTopicId(data.topic.id)
    setLevel('questions')
  }

  function startRenameTopic(id: string) {
    const topic = topics.find((t) => t.id === id)
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
    const topic = topics.find((t) => t.id === topicRenameId)
    if (!name || !topic) {
      setError(strings.myTopicNameHint)
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
    setTopics(topics.map((t) => (t.id === data.topic.id ? data.topic : t)))
    setTopicRenameId('')
    setTopicRenameDraft('')
  }

  async function saveTopic() {
    if (!selectedTopic) {
      return
    }
    if (!selectedTopic.name.trim() || !selectedTopic.prompt.trim()) {
      setError(strings.myTopicNameHint)
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
    setTopics(topics.map((t) => (t.id === data.topic.id ? data.topic : t)))
    setSelectedTopicId(data.topic.id)
    setLevel('questions')
  }

  async function removeTopic(id: string) {
    if (isDraft(id)) {
      setTopics(topics.filter((t) => t.id !== id))
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
    setTopics(topics.filter((t) => t.id !== id))
    setBankCounts(data.bankCounts ?? bankCounts)
    setSelectedTopicId('')
    setPendingRemove(null)
    setLevel('subjects')
  }

  function patchCategory(id: string, name: string) {
    setCategories(categories.map((c) => (c.id === id ? { ...c, name } : c)))
  }

  function patchTopic(id: string, patch: Partial<Topic>) {
    setTopics(topics.map((t) => (t.id === id ? withSuggestedPrompt(t, patch) : t)))
  }

  async function runGenerate(
    topicId: string,
    difficulty: Difficulty,
    count: number,
  ): Promise<{ added: number; skipped: number } | { error: string }> {
    const res = await fetch('/api/player/bank/generate', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topicId, difficulty, count }),
    })
    if (res.status === 204) {
      return { error: strings.generateFailed }
    }
    const data = (await res.json()) as {
      bankCounts?: BankCount[]
      added?: number
      skipped?: number
      error?: string
    }
    if (!res.ok) {
      return { error: data.error ?? strings.generateFailed }
    }
    setBankCounts(data.bankCounts ?? bankCounts)
    return { added: data.added ?? 0, skipped: data.skipped ?? 0 }
  }

  async function generateBank(difficulty: Difficulty) {
    if (!selectedTopicId) {
      return
    }
    setError('')
    setMessage('')
    setGeneratingDifficulty(difficulty)
    try {
      const result = await runGenerate(selectedTopicId, difficulty, generateCount)
      if ('error' in result) {
        setError(result.error)
        return
      }
      setMessage(
        result.skipped
          ? fillText(strings.myBankAddedSome, { added: result.added, skipped: result.skipped })
          : fillText(strings.myBankAdded, { added: result.added }),
      )
      if (level === 'question-list' && selectedDifficulty === difficulty) {
        await fetchBankQuestions(selectedTopicId, difficulty)
      }
    } catch {
      setError(strings.generateFailed)
    } finally {
      setGeneratingDifficulty(null)
    }
  }

  function toggleGenerateDifficulty(id: Difficulty) {
    setGenerateDifficulties((prev) =>
      prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id],
    )
  }

  function openGenerateAll() {
    if (!selectedTopicId) {
      return
    }
    const selected = bankDifficulties.map((d) => d.id).filter((id) => generateDifficulties.includes(id))
    if (!selected.length) {
      return
    }
    setError('')
    setMessage('')
    patchGenerateAllUi({
      open: true,
      chrome: 'player',
      topicId: selectedTopicId,
      count: generateCount,
      rows: emptyGenerateAllRows(selected),
      busy: false,
      error: '',
      message: '',
      counts: bankCounts,
    })
  }

  async function generateAllDifficulties() {
    const ui = getGenerateAllUi()
    const topicId = ui.topicId || selectedTopicId
    const count = ui.count || generateCount
    const selected = ui.rows.map((row) => row.id)
    if (!topicId || generatingAllRef.current || !selected.length) {
      return
    }
    generatingAllRef.current = true
    patchGenerateAllUi({
      busy: true,
      error: '',
      message: '',
      rows: ui.rows.map((row) => ({ ...row, status: 'waiting' as const })),
    })
    try {
      const { added, skipped, failed } = await runGenerateAllJob(
        '/api/player/bank/generate-all',
        (jobId) => `/api/player/bank/generate-all/${encodeURIComponent(jobId)}`,
        { topicId, count, difficulties: selected },
        (job) => {
          patchGenerateAllUi({
            rows: job.rows,
            counts: job.bankCounts ?? getGenerateAllUi().counts,
            busy: !job.done,
          })
        },
      )
      const nextMessage =
        added || skipped
          ? skipped
            ? fillText(strings.myBankAddedSome, { added, skipped })
            : fillText(strings.myBankAdded, { added })
          : ''
      const nextError = failed.length
        ? fillText(strings.bankGenerateAllFailed, { failed: failed.join(', ') })
        : ''
      patchGenerateAllUi({ busy: false, message: nextMessage, error: nextError })
      setMessage(nextMessage)
      setError(nextError)
    } catch (err) {
      const nextError = err instanceof Error ? err.message : strings.generateFailed
      patchGenerateAllUi({
        busy: false,
        error: nextError,
        rows: getGenerateAllUi().rows.map((row) =>
          row.status === 'waiting' || row.status === 'working' ? { ...row, status: 'failed' } : row,
        ),
      })
      setError(nextError)
    } finally {
      generatingAllRef.current = false
      applyGenerateAllCounts(getGenerateAllUi().counts)
    }
  }

  setGenerateAllStart(() => void generateAllDifficulties())
  setGenerateAllApplyCounts(setBankCounts)

  return {
    categories,
    topics,
    bankCounts,
    level,
    setLevel,
    renameDraft,
    setRenameDraft,
    error,
    message,
    loadError,
    generateCount,
    setGenerateCount,
    generateDifficulties,
    toggleGenerateDifficulty,
    generatingDifficulty,
    selectedDifficulty,
    bankQuestions,
    selectedQuestionIds,
    pendingRemoveIds,
    pendingRemove,
    setPendingRemove,
    questionQuery,
    setQuestionQuery,
    selectedCategory,
    selectedTopic,
    subjectsInCategory,
    sortedCategories,
    filteredBankQuestions,
    subjectsHere,
    confirmNewCategory,
    goHome,
    addCategory,
    openCategory,
    startRename,
    saveRename,
    removeCategory,
    addTopic,
    goSubjects,
    openQuestionList,
    toggleQuestionSelected,
    toggleAllFilteredQuestions,
    startRemoveQuestion,
    startRemoveSelected,
    startRemoveAll,
    cancelRemoveQuestions,
    confirmRemoveQuestions,
    clearTopicQuestions,
    confirmNewSubject,
    saveTopic,
    startRenameTopic,
    saveTopicRename,
    cancelTopicRename,
    topicRenameId,
    topicRenameDraft,
    setTopicRenameDraft,
    removeTopic,
    patchCategory,
    patchTopic,
    generateBank,
    openGenerateAll,
    setSelectedTopicId,
    setError,
    setPendingRemoveIds,
  }
}
