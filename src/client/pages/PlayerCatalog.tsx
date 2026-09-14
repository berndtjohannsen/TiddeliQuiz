import { strings } from '../strings'
import { PlayerCatalogViews } from './PlayerCatalogViews'
import { usePlayerCatalog } from './usePlayerCatalog'

/** Logged-in private catalog: add folders and generate into the player's bank. */
export default function PlayerCatalog(props: { onBack: () => void }) {
  const catalog = usePlayerCatalog()

  if (catalog.loadError) {
    return (
      <div className="mt-8 flex flex-col gap-4">
        <p className="text-sm text-red-400">{catalog.loadError}</p>
        <button type="button" className="text-sm text-sky-400" onClick={props.onBack}>
          {strings.myBackToPlay}
        </button>
      </div>
    )
  }

  return (
    <div className="mt-8 flex flex-col gap-4">
      {catalog.error ? <p className="text-sm text-red-400">{catalog.error}</p> : null}
      {catalog.message && !catalog.generatingDifficulty ? (
        <p className="text-sm text-emerald-400">{catalog.message}</p>
      ) : null}
      <PlayerCatalogViews
        level={catalog.level}
        categories={catalog.categories}
        topics={catalog.topics}
        bankCounts={catalog.bankCounts}
        sortedCategories={catalog.sortedCategories}
        subjectsHere={catalog.subjectsHere}
        selectedCategory={catalog.selectedCategory}
        selectedTopic={catalog.selectedTopic}
        subjectsInCategory={catalog.subjectsInCategory}
        renameDraft={catalog.renameDraft}
        onRenameDraft={catalog.setRenameDraft}
        generateCount={catalog.generateCount}
        onGenerateCount={catalog.setGenerateCount}
        generateDifficulties={catalog.generateDifficulties}
        onToggleGenerateDifficulty={catalog.toggleGenerateDifficulty}
        generatingDifficulty={catalog.generatingDifficulty}
        error={catalog.error}
        message={catalog.message}
        onBackToPlay={props.onBack}
        onHome={catalog.goHome}
        onAddCategory={catalog.addCategory}
        onOpenCategory={catalog.openCategory}
        onPatchCategory={catalog.patchCategory}
        onConfirmNewCategory={() => void catalog.confirmNewCategory()}
        onStartRename={catalog.startRename}
        onSaveRename={() => void catalog.saveRename()}
        onCancelRename={() => {
          catalog.setRenameDraft('')
          catalog.setLevel('subjects')
          catalog.setError('')
        }}
        pendingRemove={catalog.pendingRemove}
        onAskRemoveCategory={() => {
          catalog.setPendingRemove({ kind: 'category' })
          catalog.setError('')
        }}
        onAskRemoveTopic={(id) => {
          catalog.setPendingRemove({ kind: 'topic', id })
          catalog.setError('')
        }}
        onCancelPendingRemove={() => {
          catalog.setPendingRemove(null)
          catalog.setError('')
        }}
        onRemoveCategory={(id) => void catalog.removeCategory(id)}
        onAddTopic={catalog.addTopic}
        onOpenQuestions={(id) => {
          catalog.setSelectedTopicId(id)
          catalog.setLevel('questions')
          catalog.setError('')
        }}
        onGoSubjects={catalog.goSubjects}
        onPatchTopic={catalog.patchTopic}
        onConfirmNewSubject={() => void catalog.confirmNewSubject()}
        onEditSubject={() => {
          catalog.setLevel('edit-subject')
          catalog.setError('')
        }}
        onStartRenameTopic={catalog.startRenameTopic}
        topicRenameDraft={catalog.topicRenameDraft}
        onTopicRenameDraft={catalog.setTopicRenameDraft}
        topicRenameOpen={Boolean(catalog.topicRenameId)}
        onSaveTopicRename={() => void catalog.saveTopicRename()}
        onCancelTopicRename={catalog.cancelTopicRename}
        onSaveTopic={() => void catalog.saveTopic()}
        onCancelEditSubject={() => {
          catalog.setLevel('questions')
          catalog.setError('')
        }}
        onRemoveTopic={(id) => void catalog.removeTopic(id)}
        onGenerateAll={catalog.openGenerateAll}
        onGenerateBank={(d) => void catalog.generateBank(d)}
        onAskClearDifficulty={(d) => {
          catalog.setPendingRemove({ kind: 'clear', difficulty: d })
          catalog.setError('')
        }}
        onClearQuestions={() => {
          if (catalog.pendingRemove?.kind !== 'clear') {
            return
          }
          void catalog.clearTopicQuestions(catalog.pendingRemove.difficulty)
        }}
        selectedDifficulty={catalog.selectedDifficulty}
        questionQuery={catalog.questionQuery}
        onQuestionQuery={catalog.setQuestionQuery}
        bankQuestions={catalog.bankQuestions}
        filteredQuestions={catalog.filteredBankQuestions}
        selectedQuestionIds={catalog.selectedQuestionIds}
        pendingRemoveIds={catalog.pendingRemoveIds}
        onOpenQuestionList={(d) => void catalog.openQuestionList(d)}
        onQuestionList={() => {
          catalog.setPendingRemoveIds([])
          catalog.setLevel('question-list')
          catalog.setError('')
        }}
        onToggleQuestion={catalog.toggleQuestionSelected}
        onToggleAllFiltered={catalog.toggleAllFilteredQuestions}
        onStartRemoveQuestion={catalog.startRemoveQuestion}
        onRemoveSelected={catalog.startRemoveSelected}
        onRemoveAll={catalog.startRemoveAll}
        onConfirmRemoveQuestions={() => void catalog.confirmRemoveQuestions()}
        onCancelRemoveQuestions={catalog.cancelRemoveQuestions}
      />
    </div>
  )
}
