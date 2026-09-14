import type { BankCount, Category, Difficulty, StoredQuestion, Topic } from '../../shared/types'
import {
  BankQuestionList,
  Breadcrumb,
  ConfirmDialog,
  EditSubjectForm,
  Field,
  NewSubjectForm,
  PromptDialog,
  TopicBankScreen,
  bankCountForCategory,
  bankCountForTopic,
  bankCountIn,
  bankDifficulties,
  btnClass,
  btnSecondary,
  difficultyLabel,
  fillText,
  inputClass,
  topicCountIn,
  type FolderLevel,
} from '../catalogUi'
import { strings } from '../strings'

/** Mina kategorier folder screens. */
export function PlayerCatalogViews(props: {
  level: FolderLevel
  categories: Category[]
  topics: Topic[]
  bankCounts: BankCount[]
  sortedCategories: Category[]
  subjectsHere: Topic[]
  selectedCategory: Category | null
  selectedTopic: Topic | null
  subjectsInCategory: number
  renameDraft: string
  onRenameDraft: (value: string) => void
  generateCount: number
  onGenerateCount: (value: number) => void
  generateDifficulties: Difficulty[]
  onToggleGenerateDifficulty: (d: Difficulty) => void
  generatingDifficulty: Difficulty | null
  error: string
  message: string
  onBackToPlay: () => void
  onHome: () => void
  onAddCategory: () => void
  onOpenCategory: (id: string) => void
  onPatchCategory: (id: string, name: string) => void
  onConfirmNewCategory: () => void
  onStartRename: () => void
  onSaveRename: () => void
  onCancelRename: () => void
  onAskRemoveCategory: () => void
  onAskRemoveTopic: (id: string) => void
  pendingRemove:
    | { kind: 'category' }
    | { kind: 'topic'; id: string }
    | { kind: 'clear'; difficulty: Difficulty }
    | null
  onCancelPendingRemove: () => void
  onRemoveCategory: (id: string) => void
  onAddTopic: () => void
  onOpenQuestions: (id: string) => void
  onGoSubjects: () => void
  onPatchTopic: (id: string, patch: Partial<Topic>) => void
  onConfirmNewSubject: () => void
  onEditSubject: () => void
  onStartRenameTopic: (id: string) => void
  topicRenameDraft: string
  onTopicRenameDraft: (value: string) => void
  topicRenameOpen: boolean
  onSaveTopicRename: () => void
  onCancelTopicRename: () => void
  onSaveTopic: () => void
  onCancelEditSubject: () => void
  onRemoveTopic: (id: string) => void
  onGenerateAll: () => void
  onGenerateBank: (d: Difficulty) => void
  onAskClearDifficulty: (d: Difficulty) => void
  onClearQuestions: () => void
  selectedDifficulty: Difficulty
  questionQuery: string
  onQuestionQuery: (value: string) => void
  bankQuestions: StoredQuestion[]
  filteredQuestions: StoredQuestion[]
  selectedQuestionIds: string[]
  pendingRemoveIds: string[]
  onOpenQuestionList: (d: Difficulty) => void
  onQuestionList: () => void
  onToggleQuestion: (id: string) => void
  onToggleAllFiltered: () => void
  onStartRemoveQuestion: (row: StoredQuestion) => void
  onRemoveSelected: () => void
  onRemoveAll: () => void
  onConfirmRemoveQuestions: () => void
  onCancelRemoveQuestions: () => void
}) {
  const cat = props.selectedCategory
  const topic = props.selectedTopic
  const home = strings.myCategories
  const pending = props.pendingRemove
  const pendingTopic =
    pending?.kind === 'topic' ? props.topics.find((t) => t.id === pending.id) : null
  let removeDialog = null
  if (props.pendingRemove?.kind === 'category' && cat) {
    removeDialog = (
      <ConfirmDialog
        message={
          props.subjectsInCategory === 0
            ? fillText(strings.myRemoveCategoryWarnEmpty, { name: cat.name })
            : fillText(strings.myRemoveCategoryWarn, {
                name: cat.name,
                count: props.subjectsInCategory,
              })
        }
        confirmLabel={strings.myRemoveCategory}
        cancelLabel={strings.myCancel}
        error={props.error}
        onConfirm={() => void props.onRemoveCategory(cat.id)}
        onCancel={props.onCancelPendingRemove}
      />
    )
  } else if (pendingTopic) {
    removeDialog = (
      <ConfirmDialog
        message={
          bankCountForTopic(props.bankCounts, pendingTopic.id) === 0
            ? fillText(strings.myRemoveTopicWarnEmpty, { name: pendingTopic.name })
            : fillText(strings.myRemoveTopicWarn, { name: pendingTopic.name })
        }
        confirmLabel={strings.myRemoveTopic}
        cancelLabel={strings.myCancel}
        error={props.error}
        onConfirm={() => void props.onRemoveTopic(pendingTopic.id)}
        onCancel={props.onCancelPendingRemove}
      />
    )
  } else if (pending?.kind === 'clear' && topic) {
    removeDialog = (
      <ConfirmDialog
        message={fillText(strings.myClearDifficultyWarn, {
          name: topic.name,
          count: bankCountIn(props.bankCounts, topic.id, pending.difficulty),
          difficulty: difficultyLabel(pending.difficulty),
        })}
        confirmLabel={strings.myRemove}
        cancelLabel={strings.myCancel}
        error={props.error}
        onConfirm={props.onClearQuestions}
        onCancel={props.onCancelPendingRemove}
      />
    )
  } else if (props.pendingRemoveIds.length > 0) {
    const count = props.pendingRemoveIds.length
    removeDialog = (
      <ConfirmDialog
        message={
          count > 1
            ? fillText(strings.myRemoveQuestionsWarn, { count })
            : strings.myRemoveQuestionWarn
        }
        extra={
          count === 1 ? (
            <p className="mt-2 text-sm text-slate-300">
              {props.bankQuestions.find((row) => row.id === props.pendingRemoveIds[0])?.question ?? ''}
            </p>
          ) : null
        }
        confirmLabel={count > 1 ? strings.myDeleteSelected : strings.myRemove}
        cancelLabel={strings.myCancel}
        error={props.error}
        onConfirm={() => void props.onConfirmRemoveQuestions()}
        onCancel={props.onCancelRemoveQuestions}
      />
    )
  }

  return (
    <>
      {props.level === 'categories' ? (
        <>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-medium">{strings.myCategories}</h2>
              <p className="mt-1 text-xs text-slate-400">{strings.myCategoriesHint}</p>
            </div>
            <button type="button" className="text-sm text-sky-400" onClick={props.onBackToPlay}>
              {strings.myBackToPlay}
            </button>
          </div>
          <p className="text-xs text-slate-400">
            {fillText(strings.myCategoryCount, {
              shown: props.sortedCategories.length,
              total: props.categories.filter((c) => c.name.trim()).length,
            })}
          </p>
          <ul className="max-h-[28rem] overflow-auto rounded border border-slate-700">
            {props.sortedCategories.length === 0 ? (
              <li className="p-3 text-sm text-slate-400">{strings.myCategoryEmpty}</li>
            ) : (
              props.sortedCategories.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className="w-full px-3 py-2 text-left text-sm hover:bg-slate-800"
                    onClick={() => props.onOpenCategory(c.id)}
                  >
                    <span className="block font-medium">{c.name || '(ny)'}</span>
                    <span className="block text-xs text-slate-400">
                      {fillText(strings.myCategorySubjects, { count: topicCountIn(props.topics, c.id) })}
                      {' · '}
                      {fillText(strings.myTopicBankCount, {
                        count: bankCountForCategory(props.bankCounts, props.topics, c.id),
                      })}
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
          <button type="button" className={`${btnSecondary} self-start`} onClick={props.onAddCategory}>
            {strings.myAddCategory}
          </button>
        </>
      ) : null}

      {props.level === 'new-category' && cat ? (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            void props.onConfirmNewCategory()
          }}
        >
          <Breadcrumb parts={[{ label: home, onClick: props.onHome }]} />
          <Field label={strings.myCategoryName} hint={strings.myCategoryNameHint}>
            <input
              className={inputClass}
              value={cat.name}
              onChange={(e) => props.onPatchCategory(cat.id, e.target.value)}
            />
          </Field>
          <div className="flex flex-wrap gap-3">
            <button type="submit" className={btnClass}>
              {strings.ok}
            </button>
            <button type="button" className={btnSecondary} onClick={props.onHome}>
              {strings.myCancel}
            </button>
          </div>
        </form>
      ) : null}

      {props.level === 'rename-category' && cat ? (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            void props.onSaveRename()
          }}
        >
          <Breadcrumb
            parts={[
              { label: home, onClick: props.onHome },
              { label: cat.name || strings.myCategoryName },
            ]}
          />
          <Field label={strings.myCategoryName}>
            <input
              className={inputClass}
              value={props.renameDraft}
              onChange={(e) => props.onRenameDraft(e.target.value)}
            />
          </Field>
          <div className="flex flex-wrap gap-3">
            <button type="submit" className={btnClass}>
              {strings.mySave}
            </button>
            <button type="button" className={btnSecondary} onClick={props.onCancelRename}>
              {strings.myCancel}
            </button>
            <button type="button" className="text-sm text-red-400" onClick={props.onAskRemoveCategory}>
              {strings.myRemoveCategory}
            </button>
          </div>
        </form>
      ) : null}

      {props.level === 'subjects' && cat ? (
        <div className="flex flex-col gap-4">
          <Breadcrumb parts={[{ label: home, onClick: props.onHome }, { label: cat.name }]} />
          <div className="flex flex-wrap items-baseline gap-3">
            <h2 className="text-lg font-medium">{cat.name}</h2>
            <button type="button" className="text-sm text-sky-400" onClick={props.onStartRename}>
              {strings.myEdit}
            </button>
          </div>
          {props.subjectsInCategory > 0 ? (
            <ul className="max-h-[28rem] overflow-auto rounded border border-slate-700">
              {props.subjectsHere.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    className="w-full px-3 py-2 text-left text-sm hover:bg-slate-800"
                    onClick={() => props.onOpenQuestions(t.id)}
                  >
                    {t.name || '(ny)'}
                    <span className="mt-1 block text-xs text-slate-400">
                      {fillText(strings.myTopicBankCount, {
                        count: bankCountForTopic(props.bankCounts, t.id),
                      })}
                      {' · '}
                      {bankDifficulties
                        .map((d) =>
                          fillText(strings.topicBankByDifficulty, {
                            label: d.label,
                            count: bankCountIn(props.bankCounts, t.id, d.id),
                          }),
                        )
                        .join(' · ')}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-400">{strings.myCatalogEmpty}</p>
          )}
          <button type="button" className={`${btnSecondary} self-start`} onClick={props.onAddTopic}>
            {strings.myAddTopic}
          </button>
        </div>
      ) : null}

      {props.level === 'new-subject' && topic && cat ? (
        <NewSubjectForm
          chrome="player"
          topic={topic}
          onPatch={(patch) => props.onPatchTopic(topic.id, patch)}
          onConfirm={() => void props.onConfirmNewSubject()}
          onCancel={props.onGoSubjects}
        >
          <Breadcrumb
            parts={[
              { label: home, onClick: props.onHome },
              { label: cat.name, onClick: props.onGoSubjects },
            ]}
          />
        </NewSubjectForm>
      ) : null}

      {props.level === 'questions' && topic && cat ? (
        <TopicBankScreen
          chrome="player"
          topic={topic}
          counts={props.bankCounts}
          generateCount={props.generateCount}
          onGenerateCount={props.onGenerateCount}
          generatingDifficulty={props.generatingDifficulty}
          error={props.error}
          message={props.message}
          selectedDifficulties={props.generateDifficulties}
          onToggleDifficulty={props.onToggleGenerateDifficulty}
          onGenerate={(d) => void props.onGenerateBank(d)}
          onOpenList={(d) => void props.onOpenQuestionList(d)}
          onClearDifficulty={props.onAskClearDifficulty}
          onRename={() => props.onStartRenameTopic(topic.id)}
          onEditPrompt={props.onEditSubject}
          onGenerateSelected={props.onGenerateAll}
        >
          <Breadcrumb
            parts={[
              { label: home, onClick: props.onHome },
              { label: cat.name, onClick: props.onGoSubjects },
              { label: topic.name },
            ]}
          />
        </TopicBankScreen>
      ) : null}

      {props.level === 'edit-subject' && topic && cat ? (
        <EditSubjectForm
          chrome="player"
          topic={topic}
          onPatch={(patch) => props.onPatchTopic(topic.id, patch)}
          onSave={() => void props.onSaveTopic()}
          onCancel={props.onCancelEditSubject}
          onRemove={() => props.onAskRemoveTopic(topic.id)}
        >
          <Breadcrumb
            parts={[
              { label: home, onClick: props.onHome },
              { label: cat.name, onClick: props.onGoSubjects },
              { label: topic.name || strings.myTopicName },
            ]}
          />
        </EditSubjectForm>
      ) : null}

      {props.level === 'question-list' && topic && cat ? (
        <div className="flex flex-col gap-4">
          <Breadcrumb
            parts={[
              { label: home, onClick: props.onHome },
              { label: cat.name, onClick: props.onGoSubjects },
              { label: topic.name, onClick: () => props.onOpenQuestions(topic.id) },
              { label: difficultyLabel(props.selectedDifficulty) },
            ]}
          />
          <h2 className="text-lg font-medium">
            {topic.name} · {difficultyLabel(props.selectedDifficulty)}
          </h2>
          <Field label={strings.myBankAddCount}>
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
            onClick={() => void props.onGenerateBank(props.selectedDifficulty)}
          >
            {props.generatingDifficulty === props.selectedDifficulty
              ? strings.generating
              : strings.myBankGenerate}
          </button>
          <BankQuestionList
            chrome="player"
            query={props.questionQuery}
            onQuery={props.onQuestionQuery}
            questions={props.bankQuestions}
            filtered={props.filteredQuestions}
            selectedIds={props.selectedQuestionIds}
            onToggle={props.onToggleQuestion}
            onToggleAllFiltered={props.onToggleAllFiltered}
            onRemoveOne={props.onStartRemoveQuestion}
            onRemoveSelected={props.onRemoveSelected}
            onRemoveAll={props.onRemoveAll}
          />
        </div>
      ) : null}

      {removeDialog}
      {props.topicRenameOpen ? (
        <PromptDialog
          title={strings.myRenameSubject}
          label={strings.myTopicName}
          hint={strings.myTopicNameHint}
          value={props.topicRenameDraft}
          onValue={props.onTopicRenameDraft}
          confirmLabel={strings.mySave}
          cancelLabel={strings.myCancel}
          error={props.error}
          onConfirm={() => void props.onSaveTopicRename()}
          onCancel={props.onCancelTopicRename}
        />
      ) : null}
    </>
  )
}
