import type { FormEvent, ReactNode } from 'react'
import type { Category, PlayDifficulty, Topic } from '../../shared/types'
import { APP_VERSION } from '../../version'
import { difficultyLabel } from '../catalogUi'
import { strings } from '../strings'
import type { CatalogStatus, HomePlayView } from './useHomePage'
import type { PlayerSession } from '../playerSession'

/** Reserved strip for a future ad. Empty in v1. */
export function AdSlot() {
  return (
    <div
      className="mt-8 min-h-16 rounded border border-dashed border-slate-600 p-3 text-center text-xs text-slate-500"
      aria-hidden="true"
    >
      {strings.adPlaceholder}
    </div>
  )
}

/** Small testing shortcut to /admin. */
export function AdminShortcut() {
  return (
    <a
      href="/admin"
      className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300"
      title={strings.chooseAdmin}
      onClick={(e) => {
        e.preventDefault()
        window.location.assign('/admin')
      }}
    >
      <svg
        className="h-4 w-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
        />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H8a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V8c.3.6.9 1 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"
        />
      </svg>
      {strings.chooseAdmin}
    </a>
  )
}

/** Category dropdown + subject list. Used for platform and for Mina kategorier. */
export function PlayCatalogBlock(props: {
  heading: ReactNode
  name: string
  categories: Category[]
  topics: Topic[]
  categoryId: string
  topicId: string
  active: boolean
  status: CatalogStatus
  busy: boolean
  emptyCategories: string
  emptyTopics: string
  onPickCategory: (id: string) => void
  onPickTopic: (id: string) => void
}) {
  const selected = props.active ? props.categoryId : ''
  const hasCategory = Boolean(selected)
  const topicsHere = hasCategory ? props.topics.filter((t) => t.categoryId === selected) : []
  const showLoading = props.status === 'loading'
  const showError = props.status === 'error'
  const noCats = !showLoading && !showError && props.categories.length === 0
  const waitingForCategory = props.status === 'ready' && props.categories.length > 0 && !hasCategory
  const noTopics = props.status === 'ready' && hasCategory && topicsHere.length === 0
  const placeholder = showLoading
    ? strings.loadingCatalog
    : showError
      ? strings.catalogLoadFailed
      : noCats
        ? props.emptyCategories
        : strings.pickCategory

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1 text-sm">
        {props.heading}
        <select
          name={props.name}
          className="rounded bg-slate-800 p-2"
          value={selected}
          disabled={props.status !== 'ready' || props.busy || props.categories.length === 0}
          onChange={(e) => props.onPickCategory(e.target.value)}
        >
          <option value="">{placeholder}</option>
          {props.categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1 text-sm">
        <span>{strings.topic}</span>
        {/* About three subjects visible; scroll if the category has more. */}
        <div
          role="listbox"
          aria-label={strings.topic}
          className="max-h-[6.75rem] overflow-y-auto rounded bg-slate-800"
        >
          {showLoading ? <p className="px-3 py-2 text-slate-400">{strings.loadingCatalog}</p> : null}
          {showError ? <p className="px-3 py-2 text-slate-400">{strings.catalogLoadFailed}</p> : null}
          {noCats ? <p className="px-3 py-2 text-slate-400">{props.emptyTopics}</p> : null}
          {waitingForCategory ? (
            <p className="px-3 py-2 text-slate-400">{strings.pickCategory}</p>
          ) : null}
          {noTopics ? <p className="px-3 py-2 text-slate-400">{strings.noTopicsInCategory}</p> : null}
          {topicsHere.map((t) => (
            <button
              key={t.id}
              type="button"
              role="option"
              aria-selected={t.id === props.topicId}
              disabled={props.status !== 'ready' || props.busy}
              className={`block w-full px-3 py-2 text-left disabled:opacity-50 ${
                t.id === props.topicId ? 'bg-sky-600' : 'hover:bg-slate-700'
              }`}
              onClick={() => props.onPickTopic(t.id)}
            >
              {t.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

/** First screen: log in or continue as guest. */
export function ChooseGate(props: { onUser: () => void; onGuest: () => void }) {
  return (
    <main className="mx-auto max-w-md p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{strings.appName}</h1>
          <p className="mt-1 text-sm text-slate-400">v{APP_VERSION}</p>
        </div>
        <AdminShortcut />
      </div>
      <p className="mt-8 text-sm text-slate-300">{strings.choosePath}</p>
      <div className="mt-4 flex flex-col gap-3">
        <button type="button" className="rounded bg-sky-600 px-4 py-2 font-medium" onClick={props.onUser}>
          {strings.chooseUser}
        </button>
        <button type="button" className="rounded bg-slate-700 px-4 py-2 font-medium" onClick={props.onGuest}>
          {strings.chooseGuest}
        </button>
      </div>
      <AdSlot />
    </main>
  )
}

/** Player login form. */
export function UserLoginGate(props: {
  error: string
  username: string
  password: string
  onUsername: (value: string) => void
  onPassword: (value: string) => void
  onSubmit: (e: FormEvent) => void
  onBack: () => void
}) {
  return (
    <main className="mx-auto max-w-md p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{strings.userLoginTitle}</h1>
          <p className="mt-1 text-sm text-slate-400">v{APP_VERSION}</p>
        </div>
        <AdminShortcut />
      </div>
      {props.error ? <p className="mt-4 text-sm text-red-400">{props.error}</p> : null}
      <form className="mt-8 flex flex-col gap-4" onSubmit={props.onSubmit}>
        <label className="flex flex-col gap-1 text-sm">
          {strings.playerUsername}
          <input
            className="rounded bg-slate-800 p-2"
            autoComplete="username"
            value={props.username}
            onChange={(e) => props.onUsername(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {strings.playerPassword}
          <input
            className="rounded bg-slate-800 p-2"
            type="password"
            autoComplete="current-password"
            value={props.password}
            onChange={(e) => props.onPassword(e.target.value)}
          />
        </label>
        <button type="submit" className="rounded bg-sky-600 px-4 py-2 font-medium">
          {strings.chooseUser}
        </button>
        <button type="button" className="text-sm text-sky-400" onClick={props.onBack}>
          {strings.backToChoose}
        </button>
      </form>
      <AdSlot />
    </main>
  )
}

/** Title row on the play / results / mine screens. */
export function PlayHeader(props: {
  player: PlayerSession | null
  isGuest: boolean
  playView: HomePlayView
  onResults: () => void
  onLogout: () => void
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold">{strings.appName}</h1>
        <p className="mt-1 text-sm text-slate-400">v{APP_VERSION}</p>
        <p className="mt-1 text-xs text-slate-500">
          {props.player?.role === 'user'
            ? strings.loggedInAs.replace('{name}', props.player.username)
            : strings.playingAsGuest}
        </p>
      </div>
      <div className="flex flex-col items-end gap-2">
        {props.playView === 'play' ? (
          <button type="button" className="text-sm text-sky-400" onClick={props.onResults}>
            {strings.myResults}
          </button>
        ) : null}
        {/* Guest returns to the chooser; a logged-in player actually logs out. */}
        <button type="button" className="text-sm text-sky-400" onClick={props.onLogout}>
          {props.isGuest ? strings.backToChoose : strings.playerLogout}
        </button>
      </div>
    </div>
  )
}

/** Category / subject / difficulty / count form. */
export function StartForm(props: {
  isGuest: boolean
  categories: Category[]
  platformCategories: Category[]
  myCategories: Category[]
  topics: Topic[]
  categoryId: string
  topicId: string
  pickingMine: boolean
  status: CatalogStatus
  busy: boolean
  count: number
  countChoices: number[]
  difficulty: PlayDifficulty
  guestDifficulties: PlayDifficulty[]
  startError: string
  bankExhausted: boolean
  canStart: boolean
  onPickCategory: (id: string) => void
  onPickTopic: (id: string) => void
  onCount: (n: number) => void
  onDifficulty: (d: PlayDifficulty) => void
  onMine: () => void
  onReplayBank: () => void
  onSubmit: (e: FormEvent<HTMLFormElement>) => void
}) {
  return (
    <form className="mt-8 flex flex-col gap-4" onSubmit={props.onSubmit}>
      <PlayCatalogBlock
        heading={strings.category}
        name="category"
        categories={props.isGuest ? props.categories : props.platformCategories}
        topics={props.topics}
        categoryId={props.categoryId}
        topicId={props.topicId}
        active={!props.pickingMine}
        status={props.status}
        busy={props.busy}
        emptyCategories={strings.noCategories}
        emptyTopics={props.topics.length ? strings.noTopicsInCategory : strings.noTopics}
        onPickCategory={props.onPickCategory}
        onPickTopic={props.onPickTopic}
      />

      {!props.isGuest ? (
        <div className="border-t border-slate-700 pt-4">
          <PlayCatalogBlock
            heading={
              <div className="flex items-center justify-between gap-3">
                <span>{strings.myCategories}</span>
                <button type="button" className="text-sm font-medium text-sky-400" onClick={props.onMine}>
                  {strings.myEditOrCreate}
                </button>
              </div>
            }
            name="my-category"
            categories={props.myCategories}
            topics={props.topics}
            categoryId={props.categoryId}
            topicId={props.topicId}
            active={props.pickingMine}
            status={props.status}
            busy={props.busy}
            emptyCategories={strings.myCategoryEmpty}
            emptyTopics={strings.myPlayEmptyHint}
            onPickCategory={props.onPickCategory}
            onPickTopic={props.onPickTopic}
          />
        </div>
      ) : null}

      {props.status === 'empty' && props.isGuest ? (
        <p className="text-sm text-slate-400">
          {props.categories.length ? strings.noTopics : strings.noCategories}
        </p>
      ) : null}

      <label className="flex flex-col gap-1 text-sm">
        {strings.difficulty}
        <select
          name="difficulty"
          value={props.difficulty}
          disabled={props.busy || !props.guestDifficulties.length}
          className="rounded bg-slate-800 p-2"
          onChange={(e) => props.onDifficulty(e.target.value as PlayDifficulty)}
        >
          {props.guestDifficulties.map((d) => (
            <option key={d} value={d}>
              {difficultyLabel(d)}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        {strings.questions}
        <select
          name="count"
          value={props.count}
          disabled={props.busy || !props.countChoices.length}
          className="rounded bg-slate-800 p-2"
          onChange={(e) => props.onCount(Number(e.target.value))}
        >
          {props.countChoices.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>

      {props.startError ? <p className="text-sm text-red-400">{props.startError}</p> : null}

      {props.bankExhausted ? (
        <button
          type="button"
          className="rounded bg-sky-600 px-4 py-2 font-medium disabled:opacity-50"
          disabled={props.busy || !props.topicId}
          onClick={props.onReplayBank}
        >
          {strings.replayBank}
        </button>
      ) : (
        <button
          type="submit"
          className="rounded bg-sky-600 px-4 py-2 font-medium disabled:opacity-50"
          disabled={!props.canStart}
        >
          {strings.start}
        </button>
      )}
    </form>
  )
}
