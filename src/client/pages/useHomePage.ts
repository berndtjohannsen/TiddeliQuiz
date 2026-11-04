import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { BankCount, CatalogResponse, Category, Difficulty, QuizAttempt, Topic } from '../../shared/types'
import { fillText } from '../catalogUi'
import {
  bankForLevels,
  clearPlayerContext,
  playableLevels,
  roundAllCount,
  roundCountChoices,
  clearSeen,
  fetchQuizRound,
  isPrivateCategory,
  levelsFromKey,
  readPlayerSession,
  readStoredRound,
  reshuffleQuestions,
  ROUND_KEY,
  selectionKey,
  startDifficulty,
  unseenLeftAfterDraw,
  writePlayerSession,
  writeStoredRound,
  type PlayerSession,
} from '../playerSession'
import { strings } from '../strings'

export type HomeGate = 'choose' | 'user-login' | 'play'
export type HomePlayView = 'play' | 'mine'
export type CatalogStatus = 'loading' | 'ready' | 'empty' | 'error' | 'busy'

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
  const [levels, setLevels] = useState<Difficulty[]>([])
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
  const pinnedLevels = useRef<string | null>(null)

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
      if (res.status === 429) {
        if (!cancelled) {
          setStatus('busy')
        }
        return
      }
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
        if (saved?.difficulty) {
          pinnedLevels.current = saved.difficulty
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
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      setLoginError(
        data.error === 'login_paused'
          ? strings.playerLoginPaused
          : data.error === 'busy'
            ? strings.serverBusy
            : strings.playerLoginFailed,
      )
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
  const levelChoices = playableLevels(bankCounts, topicId)
  const countChoices = roundCountChoices(bankForLevels(bankCounts, topicId, levels))
  const canStart =
    status === 'ready' &&
    Boolean(topicId) &&
    topicsInCategory.length > 0 &&
    !busy &&
    levels.length > 0 &&
    countChoices.includes(count)

  // A new subject starts with every level. A cleared tick list stays cleared.
  useEffect(() => {
    if (!topicId) {
      return
    }
    const available = playableLevels(bankCounts, topicId)
    if (pinnedLevels.current != null) {
      const key = pinnedLevels.current
      pinnedLevels.current = null
      setLevels(levelsFromKey(available, key))
      return
    }
    const stillThere = levels.filter((d) => available.includes(d))
    if (stillThere.join() !== levels.join()) {
      setLevels(stillThere)
      const all = roundAllCount(bankForLevels(bankCounts, topicId, stillThere))
      if (all) {
        setCount(all)
      }
      return
    }
    if (!stillThere.length) {
      return
    }
    const all = roundAllCount(bankForLevels(bankCounts, topicId, stillThere))
    const counts = roundCountChoices(all)
    if (!all || !counts.length || pinnedCount.current == null) {
      return
    }
    const pinned = pinnedCount.current
    pinnedCount.current = null
    setCount(counts.includes(pinned) ? pinned : all)
  }, [topicId, levels, bankCounts])

  // Drop a stale start error when the player changes what they would start.
  useEffect(() => {
    setStartError('')
    setBankExhausted(false)
  }, [categoryId, topicId, count, levels])

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

  /** A chosen subject starts with every stocked level ticked. */
  function chooseTopic(id: string) {
    setTopicId(id)
    if (!id) {
      setLevels([])
      return
    }
    pinnedCount.current = null
    pinnedLevels.current = null
    const available = playableLevels(bankCounts, id)
    setLevels(available)
    const total = roundAllCount(bankForLevels(bankCounts, id, available))
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

  function applyLevels(next: Difficulty[]) {
    setStartError('')
    pinnedCount.current = null
    const available = playableLevels(bankCounts, topicId)
    const picked = available.filter((d) => next.includes(d))
    setLevels(picked)
    const all = roundAllCount(bankForLevels(bankCounts, topicId, picked))
    if (all) {
      setCount(all)
    }
  }

  function onToggleLevel(level: Difficulty) {
    const next = levels.includes(level) ? levels.filter((d) => d !== level) : [...levels, level]
    applyLevels(next)
  }

  function onToggleAll() {
    const available = playableLevels(bankCounts, topicId)
    const allOn = available.length > 0 && available.every((d) => levels.includes(d))
    applyLevels(allOn ? [] : available)
  }

  /** Levels and count as shown in the form, including a tick made in this same submit. */
  function chosenRound(form?: HTMLFormElement): { count: number; difficulty: string } {
    const node = form?.elements.namedItem('level')
    const boxes =
      node instanceof RadioNodeList ? Array.from(node) : node instanceof HTMLInputElement ? [node] : []
    const available = playableLevels(bankCounts, topicId)
    const picked = boxes.length
      ? available.filter((d) =>
          boxes.some((el) => el instanceof HTMLInputElement && el.checked && el.value === d),
        )
      : levels
    const nextDifficulty = selectionKey(available, picked)
    const all = roundAllCount(bankForLevels(bankCounts, topicId, picked))
    const countEl = form?.elements.namedItem('count')
    // The first row is "Alla". Its old value can still be 10 until React redraws the list.
    if (countEl instanceof HTMLSelectElement && countEl.selectedIndex === 0 && all) {
      return { count: all, difficulty: nextDifficulty }
    }
    const raw = countEl instanceof HTMLSelectElement ? Number(countEl.value) : count
    const choices = roundCountChoices(all)
    return {
      count: choices.includes(raw) ? raw : all || count,
      difficulty: nextDifficulty,
    }
  }

  async function startRound(
    nextTopicId: string,
    nextCategoryId: string,
    nextCount: number,
    nextDifficulty: string,
  ) {
    setStartError('')
    setBusy(true)
    const seq = ++startSeq.current
    startAbort.current?.abort()
    const ac = new AbortController()
    startAbort.current = ac
    const pick = startDifficulty(nextDifficulty)
    try {
      const data = await fetchQuizRound(
        nextTopicId,
        nextCount,
        pick.difficulty,
        ac.signal,
        pick.difficulties,
      )
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
              : data.error === 'busy'
                ? strings.serverBusy
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
    if (!chosen.difficulty) {
      return
    }
    await startRound(topicId, categoryId, chosen.count, chosen.difficulty)
  }

  async function onReplayBank() {
    if (!topicId) {
      return
    }
    clearSeen(topicId)
    setBankExhausted(false)
    const key = selectionKey(playableLevels(bankCounts, topicId), levels)
    await startRound(topicId, categoryId, count, key || 'all')
  }

  function onPlayAgain(row: QuizAttempt, onlyFailed = false) {
    const saved = row.questions
    const flags = row.failed
    if (saved?.length && flags?.length === saved.length) {
      const picked = onlyFailed ? saved.filter((_, i) => flags[i]) : saved
      if (!picked.length) {
        return
      }
      writeStoredRound({
        topicId: row.topicId,
        categoryId: row.categoryId,
        categoryName: row.categoryName,
        topicName: row.topicName,
        difficulty: row.difficulty,
        questions: reshuffleQuestions(picked),
        allQuestions: saved,
        requestedCount: picked.length,
        shortNotice: '',
        attemptSaved: false,
      })
      const q = new URLSearchParams({
        topic: row.topicId,
        count: String(picked.length),
        difficulty: row.difficulty,
      })
      window.location.assign(`/play?${q.toString()}`)
      return
    }
    const topic = topics.find((t) => t.id === row.topicId)
    if (!topic) {
      setStartError(strings.myPlayAgainGone)
      setPlayView('play')
      return
    }
    setCategoryId(topic.categoryId)
    setTopicId(topic.id)
    setCount(row.count)
    setLevels(levelsFromKey(playableLevels(bankCounts, topic.id), row.difficulty))
    setPlayView('play')
    void startRound(topic.id, topic.categoryId, row.count, row.difficulty || 'all')
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
    levels,
    levelChoices,
    onToggleLevel,
    onToggleAll,
    status,
    busy,
    startError,
    bankExhausted,
    playView,
    setPlayView,
    platformCategories,
    myCategories,
    pickingMine,
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
