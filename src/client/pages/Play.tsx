import { AdSlot } from './HomeViews'
import { PlayError, PlayQuestion, PlaySummary } from './PlayViews'
import { usePlayPage } from './usePlayPage'

/** Quiz round: uses questions stored after Start. Does not call the AI. */
export default function PlayPage() {
  const play = usePlayPage()

  if (!play.hasSession) {
    return null
  }

  return (
    <main className="mx-auto max-w-md p-6">
      {play.status === 'error' ? <PlayError message={play.error} /> : null}
      {play.status === 'play' ? <PlayQuestion play={play} /> : null}
      {play.status === 'summary' ? <PlaySummary play={play} /> : null}
      <AdSlot />
    </main>
  )
}
