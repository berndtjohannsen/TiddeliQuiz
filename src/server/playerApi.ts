import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import type { Hono } from 'hono'
import type { Difficulty } from '../shared/types'
import { appendPlayerAttempt, listPlayerAttempts, parseAttemptFields } from './attemptsStore'
import { generateQuizRound, isCancelledError } from './ai'
import { generateAllJobJson, startGenerateAllJob } from './generateAllJob'
import { playerAccount, playerCookie, playerSessions } from './httpAuth'
import { difficulties, parseGenerateBody, parseOptionalDifficulty, parseQuestionIds } from './httpParse'
import { log } from './log'
import {
  appendUserQuestions,
  deleteBankQuestions,
  deleteQuestionsForTopic,
  findPlayerUser,
  loadBankCountsForUser,
  loadBankQuestions,
  loadBankQuestionTexts,
  loadUserCatalog,
  loadUserCatalogWithCounts,
} from './store'

/** Player login and private bank routes. */
export function mountPlayerApi(app: Hono) {
  app.post('/api/player/login', async (c) => {
    const body = await c.req.json<{ username?: string; password?: string }>()
    const account = findPlayerUser(String(body.username ?? ''), String(body.password ?? ''))
    if (!account) {
      log('warn', 'Player login failed')
      return c.json({ error: 'Invalid credentials' }, 401)
    }
    const token = crypto.randomUUID()
    playerSessions.set(token, account)
    setCookie(c, playerCookie, token, {
      httpOnly: true,
      path: '/',
      sameSite: 'Lax',
      maxAge: 60 * 60 * 8,
    })
    log('info', `Player logged in: ${account.username}`)
    return c.json({ ok: true, username: account.username, id: account.id })
  })

  app.post('/api/player/logout', (c) => {
    const token = getCookie(c, playerCookie)
    if (token) {
      playerSessions.delete(token)
    }
    deleteCookie(c, playerCookie, { path: '/' })
    return c.json({ ok: true })
  })

  app.get('/api/player/catalog', (c) => {
    const player = playerAccount(c)
    if (!player) {
      return c.json({ error: 'Unauthorized' }, 401)
    }
    return c.json(loadUserCatalogWithCounts(player.id))
  })

  app.post('/api/player/bank/generate', async (c) => {
    const player = playerAccount(c)
    if (!player) {
      return c.json({ error: 'Unauthorized' }, 401)
    }
    const { topicId, difficulty, count } = parseGenerateBody(
      await c.req.json<{ topicId?: string; difficulty?: string; count?: number }>(),
    )
    const topic = loadUserCatalog(player.id).topics.find((t) => t.id === topicId)
    if (!topic) {
      return c.json({ error: 'Unknown subject' }, 400)
    }
    const exclude = loadBankQuestionTexts(topic.id, difficulty, 'user', player.id)
      .slice(0, 60)
      .map((q) => q.slice(0, 200))
    try {
      const questions = await generateQuizRound({ topic, count, difficulty, exclude })
      const { added, skipped } = appendUserQuestions(player.id, topic.id, difficulty, questions)
      log('info', `Player bank: +${added} for ${topic.name} (${difficulty}), skipped ${skipped}`)
      return c.json({
        added,
        skipped,
        bankCounts: loadBankCountsForUser(player.id),
      })
    } catch (err) {
      if (isCancelledError(err)) {
        return c.body(null, 204)
      }
      log('error', `Player bank generate failed: ${String(err)}`)
      return c.json({ error: 'Could not generate questions. Try again.' }, 502)
    }
  })

  /** Start Generate all. The job keeps going even if the browser leaves. */
  app.post('/api/player/bank/generate-all', async (c) => {
    const player = playerAccount(c)
    if (!player) {
      return c.json({ error: 'Unauthorized' }, 401)
    }
    const { topicId, count, difficulties: selected } = parseGenerateBody(
      await c.req.json<{ topicId?: string; count?: number; difficulties?: unknown }>(),
    )
    if (!selected.length) {
      return c.json({ error: 'Pick at least one difficulty' }, 400)
    }
    const topic = loadUserCatalog(player.id).topics.find((t) => t.id === topicId)
    if (!topic) {
      return c.json({ error: 'Unknown subject' }, 400)
    }
    const jobId = startGenerateAllJob({
      topic,
      count,
      who: `Player ${player.username}`,
      difficulties: selected,
      exclude: (difficulty) => loadBankQuestionTexts(topic.id, difficulty, 'user', player.id),
      append: (difficulty, questions, visibleOn) =>
        appendUserQuestions(player.id, topic.id, difficulty, questions, visibleOn),
      counts: () => loadBankCountsForUser(player.id),
    })
    return c.json({ jobId })
  })

  app.get('/api/player/bank/generate-all/:jobId', (c) => {
    const player = playerAccount(c)
    if (!player) {
      return c.json({ error: 'Unauthorized' }, 401)
    }
    return generateAllJobJson(c, c.req.param('jobId'))
  })

  /** List this player's questions for one subject and difficulty. */
  app.get('/api/player/bank/questions', (c) => {
    const player = playerAccount(c)
    if (!player) {
      return c.json({ error: 'Unauthorized' }, 401)
    }
    const topicId = String(c.req.query('topicId') ?? '')
    const difficulty = c.req.query('difficulty')
    if (!topicId || !difficulties.includes(difficulty as Difficulty)) {
      return c.json({ error: 'Unknown subject or difficulty' }, 400)
    }
    const topic = loadUserCatalog(player.id).topics.find((t) => t.id === topicId)
    if (!topic) {
      return c.json({ error: 'Unknown subject' }, 400)
    }
    return c.json({
      questions: loadBankQuestions(topicId, difficulty as Difficulty, 'user', player.id),
    })
  })

  /** Delete selected questions in this player's bank. */
  app.post('/api/player/bank/questions/delete', async (c) => {
    const player = playerAccount(c)
    if (!player) {
      return c.json({ error: 'Unauthorized' }, 401)
    }
    const ids = parseQuestionIds(await c.req.json<{ ids?: unknown }>())
    if (!ids.length) {
      return c.json({ error: 'No questions selected' }, 400)
    }
    const result = deleteBankQuestions(ids, { kind: 'user', userId: player.id })
    log('info', `Player removed ${result.removed} question(s)`)
    return c.json({ ok: true, removed: result.removed, bankCounts: result.bankCounts })
  })

  /** Delete questions in this player's subject. Optional: one difficulty. */
  app.post('/api/player/bank/questions/clear', async (c) => {
    const player = playerAccount(c)
    if (!player) {
      return c.json({ error: 'Unauthorized' }, 401)
    }
    const body = await c.req.json<{ topicId?: string; difficulty?: string }>()
    const topicId = String(body.topicId ?? '')
    const topic = loadUserCatalog(player.id).topics.find((t) => t.id === topicId)
    if (!topic) {
      return c.json({ error: 'Unknown subject' }, 400)
    }
    const difficulty = parseOptionalDifficulty(body.difficulty)
    const result = deleteQuestionsForTopic(topicId, { kind: 'user', userId: player.id }, difficulty)
    log(
      'info',
      `Player cleared ${result.removed} question(s) for ${topic.name}${difficulty ? ` (${difficulty})` : ''}`,
    )
    return c.json({ ok: true, removed: result.removed, bankCounts: result.bankCounts })
  })

  /** Finished quizzes for this player. Newest first. */
  app.get('/api/player/attempts', (c) => {
    const player = playerAccount(c)
    if (!player) {
      return c.json({ error: 'Unauthorized' }, 401)
    }
    return c.json({ attempts: listPlayerAttempts(player.id) })
  })

  app.post('/api/player/attempts', async (c) => {
    const player = playerAccount(c)
    if (!player) {
      return c.json({ error: 'Unauthorized' }, 401)
    }
    const parsed = parseAttemptFields(await c.req.json())
    if ('error' in parsed) {
      return c.json({ error: parsed.error }, 400)
    }
    const attempt = appendPlayerAttempt(player.id, parsed)
    log('info', `Player ${player.username} saved attempt ${attempt.topicName} (${attempt.difficulty})`)
    return c.json({ attempt })
  })
}
