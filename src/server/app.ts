import fs from 'node:fs'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import type { PlayDifficulty } from '../shared/types'
import { mountAdminApi } from './adminApi'
import { mountCatalogMutations } from './catalogMutations'
import { isAdmin, playerAccount } from './httpAuth'
import { difficulties, routeParam } from './httpParse'
import { log } from './log'
import { mountPlayerApi } from './playerApi'
import {
  drawPlatformRound,
  drawUserRound,
  findPlayerById,
  isPlatformCategory,
  loadCatalog,
  loadGuestCatalog,
  loadPlayerCatalog,
} from './store'

/** HTTP API. Player and admin UIs call these routes. */
export const app = new Hono()

mountCatalogMutations(app, '/api/player', (c) => {
  const player = playerAccount(c)
  if (!player) {
    return { error: 'Unauthorized', status: 401 }
  }
  return { owner: { kind: 'user', userId: player.id }, who: `Player ${player.username}` }
})

mountCatalogMutations(app, '/api/admin', (c) => {
  if (!isAdmin(c)) {
    return { error: 'Unauthorized', status: 401 }
  }
  return { owner: { kind: 'platform' }, who: 'Admin' }
})

mountCatalogMutations(app, '/api/admin/users/:userId', (c) => {
  if (!isAdmin(c)) {
    return { error: 'Unauthorized', status: 401 }
  }
  const account = findPlayerById(routeParam(c, 'userId'))
  if (!account) {
    return { error: 'Unknown user', status: 404 }
  }
  return { owner: { kind: 'user', userId: account.id }, who: `Admin for ${account.username}` }
})

mountPlayerApi(app)
mountAdminApi(app)

app.get('/api/health', (c) => {
  return c.json({ ok: true })
})

app.get('/api/catalog', (c) => {
  try {
    const player = playerAccount(c)
    if (!player) {
      return c.json(loadGuestCatalog())
    }
    return c.json(loadPlayerCatalog(player.id))
  } catch (err) {
    log('error', `Failed to load catalog: ${String(err)}`)
    return c.json({ error: 'Could not load catalog' }, 500)
  }
})

app.post('/api/quiz/start', async (c) => {
  const body = await c.req.json<{
    topicId?: string
    count?: number
    difficulty?: string
    exclude?: unknown
  }>()
  const catalog = loadCatalog()
  const topic = catalog.topics.find((t) => t.id === body.topicId)
  if (!topic) {
    return c.json({ error: 'Unknown topic' }, 400)
  }
  const category = catalog.categories.find((row) => row.id === topic.categoryId)
  if (!category) {
    return c.json({ error: 'Unknown topic' }, 400)
  }
  const player = playerAccount(c)
  const platformTopic = isPlatformCategory(category)
  if (!platformTopic && (!player || category.ownerId !== player.id)) {
    return c.json({ error: 'Unknown topic' }, 400)
  }
  const rawCount = Number(body.count)
  const whole = Number.isFinite(rawCount) ? Math.round(rawCount) : 10
  const count = Math.max(5, whole)
  const difficulty: PlayDifficulty =
    body.difficulty === 'all' || difficulties.includes(body.difficulty as (typeof difficulties)[number])
      ? (body.difficulty as PlayDifficulty)
      : 'medium'
  const exclude = Array.isArray(body.exclude)
    ? body.exclude
        .filter((q): q is string => typeof q === 'string')
        .map((q) => q.trim())
        .filter(Boolean)
        .slice(0, 40)
        .map((q) => q.slice(0, 200))
    : []

  // Guest and logged-in start both read the bank. Generate lives in Mina kategorier / Admin.
  const drawn = platformTopic
    ? drawPlatformRound(topic.id, difficulty, count, exclude)
    : drawUserRound(player?.id ?? '', topic.id, difficulty, count, exclude)
  if ('reason' in drawn) {
    const error = drawn.reason === 'no_new' ? 'no_new_questions' : 'bank_too_small'
    log('info', `Bank draw failed for ${topic.name} (${difficulty}): ${error}`)
    return c.json({ error, available: drawn.available, requested: count }, 409)
  }
  if (drawn.questions.length < count) {
    log(
      'info',
      `Short round from bank: ${drawn.questions.length} of ${count} new for ${topic.name} (${difficulty})`,
    )
  } else {
    log('info', `Round from bank: ${drawn.questions.length} for ${topic.name} (${difficulty})`)
  }
  return c.json({
    questions: drawn.questions,
    requested: count,
    available: drawn.unseen,
  })
})

/** Built Vite files. Only in the container / NODE_ENV=production. */
function mountProductionUi() {
  if (process.env.NODE_ENV !== 'production') {
    return
  }
  app.use('/*', serveStatic({ root: './dist' }))
  app.get('*', (c) => {
    if (c.req.path.startsWith('/api')) {
      return c.json({ error: 'Not found' }, 404)
    }
    try {
      return c.html(fs.readFileSync('./dist/index.html', 'utf8'))
    } catch {
      return c.text('UI not built. Run npm run build.', 500)
    }
  })
}

mountProductionUi()
