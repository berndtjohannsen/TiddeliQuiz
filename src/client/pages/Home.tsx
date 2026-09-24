import PlayerCatalog from './PlayerCatalog'
import { Results } from './Results'
import { AdSlot, ChooseGate, PlayHeader, StartForm, UserLoginGate } from './HomeViews'
import { useHomePage } from './useHomePage'

/** Start: Logga in or guest, then pick category, topic, difficulty, count. */
export default function HomePage() {
  const home = useHomePage()

  if (home.gate === 'choose') {
    return <ChooseGate onUser={home.goUserLogin} onGuest={home.onGuest} />
  }

  if (home.gate === 'user-login') {
    return (
      <UserLoginGate
        error={home.loginError}
        username={home.loginName}
        password={home.loginPassword}
        onUsername={home.setLoginName}
        onPassword={home.setLoginPassword}
        onSubmit={(e) => void home.onUserLogin(e)}
        onBack={home.goChoose}
      />
    )
  }

  return (
    <main className="mx-auto max-w-md p-6">
      <PlayHeader
        player={home.player}
        isGuest={home.isGuest}
        playView={home.playView}
        onResults={() => home.setPlayView('results')}
        onLogout={() => void home.onLogout()}
      />

      {!home.isGuest && home.playView === 'mine' ? (
        <PlayerCatalog onBack={home.backFromMine} />
      ) : home.playView === 'results' ? (
        <Results onBack={() => home.setPlayView('play')} onPlayAgain={home.onPlayAgain} />
      ) : (
        <StartForm
          isGuest={home.isGuest}
          categories={home.categories}
          platformCategories={home.platformCategories}
          myCategories={home.myCategories}
          topics={home.topics}
          categoryId={home.categoryId}
          topicId={home.topicId}
          pickingMine={home.pickingMine}
          status={home.status}
          busy={home.busy}
          count={home.count}
          countChoices={home.countChoices}
          difficulty={home.difficulty}
          guestDifficulties={home.guestDifficulties}
          startError={home.startError}
          bankExhausted={home.bankExhausted}
          canStart={home.canStart}
          onPickCategory={home.onPickCategory}
          onPickTopic={home.onPickTopic}
          onCount={home.onCount}
          onDifficulty={home.onDifficulty}
          onMine={home.openMine}
          onReplayBank={() => void home.onReplayBank()}
          onSubmit={(e) => void home.onStart(e)}
        />
      )}

      <AdSlot />
    </main>
  )
}
