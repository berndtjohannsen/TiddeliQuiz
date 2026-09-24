import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import type { AdminConfig, BankCount, Difficulty, PlayerPublic, StoredQuestion } from '../../../shared/types'
import {
  applyGenerateAllCounts,
  bankDifficulties,
  emptyGenerateAllRows,
  fillText,
  getGenerateAllUi,
  patchGenerateAllUi,
  runGenerateAllJob,
  setGenerateAllApplyCounts,
  setGenerateAllStart,
  type AdminCatalogLevel,
} from '../../catalogUi'
import { strings } from '../../strings'
import { adminCatalogBase } from './adminCatalogApi'

/** Generate into the bank and edit stored questions. */
export function useAdminBank(opts: {
  catalogOwner: PlayerPublic | null
  selectedTopicId: string
  setConfig: Dispatch<SetStateAction<AdminConfig | null>>
  setError: (value: string) => void
  setMessage: (value: string) => void
  setLevel: (value: AdminCatalogLevel) => void
  setQuery: (value: string) => void
  query: string
  level: AdminCatalogLevel
  getBankCounts: () => BankCount[]
}) {
  const [generateCount, setGenerateCount] = useState(10)
  const [generateDifficulties, setGenerateDifficulties] = useState<Difficulty[]>(() =>
    bankDifficulties.map((d) => d.id),
  )
  const [generatingDifficulty, setGeneratingDifficulty] = useState<Difficulty | null>(null)
  const generatingAllRef = useRef(false)
  const [selectedDifficulty, setSelectedDifficulty] = useState<Difficulty>('medium')
  /** Difficulties shown together on the question list. One entry is a normal Edit. */
  const [listDifficulties, setListDifficulties] = useState<Difficulty[]>(['medium'])
  const listDifficultiesRef = useRef(listDifficulties)
  listDifficultiesRef.current = listDifficulties
  const [bankQuestions, setBankQuestions] = useState<StoredQuestion[]>([])
  const [questionDraft, setQuestionDraft] = useState<StoredQuestion | null>(null)
  const [removeQuestionFrom, setRemoveQuestionFrom] = useState<'list' | 'edit'>('list')
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<string[]>([])
  const [pendingRemoveIds, setPendingRemoveIds] = useState<string[]>([])
  const levelRef = useRef(opts.level)
  levelRef.current = opts.level
  const selectedDifficultyRef = useRef(selectedDifficulty)
  selectedDifficultyRef.current = selectedDifficulty

  useEffect(() => {
    setGenerateDifficulties(bankDifficulties.map((d) => d.id))
  }, [opts.selectedTopicId])

  function toggleGenerateDifficulty(id: Difficulty) {
    setGenerateDifficulties((prev) =>
      prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id],
    )
  }

  function resetBank() {
    setBankQuestions([])
    setQuestionDraft(null)
    setSelectedQuestionIds([])
    setPendingRemoveIds([])
  }

  function orderedDifficulties(ids: Difficulty[]) {
    return bankDifficulties.map((d) => d.id).filter((id) => ids.includes(id))
  }

  async function fetchBankQuestions(topicId: string, difficulty: Difficulty | Difficulty[]) {
    const wanted = orderedDifficulties(Array.isArray(difficulty) ? difficulty : [difficulty])
    const questionsPath = `${adminCatalogBase(opts.catalogOwner)}/bank/questions`
    const lists: StoredQuestion[][] = []
    for (const level of wanted) {
      const res = await fetch(
        `${questionsPath}?topicId=${encodeURIComponent(topicId)}&difficulty=${encodeURIComponent(level)}`,
        { credentials: 'include' },
      )
      if (!res.ok) {
        opts.setError(strings.loadFailed)
        return
      }
      const data = (await res.json()) as { questions?: StoredQuestion[] }
      lists.push(data.questions ?? [])
    }
    setBankQuestions(lists.flat())
    setSelectedQuestionIds([])
  }

  async function runGenerate(
    topicId: string,
    difficulty: Difficulty,
    count: number,
  ): Promise<{ added: number; skipped: number } | { error: string }> {
    const res = await fetch(`${adminCatalogBase(opts.catalogOwner)}/bank/generate`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topicId, difficulty, count }),
    })
    if (res.status === 204) {
      return { error: strings.bankGenerateFailed }
    }
    const data = (await res.json()) as {
      bankCounts?: BankCount[]
      added?: number
      skipped?: number
      error?: string
    }
    if (!res.ok) {
      return { error: data.error ?? strings.bankGenerateFailed }
    }
    opts.setConfig((current) =>
      current ? { ...current, bankCounts: data.bankCounts ?? current.bankCounts ?? [] } : current,
    )
    if (levelRef.current === 'question-list' && listDifficultiesRef.current.includes(difficulty)) {
      await fetchBankQuestions(topicId, listDifficultiesRef.current)
    }
    return { added: data.added ?? 0, skipped: data.skipped ?? 0 }
  }

  async function generateBank(difficulty: Difficulty) {
    if (!opts.selectedTopicId) {
      return
    }
    opts.setError('')
    opts.setMessage('')
    setGeneratingDifficulty(difficulty)
    try {
      const result = await runGenerate(opts.selectedTopicId, difficulty, generateCount)
      if ('error' in result) {
        opts.setError(result.error)
        return
      }
      opts.setMessage(
        result.skipped
          ? fillText(strings.bankAddedSome, { added: result.added, skipped: result.skipped })
          : fillText(strings.bankAdded, { added: result.added }),
      )
    } catch {
      opts.setError(strings.bankGenerateFailed)
    } finally {
      setGeneratingDifficulty(null)
    }
  }

  function openGenerateAll() {
    if (!opts.selectedTopicId) {
      return
    }
    const selected = bankDifficulties.map((d) => d.id).filter((id) => generateDifficulties.includes(id))
    if (!selected.length) {
      return
    }
    opts.setError('')
    opts.setMessage('')
    patchGenerateAllUi({
      open: true,
      chrome: 'admin',
      topicId: opts.selectedTopicId,
      count: generateCount,
      rows: emptyGenerateAllRows(selected),
      busy: false,
      error: '',
      message: '',
      counts: opts.getBankCounts(),
    })
  }

  /** Poll a server job. Popup state lives on App, not this hook. */
  async function generateAllDifficulties() {
    const ui = getGenerateAllUi()
    const topicId = ui.topicId || opts.selectedTopicId
    const count = ui.count || generateCount
    const selected = ui.rows.map((row) => row.id)
    if (!topicId || generatingAllRef.current || !selected.length) {
      return
    }
    const base = adminCatalogBase(opts.catalogOwner)
    generatingAllRef.current = true
    patchGenerateAllUi({
      busy: true,
      error: '',
      message: '',
      rows: ui.rows.map((row) => ({ ...row, status: 'waiting' as const })),
    })
    try {
      const { added, skipped, failed } = await runGenerateAllJob(
        `${base}/bank/generate-all`,
        (jobId) => `${base}/bank/generate-all/${encodeURIComponent(jobId)}`,
        { topicId, count, difficulties: selected },
        (job) => {
          patchGenerateAllUi({
            rows: job.rows,
            counts: job.bankCounts ?? getGenerateAllUi().counts,
            busy: !job.done,
          })
        },
      )
      const message =
        added || skipped
          ? skipped
            ? fillText(strings.bankAddedSome, { added, skipped })
            : fillText(strings.bankAdded, { added })
          : ''
      const error = failed.length
        ? fillText(strings.bankGenerateAllFailed, { failed: failed.join(', ') })
        : ''
      patchGenerateAllUi({ busy: false, message, error })
      opts.setMessage(message)
      opts.setError(error)
    } catch (err) {
      const error = err instanceof Error ? err.message : strings.bankGenerateFailed
      patchGenerateAllUi({
        busy: false,
        error,
        rows: getGenerateAllUi().rows.map((row) =>
          row.status === 'waiting' || row.status === 'working' ? { ...row, status: 'failed' } : row,
        ),
      })
      opts.setError(error)
    } finally {
      generatingAllRef.current = false
      applyGenerateAllCounts(getGenerateAllUi().counts)
    }
  }

  setGenerateAllStart(() => void generateAllDifficulties())
  setGenerateAllApplyCounts((counts) => {
    opts.setConfig((cfg) => (cfg ? { ...cfg, bankCounts: counts } : cfg))
  })

  async function openQuestionList(difficulty: Difficulty) {
    if (!opts.selectedTopicId) {
      return
    }
    setSelectedDifficulty(difficulty)
    setListDifficulties([difficulty])
    opts.setQuery('')
    opts.setLevel('question-list')
    opts.setError('')
    await fetchBankQuestions(opts.selectedTopicId, difficulty)
  }

  /** Question list for the ticked difficulties, instead of one level at a time. */
  async function openSelectedQuestions() {
    if (!opts.selectedTopicId || generateDifficulties.length === 0) {
      return
    }
    const picked = orderedDifficulties(generateDifficulties)
    setSelectedDifficulty(picked[0])
    setListDifficulties(picked)
    opts.setQuery('')
    opts.setLevel('question-list')
    opts.setError('')
    await fetchBankQuestions(opts.selectedTopicId, picked)
  }

  function openEditQuestion(row: StoredQuestion) {
    setQuestionDraft({ ...row, options: [...row.options] })
    opts.setLevel('edit-question')
    opts.setError('')
  }

  /** Warning screen, then delete. From the list so Admin does not have to open the editor first. */
  function startRemoveQuestion(row: StoredQuestion) {
    setQuestionDraft({ ...row, options: [...row.options] })
    setPendingRemoveIds([row.id])
    setRemoveQuestionFrom('list')
    opts.setError('')
  }

  function toggleQuestionSelected(id: string) {
    setSelectedQuestionIds((current) =>
      current.includes(id) ? current.filter((rowId) => rowId !== id) : [...current, id],
    )
  }

  function toggleAllFilteredQuestions() {
    const q = opts.query.trim().toLowerCase()
    const visible = bankQuestions
      .filter((row) => !q || row.question.toLowerCase().includes(q))
      .map((row) => row.id)
    const allOn = visible.length > 0 && visible.every((id) => selectedQuestionIds.includes(id))
    if (allOn) {
      setSelectedQuestionIds((current) => current.filter((id) => !visible.includes(id)))
      return
    }
    setSelectedQuestionIds((current) => [...new Set([...current, ...visible])])
  }

  function startRemoveSelected() {
    if (!selectedQuestionIds.length) {
      return
    }
    setQuestionDraft(null)
    setPendingRemoveIds(selectedQuestionIds)
    setRemoveQuestionFrom('list')
    opts.setError('')
  }

  function startRemoveAll() {
    if (!bankQuestions.length) {
      return
    }
    setQuestionDraft(null)
    setPendingRemoveIds(bankQuestions.map((row) => row.id))
    setRemoveQuestionFrom('list')
    opts.setError('')
  }

  function askRemoveFromEdit() {
    if (!questionDraft) {
      return
    }
    setPendingRemoveIds([questionDraft.id])
    setRemoveQuestionFrom('edit')
    opts.setError('')
  }

  function patchQuestionDraft(patch: Partial<StoredQuestion>) {
    if (!questionDraft) {
      return
    }
    setQuestionDraft({ ...questionDraft, ...patch })
  }

  function patchQuestionOption(index: number, value: string) {
    if (!questionDraft) {
      return
    }
    const options = questionDraft.options.map((o, i) => (i === index ? value : o))
    setQuestionDraft({ ...questionDraft, options })
  }

  async function saveQuestion() {
    if (!questionDraft) {
      return
    }
    const options = questionDraft.options.map((o) => o.trim()).filter(Boolean)
    if (!questionDraft.question.trim() || options.length < 2) {
      opts.setError(strings.questionInvalid)
      return
    }
    const correctIndex =
      questionDraft.correctIndex >= 0 && questionDraft.correctIndex < options.length
        ? questionDraft.correctIndex
        : 0
    opts.setError('')
    const res = await fetch(`/api/admin/bank/questions/${encodeURIComponent(questionDraft.id)}`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: questionDraft.question,
        options,
        correctIndex,
        explanation: questionDraft.explanation,
        sourceUrl: questionDraft.sourceUrl ?? '',
      }),
    })
    const data = (await res.json()) as { error?: string; bankCounts?: BankCount[] }
    if (!res.ok) {
      opts.setError(
        data.error === 'A question with this text already exists'
          ? strings.questionDuplicate
          : (data.error ?? strings.loadFailed),
      )
      return
    }
    opts.setConfig((current) =>
      current ? { ...current, bankCounts: data.bankCounts ?? current.bankCounts ?? [] } : current,
    )
    opts.setMessage(strings.saved)
    setQuestionDraft(null)
    opts.setLevel('question-list')
    if (opts.selectedTopicId) {
      await fetchBankQuestions(opts.selectedTopicId, listDifficultiesRef.current)
    }
  }

  async function removeQuestion() {
    const ids = pendingRemoveIds.length
      ? pendingRemoveIds
      : questionDraft
        ? [questionDraft.id]
        : []
    if (!ids.length) {
      return
    }
    opts.setError('')
    const res = await fetch(`${adminCatalogBase(opts.catalogOwner)}/bank/questions/delete`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    })
    const data = (await res.json()) as { error?: string; bankCounts?: BankCount[]; removed?: number }
    if (!res.ok) {
      opts.setError(data.error ?? strings.loadFailed)
      return
    }
    opts.setConfig((current) =>
      current ? { ...current, bankCounts: data.bankCounts ?? current.bankCounts ?? [] } : current,
    )
    setQuestionDraft(null)
    setPendingRemoveIds([])
    setSelectedQuestionIds([])
    opts.setLevel('question-list')
    opts.setMessage(
      fillText(strings.removedQuestions, { count: data.removed ?? ids.length }),
    )
    if (opts.selectedTopicId) {
      await fetchBankQuestions(opts.selectedTopicId, listDifficultiesRef.current)
    }
  }

  function goQuestionList() {
    setQuestionDraft(null)
    setPendingRemoveIds([])
    opts.setLevel('question-list')
    opts.setError('')
  }

  /** Cancel remove: list Remove goes back to the list; editor Remove goes back to the editor. */
  function cancelRemoveQuestion() {
    opts.setError('')
    setPendingRemoveIds([])
    if (removeQuestionFrom === 'list') {
      setQuestionDraft(null)
    }
  }

  /** Empty the subject bank, or only one difficulty. */
  async function clearTopicQuestions(difficulty?: Difficulty) {
    if (!opts.selectedTopicId) {
      return
    }
    opts.setError('')
    const res = await fetch(`${adminCatalogBase(opts.catalogOwner)}/bank/questions/clear`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topicId: opts.selectedTopicId,
        ...(difficulty ? { difficulty } : {}),
      }),
    })
    const data = (await res.json()) as { error?: string; bankCounts?: BankCount[]; removed?: number }
    if (!res.ok) {
      opts.setError(data.error ?? strings.loadFailed)
      return
    }
    opts.setConfig((current) =>
      current ? { ...current, bankCounts: data.bankCounts ?? current.bankCounts ?? [] } : current,
    )
    resetBank()
    opts.setLevel('questions')
    opts.setMessage(fillText(strings.removedQuestions, { count: data.removed ?? 0 }))
  }

  const filteredBankQuestions = useMemo(() => {
    const q = opts.query.trim().toLowerCase()
    return bankQuestions.filter((row) => !q || row.question.toLowerCase().includes(q))
  }, [bankQuestions, opts.query])

  return {
    generateCount,
    setGenerateCount,
    generateDifficulties,
    toggleGenerateDifficulty,
    generatingDifficulty,
    selectedDifficulty,
    listDifficulties,
    setSelectedDifficulty,
    bankQuestions,
    questionDraft,
    filteredBankQuestions,
    selectedQuestionIds,
    pendingRemoveIds,
    resetBank,
    fetchBankQuestions,
    generateBank,
    openGenerateAll,
    generateAllDifficulties,
    openQuestionList,
    openSelectedQuestions,
    openEditQuestion,
    startRemoveQuestion,
    toggleQuestionSelected,
    toggleAllFilteredQuestions,
    startRemoveSelected,
    startRemoveAll,
    askRemoveFromEdit,
    patchQuestionDraft,
    patchQuestionOption,
    saveQuestion,
    removeQuestion,
    goQuestionList,
    cancelRemoveQuestion,
    setRemoveQuestionFrom,
    clearTopicQuestions,
  }
}
