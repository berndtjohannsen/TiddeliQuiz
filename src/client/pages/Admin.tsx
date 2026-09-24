import { Field, btnClass, btnSecondary, inputClass } from '../catalogUi'
import { strings } from '../strings'
import { AdminCatalogTree } from './admin/AdminCatalogTree'
import { AdminQuestions } from './admin/AdminQuestions'
import { AdminSettings } from './admin/AdminSettings'
import { AdminUsers } from './admin/AdminUsers'
import { useAdminPage } from './admin/useAdminPage'

/** Admin at /admin: Categories, Users, Settings (AI, log). */
export default function AdminPage() {
  const {
    username,
    setUsername,
    password,
    setPassword,
    loggedIn,
    config,
    apiKey,
    setApiKey,
    logLines,
    message,
    error,
    tab,
    catalogOwner,
    playerUsers,
    level,
    query,
    setQuery,
    renameDraft,
    setRenameDraft,
    settingsPage,
    setSettingsPage,
    generateCount,
    setGenerateCount,
    generateDifficulties,
    toggleGenerateDifficulty,
    generatingDifficulty,
    selectedDifficulty,
    listDifficulties,
    bankQuestions,
    questionDraft,
    userScope,
    showCatalog,
    selectedCategory,
    selectedTopic,
    subjectsInCategory,
    showBankNotice,
    filteredCategories,
    filteredTopics,
    filteredBankQuestions,
    selectedQuestionIds,
    pendingRemoveIds,
    onLogin,
    onLogout,
    onAdminTab,
    onSaveAi,
    onSaveLogLevel,
    patchAi,
    setConfig,
    addCategory,
    openCategory,
    confirmNewCategory,
    cancelNewCategory,
    patchCategory,
    goContentHome,
    startRename,
    saveRename,
    cancelRename,
    pendingRemove,
    askRemoveCategory,
    askRemoveCategoryFromList,
    cancelPendingRemove,
    removeCategory,
    askRemoveTopic,
    askClearQuestions,
    askClearDifficulty,
    addTopic,
    openQuestions,
    confirmNewSubject,
    goSubjects,
    patchTopic,
    openEditSubject,
    saveTopic,
    startRenameTopic,
    saveTopicRename,
    cancelTopicRename,
    topicRenameId,
    topicRenameDraft,
    setTopicRenameDraft,
    cancelEditSubject,
    removeTopic,
    openGenerateAll,
    generateBank,
    openQuestionList,
    openSelectedQuestions,
    openEditQuestion,
    startRemoveQuestion,
    toggleQuestionSelected,
    toggleAllFilteredQuestions,
    startRemoveSelected,
    startRemoveAll,
    askRemoveFromEdit,
    patchQuestionDraft,
    patchQuestionOption,
    saveQuestion,
    removeQuestion,
    goQuestionList,
    cancelRemoveQuestion,
    openUserCatalog,
    clearTopicQuestions,
  } = useAdminPage()

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-semibold">{strings.adminTitle}</h1>

      {error && !showBankNotice ? <p className="mt-4 text-sm text-red-400">{error}</p> : null}
      {message && loggedIn && !showBankNotice ? (
        <p className="mt-4 text-sm text-emerald-400">{message}</p>
      ) : null}

      {!loggedIn ? (
        <form className="mt-8 flex max-w-md flex-col gap-4" onSubmit={onLogin}>
          <Field label={strings.username}>
            <input
              className={inputClass}
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </Field>
          <Field label={strings.password}>
            <input
              className={inputClass}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <button type="submit" className={btnClass}>
            {strings.login}
          </button>
        </form>
      ) : config ? (
        <div className="mt-8 flex flex-col gap-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <nav className="flex flex-wrap gap-2" aria-label="Admin sections">
              {(
                [
                  ['categories', strings.adminTabCategories],
                  ['users', strings.adminTabUsers],
                  ['settings', strings.adminTabSettings],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={`rounded px-3 py-1.5 text-sm font-medium ${
                    tab === id ? 'bg-sky-600' : 'bg-slate-700'
                  }`}
                  onClick={() => onAdminTab(id)}
                >
                  {label}
                </button>
              ))}
            </nav>
            <button type="button" className={btnSecondary} onClick={onLogout}>
              {strings.logout}
            </button>
          </div>

          {showCatalog ? (
            <>
              <AdminCatalogTree
                level={level}
                config={config}
                catalogOwner={catalogOwner}
                userScope={userScope}
                selectedCategory={selectedCategory}
                selectedTopic={selectedTopic}
                subjectsInCategory={subjectsInCategory}
                query={query}
                onQuery={setQuery}
                renameDraft={renameDraft}
                onRenameDraft={setRenameDraft}
                filteredCategories={filteredCategories}
                filteredTopics={filteredTopics}
                generateCount={generateCount}
                onGenerateCount={setGenerateCount}
                generateDifficulties={generateDifficulties}
                onToggleGenerateDifficulty={toggleGenerateDifficulty}
                generatingDifficulty={generatingDifficulty}
                error={error}
                message={message}
                onAddCategory={addCategory}
                onOpenCategory={openCategory}
                onConfirmNewCategory={() => void confirmNewCategory()}
                onCancelNewCategory={cancelNewCategory}
                onPatchCategory={patchCategory}
                onHome={goContentHome}
                onStartRename={startRename}
                onSaveRename={() => void saveRename()}
                onCancelRename={cancelRename}
                pendingRemove={pendingRemove}
                onAskRemoveCategory={askRemoveCategory}
                onAskRemoveCategoryFromList={askRemoveCategoryFromList}
                onCancelPendingRemove={cancelPendingRemove}
                onRemoveCategory={(id) => void removeCategory(id)}
                onAddTopic={addTopic}
                onOpenQuestions={openQuestions}
                onAskRemoveTopic={askRemoveTopic}
                onConfirmNewSubject={() => void confirmNewSubject()}
                onGoSubjects={goSubjects}
                onPatchTopic={patchTopic}
                onEditSubject={openEditSubject}
                onStartRenameTopic={startRenameTopic}
                topicRenameDraft={topicRenameDraft}
                onTopicRenameDraft={setTopicRenameDraft}
                topicRenameOpen={Boolean(topicRenameId)}
                onSaveTopicRename={() => void saveTopicRename()}
                onCancelTopicRename={cancelTopicRename}
                onSaveTopic={() => void saveTopic()}
                onCancelEditSubject={() => void cancelEditSubject()}
                onRemoveTopic={(id) => void removeTopic(id)}
                onGenerateAll={openGenerateAll}
                onGenerateBank={(d) => void generateBank(d)}
                onOpenQuestionList={(d) => void openQuestionList(d)}
                onEditSelected={() => void openSelectedQuestions()}
                onAskClearQuestions={askClearQuestions}
                onAskClearDifficulty={askClearDifficulty}
                onClearQuestions={() => {
                  const difficulty =
                    pendingRemove?.kind === 'clear' ? pendingRemove.difficulty : undefined
                  cancelPendingRemove()
                  void clearTopicQuestions(difficulty)
                }}
              />
              {selectedCategory &&
              selectedTopic &&
              (level === 'question-list' || level === 'edit-question') ? (
                <AdminQuestions
                  level={level}
                  userScope={userScope}
                  category={selectedCategory}
                  topic={selectedTopic}
                  difficulties={listDifficulties.length ? listDifficulties : [selectedDifficulty]}
                  query={query}
                  onQuery={setQuery}
                  generateCount={generateCount}
                  onGenerateCount={setGenerateCount}
                  generatingDifficulty={generatingDifficulty}
                  error={error}
                  message={message}
                  questions={bankQuestions}
                  filteredQuestions={filteredBankQuestions}
                  selectedIds={selectedQuestionIds}
                  pendingRemoveIds={pendingRemoveIds}
                  draft={questionDraft}
                  onHome={goContentHome}
                  onSubjects={goSubjects}
                  onQuestions={openQuestions}
                  onQuestionList={goQuestionList}
                  onGenerate={() => void generateBank(selectedDifficulty)}
                  onEdit={openEditQuestion}
                  onStartRemove={startRemoveQuestion}
                  onToggle={toggleQuestionSelected}
                  onToggleAllFiltered={toggleAllFilteredQuestions}
                  onRemoveSelected={startRemoveSelected}
                  onRemoveAll={startRemoveAll}
                  onPatchDraft={patchQuestionDraft}
                  onPatchOption={patchQuestionOption}
                  onSave={() => void saveQuestion()}
                  onAskRemoveFromEdit={askRemoveFromEdit}
                  onConfirmRemove={() => void removeQuestion()}
                  onCancelRemove={cancelRemoveQuestion}
                />
              ) : null}
            </>
          ) : null}

          {tab === 'users' && !catalogOwner ? (
            <AdminUsers users={playerUsers} onOpen={(u) => void openUserCatalog(u)} />
          ) : null}

          {tab === 'settings' ? (
            <AdminSettings
              page={settingsPage}
              config={config}
              apiKey={apiKey}
              logLines={logLines}
              onPage={setSettingsPage}
              onApiKey={setApiKey}
              onPatchAi={patchAi}
              onLogLevel={(logLevel) => setConfig({ ...config, logLevel })}
              onSaveAi={onSaveAi}
              onSaveLogLevel={onSaveLogLevel}
            />
          ) : null}

        </div>
      ) : null}
    </main>
  )
}

