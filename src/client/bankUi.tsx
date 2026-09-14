import type { ReactNode } from 'react'
import type { BankCount, Difficulty, StoredQuestion, Topic } from '../shared/types'
import {
  bankCountIn,
  bankDifficulties,
  btnDangerText,
  btnLink,
  btnSecondary,
  difficultyLabel,
  fillText,
  inputClass,
} from './catalogShared'
import { Field, TopicSourceSummary } from './catalogChrome'
import { useGenerateAllUi } from './generateAllUi'
import { strings } from './strings'

/** Row shortcuts: Edit / Generate / Delete, same idea as the subject list. */
export function CatalogPageActions(props: {
  editLabel: string
  generateLabel: string
  deleteLabel: string
  onEdit: () => void
  onGenerate: () => void
  onDelete: () => void
  generateDisabled?: boolean
  deleteDisabled?: boolean
}) {
  const genAll = useGenerateAllUi()
  const generateBusy = Boolean(props.generateDisabled) || genAll.open || genAll.busy
  return (
    <div className="flex shrink-0 gap-1">
      <button type="button" className={btnLink} onClick={props.onEdit}>
        {props.editLabel}
      </button>
      <button
        type="button"
        className={`${btnLink} disabled:opacity-50`}
        disabled={generateBusy}
        onClick={props.onGenerate}
      >
        {props.generateLabel}
      </button>
      <button
        type="button"
        className={`${btnDangerText} disabled:opacity-50`}
        disabled={Boolean(props.deleteDisabled) || generateBusy}
        onClick={props.onDelete}
      >
        {props.deleteLabel}
      </button>
    </div>
  )
}

/** Wait / result text on generate screens so the page does not jump to the top. */
export function BankNotice(props: {
  generatingDifficulty: Difficulty | null
  generatingAll: boolean
  error: string
  message: string
  busyLabel?: string
}) {
  let text = '\u00a0'
  let color = 'text-slate-300'
  if (props.generatingDifficulty) {
    text = props.generatingAll
      ? fillText(strings.bankGeneratingAll, {
          current: bankDifficulties.findIndex((d) => d.id === props.generatingDifficulty) + 1,
          total: bankDifficulties.length,
          difficulty: difficultyLabel(props.generatingDifficulty),
        })
      : (props.busyLabel ?? strings.bankGenerating)
  } else if (props.error) {
    text = props.error
    color = 'text-red-400'
  } else if (props.message) {
    text = props.message
    color = 'text-emerald-400'
  }
  return <p className={`min-h-5 text-sm ${color}`}>{text}</p>
}

/** Per-difficulty list: Edit / Generate / Delete. Tick rows, then Generate selected on the header. */
export function BankGeneratePanel(props: {
  chrome: 'admin' | 'player'
  topicId: string
  counts: BankCount[] | undefined
  generateCount: number
  onGenerateCount: (n: number) => void
  generatingDifficulty: Difficulty | null
  error: string
  message: string
  selectedDifficulties: Difficulty[]
  onToggleDifficulty: (d: Difficulty) => void
  onGenerate: (d: Difficulty) => void
  onOpenList: (d: Difficulty) => void
  onClearDifficulty: (d: Difficulty) => void
  onClear?: () => void
  canClear?: boolean
}) {
  const admin = props.chrome === 'admin'
  const genAll = useGenerateAllUi()
  const busy = Boolean(props.generatingDifficulty) || genAll.open || genAll.busy
  return (
    <>
      <Field label={admin ? strings.bankAddCount : strings.myBankAddCount}>
        <select
          className={inputClass}
          value={props.generateCount}
          disabled={busy}
          onChange={(e) => props.onGenerateCount(Number(e.target.value))}
        >
          {[5, 10, 15, 20].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </Field>
      <BankNotice
        generatingDifficulty={genAll.open ? null : props.generatingDifficulty}
        generatingAll={false}
        error={props.error}
        message={props.message}
        busyLabel={admin ? strings.bankGenerating : strings.generating}
      />
      <ul className="rounded border border-slate-700">
        {bankDifficulties.map((d) => {
          const isCurrent = props.generatingDifficulty === d.id
          const count = bankCountIn(props.counts, props.topicId, d.id)
          const checked = props.selectedDifficulties.includes(d.id)
          return (
            <li
              key={d.id}
              className={`flex items-start gap-2 border-b border-slate-800 last:border-b-0 ${
                isCurrent ? 'bg-slate-800/60' : ''
              }`}
            >
              <label className="flex shrink-0 items-start px-2 py-3">
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={busy}
                  onChange={() => props.onToggleDifficulty(d.id)}
                  aria-label={d.label}
                />
              </label>
              <button
                type="button"
                className="min-w-0 flex-1 px-3 py-2 text-left text-sm hover:bg-slate-800"
                onClick={() => props.onOpenList(d.id)}
              >
                <span className="block font-medium">{d.label}</span>
                <span className="mt-1 block text-xs text-slate-400">
                  {fillText(admin ? strings.bankCount : strings.myBankCount, { count })}
                  {isCurrent
                    ? ` · ${admin ? strings.bankGenerating : strings.generating}`
                    : ''}
                </span>
              </button>
              <div className="px-2 py-2">
                <CatalogPageActions
                  editLabel={admin ? strings.edit : strings.myEdit}
                  generateLabel={admin ? strings.bankGenerate : strings.myBankGenerate}
                  deleteLabel={admin ? strings.remove : strings.myRemove}
                  onEdit={() => props.onOpenList(d.id)}
                  onGenerate={() => props.onGenerate(d.id)}
                  onDelete={() => props.onClearDifficulty(d.id)}
                  generateDisabled={busy}
                  deleteDisabled={count === 0}
                />
              </div>
            </li>
          )
        })}
      </ul>
      {props.onClear ? (
        <button
          type="button"
          className={`${btnDangerText} self-start disabled:opacity-50`}
          disabled={busy || !props.canClear}
          onClick={props.onClear}
        >
          {strings.clearQuestions}
        </button>
      ) : null}
    </>
  )
}

/** Subject generate screen shared by Admin and Mina kategorier. */
export function TopicBankScreen(props: {
  chrome: 'admin' | 'player'
  topic: Topic
  counts: BankCount[] | undefined
  generateCount: number
  onGenerateCount: (n: number) => void
  generatingDifficulty: Difficulty | null
  error: string
  message: string
  selectedDifficulties: Difficulty[]
  onToggleDifficulty: (d: Difficulty) => void
  onGenerate: (d: Difficulty) => void
  onOpenList: (d: Difficulty) => void
  onClearDifficulty: (d: Difficulty) => void
  onClear?: () => void
  canClear?: boolean
  onRename: () => void
  onEditPrompt: () => void
  onGenerateSelected: () => void
  children?: ReactNode
}) {
  const admin = props.chrome === 'admin'
  const genAll = useGenerateAllUi()
  const generateBusy = Boolean(props.generatingDifficulty) || genAll.open || genAll.busy
  return (
    <div className="flex flex-col gap-4">
      {props.children}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="text-lg font-medium">{props.topic.name}</h2>
        <div className="flex shrink-0 gap-1">
          <button type="button" className={btnLink} onClick={props.onRename}>
            {admin ? strings.rename : strings.myRename}
          </button>
          <button type="button" className={btnLink} onClick={props.onEditPrompt}>
            {admin ? strings.editPrompt : strings.myEditPrompt}
          </button>
          <button
            type="button"
            className={`${btnLink} disabled:opacity-50`}
            disabled={generateBusy || props.selectedDifficulties.length === 0}
            onClick={props.onGenerateSelected}
          >
            {admin ? strings.bankGenerateAll : strings.myBankGenerateAll}
          </button>
        </div>
      </div>
      <TopicSourceSummary chrome={props.chrome} topic={props.topic} />
      <p className="text-xs text-slate-400">{admin ? strings.bankHint : strings.myBankHint}</p>
      <BankGeneratePanel
        chrome={props.chrome}
        topicId={props.topic.id}
        counts={props.counts}
        generateCount={props.generateCount}
        onGenerateCount={props.onGenerateCount}
        generatingDifficulty={props.generatingDifficulty}
        error={props.error}
        message={props.message}
        selectedDifficulties={props.selectedDifficulties}
        onToggleDifficulty={props.onToggleDifficulty}
        onGenerate={props.onGenerate}
        onOpenList={props.onOpenList}
        onClearDifficulty={props.onClearDifficulty}
        onClear={props.onClear}
        canClear={props.canClear}
      />
    </div>
  )
}

export function questionSnippet(text: string) {
  const t = text.trim()
  return t.length > 40 ? `${t.slice(0, 40)}…` : t || strings.questionText
}

/** Question list with select-all / delete selected / delete all. */
export function BankQuestionList(props: {
  chrome: 'admin' | 'player'
  query: string
  onQuery: (value: string) => void
  questions: StoredQuestion[]
  filtered: StoredQuestion[]
  selectedIds: string[]
  onToggle: (id: string) => void
  onToggleAllFiltered: () => void
  onEdit?: (row: StoredQuestion) => void
  onRemoveOne: (row: StoredQuestion) => void
  onRemoveSelected: () => void
  onRemoveAll: () => void
}) {
  const admin = props.chrome === 'admin'
  const search = admin ? strings.questionSearch : strings.myQuestionSearch
  const empty = admin ? strings.questionListEmpty : strings.myQuestionListEmpty
  const countTpl = admin ? strings.questionListCount : strings.myQuestionListCount
  const correct = admin ? strings.questionCorrect : strings.myQuestionCorrect
  const edit = admin ? strings.edit : strings.myEdit
  const remove = admin ? strings.remove : strings.myRemove
  const selectAll = admin ? strings.selectAll : strings.mySelectAll
  const deleteSelected = admin ? strings.deleteSelected : strings.myDeleteSelected
  const deleteAll = admin ? strings.deleteAll : strings.myDeleteAll

  if (props.questions.length === 0) {
    return <p className="text-sm text-slate-400">{empty}</p>
  }

  return (
    <>
      <input
        className={inputClass}
        type="search"
        placeholder={search}
        value={props.query}
        onChange={(e) => props.onQuery(e.target.value)}
      />
      <p className="text-xs text-slate-400">
        {fillText(countTpl, {
          shown: props.filtered.length,
          total: props.questions.length,
        })}
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={`${btnSecondary} text-sm`} onClick={props.onToggleAllFiltered}>
          {selectAll}
        </button>
        <button
          type="button"
          className={`${btnSecondary} text-sm text-red-200 disabled:opacity-50`}
          disabled={props.selectedIds.length === 0}
          onClick={props.onRemoveSelected}
        >
          {deleteSelected}
        </button>
        <button
          type="button"
          className="rounded px-4 py-2 text-sm font-medium text-red-200 disabled:opacity-50"
          disabled={props.questions.length === 0}
          onClick={props.onRemoveAll}
        >
          {deleteAll}
        </button>
      </div>
      <ul className="max-h-[28rem] overflow-auto rounded border border-slate-700">
        {props.filtered.length === 0 ? (
          <li className="p-3 text-sm text-slate-400">{empty}</li>
        ) : (
          props.filtered.map((row) => (
            <li
              key={row.id}
              className="flex items-start gap-2 border-b border-slate-800 last:border-b-0"
            >
              <label className="flex shrink-0 items-start px-2 py-3">
                <input
                  type="checkbox"
                  checked={props.selectedIds.includes(row.id)}
                  onChange={() => props.onToggle(row.id)}
                  aria-label={row.question}
                />
              </label>
              <div className="min-w-0 flex-1 py-2 pr-2 text-sm">
                {row.question}
                <span className="mt-1 block text-xs text-slate-400">
                  {correct}: {row.options[row.correctIndex] || '—'}
                </span>
              </div>
              <div className="flex shrink-0 gap-1 px-2 py-2">
                {props.onEdit ? (
                  <button
                    type="button"
                    className="px-2 py-1 text-sm text-sky-400 hover:text-sky-300"
                    onClick={() => props.onEdit?.(row)}
                  >
                    {edit}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="px-2 py-1 text-sm text-red-400 hover:text-red-300"
                  onClick={() => props.onRemoveOne(row)}
                >
                  {remove}
                </button>
              </div>
            </li>
          ))
        )}
      </ul>
    </>
  )
}
