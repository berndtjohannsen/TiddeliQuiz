import type { Category, Difficulty, StoredQuestion, Topic } from '../../../shared/types'
import {
  BankNotice,
  BankQuestionList,
  Breadcrumb,
  ConfirmDialog,
  Field,
  btnClass,
  btnDangerText,
  btnSecondary,
  difficultyLabel,
  fillText,
  inputClass,
  questionSnippet,
} from '../../catalogUi'
import { strings } from '../../strings'

type UserScope = { username: string; onUsers: () => void } | null

/** Question list, editor, and remove warning. */
export function AdminQuestions(props: {
  level: 'question-list' | 'edit-question'
  userScope: UserScope
  category: Category
  topic: Topic
  difficulty: Difficulty
  query: string
  onQuery: (value: string) => void
  generateCount: number
  onGenerateCount: (value: number) => void
  generatingDifficulty: Difficulty | null
  error: string
  message: string
  questions: StoredQuestion[]
  filteredQuestions: StoredQuestion[]
  selectedIds: string[]
  pendingRemoveIds: string[]
  draft: StoredQuestion | null
  onHome: () => void
  onSubjects: () => void
  onQuestions: (topicId: string) => void
  onQuestionList: () => void
  onGenerate: () => void
  onEdit: (row: StoredQuestion) => void
  onStartRemove: (row: StoredQuestion) => void
  onToggle: (id: string) => void
  onToggleAllFiltered: () => void
  onRemoveSelected: () => void
  onRemoveAll: () => void
  onPatchDraft: (patch: Partial<StoredQuestion>) => void
  onPatchOption: (index: number, value: string) => void
  onSave: () => void
  onAskRemoveFromEdit: () => void
  onConfirmRemove: () => void
  onCancelRemove: () => void
}) {
  const root = { label: strings.adminTabCategories, onClick: props.onHome }
  const cat = { label: props.category.name, onClick: props.onSubjects }
  const topic = { label: props.topic.name, onClick: () => props.onQuestions(props.topic.id) }
  const diff = { label: difficultyLabel(props.difficulty), onClick: props.onQuestionList }
  const removeCount = props.pendingRemoveIds.length
  const removeDialog =
    removeCount > 0 ? (
      <ConfirmDialog
        message={
          removeCount > 1
            ? fillText(strings.removeQuestionsWarn, { count: removeCount })
            : strings.removeQuestionWarn
        }
        extra={
          removeCount === 1 && props.draft ? (
            <p className="mt-2 text-sm text-slate-300">{props.draft.question}</p>
          ) : null
        }
        confirmLabel={removeCount > 1 ? strings.deleteSelected : strings.removeQuestion}
        cancelLabel={strings.cancel}
        onConfirm={() => void props.onConfirmRemove()}
        onCancel={props.onCancelRemove}
      />
    ) : null

  if (props.level === 'question-list') {
    return (
      <div className="flex flex-col gap-4">
        <Breadcrumb chrome="admin" userScope={props.userScope} parts={[root, cat, topic, { label: diff.label }]} />
        <h2 className="text-lg font-medium">
          {props.topic.name} · {difficultyLabel(props.difficulty)}
        </h2>
        <Field label={strings.bankAddCount}>
          <select
            className={inputClass}
            value={props.generateCount}
            disabled={Boolean(props.generatingDifficulty)}
            onChange={(e) => props.onGenerateCount(Number(e.target.value))}
          >
            {[5, 10, 15, 20].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </Field>
        <button
          type="button"
          className={`${btnSecondary} self-start`}
          disabled={Boolean(props.generatingDifficulty)}
          onClick={props.onGenerate}
        >
          {props.generatingDifficulty === props.difficulty
            ? strings.bankGenerating
            : strings.bankGenerate}
        </button>
        <BankNotice
          generatingDifficulty={props.generatingDifficulty}
          generatingAll={false}
          error={props.error}
          message={props.message}
        />
        <BankQuestionList
          chrome="admin"
          query={props.query}
          onQuery={props.onQuery}
          questions={props.questions}
          filtered={props.filteredQuestions}
          selectedIds={props.selectedIds}
          onToggle={props.onToggle}
          onToggleAllFiltered={props.onToggleAllFiltered}
          onEdit={props.onEdit}
          onRemoveOne={props.onStartRemove}
          onRemoveSelected={props.onRemoveSelected}
          onRemoveAll={props.onRemoveAll}
        />
        {removeDialog}
      </div>
    )
  }

  if (!props.draft) {
    return null
  }

  const crumb = questionSnippet(props.draft.question)
  const path = [root, cat, topic, diff, { label: crumb }]

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        void props.onSave()
      }}
    >
      <Breadcrumb chrome="admin" userScope={props.userScope} parts={path} />
      <Field label={strings.questionText}>
        <textarea
          className={`${inputClass} min-h-20`}
          value={props.draft.question}
          onChange={(e) => props.onPatchDraft({ question: e.target.value })}
        />
      </Field>
      {props.draft.options.map((option, index) => (
        <div key={index} className="flex flex-col gap-1 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span>{fillText(strings.questionOption, { n: index + 1 })}</span>
            <label className="flex items-center gap-2 text-xs text-slate-300">
              <input
                type="radio"
                name="correct-option"
                checked={props.draft?.correctIndex === index}
                onChange={() => props.onPatchDraft({ correctIndex: index })}
              />
              {strings.questionCorrect}
            </label>
          </div>
          <input
            className={inputClass}
            value={option}
            onChange={(e) => props.onPatchOption(index, e.target.value)}
          />
        </div>
      ))}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className={btnSecondary}
          onClick={() => props.onPatchDraft({ options: [...props.draft!.options, ''] })}
        >
          {strings.addOption}
        </button>
        {props.draft.options.length > 2 ? (
          <button
            type="button"
            className="text-sm text-red-400"
            onClick={() => {
              const options = props.draft!.options.slice(0, -1)
              const correctIndex = Math.min(props.draft!.correctIndex, options.length - 1)
              props.onPatchDraft({ options, correctIndex })
            }}
          >
            {strings.removeOption}
          </button>
        ) : null}
      </div>
      <Field label={strings.questionExplanation}>
        <textarea
          className={`${inputClass} min-h-20`}
          value={props.draft.explanation}
          onChange={(e) => props.onPatchDraft({ explanation: e.target.value })}
        />
      </Field>
      <Field label={strings.questionSource}>
        <input
          className={inputClass}
          value={props.draft.sourceUrl ?? ''}
          onChange={(e) => props.onPatchDraft({ sourceUrl: e.target.value })}
        />
      </Field>
      <div className="flex flex-wrap gap-3">
        <button type="submit" className={btnClass}>
          {strings.save}
        </button>
        <button type="button" className={btnSecondary} onClick={props.onQuestionList}>
          {strings.cancel}
        </button>
        <button type="button" className={btnDangerText} onClick={props.onAskRemoveFromEdit}>
          {strings.removeQuestion}
        </button>
      </div>
      {removeDialog}
    </form>
  )
}
