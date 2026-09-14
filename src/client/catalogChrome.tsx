import type { ReactNode } from 'react'
import type { SourceFocus, Topic } from '../shared/types'
import { btnClass, btnDanger, btnDangerText, btnLink, btnSecondary, inputClass } from './catalogShared'
import { strings } from './strings'

/** Confirm a delete without leaving the current list or form. */
export function ConfirmDialog(props: {
  message: string
  confirmLabel: string
  cancelLabel: string
  error?: string
  extra?: ReactNode
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      onClick={props.onCancel}
    >
      <div
        className="w-full max-w-md rounded-lg border border-slate-600 bg-slate-900 p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm text-amber-200">{props.message}</p>
        {props.extra}
        {props.error ? <p className="mt-2 text-sm text-red-400">{props.error}</p> : null}
        <div className="mt-4 flex flex-wrap gap-3">
          <button type="button" className={btnDanger} onClick={props.onConfirm}>
            {props.confirmLabel}
          </button>
          <button type="button" className={btnSecondary} onClick={props.onCancel}>
            {props.cancelLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

/** Name field in a popup. Stays on the current catalog screen. */
export function PromptDialog(props: {
  title: string
  label: string
  hint?: string
  value: string
  onValue: (value: string) => void
  confirmLabel: string
  cancelLabel: string
  error?: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      onClick={props.onCancel}
    >
      <form
        className="w-full max-w-md rounded-lg border border-slate-600 bg-slate-900 p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault()
          props.onConfirm()
        }}
      >
        <h2 className="text-lg font-medium">{props.title}</h2>
        <label className="mt-3 flex flex-col gap-1 text-sm">
          {props.label}
          <input
            className={inputClass}
            value={props.value}
            autoFocus
            onChange={(e) => props.onValue(e.target.value)}
          />
          {props.hint ? <span className="text-xs text-slate-400">{props.hint}</span> : null}
        </label>
        {props.error ? <p className="mt-2 text-sm text-red-400">{props.error}</p> : null}
        <div className="mt-4 flex flex-wrap gap-3">
          <button type="submit" className={btnClass}>
            {props.confirmLabel}
          </button>
          <button type="button" className={btnSecondary} onClick={props.onCancel}>
            {props.cancelLabel}
          </button>
        </div>
      </form>
    </div>
  )
}

/** List row with open-on-name plus Edit / Delete shortcuts. */
export function CatalogListRow(props: {
  title: string
  subtitle: string
  onOpen: () => void
  onDelete: () => void
  /** If set, Edit renames in place. Otherwise Edit opens the row. */
  onEdit?: () => void
  editLabel: string
  deleteLabel: string
}) {
  return (
    <li className="flex items-start gap-2 border-b border-slate-800 last:border-b-0">
      <button
        type="button"
        className="min-w-0 flex-1 px-3 py-2 text-left text-sm hover:bg-slate-800"
        onClick={props.onOpen}
      >
        <span className="block font-medium">{props.title}</span>
        <span className="mt-1 block text-xs text-slate-400">{props.subtitle}</span>
      </button>
      <div className="flex shrink-0 gap-1 px-2 py-2">
        <button type="button" className={btnLink} onClick={props.onEdit ?? props.onOpen}>
          {props.editLabel}
        </button>
        <button type="button" className={btnDangerText} onClick={props.onDelete}>
          {props.deleteLabel}
        </button>
      </div>
    </li>
  )
}

/** Label + control used on catalog forms. */
export function Field(props: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      {props.label}
      {props.children}
      {props.hint ? <span className="text-xs text-slate-400">{props.hint}</span> : null}
    </label>
  )
}

/** Source URL + only/mainly. Same fields for Admin (EN) and Mina kategorier (SV). */
export function TopicSourceFields(props: {
  chrome: 'admin' | 'player'
  topic: Topic
  onPatch: (patch: Partial<Topic>) => void
}) {
  const admin = props.chrome === 'admin'
  const url = props.topic.sourceUrl ?? ''
  return (
    <>
      <Field
        label={admin ? strings.topicSource : strings.myTopicSource}
        hint={admin ? strings.topicSourceHint : strings.myTopicSourceHint}
      >
        <input
          className={inputClass}
          type="url"
          inputMode="url"
          placeholder="https://"
          value={url}
          onChange={(e) => props.onPatch({ sourceUrl: e.target.value })}
        />
      </Field>
      {url.trim() ? (
        <Field
          label={admin ? strings.topicSourceFocus : strings.myTopicSourceFocus}
          hint={admin ? strings.topicSourceFocusHint : strings.myTopicSourceFocusHint}
        >
          <select
            className={inputClass}
            value={props.topic.sourceFocus === 'only' ? 'only' : 'mainly'}
            onChange={(e) => props.onPatch({ sourceFocus: e.target.value as SourceFocus })}
          >
            <option value="mainly">{admin ? strings.topicSourceMainly : strings.myTopicSourceMainly}</option>
            <option value="only">{admin ? strings.topicSourceOnly : strings.myTopicSourceOnly}</option>
          </select>
        </Field>
      ) : null}
    </>
  )
}

/** One line on the generate screen so the chosen source is visible. */
export function TopicSourceSummary(props: { chrome: 'admin' | 'player'; topic: Topic }) {
  const url = props.topic.sourceUrl?.trim()
  if (!url) {
    return null
  }
  const admin = props.chrome === 'admin'
  const focus =
    props.topic.sourceFocus === 'only'
      ? admin
        ? strings.topicSourceOnly
        : strings.myTopicSourceOnly
      : admin
        ? strings.topicSourceMainly
        : strings.myTopicSourceMainly
  const label = admin ? strings.topicSourceUsing : strings.myTopicSourceUsing
  return (
    <p className="text-xs text-slate-400">
      {label}: {url} · {focus}
    </p>
  )
}

/** Create a subject: name + source, then OK. */
export function NewSubjectForm(props: {
  chrome: 'admin' | 'player'
  topic: Topic
  onPatch: (patch: Partial<Topic>) => void
  onConfirm: () => void
  onCancel: () => void
  children?: ReactNode
}) {
  const admin = props.chrome === 'admin'
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        props.onConfirm()
      }}
    >
      {props.children}
      <Field label={admin ? strings.topicName : strings.myTopicName} hint={admin ? strings.topicNameHint : strings.myTopicNameHint}>
        <input
          className={inputClass}
          value={props.topic.name}
          onChange={(e) => props.onPatch({ name: e.target.value })}
        />
      </Field>
      <TopicSourceFields chrome={props.chrome} topic={props.topic} onPatch={props.onPatch} />
      <div className="flex flex-wrap gap-3">
        <button type="submit" className={btnClass}>
          {strings.ok}
        </button>
        <button type="button" className={btnSecondary} onClick={props.onCancel}>
          {admin ? strings.cancel : strings.myCancel}
        </button>
      </div>
    </form>
  )
}

/** Edit prompt, options, and source. Name is renamed in a popup. */
export function EditSubjectForm(props: {
  chrome: 'admin' | 'player'
  topic: Topic
  onPatch: (patch: Partial<Topic>) => void
  onSave: () => void
  onCancel: () => void
  onRemove: () => void
  children?: ReactNode
}) {
  const admin = props.chrome === 'admin'
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        props.onSave()
      }}
    >
      {props.children}
      <Field label={admin ? strings.topicOptions : strings.myTopicOptions}>
        <input
          className={inputClass}
          type="number"
          min={2}
          value={props.topic.optionCount}
          onChange={(e) => props.onPatch({ optionCount: Number(e.target.value) })}
        />
      </Field>
      <TopicSourceFields chrome={props.chrome} topic={props.topic} onPatch={props.onPatch} />
      <Field
        label={admin ? strings.topicPrompt : strings.myTopicPrompt}
        hint={admin ? strings.topicPromptHint : strings.myTopicPromptHint}
      >
        <textarea
          className={`${inputClass} min-h-28`}
          value={props.topic.prompt}
          onChange={(e) => props.onPatch({ prompt: e.target.value })}
        />
      </Field>
      <div className="flex flex-wrap gap-3">
        <button type="submit" className={btnClass}>
          {admin ? strings.save : strings.mySave}
        </button>
        <button type="button" className={btnSecondary} onClick={props.onCancel}>
          {admin ? strings.cancel : strings.myCancel}
        </button>
        <button
          type="button"
          className={admin ? btnDangerText : 'text-sm text-red-400'}
          onClick={props.onRemove}
        >
          {admin ? strings.removeTopic : strings.myRemoveTopic}
        </button>
      </div>
    </form>
  )
}

export type BreadcrumbPart = { label: string; onClick?: () => void }

/** Path + Back. Admin can prefix Users / name when editing a player's tree. */
export function Breadcrumb(props: {
  parts: BreadcrumbPart[]
  userScope?: { username: string; onUsers: () => void } | null
  chrome?: 'admin' | 'player'
}) {
  const chrome = props.chrome ?? 'player'
  const parts =
    chrome === 'admin' && props.userScope && props.parts[0]?.label === strings.adminTabCategories
      ? [
          { label: strings.adminTabUsers, onClick: props.userScope.onUsers },
          { label: props.userScope.username, onClick: props.parts[0].onClick },
          ...props.parts.slice(1),
        ]
      : chrome === 'admin' && props.userScope && props.parts[0]?.label !== strings.adminTabCategories
        ? [
            { label: strings.adminTabUsers, onClick: props.userScope.onUsers },
            { label: props.userScope.username },
            ...props.parts,
          ]
        : props.parts
  const back = [...parts].reverse().find((part) => part.onClick)
  const backLabel = chrome === 'admin' ? strings.adminBack : strings.back
  const pathLabel = chrome === 'admin' ? 'Path' : 'Sökväg'
  return (
    <div className="flex flex-col items-start gap-2">
      {back ? (
        <button type="button" className={`${btnSecondary} self-start`} onClick={back.onClick}>
          {backLabel}
        </button>
      ) : null}
      <nav className="flex flex-wrap items-center gap-1 text-sm" aria-label={pathLabel}>
        {parts.map((part, index) => (
          <span key={`${part.label}-${index}`} className="flex items-center gap-1">
            {index > 0 ? <span className="text-slate-500">/</span> : null}
            {part.onClick ? (
              <button type="button" className="text-sky-400" onClick={part.onClick}>
                {part.label}
              </button>
            ) : (
              <span className="text-slate-200">{part.label}</span>
            )}
          </span>
        ))}
      </nav>
    </div>
  )
}
