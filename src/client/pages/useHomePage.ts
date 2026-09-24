import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { BankCount, CatalogResponse, Category, PlayDifficulty, QuizAttempt, Topic } from '../../shared/types'
import { fillText } from '../catalogUi'
import {
  bankAvailable,
  clearPlayerContext,
  playDifficultyChoices,
  roundCountChoices,
  clearSeen,
  fetchQuizRound,
  isPrivateCategory,
  readPlayerSession,
  ROUND_KEY,
  unseenLeftAfterDraw,
  writePlayerSession,
  type PlayerSession,
} from '../playerSession'
import { strings } from '../strings'

export type HomeGate = 'choose' | 'user-login' | 'play'
export type HomePlayView = 'play' | 'mine' | 'results'
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
  const [difficulty, setDifficulty] = useState<PlayDifficulty>('medium')
  const [status, setStatus] = useState<CatalogStatus>('loading')
  const [busy, setBusy] = useState(false)
  const [startError, setStartError] = useState('')
  const [bankExhausted, setBankExhausted] = useState(false)
  const [playView, setPlayView] = useState<HomePlayView>('play')
  const [catalogEpoch, setCatalogEpoch] = useState(0)
  const startAbort = useRef<AbortController | null>(null)
  const startSeq = useRef(0)

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
      setCategoryId('')
      setTopicId('')
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

  // Keep difficulty and count inside what the bank can offer.
  useEffect(() => {
    if (!topicId) {
      return
    }
    const diffs = playDifficultyChoices(bankCounts, topicId)
    if (diffs.length && !diffs.includes(difficulty)) {
      setDifficulty(diffs[0])
      return
    }
    const counts = roundCountChoices(bankAvailable(bankCounts, topicId, difficulty))
    if (counts.length && !counts.includes(count)) {
      setCount(counts[counts.length - 1])
    }
  }, [topicId, difficulty, count, bankCounts])

  // Drop a stale start error when the player changes what they would start.
  useEffect(() => {
    setStartError('')
    setBankExhausted(false)
  }, [categoryId, topicId, count, difficulty])

  function onPickCategory(id: string) {
    setStartError('')
    setCategoryId(id)
    setTopicId(topics.find((t) => t.categoryId === id)?.id ?? '')
  }

  function onPickTopic(id: string) {
    setStartError('')
    setTopicId(id)
  }

  function onCount(value: number) {
    setStartError('')
    setCount(value)
  }

  function onDifficulty(value: PlayDifficulty) {
    setStartError('')
    setDifficulty(value)
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
    await startRound(topicId, categoryId, count, difficulty)
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
