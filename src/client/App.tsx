import { useEffect, useState } from 'react'
import { GenerateAllHost } from './catalogUi'
import AdminPage from './pages/Admin'
import HomePage from './pages/Home'
import PlayPage from './pages/Play'

/** Tiny path-based router. Avoids an extra routing library. */
export default function App() {
  const [loc, setLoc] = useState(() => window.location.pathname + window.location.search)

  useEffect(() => {
    const sync = () => setLoc(window.location.pathname + window.location.search)
    window.addEventListener('popstate', sync)
    window.addEventListener('pageshow', sync)
    return () => {
      window.removeEventListener('popstate', sync)
      window.removeEventListener('pageshow', sync)
    }
  }, [])

  const pathname = loc.split('?')[0]
  const search = loc.includes('?') ? loc.slice(loc.indexOf('?')) : ''
  const page = pathname.startsWith('/admin') ? (
    <AdminPage />
  ) : pathname.startsWith('/play') ? (
    // New topic/query must remount so we do not keep the previous round in memory.
    <PlayPage key={search} />
  ) : (
    <HomePage />
  )

  return (
    <>
      {page}
      <GenerateAllHost />
    </>
  )
}
