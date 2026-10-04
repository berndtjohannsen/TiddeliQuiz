import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { BankCount, CatalogResponse, Category, PlayDifficulty, QuizAttempt, Topic } from '../../shared/types'
import { fillText } from '../catalogUi'
import {
  bankAvailable,
  clearPlayerContext,
  playDifficultyChoices,
  roundAllCount,
  roundCountChoices,
  clearSeen,
  fetchQuizRound,
  isPlayDifficulty,
  isPrivateCategory,
  readPlayerSession,
  readStoredRound,
  ROUND_KEY,
  unseenLeftAfterDraw,
  writePlayerSession,
  type PlayerSession,
} from '../playerSession'
import { strings } from '../strings'

export type HomeGate = 'choose' | 'user-login' | 'play'
export type HomePlayView = 'play' | 'mine'
export type CatalogStatus = 'loading' | 'ready' | 'empty' | 'error'

/** Login, catalog load, and starting a round from the home screen. */
export function useHomePage() {
  const initial = readPlayerSession()
  const [gate, setGate] = useState<HomeGate>(initial ? 'play' : 'choose')
  const [player, setPlayer] = useState<PlayerSession | null>(initial)
  const [loginName, setLoginName] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const entered = gate === 'play'
  const isGuest = player?.role !== 'user'
  const [categories, setCategories] = useState<Category[]>([])
  const [topics, setTopics] = useState<Topic[]>([])
  const [bankCounts, setBankCounts] = useState<BankCount[]>([])
  const [categoryId, setCategoryId] = useState('')
  const [topicId, setTopicId] = useState('')
  const [count, setCount] = useState(10)
  const [difficulty, setDifficulty] = useState<PlayDifficulty>('all')
  const [status, setStatus] = useState<CatalogStatus>('loading')
  const [busy, setBusy] = useState(false)
  const [startError, setStartError] = useState('')
  const [bankExhausted, setBankExhausted] = useState(false)
  const [playView, setPlayView] = useState<HomePlayView>('play')
  const [catalogEpoch, setCatalogEpoch] = useState(0)
  const startAbort = useRef<AbortController | null>(null)
  const startSeq = useRef(0)
  /** Count restored from the last round. Applied once, then "Alla" is the default. */
  const pinnedCount = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      startAbort.current?.abort()
    }
  }, [])

  useEffect(() => {
    if (!entered) {
      return
    }
    let cancelled = false
    setStatus('loading')
    void (async () => {
      // Guest must not keep a leftover player cookie (that would start an AI round).
      if (isGuest) {
        await fetch('/api/player/logout', { method: 'POST', credentials: 'include' })
      }
      const res = await fetch('/api/catalog', { credentials: 'include' })
      if (!res.ok) {
        throw new Error('bad response')
      }
      const data = (await res.json()) as CatalogResponse
      if (cancelled) {
        return
      }
      const cats = data.categories ?? []
      const list = data.topics ?? []
      setCategories(cats)
      setTopics(list)
      setBankCounts(data.bankCounts ?? [])
      const saved = readStoredRound()
      const savedTopic = list.find((t) => t.id === saved?.topicId)
      const savedCategory = savedTopic ? cats.find((c) => c.id === savedTopic.categoryId) : undefined
      if (savedTopic && savedCategory) {
        setCategoryId(savedCategory.id)
        setTopicId(savedTopic.id)
        if (isPlayDifficulty(saved?.difficulty)) {
          setDifficulty(saved.difficulty)
        }
        if (typeof saved?.requestedCount === 'number' && saved.requestedCount >= 5) {
          pinnedCount.current = saved.requestedCount
          setCount(saved.requestedCount)
        }
      } else {
        setCategoryId('')
        setTopicId('')
      }
      setStatus(cats.length && list.length ? 'ready' : 'empty')
    })().catch(() => {
      if (!cancelled) {
        setStatus('error')
      }
    })
    return () => {
      cancelled = true
    }
  }, [entered, isGuest, catalogEpoch])

  function enterPlay(next: PlayerSession) {
    writePlayerSession(next)
    setPlayer(next)
    setGate('play')
    setLoginError('')
    setLoginPassword('')
  }

  function onGuest() {
    enterPlay({ role: 'guest', username: '' })
  }

  function goUserLogin() {
    setLoginError('')
    setGate('user-login')
  }

  function goChoose() {
    setGate('choose')
  }

  async function onUserLogin(e: FormEvent) {
    e.preventDefault()
    setLoginError('')
    const res = await fetch('/api/player/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: loginName, password: loginPassword }),
    })
    if (!res.ok) {
      setLoginError(strings.playerLoginFailed)
      return
    }
    const data = (await res.json()) as { username?: string }
    enterPlay({ role: 'user', username: data.username || loginName.trim() })
  }

  async function onLogout() {
    if (player?.role === 'user') {
      await fetch('/api/player/logout', { method: 'POST', credentials: 'include' })
    }
    clearPlayerContext()
    setPlayer(null)
    setGate('choose')
    setBusy(false)
    setStartError('')
    setPlayView('play')
  }

  const platformCategories = categories.filter((c) => !isPrivateCategory(c))
  const myCategories = categories.filter(isPrivateCategory)
  const pickingMine = myCategories.some((c) => c.id === categoryId)
  const topicsInCategory = topics.filter((t) => t.categoryId === categoryId)
  const guestDifficulties = playDifficultyChoices(bankCounts, topicId)
  const countChoices = roundCountChoices(bankAvailable(bankCounts, topicId, difficulty))
  const canStart =
    status === 'ready' &&
    Boolean(topicId) &&
    topicsInCategory.length > 0 &&
    !busy &&
    countChoices.includes(count) &&
    guestDifficulties.includes(difficulty)

  // Keep difficulty in range, and default the count to every available question.
  useEffect(() => {
    if (!topicId) {
      return
    }
    const diffs = playDifficultyChoices(bankCounts, topicId)
    if (diffs.length && !diffs.includes(difficulty)) {
      // Alla stays available whenever any level can be played. Do not fall back to Svår.
      setDifficulty(diffs.includes('all') ? 'all' : diffs[0])
      return
    }
    const available = bankAvailable(bankCounts, topicId, difficulty)
    const all = roundAllCount(available)
    const counts = roundCountChoices(available)
    if (!all || !counts.length) {
      return
    }
    if (pinnedCount.current != null) {
      const pinned = pinnedCount.current
      pinnedCount.current = null
      setCount(counts.includes(pinned) ? pinned : all)
      return
    }
    setCount(all)
  }, [topicId, difficulty, bankCounts])

  // Drop a stale start error when the player changes what they would start.
  useEffect(() => {
    setStartError('')
    setBankExhausted(false)
  }, [categoryId, topicId, count, difficulty])

  function onPickCategory(id: string) {
    setStartError('')
    setCategoryId(id)
    // The list shows the first subject immediately. Count that whole subject, not one level.
    chooseTopic(topics.find((t) => t.categoryId === id)?.id ?? '')
  }

  function onPickTopic(id: string) {
    setStartError('')
    chooseTopic(id)
  }

  /** A chosen subject starts at Alla difficulties and every question in that subject. */
  function chooseTopic(id: string) {
    setTopicId(id)
    if (!id) {
      return
    }
    pinnedCount.current = null
    const diffs = playDifficultyChoices(bankCounts, id)
    const next: PlayDifficulty = diffs.includes('all') ? 'all' : diffs[0] ?? 'all'
    setDifficulty(next)
    const total = roundAllCount(bankAvailable(bankCounts, id, next))
    if (total) {
      setCount(total)
    }
  }

  function onCount(value: number) {
    setStartError('')
    // A restored round must not put the old number back after the player picks one.
    pinnedCount.current = null
    setCount(value)
  }

  function onDifficulty(value: PlayDifficulty) {
    setStartError('')
    pinnedCount.current = null
    setDifficulty(value)
    // Alla on the previous level is often 10. Switch the number to this level's full bank now.
    const all = roundAllCount(bankAvailable(bankCounts, topicId, value))
    if (all) {
      setCount(all)
    }
  }

  /** Difficulty and count as shown in the form, including a choice made in this same submit. */
  function chosenRound(form?: HTMLFormElement): { count: number; difficulty: PlayDifficulty } {
    const diffEl = form?.elements.namedItem('difficulty')
    const countEl = form?.elements.namedItem('count')
    const nextDifficulty =
      diffEl instanceof HTMLSelectElement && isPlayDifficulty(diffEl.value) ? diffEl.value : difficulty
    const available = bankAvailable(bankCounts, topicId, nextDifficulty)
    const all = roundAllCount(available)
    // The first row is "Alla". Its old value can still be 10 until React redraws the list.
    if (countEl instanceof HTMLSelectElement && countEl.selectedIndex === 0 && all) {
      return { count: all, difficulty: nextDifficulty }
    }
    const raw = countEl instanceof HTMLSelectElement ? Number(countEl.value) : count
    const choices = roundCountChoices(available)
    return {
      count: choices.includes(raw) ? raw : all || count,
      difficulty: nextDifficulty,
    }
  }

  async function startRound(
    nextTopicId: string,
    nextCategoryId: string,
    nextCount: number,
    nextDifficulty: PlayDifficulty,
  ) {
    setStartError('')
    setBusy(true)
    const seq = ++startSeq.current
    startAbort.current?.abort()
    const ac = new AbortController()
    startAbort.current = ac
    try {
      const data = await fetchQuizRound(nextTopicId, nextCount, nextDifficulty, ac.signal)
      if (seq !== startSeq.current || ac.signal.aborted) {
        return
      }
      if ('error' in data) {
        const exhausted = data.error === 'no_new_questions'
        setBankExhausted(exhausted)
        setStartError(
          exhausted
            ? strings.replayBankHint
            : data.error === 'bank_too_small'
              ? fillText(strings.bankTooSmall, {
                  available: data.available ?? 0,
                  requested: data.requested ?? nextCount,
                })
              : strings.startFailed,
        )
        setBusy(false)
        return
      }
      const topic = topics.find((t) => t.id === nextTopicId)
      const category = categories.find((c) => c.id === nextCategoryId)
      const shortNotice =
        data.questions.length < data.requested
          ? fillText(strings.roundShort, {
              count: data.questions.length,
              requested: data.requested,
            })
          : ''
      sessionStorage.setItem(
        ROUND_KEY,
        JSON.stringify({
          topicId: nextTopicId,
          categoryId: nextCategoryId,
          categoryName: category?.name ?? '',
          topicName: topic?.name ?? '',
          difficulty: nextDifficulty,
          questions: data.questions,
          requestedCount: data.requested,
          shortNotice,
          unseenLeft: unseenLeftAfterDraw(data.available, data.questions.length),
        }),
      )
      const q = new URLSearchParams({
        topic: nextTopicId,
        count: String(data.questions.length),
        difficulty: nextDifficulty,
      })
      window.location.assign(`/play?${q.toString()}`)
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return
      }
      setStartError(strings.startFailed)
      setBusy(false)
    }
  }

  async function onStart(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const chosen = chosenRound(e.currentTarget)
    await startRound(topicId, categoryId, chosen.count, chosen.difficulty)
  }

  async function onReplayBank() {
    if (!topicId) {
      return
    }
    clearSeen(topicId)
    setBankExhausted(false)
    await startRound(topicId, categoryId, count, difficulty)
  }

  function onPlayAgain(row: QuizAttempt) {
    const topic = topics.find((t) => t.id === row.topicId)
    if (!topic) {
      setStartError(strings.myPlayAgainGone)
      setPlayView('play')
      return
    }
    setCategoryId(topic.categoryId)
    setTopicId(topic.id)
    setCount(row.count)
    setDifficulty(row.difficulty)
    setPlayView('play')
    void startRound(topic.id, topic.categoryId, row.count, row.difficulty)
  }

  function openMine() {
    setPlayView('mine')
  }

  function backFromMine() {
    setPlayView('play')
    setCatalogEpoch((n) => n + 1)
  }

  return {
    gate,
    player,
    isGuest,
    loginName,
    setLoginName,
    loginPassword,
    setLoginPassword,
    loginError,
    categories,
    topics,
    categoryId,
    topicId,
    count,
    onCount,
    difficulty,
    onDifficulty,
    status,
    busy,
    startError,
    bankExhausted,
    playView,
    setPlayView,
    platformCategories,
    myCategories,
    pickingMine,
    guestDifficulties,
    countChoices,
    canStart,
    onGuest,
    goUserLogin,
    goChoose,
    onUserLogin,
    onLogout,
    onPickCategory,
    onPickTopic,
    onStart,
    onReplayBank,
    onPlayAgain,
    openMine,
    backFromMine,
  }
}
