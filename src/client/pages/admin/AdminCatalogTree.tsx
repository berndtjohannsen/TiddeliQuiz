import type { AdminConfig, Category, Difficulty, PlayerPublic, Topic } from '../../../shared/types'
import {
  Breadcrumb,
  CatalogListRow,
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
  btnDangerText,
  btnLink,
  btnSecondary,
  difficultyLabel,
  fillText,
  inputClass,
  topicCountIn,
  type AdminCatalogLevel,
} from '../../catalogUi'
import { strings } from '../../strings'

type UserScope = { username: string; onUsers: () => void } | null

const treeLevels: AdminCatalogLevel[] = [
  'categories',
  'new-category',
  'rename-category',
  'subjects',
  'new-subject',
  'questions',
  'edit-subject',
]

/** Folder tree: categories, subjects, generate, edit subject. */
export function AdminCatalogTree(props: {
  level: AdminCatalogLevel
  config: AdminConfig
  catalogOwner: PlayerPublic | null
  userScope: UserScope
  selectedCategory: Category | null
  selectedTopic: Topic | null
  subjectsInCategory: number
  query: string
  onQuery: (value: string) => void
  renameDraft: string
  onRenameDraft: (value: string) => void
  filteredCategories: Category[]
  filteredTopics: Topic[]
  generateCount: number
  onGenerateCount: (value: number) => void
  generateDifficulties: Difficulty[]
  onToggleGenerateDifficulty: (d: Difficulty) => void
  generatingDifficulty: Difficulty | null
  error: string
  message: string
  onAddCategory: () => void
  onOpenCategory: (id: string) => void
  onConfirmNewCategory: () => void
  onCancelNewCategory: () => void
  onPatchCategory: (id: string, name: string) => void
  onHome: () => void
  onStartRename: () => void
  onSaveRename: () => void
  onCancelRename: () => void
  pendingRemove:
    | { kind: 'category'; id: string }
    | { kind: 'topic'; id: string }
    | { kind: 'clear'; difficulty?: Difficulty }
    | null
  onAskRemoveCategory: () => void
  onAskRemoveCategoryFromList: (id: string) => void
  onCancelPendingRemove: () => void
  onRemoveCategory: (id: string) => void
  onAddTopic: () => void
  onOpenQuestions: (id: string) => void
  onAskRemoveTopic: (id: string) => void
  onConfirmNewSubject: () => void
  onGoSubjects: () => void
  onPatchTopic: (id: string, patch: Partial<Topic>) => void
  onEditSubject: (id: string, back: 'subjects' | 'questions') => void
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
  onOpenQuestionList: (d: Difficulty) => void
  onEditSelected: () => void
  onAskClearQuestions: () => void
  onAskClearDifficulty: (d: Difficulty) => void
  onClearQuestions: () => void
}) {
  if (!treeLevels.includes(props.level)) {
    return null
  }
  const scope = props.userScope
  const cat = props.selectedCategory
  const topic = props.selectedTopic
  const catsLabel = strings.adminTabCategories
  const pending = props.pendingRemove
  const pendingCategory =
    pending?.kind === 'category' ? props.config.categories.find((c) => c.id === pending.id) : null
  const pendingTopic =
    pending?.kind === 'topic' ? props.config.topics.find((t) => t.id === pending.id) : null
  let removeDialog = null
  if (pendingCategory) {
    const count = topicCountIn(props.config.topics, pendingCategory.id)
    removeDialog = (
      <ConfirmDialog
        message={
          count === 0
            ? fillText(strings.removeCategoryWarnEmpty, { name: pendingCategory.name })
            : fillText(strings.removeCategoryWarn, { name: pendingCategory.name, count })
        }
        confirmLabel={strings.removeCategory}
        cancelLabel={strings.cancel}
        error={props.error}
        onConfirm={() => void props.onRemoveCategory(pendingCategory.id)}
        onCancel={props.onCancelPendingRemove}
      />
    )
  } else if (pendingTopic) {
    removeDialog = (
      <ConfirmDialog
        message={
          bankCountForTopic(props.config.bankCounts, pendingTopic.id) === 0
            ? fillText(strings.removeTopicWarnEmpty, { name: pendingTopic.name })
            : fillText(strings.removeTopicWarn, { name: pendingTopic.name })
        }
        confirmLabel={strings.removeTopic}
        cancelLabel={strings.cancel}
        error={props.error}
        onConfirm={() => void props.onRemoveTopic(pendingTopic.id)}
        onCancel={props.onCancelPendingRemove}
      />
    )
  } else if (pending?.kind === 'clear' && topic) {
    const count = pending.difficulty
      ? bankCountIn(props.config.bankCounts, topic.id, pending.difficulty)
      : bankCountForTopic(props.config.bankCounts, topic.id)
    removeDialog = (
      <ConfirmDialog
        message={
          pending.difficulty
            ? fillText(strings.clearDifficultyWarn, {
                name: topic.name,
                count,
                difficulty: difficultyLabel(pending.difficulty),
              })
            : fillText(strings.clearQuestionsWarn, { name: topic.name, count })
        }
        confirmLabel={pending.difficulty ? strings.remove : strings.clearQuestions}
        cancelLabel={strings.cancel}
        error={props.error}
        onConfirm={props.onClearQuestions}
        onCancel={props.onCancelPendingRemove}
      />
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {props.level === 'categories' ? (
        <>
          {props.catalogOwner ? (
            <Breadcrumb chrome="admin" userScope={scope} parts={[{ label: catsLabel }]} />
          ) : null}
          <h2 className="text-lg font-medium">
            {props.catalogOwner ? props.catalogOwner.username : strings.categoriesSection}
          </h2>
          <input
            className={inputClass}
            type="search"
            placeholder={strings.categorySearch}
            value={props.query}
            onChange={(e) => props.onQuery(e.target.value)}
          />
          <p className="text-xs text-slate-400">
            {fillText(strings.categoryCount, {
              shown: props.filteredCategories.length,
              total: props.config.categories.length,
            })}
          </p>
          <ul className="max-h-[28rem] overflow-auto rounded border border-slate-700">
            {props.filteredCategories.length === 0 ? (
              <li className="p-3 text-sm text-slate-400">{strings.categoryEmpty}</li>
            ) : (
              props.filteredCategories.map((c) => (
                <CatalogListRow
                  key={c.id}
                  title={c.name || '(new)'}
                  subtitle={`${fillText(strings.categorySubjects, {
                    count: topicCountIn(props.config.topics, c.id),
                  })} · ${fillText(strings.topicBankCount, {
                    count: bankCountForCategory(props.config.bankCounts, props.config.topics, c.id),
                  })}`}
                  onOpen={() => props.onOpenCategory(c.id)}
                  onDelete={() => props.onAskRemoveCategoryFromList(c.id)}
                  editLabel={strings.edit}
                  deleteLabel={strings.remove}
                />
              ))
            )}
          </ul>
          <button type="button" className={`${btnSecondary} self-start`} onClick={props.onAddCategory}>
            {strings.addCategory}
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
          <Breadcrumb
            chrome="admin"
            userScope={scope}
            parts={[{ label: catsLabel, onClick: props.onCancelNewCategory }]}
          />
          <Field label={strings.categoryName} hint={strings.categoryNameHint}>
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
            <button type="button" className={btnSecondary} onClick={props.onCancelNewCategory}>
              {strings.cancel}
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
            chrome="admin"
            userScope={scope}
            parts={[
              { label: catsLabel, onClick: props.onHome },
              { label: cat.name || strings.categoryName },
            ]}
          />
          <Field label={strings.categoryName}>
            <input
              className={inputClass}
              value={props.renameDraft}
              onChange={(e) => props.onRenameDraft(e.target.value)}
            />
          </Field>
          <div className="flex flex-wrap gap-3">
            <button type="submit" className={btnClass}>
              {strings.save}
            </button>
            <button type="button" className={btnSecondary} onClick={props.onCancelRename}>
              {strings.cancel}
            </button>
            <button type="button" className={btnDangerText} onClick={props.onAskRemoveCategory}>
              {strings.removeCategory}
            </button>
          </div>
        </form>
      ) : null}

      {props.level === 'subjects' && cat ? (
        <div className="flex flex-col gap-4">
          <Breadcrumb
            chrome="admin"
            userScope={scope}
            parts={[
              { label: catsLabel, onClick: props.onHome },
              { label: cat.name },
            ]}
          />
          <div className="flex flex-wrap items-baseline gap-3">
            <h2 className="text-lg font-medium">{cat.name}</h2>
            <button type="button" className={btnLink} onClick={props.onStartRename}>
              {strings.rename}
            </button>
          </div>
          {props.subjectsInCategory > 0 ? (
            <>
              <input
                className={inputClass}
                type="search"
                placeholder={strings.catalogSearch}
                value={props.query}
                onChange={(e) => props.onQuery(e.target.value)}
              />
              <p className="text-xs text-slate-400">
                {fillText(strings.catalogCount, {
                  shown: props.filteredTopics.length,
                  total: props.subjectsInCategory,
                })}
              </p>
              <ul className="max-h-[28rem] overflow-auto rounded border border-slate-700">
                {props.filteredTopics.length === 0 ? (
                  <li className="p-3 text-sm text-slate-400">{strings.catalogEmpty}</li>
                ) : (
                  props.filteredTopics.map((t) => (
                    <CatalogListRow
                      key={t.id}
                      title={t.name || '(new)'}
                      subtitle={`${fillText(strings.topicBankCount, {
                        count: bankCountForTopic(props.config.bankCounts, t.id),
                      })} · ${bankDifficulties
                        .map((d) =>
                          fillText(strings.topicBankByDifficulty, {
                            label: d.label,
                            count: bankCountIn(props.config.bankCounts, t.id, d.id),
                          }),
                        )
                        .join(' · ')}`}
                      onOpen={() => props.onOpenQuestions(t.id)}
                      onEdit={() => props.onEditSubject(t.id, 'subjects')}
                      onDelete={() => props.onAskRemoveTopic(t.id)}
                      editLabel={strings.editSubject}
                      deleteLabel={strings.remove}
                    />
                  ))
                )}
              </ul>
            </>
          ) : (
            <p className="text-sm text-slate-400">{strings.catalogEmpty}</p>
          )}
          <div className="flex flex-wrap gap-3">
            <button type="button" className={btnSecondary} onClick={props.onAddTopic}>
              {strings.addTopic}
            </button>
          </div>
        </div>
      ) : null}

      {props.level === 'new-subject' && topic && cat ? (
        <NewSubjectForm
          chrome="admin"
          topic={topic}
          onPatch={(patch) => props.onPatchTopic(topic.id, patch)}
          onConfirm={() => void props.onConfirmNewSubject()}
          onCancel={props.onGoSubjects}
        >
          <Breadcrumb
            chrome="admin"
            userScope={scope}
            parts={[
              { label: catsLabel, onClick: props.onHome },
              { label: cat.name, onClick: props.onGoSubjects },
            ]}
          />
        </NewSubjectForm>
      ) : null}

      {props.level === 'questions' && topic && cat ? (
        <TopicBankScreen
          chrome="admin"
          topic={topic}
          counts={props.config.bankCounts}
          generateCount={props.generateCount}
          onGenerateCount={props.onGenerateCount}
          generatingDifficulty={props.generatingDifficulty}
          error={props.error}
          message={props.message}
          selectedDifficulties={props.generateDifficulties}
          onToggleDifficulty={props.onToggleGenerateDifficulty}
          onGenerate={(d) => void props.onGenerateBank(d)}
          onOpenList={(d) => void props.onOpenQuestionList(d)}
          onEditSelected={() => void props.onEditSelected()}
          onClearDifficulty={props.onAskClearDifficulty}
          onClear={props.onAskClearQuestions}
          canClear={bankCountForTopic(props.config.bankCounts, topic.id) > 0}
          onRename={() => props.onStartRenameTopic(topic.id)}
          onEditPrompt={() => props.onEditSubject(topic.id, 'questions')}
          onGenerateSelected={props.onGenerateAll}
        >
          <Breadcrumb
            chrome="admin"
            userScope={scope}
            parts={[
              { label: catsLabel, onClick: props.onHome },
              { label: cat.name, onClick: props.onGoSubjects },
              { label: topic.name },
            ]}
          />
        </TopicBankScreen>
      ) : null}

      {props.level === 'edit-subject' && topic && cat ? (
        <EditSubjectForm
          chrome="admin"
          topic={topic}
          onPatch={(patch) => props.onPatchTopic(topic.id, patch)}
          onSave={() => void props.onSaveTopic()}
          onCancel={() => void props.onCancelEditSubject()}
          onRemove={() => props.onAskRemoveTopic(topic.id)}
        >
          <Breadcrumb
            chrome="admin"
            userScope={scope}
            parts={[
              { label: catsLabel, onClick: props.onHome },
              { label: cat.name, onClick: props.onGoSubjects },
              {
                label: topic.name || strings.topicName,
                onClick: () => void props.onCancelEditSubject(),
              },
            ]}
          />
        </EditSubjectForm>
      ) : null}
      {removeDialog}
      {props.topicRenameOpen ? (
        <PromptDialog
          title={strings.renameSubject}
          label={strings.topicName}
          hint={strings.topicNameHint}
          value={props.topicRenameDraft}
          onValue={props.onTopicRenameDraft}
          confirmLabel={strings.save}
          cancelLabel={strings.cancel}
          error={props.error}
          onConfirm={() => void props.onSaveTopicRename()}
          onCancel={props.onCancelTopicRename}
        />
      ) : null}
    </div>
  )
}
