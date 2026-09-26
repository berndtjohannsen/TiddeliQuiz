import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import type { Hono } from 'hono'
import type { Difficulty, LogLevel } from '../shared/types'
import { generateQuizRound, isCancelledError } from './ai'
import { getAdminCredentials } from './config'
import { generateAllJobJson, startGenerateAllJob } from './generateAllJob'
import { cookieName, isAdmin, sessions } from './httpAuth'
import {
  bankCountsForQuestion,
  difficulties,
  parseGenerateBody,
  parseOptionalDifficulty,
  parseQuestionIds,
} from './httpParse'
import { getLogLines, log, setLogLevel } from './log'
import {
  appendPlatformQuestions,
  appendUserQuestions,
  deleteBankQuestion,
  deleteBankQuestions,
  deleteQuestionsForTopic,
  findPlayerById,
  listPlayerUsers,
  loadAiPublic,
  loadBankCounts,
  loadBankCountsForUser,
  loadBankQuestions,
  loadBankQuestionTexts,
  loadLogLevel,
  loadPlatformCatalog,
  loadUserCatalog,
  loadUserCatalogWithCounts,
  saveAiSettings,
  saveLogLevel,
  updateBankQuestion,
} from './store'

const logLevels: LogLevel[] = ['error', 'warn', 'info', 'debug']

/** Admin login, settings, platform bank, and Users-tab bank. */
export function mountAdminApi(app: Hono) {
  app.post('/api/admin/login', async (c) => {
    const body = await c.req.json<{ username?: string; password?: string }>()
    const expected = getAdminCredentials()
    if (body.username !== expected.username || body.password !== expected.password) {
      log('warn', 'Admin login failed')
      return c.json({ error: 'Invalid credentials' }, 401)
    }
    const token = crypto.randomUUID()
    sessions.add(token)
    setCookie(c, cookieName, token, {
      httpOnly: true,
      path: '/',
      sameSite: 'Lax',
      maxAge: 60 * 60 * 8,
    })
    log('info', 'Admin logged in')
    return c.json({ ok: true })
  })

  app.post('/api/admin/logout', (c) => {
    const token = getCookie(c, cookieName)
    if (token) {
      sessions.delete(token)
    }
    deleteCookie(c, cookieName, { path: '/' })
    return c.json({ ok: true })
  })

  app.get('/api/admin/config', (c) => {
    if (!isAdmin(c)) {
      return c.json({ error: 'Unauthorized' }, 401)
    }
    const catalog = loadPlatformCatalog()
    return c.json({
      ai: loadAiPublic(),
      categories: catalog.categories,
      topics: catalog.topics,
      logLevel: loadLogLevel(),
      bankCounts: loadBankCounts(),
    })
  })

  app.put('/api/admin/ai', async (c) => {
    if (!isAdmin(c)) {
      return c.json({ error: 'Unauthorized' }, 401)
    }
    const body = await c.req.json<{
      baseURL?: string
      model?: string
      timeoutMs?: number
      temperature?: number
      thinkingEnabled?: boolean
      fetchSourceEnabled?: boolean
      apiKey?: string
    }>()
    const baseURL = (body.baseURL ?? '').trim()
    const model = (body.model ?? '').trim()
    const timeoutMs = Number(body.timeoutMs)
    const temperature = Number(body.temperature)
    if (!baseURL || !model || !Number.isFinite(timeoutMs) || !Number.isFinite(temperature)) {
      return c.json({ error: 'Invalid AI settings' }, 400)
    }
    saveAiSettings({
      baseURL,
      model,
      timeoutMs,
      temperature,
      thinkingEnabled: body.thinkingEnabled === true,
      fetchSourceEnabled: body.fetchSourceEnabled === true,
      apiKey: body.apiKey,
    })
    log('info', 'Admin saved AI settings')
    return c.json({ ai: loadAiPublic() })
  })

  app.put('/api/admin/log-level', async (c) => {
    if (!isAdmin(c)) {
      return c.json({ error: 'Unauthorized' }, 401)
    }
    const body = await c.req.json<{ logLevel?: string }>()
    if (!logLevels.includes(body.logLevel as LogLevel)) {
      return c.json({ error: 'Invalid log level' }, 400)
    }
    const logLevel = body.logLevel as LogLevel
    saveLogLevel(logLevel)
    setLogLevel(logLevel)
    log('info', `Admin set log level to ${logLevel}`)
    return c.json({ logLevel })
  })

  app.get('/api/admin/log', (c) => {
    if (!isAdmin(c)) {
      return c.json({ error: 'Unauthorized' }, 401)
    }
    return c.json({ lines: getLogLines() })
  })

  /** Fill the platform bank for one subject and difficulty. */
  app.post('/api/admin/bank/generate', async (c) => {
    if (!isAdmin(c)) {
      return c.json({ error: 'Unauthorized' }, 401)
    }
    const body = await c.req.json<{
      topicId?: string
      difficulty?: string
      count?: number
    }>()
    const { topicId, difficulty, count } = parseGenerateBody(body)
    const topic = loadPlatformCatalog().topics.find((t) => t.id === topicId)
    if (!topic) {
      return c.json({ error: 'Unknown subject' }, 400)
    }
    const exclude = loadBankQuestionTexts(topic.id, difficulty).slice(0, 60).map((q) => q.slice(0, 200))

    try {
      // Do not abort on the HTTP request signal: sequential Generate all was
      // cancelled after the first difficulty (false "client disconnected").
      const questions = await generateQuizRound({
        topic,
        count,
        difficulty,
        exclude,
      })
      const { added, skipped } = appendPlatformQuestions(topic.id, difficulty, questions)
      log('info', `Admin bank: +${added} for ${topic.name} (${difficulty}), skipped ${skipped}`)
      return c.json({
        added,
        skipped,
        bankCounts: loadBankCounts(),
      })
    } catch (err) {
      if (isCancelledError(err)) {
        return c.body(null, 204)
      }
      log('error', `Admin bank generate failed: ${String(err)}`)
      return c.json({ error: 'Could not generate questions. Try again.' }, 502)
    }
  })

  /** Start platform Generate all. The job keeps going even if the popup closes. */
  app.post('/api/admin/bank/generate-all', async (c) => {
    if (!isAdmin(c)) {
      return c.json({ error: 'Unauthorized' }, 401)
    }
    const { topicId, count, difficulties: selected } = parseGenerateBody(
      await c.req.json<{ topicId?: string; count?: number; difficulties?: unknown }>(),
    )
    if (!selected.length) {
      return c.json({ error: 'Pick at least one difficulty' }, 400)
    }
    const topic = loadPlatformCatalog().topics.find((t) => t.id === topicId)
    if (!topic) {
      return c.json({ error: 'Unknown subject' }, 400)
    }
    const jobId = startGenerateAllJob({
      topic,
      count,
      who: 'Admin',
      difficulties: selected,
      exclude: (difficulty) => loadBankQuestionTexts(topic.id, difficulty),
      append: (difficulty, questions, visibleOn) =>
        appendPlatformQuestions(topic.id, difficulty, questions, visibleOn),
      counts: () => loadBankCounts(),
    })
    return c.json({ jobId })
  })

  app.get('/api/admin/bank/generate-all/:jobId', (c) => {
    if (!isAdmin(c)) {
      return c.json({ error: 'Unauthorized' }, 401)
    }
    return generateAllJobJson(c, c.req.param('jobId'))
  })

  /** List platform questions for one subject and difficulty. */
  app.get('/api/admin/bank/questions', (c) => {
    if (!isAdmin(c)) {
      return c.json({ error: 'Unauthorized' }, 401)
    }
    const topicId = String(c.req.query('topicId') ?? '')
    const difficulty = c.req.query('difficulty')
    if (!topicId || !difficulties.includes(difficulty as Difficulty)) {
      return c.json({ error: 'Unknown subject or difficulty' }, 400)
    }
    return c.json({ questions: loadBankQuestions(topicId, difficulty as Difficulty) })
  })

  /** Save edits to one platform question. */
  app.put('/api/admin/bank/questions/:id', async (c) => {
    if (!isAdmin(c)) {
      return c.json({ error: 'Unauthorized' }, 401)
    }
    const id = c.req.param('id')
    const body = await c.req.json<{
      question?: string
      options?: unknown
      correctIndex?: number
      explanation?: string
      sourceUrl?: string
    }>()
    const options = Array.isArray(body.options)
      ? body.options.map((o) => String(o ?? '').trim()).filter(Boolean)
      : []
    const correctIndex = Number(body.correctIndex)
    if (!String(body.question ?? '').trim() || options.length < 2 || !Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= options.length) {
      return c.json({ error: 'Invalid question' }, 400)
    }
    const result = updateBankQuestion(id, {
      question: String(body.question),
      options,
      correctIndex,
      explanation: String(body.explanation ?? ''),
      sourceUrl: String(body.sourceUrl ?? ''),
    })
    if ('error' in result) {
      if (result.error === 'duplicate') {
        return c.json({ error: 'A question with this text already exists' }, 400)
      }
      return c.json({ error: 'Unknown question' }, 404)
    }
    log('info', `Admin updated question ${id}`)
    return c.json({
      question: result.question,
      bankCounts: bankCountsForQuestion(result.question.ownerType, result.question.ownerId),
    })
  })

  /** Delete one stored question. */
  app.delete('/api/admin/bank/questions/:id', (c) => {
    if (!isAdmin(c)) {
      return c.json({ error: 'Unauthorized' }, 401)
    }
    const id = c.req.param('id')
    const removed = deleteBankQuestion(id)
    if (!removed) {
      return c.json({ error: 'Unknown question' }, 404)
    }
    log('info', `Admin removed question ${id}`)
    return c.json({
      ok: true,
      bankCounts: bankCountsForQuestion(removed.ownerType, removed.ownerId),
    })
  })

  /** Delete selected platform questions. */
  app.post('/api/admin/bank/questions/delete', async (c) => {
    if (!isAdmin(c)) {
      return c.json({ error: 'Unauthorized' }, 401)
    }
    const ids = parseQuestionIds(await c.req.json<{ ids?: unknown }>())
    if (!ids.length) {
      return c.json({ error: 'No questions selected' }, 400)
    }
    const result = deleteBankQuestions(ids, { kind: 'platform' })
    log('info', `Admin removed ${result.removed} platform question(s)`)
    return c.json({ ok: true, removed: result.removed, bankCounts: result.bankCounts })
  })

  /** Delete every platform question for one subject. */
  app.post('/api/admin/bank/questions/clear', async (c) => {
    if (!isAdmin(c)) {
      return c.json({ error: 'Unauthorized' }, 401)
    }
    const body = await c.req.json<{ topicId?: string; difficulty?: string }>()
    const topicId = String(body.topicId ?? '')
    const topic = loadPlatformCatalog().topics.find((t) => t.id === topicId)
    if (!topic) {
      return c.json({ error: 'Unknown subject' }, 400)
    }
    const difficulty = parseOptionalDifficulty(body.difficulty)
    const result = deleteQuestionsForTopic(topicId, { kind: 'platform' }, difficulty)
    log(
      'info',
      `Admin cleared ${result.removed} question(s) for ${topic.name}${difficulty ? ` (${difficulty})` : ''}`,
    )
    return c.json({ ok: true, removed: result.removed, bankCounts: result.bankCounts })
  })

  app.get('/api/admin/users', (c) => {
    if (!isAdmin(c)) {
      return c.json({ error: 'Unauthorized' }, 401)
    }
    return c.json({ users: listPlayerUsers() })
  })

  app.get('/api/admin/users/:userId/catalog', (c) => {
    if (!isAdmin(c)) {
      return c.json({ error: 'Unauthorized' }, 401)
    }
    const account = findPlayerById(c.req.param('userId'))
    if (!account) {
      return c.json({ error: 'Unknown user' }, 404)
    }
    return c.json({
      id: account.id,
      username: account.username,
      ...loadUserCatalogWithCounts(account.id),
    })
  })

  app.post('/api/admin/users/:userId/bank/generate', async (c) => {
    if (!isAdmin(c)) {
      return c.json({ error: 'Unauthorized' }, 401)
    }
    const account = findPlayerById(c.req.param('userId'))
    if (!account) {
      return c.json({ error: 'Unknown user' }, 404)
    }
    const { topicId, difficulty, count } = parseGenerateBody(
      await c.req.json<{ topicId?: string; difficulty?: string; count?: number }>(),
    )
    const topic = loadUserCatalog(account.id).topics.find((t) => t.id === topicId)
    if (!topic) {
      return c.json({ error: 'Unknown subject' }, 400)
    }
    const exclude = loadBankQuestionTexts(topic.id, difficulty, 'user', account.id)
      .slice(0, 60)
      .map((q) => q.slice(0, 200))
    try {
      const questions = await generateQuizRound({ topic, count, difficulty, exclude })
      const { added, skipped } = appendUserQuestions(account.id, topic.id, difficulty, questions)
      log('info', `Admin user bank: +${added} for ${account.username} / ${topic.name} (${difficulty}), skipped ${skipped}`)
      return c.json({
        added,
        skipped,
        bankCounts: loadBankCountsForUser(account.id),
      })
    } catch (err) {
      if (isCancelledError(err)) {
        return c.body(null, 204)
      }
      log('error', `Admin user bank generate failed: ${String(err)}`)
      return c.json({ error: 'Could not generate questions. Try again.' }, 502)
    }
  })

  app.post('/api/admin/users/:userId/bank/generate-all', async (c) => {
    if (!isAdmin(c)) {
      return c.json({ error: 'Unauthorized' }, 401)
    }
    const account = findPlayerById(c.req.param('userId'))
    if (!account) {
      return c.json({ error: 'Unknown user' }, 404)
    }
    const { topicId, count, difficulties: selected } = parseGenerateBody(
      await c.req.json<{ topicId?: string; count?: number; difficulties?: unknown }>(),
    )
    if (!selected.length) {
      return c.json({ error: 'Pick at least one difficulty' }, 400)
    }
    const topic = loadUserCatalog(account.id).topics.find((t) => t.id === topicId)
    if (!topic) {
      return c.json({ error: 'Unknown subject' }, 400)
    }
    const jobId = startGenerateAllJob({
      topic,
      count,
      who: `Admin for ${account.username}`,
      difficulties: selected,
      exclude: (difficulty) => loadBankQuestionTexts(topic.id, difficulty, 'user', account.id),
      append: (difficulty, questions, visibleOn) =>
        appendUserQuestions(account.id, topic.id, difficulty, questions, visibleOn),
      counts: () => loadBankCountsForUser(account.id),
    })
    return c.json({ jobId })
  })

  app.get('/api/admin/users/:userId/bank/generate-all/:jobId', (c) => {
    if (!isAdmin(c)) {
      return c.json({ error: 'Unauthorized' }, 401)
    }
    return generateAllJobJson(c, c.req.param('jobId'))
  })

  app.get('/api/admin/users/:userId/bank/questions', (c) => {
    if (!isAdmin(c)) {
      return c.json({ error: 'Unauthorized' }, 401)
    }
    const account = findPlayerById(c.req.param('userId'))
    if (!account) {
      return c.json({ error: 'Unknown user' }, 404)
    }
    const topicId = String(c.req.query('topicId') ?? '')
    const difficulty = c.req.query('difficulty')
    if (!topicId || !difficulties.includes(difficulty as Difficulty)) {
      return c.json({ error: 'Unknown subject or difficulty' }, 400)
    }
    const topic = loadUserCatalog(account.id).topics.find((t) => t.id === topicId)
    if (!topic) {
      return c.json({ error: 'Unknown subject' }, 400)
    }
    return c.json({
      questions: loadBankQuestions(topicId, difficulty as Difficulty, 'user', account.id),
    })
  })

  /** Delete selected questions in a player's bank (Admin Users). */
  app.post('/api/admin/users/:userId/bank/questions/delete', async (c) => {
    if (!isAdmin(c)) {
      return c.json({ error: 'Unauthorized' }, 401)
    }
    const account = findPlayerById(c.req.param('userId'))
    if (!account) {
      return c.json({ error: 'Unknown user' }, 404)
    }
    const ids = parseQuestionIds(await c.req.json<{ ids?: unknown }>())
    if (!ids.length) {
      return c.json({ error: 'No questions selected' }, 400)
    }
    const result = deleteBankQuestions(ids, { kind: 'user', userId: account.id })
    log('info', `Admin removed ${result.removed} question(s) for ${account.username}`)
    return c.json({ ok: true, removed: result.removed, bankCounts: result.bankCounts })
  })

  /** Delete every question in a player's subject (Admin Users). */
  app.post('/api/admin/users/:userId/bank/questions/clear', async (c) => {
    if (!isAdmin(c)) {
      return c.json({ error: 'Unauthorized' }, 401)
    }
    const account = findPlayerById(c.req.param('userId'))
    if (!account) {
      return c.json({ error: 'Unknown user' }, 404)
    }
    const body = await c.req.json<{ topicId?: string; difficulty?: string }>()
    const topicId = String(body.topicId ?? '')
    const topic = loadUserCatalog(account.id).topics.find((t) => t.id === topicId)
    if (!topic) {
      return c.json({ error: 'Unknown subject' }, 400)
    }
    const difficulty = parseOptionalDifficulty(body.difficulty)
    const result = deleteQuestionsForTopic(topicId, { kind: 'user', userId: account.id }, difficulty)
    log(
      'info',
      `Admin cleared ${result.removed} question(s) for ${account.username} / ${topic.name}${difficulty ? ` (${difficulty})` : ''}`,
    )
    return c.json({ ok: true, removed: result.removed, bankCounts: result.bankCounts })
  })
}
