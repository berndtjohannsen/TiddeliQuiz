import fs from 'node:fs'
import path from 'node:path'
import type { AiSettingsPublic, BankCount, Category, Difficulty, LogLevel, PlayDifficulty, QuizQuestion, SourceFocus, StoredQuestion, Topic } from '../shared/types'
import {
  dbBankCounts,
  dbDeleteCategory,
  dbDeleteQuestion,
  dbDeleteQuestions,
  dbDeleteQuestionsForTopic,
  dbDeleteTopic,
  dbGetQuestion,
  dbInsertCategory,
  dbInsertQuestion,
  dbInsertTopic,
  dbLoadCatalog,
  dbLoadQuestions,
  dbUpdateCategory,
  dbUpdateQuestion,
  dbUpdateTopic,
} from './catalogDb'

const dataDir = path.resolve(process.cwd(), 'data')
const usersFile = path.join(dataDir, 'users.json')
const aiFile = path.join(dataDir, 'ai-config.json')
const secretsFile = path.join(dataDir, 'secrets.json')

type AiFile = {
  baseURL: string
  model: string
  timeoutMs: number
  temperature: number
  thinkingEnabled: boolean
  fetchSourceEnabled: boolean
  logLevel: LogLevel
}

type SecretsFile = {
  aiApiKey?: string
}

const logLevels: LogLevel[] = ['error', 'warn', 'info', 'debug']

const defaultAi: AiFile = {
  baseURL: 'https://api.deepseek.com',
  model: 'deepseek-v4-flash',
  timeoutMs: 60_000,
  temperature: 0.7,
  thinkingEnabled: false,
  fetchSourceEnabled: false,
  logLevel: 'info',
}

function parseLogLevel(value: unknown): LogLevel {
  return logLevels.includes(value as LogLevel) ? (value as LogLevel) : defaultAi.logLevel
}

function readJson<T>(file: string, fallback: T): T {
  if (!fs.existsSync(file)) {
    return fallback
  }
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T
}

function writeJson(file: string, value: unknown) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

type CatalogFile = {
  categories: Category[]
  topics: Topic[]
}

/** Platform if owner is missing. Private folders set ownerType user. */
export function isPlatformCategory(c: Pick<Category, 'ownerType'>): boolean {
  return c.ownerType !== 'user'
}

/** Optional source URL + how strictly to use it. */
export function topicSourceFields(input: { sourceUrl?: string; sourceFocus?: string }): {
  sourceUrl?: string
  sourceFocus?: SourceFocus
} {
  const sourceUrl = String(input.sourceUrl ?? '').trim()
  if (!sourceUrl) {
    return {}
  }
  return { sourceUrl, sourceFocus: input.sourceFocus === 'only' ? 'only' : 'mainly' }
}

function parseTopic(raw: Partial<Topic>): Topic {
  return {
    id: String(raw.id ?? ''),
    categoryId: String(raw.categoryId ?? ''),
    name: String(raw.name ?? ''),
    optionCount: Math.max(2, Number(raw.optionCount) || 4),
    prompt: String(raw.prompt ?? ''),
    ...topicSourceFields(raw),
  }
}

function parseCategory(raw: Partial<Category>): Category {
  const row: Category = {
    id: String(raw.id ?? ''),
    name: String(raw.name ?? ''),
  }
  if (raw.ownerType === 'user' && raw.ownerId) {
    row.ownerType = 'user'
    row.ownerId = String(raw.ownerId)
  }
  return row
}

/** Read categories and subjects from SQLite. */
export function loadCatalog(): CatalogFile {
  return dbLoadCatalog()
}

/** Admin Categories: platform folders only. Private trees stay under Users. */
export function loadPlatformCatalog(): CatalogFile {
  const catalog = loadCatalog()
  const categories = catalog.categories.filter(isPlatformCategory)
  const keep = new Set(categories.map((c) => c.id))
  return { categories, topics: catalog.topics.filter((t) => keep.has(t.categoryId)) }
}

/** One player's private folders only. */
export function loadUserCatalog(userId: string): CatalogFile {
  const catalog = loadCatalog()
  const categories = catalog.categories.filter(
    (c) => c.ownerType === 'user' && c.ownerId === userId,
  )
  const keep = new Set(categories.map((c) => c.id))
  return { categories, topics: catalog.topics.filter((t) => keep.has(t.categoryId)) }
}

/** Who owns the tree we are editing. Same shape a SQL store can use. */
export type CatalogOwner = { kind: 'platform' } | { kind: 'user'; userId: string }

function categoryOwnedBy(c: Category, owner: CatalogOwner): boolean {
  if (owner.kind === 'platform') {
    return isPlatformCategory(c)
  }
  return c.ownerType === 'user' && c.ownerId === owner.userId
}

function topicOwnedBy(catalog: CatalogFile, topic: Topic, owner: CatalogOwner): boolean {
  const cat = catalog.categories.find((c) => c.id === topic.categoryId)
  return Boolean(cat && categoryOwnedBy(cat, owner))
}

function stampNewCategory(name: string, owner: CatalogOwner): Category {
  if (owner.kind === 'user') {
    return parseCategory({
      id: crypto.randomUUID(),
      name,
      ownerType: 'user',
      ownerId: owner.userId,
    })
  }
  return parseCategory({ id: crypto.randomUUID(), name })
}

function ownerStamp(c: Category): { ownerType: 'platform' | 'user'; ownerId: string | null } {
  if (c.ownerType === 'user' && c.ownerId) {
    return { ownerType: 'user', ownerId: c.ownerId }
  }
  return { ownerType: 'platform', ownerId: null }
}

export function addCategory(
  owner: CatalogOwner,
  name: string,
): { category: Category } | { error: 'empty' } {
  const trimmed = name.trim()
  if (!trimmed) {
    return { error: 'empty' }
  }
  const category = stampNewCategory(trimmed, owner)
  dbInsertCategory(category)
  return { category }
}

export function renameCategory(
  owner: CatalogOwner,
  id: string,
  name: string,
): { category: Category } | { error: 'empty' | 'not_found' } {
  const trimmed = name.trim()
  if (!trimmed) {
    return { error: 'empty' }
  }
  const catalog = loadCatalog()
  const current = catalog.categories.find((c) => c.id === id && categoryOwnedBy(c, owner))
  if (!current) {
    return { error: 'not_found' }
  }
  const category = parseCategory({ ...current, name: trimmed })
  dbUpdateCategory(category)
  return { category }
}

export function removeCategory(
  owner: CatalogOwner,
  id: string,
): { ok: true } | { error: 'not_found' } {
  const catalog = loadCatalog()
  const cat = catalog.categories.find((c) => c.id === id && categoryOwnedBy(c, owner))
  if (!cat) {
    return { error: 'not_found' }
  }
  dbDeleteCategory(id)
  return { ok: true }
}

export function addTopic(
  owner: CatalogOwner,
  input: {
    categoryId: string
    name: string
    optionCount: number
    prompt: string
    sourceUrl?: string
    sourceFocus?: string
  },
): { topic: Topic } | { error: 'invalid' | 'not_found' } {
  const name = input.name.trim()
  const prompt = input.prompt.trim()
  if (!name || !prompt) {
    return { error: 'invalid' }
  }
  const catalog = loadCatalog()
  const cat = catalog.categories.find((c) => c.id === input.categoryId)
  if (!cat || !categoryOwnedBy(cat, owner)) {
    return { error: 'not_found' }
  }
  const topic: Topic = {
    id: crypto.randomUUID(),
    categoryId: cat.id,
    name,
    optionCount: Math.max(2, Number(input.optionCount) || 4),
    prompt,
    ...topicSourceFields(input),
  }
  const stamp = ownerStamp(cat)
  dbInsertTopic(topic, stamp.ownerType, stamp.ownerId)
  return { topic }
}

export function updateTopic(
  owner: CatalogOwner,
  id: string,
  input: {
    name: string
    optionCount: number
    prompt: string
    sourceUrl?: string
    sourceFocus?: string
  },
): { topic: Topic } | { error: 'invalid' | 'not_found' } {
  const name = input.name.trim()
  const prompt = input.prompt.trim()
  if (!name || !prompt) {
    return { error: 'invalid' }
  }
  const catalog = loadCatalog()
  const existing = catalog.topics.find((t) => t.id === id)
  if (!existing || !topicOwnedBy(catalog, existing, owner)) {
    return { error: 'not_found' }
  }
  const topic: Topic = {
    id: existing.id,
    categoryId: existing.categoryId,
    name,
    optionCount: Math.max(2, Number(input.optionCount) || 4),
    prompt,
    ...topicSourceFields(input),
  }
  const cat = catalog.categories.find((c) => c.id === existing.categoryId)
  const stamp = cat ? ownerStamp(cat) : { ownerType: 'platform' as const, ownerId: null }
  dbUpdateTopic(topic, stamp.ownerType, stamp.ownerId)
  return { topic }
}

export function removeTopic(
  owner: CatalogOwner,
  id: string,
): { ok: true } | { error: 'not_found' } {
  const catalog = loadCatalog()
  const topic = catalog.topics.find((t) => t.id === id)
  if (!topic || !topicOwnedBy(catalog, topic, owner)) {
    return { error: 'not_found' }
  }
  dbDeleteTopic(id)
  return { ok: true }
}

/** Guest: platform only. Logged-in: platform + that user's private folders. */
function catalogForPlayer(userId: string | null): CatalogFile {
  const catalog = loadCatalog()
  const categories = catalog.categories.filter(
    (c) => isPlatformCategory(c) || (Boolean(userId) && c.ownerType === 'user' && c.ownerId === userId),
  )
  const keep = new Set(categories.map((c) => c.id))
  return { categories, topics: catalog.topics.filter((t) => keep.has(t.categoryId)) }
}

type PlayerUser = {
  id: string
  username: string
  password: string
}

/** Temporary file-based players. Replace with a real user store later. */
export function findPlayerUser(
  username: string,
  password: string,
): { id: string; username: string } | null {
  const raw = readJson<{ users?: Array<Partial<PlayerUser>> }>(usersFile, { users: [] })
  const users = Array.isArray(raw.users) ? raw.users : []
  const name = username.trim()
  const index = users.findIndex((u) => u.username === name && u.password === password)
  if (index < 0) {
    return null
  }
  const row = users[index]
  let id = String(row.id ?? '').trim()
  const uname = String(row.username ?? name)
  if (!id) {
    id = crypto.randomUUID()
    users[index] = { id, username: uname, password: String(row.password ?? '') }
    writeJson(usersFile, { users })
  }
  return { id, username: uname }
}

/** Player accounts for Admin Users. Passwords stay on disk. */
export function listPlayerUsers(): { id: string; username: string }[] {
  const raw = readJson<{ users?: Array<Partial<PlayerUser>> }>(usersFile, { users: [] })
  const users = Array.isArray(raw.users) ? raw.users : []
  return users
    .map((u) => ({
      id: String(u.id ?? '').trim(),
      username: String(u.username ?? '').trim(),
    }))
    .filter((u) => u.id && u.username)
    .sort((a, b) => a.username.localeCompare(b.username, 'sv'))
}

export function findPlayerById(userId: string): { id: string; username: string } | null {
  return listPlayerUsers().find((u) => u.id === userId) ?? null
}

function loadAiFile(): AiFile {
  const raw = readJson<Partial<AiFile>>(aiFile, {})
  return {
    baseURL: raw.baseURL ?? defaultAi.baseURL,
    model: raw.model ?? defaultAi.model,
    timeoutMs: Number(raw.timeoutMs ?? defaultAi.timeoutMs),
    temperature: Number(raw.temperature ?? defaultAi.temperature),
    thinkingEnabled: raw.thinkingEnabled === true,
    fetchSourceEnabled: raw.fetchSourceEnabled === true,
    logLevel: parseLogLevel(raw.logLevel),
  }
}

export function loadLogLevel(): LogLevel {
  return loadAiFile().logLevel
}

export function saveLogLevel(level: LogLevel) {
  const ai = loadAiFile()
  writeJson(aiFile, { ...ai, logLevel: parseLogLevel(level) })
}

/** API key: git-ignored secrets file, then .env. Never returned to the browser. */
export function getAiApiKey(): string {
  const secrets = readJson<SecretsFile>(secretsFile, {})
  return secrets.aiApiKey || process.env.AI_API_KEY || ''
}

export function saveAiApiKey(key: string) {
  writeJson(secretsFile, { aiApiKey: key })
}

/** Public AI settings for the admin form. */
export function loadAiPublic(): AiSettingsPublic {
  const ai = loadAiFile()
  return {
    ...ai,
    apiKeySet: getAiApiKey().length > 0,
  }
}

export function saveAiSettings(input: {
  baseURL: string
  model: string
  timeoutMs: number
  temperature: number
  thinkingEnabled: boolean
  fetchSourceEnabled: boolean
  apiKey?: string
}) {
  writeJson(aiFile, {
    ...loadAiFile(),
    baseURL: input.baseURL,
    model: input.model,
    timeoutMs: input.timeoutMs,
    temperature: input.temperature,
    thinkingEnabled: input.thinkingEnabled === true,
    fetchSourceEnabled: input.fetchSourceEnabled === true,
  })
  if (input.apiKey && input.apiKey.trim()) {
    saveAiApiKey(input.apiKey.trim())
  }
}

/** Settings used for a generation call. Includes the key (server only). */
export function loadAiRuntime() {
  return {
    ...loadAiFile(),
    apiKey: getAiApiKey(),
  }
}

/** Words that do not identify a question. Names and facts are what we compare. */
const questionStop = new Set([
  'vem', 'vad', 'vilken', 'vilket', 'vilka', 'när', 'hur', 'var', 'är', 'varit',
  'en', 'ett', 'den', 'det', 'de', 'som', 'för', 'av', 'och', 'eller', 'i', 'på',
  'till', 'med', 'om', 'har', 'hade', 'från', 'inte', 'att', 'sin', 'sitt', 'sina',
  'denna', 'detta', 'man', 'du', 'känd', 'kända', 'film', 'filmen', 'filmer',
])

function normalizeQuestion(text: string) {
  return text
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function contentTokens(text: string) {
  return normalizeQuestion(text)
    .split(' ')
    .filter((word) => word.length >= 3 && !questionStop.has(word))
}

function answerKey(options: string[], correctIndex: number) {
  return normalizeQuestion(options[correctIndex] ?? '')
}

/** Same wording, or the same answer plus mostly the same names and facts. */
function questionsAreDuplicates(
  a: Pick<StoredQuestion, 'question' | 'options' | 'correctIndex'>,
  b: Pick<StoredQuestion, 'question' | 'options' | 'correctIndex'>,
) {
  if (normalizeQuestion(a.question) === normalizeQuestion(b.question)) {
    return true
  }
  const leftAnswer = answerKey(a.options, a.correctIndex)
  const rightAnswer = answerKey(b.options, b.correctIndex)
  if (!leftAnswer || leftAnswer.length < 3 || leftAnswer !== rightAnswer) {
    return false
  }
  const left = contentTokens(a.question)
  const right = contentTokens(b.question)
  if (!left.length || !right.length) {
    return false
  }
  const rightSet = new Set(right)
  const shared = left.filter((word) => rightSet.has(word)).length
  const smaller = Math.min(left.length, right.length)
  return shared >= 2 && shared / smaller >= 0.6
}

/** Guest start list: stocked platform subjects only (never another player's folders). */
export function loadGuestCatalog(): {
  categories: Category[]
  topics: Topic[]
  bankCounts: BankCount[]
} {
  const catalog = catalogForPlayer(null)
  const bankCounts = loadBankCounts()
  const playable = new Set(bankCounts.filter((row) => row.count >= 5).map((row) => row.topicId))
  const topics = catalog.topics.filter((t) => playable.has(t.id))
  const keepCat = new Set(topics.map((t) => t.categoryId))
  const categories = catalog.categories.filter((c) => keepCat.has(c.id))
  return { categories, topics, bankCounts }
}

/** Logged-in play list: stocked platform subjects plus that user's stocked private subjects. */
export function loadPlayerCatalog(userId: string): {
  categories: Category[]
  topics: Topic[]
  bankCounts: BankCount[]
} {
  const guest = loadGuestCatalog()
  const mine = catalogForPlayer(userId)
  const privateCats = mine.categories.filter((c) => !isPlatformCategory(c))
  const privateIds = new Set(privateCats.map((c) => c.id))
  const privateTopics = mine.topics.filter((t) => privateIds.has(t.categoryId))
  const userCounts = loadBankCountsForUser(userId)
  const playable = new Set(userCounts.filter((row) => row.count >= 5).map((row) => row.topicId))
  const topics = privateTopics.filter((t) => playable.has(t.id))
  const keepCat = new Set(topics.map((t) => t.categoryId))
  const categories = privateCats.filter((c) => keepCat.has(c.id))
  return {
    categories: [...guest.categories, ...categories],
    topics: [...guest.topics, ...topics],
    bankCounts: [...guest.bankCounts, ...userCounts],
  }
}

/** Private folders even if empty. Used by Mina kategorier and Admin Users. */
export function loadUserCatalogWithCounts(userId: string): {
  categories: Category[]
  topics: Topic[]
  bankCounts: BankCount[]
} {
  const catalog = loadUserCatalog(userId)
  return { ...catalog, bankCounts: loadBankCountsForUser(userId) }
}

/** Counts per subject and difficulty. Platform by default; pass userId for that player's bank. */
export function loadBankCounts() {
  return dbBankCounts('platform')
}

export function loadBankCountsForUser(userId: string) {
  return dbBankCounts('user', userId)
}

/** Existing question titles in this subject (any difficulty) so generate does not repeat them. */
export function loadBankQuestionTexts(
  topicId: string,
  _difficulty: Difficulty,
  ownerType: 'platform' | 'user' = 'platform',
  ownerId?: string,
): string[] {
  return dbLoadQuestions({ topicId, ownerType, ownerId })
    .map((q) => q.question.trim())
    .filter(Boolean)
}

/** Append generated questions. Same text in this subject+owner is skipped (any difficulty). */
export function appendPlatformQuestions(
  topicId: string,
  difficulty: Difficulty,
  generated: QuizQuestion[],
) {
  return appendOwnedQuestions(topicId, difficulty, generated, 'platform')
}

export function appendUserQuestions(
  userId: string,
  topicId: string,
  difficulty: Difficulty,
  generated: QuizQuestion[],
) {
  return appendOwnedQuestions(topicId, difficulty, generated, 'user', userId)
}

function appendOwnedQuestions(
  topicId: string,
  difficulty: Difficulty,
  generated: QuizQuestion[],
  ownerType: 'platform' | 'user',
  ownerId?: string,
): { added: number; skipped: number } {
  const seen = dbLoadQuestions({ topicId, ownerType, ownerId })
  let added = 0
  let skipped = 0
  for (const item of generated) {
    const candidate: Pick<StoredQuestion, 'question' | 'options' | 'correctIndex'> = {
      question: item.question,
      options: item.options,
      correctIndex: item.correctIndex,
    }
    if (!normalizeQuestion(item.question) || seen.some((row) => questionsAreDuplicates(row, candidate))) {
      skipped += 1
      continue
    }
    const row: StoredQuestion = {
      id: crypto.randomUUID(),
      topicId,
      difficulty,
      ownerType,
      question: item.question,
      options: item.options,
      correctIndex: item.correctIndex,
      explanation: item.explanation,
    }
    if (ownerType === 'user' && ownerId) {
      row.ownerId = ownerId
    }
    if (item.sourceUrl) {
      row.sourceUrl = item.sourceUrl
    }
    dbInsertQuestion(row)
    seen.push(row)
    added += 1
  }
  return { added, skipped }
}

/** Questions for one subject and difficulty. Platform by default. */
export function loadBankQuestions(
  topicId: string,
  difficulty: Difficulty,
  ownerType: 'platform' | 'user' = 'platform',
  ownerId?: string,
): StoredQuestion[] {
  return dbLoadQuestions({ topicId, difficulty, ownerType, ownerId }).sort((a, b) =>
    a.question.localeCompare(b.question, 'sv'),
  )
}

function shuffleList<T>(items: T[]): T[] {
  const next = [...items]
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = next[i]
    next[i] = next[j]
    next[j] = tmp
  }
  return next
}

function storedToQuiz(row: StoredQuestion): QuizQuestion {
  const pairs = row.options.map((text, i) => ({ text, correct: i === row.correctIndex }))
  const shuffled = shuffleList(pairs)
  const q: QuizQuestion = {
    question: row.question,
    options: shuffled.map((p) => p.text),
    correctIndex: shuffled.findIndex((p) => p.correct),
    explanation: row.explanation,
    difficulty: row.difficulty,
  }
  if (row.sourceUrl?.trim()) {
    q.sourceUrl = row.sourceUrl.trim()
  }
  return q
}

/** Guest round: pick unseen questions only. Short round if fewer unseen than requested. */
export function drawPlatformRound(
  topicId: string,
  difficulty: PlayDifficulty,
  count: number,
  exclude: string[],
) {
  return drawOwnedRound(topicId, difficulty, count, exclude, 'platform')
}

/** Logged-in private round: that player's own bank only. */
export function drawUserRound(
  userId: string,
  topicId: string,
  difficulty: PlayDifficulty,
  count: number,
  exclude: string[],
) {
  return drawOwnedRound(topicId, difficulty, count, exclude, 'user', userId)
}

function drawOwnedRound(
  topicId: string,
  difficulty: PlayDifficulty,
  count: number,
  exclude: string[],
  ownerType: 'platform' | 'user',
  ownerId?: string,
):
  | { questions: QuizQuestion[]; unseen: number }
  | { available: number; reason: 'empty' | 'no_new' } {
  const pool =
    difficulty === 'all'
      ? dbLoadQuestions({ topicId, ownerType, ownerId })
      : loadBankQuestions(topicId, difficulty, ownerType, ownerId)
  if (pool.length === 0) {
    return { available: 0, reason: 'empty' }
  }
  const skip = new Set(exclude.map((q) => q.trim().toLowerCase()).filter(Boolean))
  const unseen = shuffleList(pool.filter((q) => !skip.has(q.question.trim().toLowerCase())))
  if (unseen.length === 0) {
    return { available: 0, reason: 'no_new' }
  }
  // Never pad with already-seen questions. A short round is OK; the client explains it.
  const picked = unseen.slice(0, count)
  return { questions: shuffleList(picked).map(storedToQuiz), unseen: unseen.length }
}

/** Update one stored question. Duplicate text in the same bank is rejected. */
export function updateBankQuestion(
  id: string,
  patch: Pick<StoredQuestion, 'question' | 'options' | 'correctIndex' | 'explanation' | 'sourceUrl'>,
): { question: StoredQuestion } | { error: 'not_found' | 'duplicate' } {
  const current = dbGetQuestion(id)
  if (!current) {
    return { error: 'not_found' }
  }
  const next: StoredQuestion = {
    ...current,
    question: patch.question.trim(),
    options: patch.options.map((o) => o.trim()),
    correctIndex: patch.correctIndex,
    explanation: patch.explanation.trim(),
  }
  if (patch.sourceUrl?.trim()) {
    next.sourceUrl = patch.sourceUrl.trim()
  } else {
    delete next.sourceUrl
  }
  const duplicate = dbLoadQuestions({ topicId: current.topicId, ownerType: current.ownerType, ownerId: current.ownerId }).some(
    (q) => q.id !== id && questionsAreDuplicates(q, next),
  )
  if (duplicate) {
    return { error: 'duplicate' }
  }
  dbUpdateQuestion(next)
  return { question: next }
}

/** Delete one stored question and copies of it in the same subject. */
export function deleteBankQuestion(id: string): StoredQuestion | null {
  const row = dbGetQuestion(id)
  if (!row) {
    return null
  }
  dbDeleteQuestions(idsWithCopies(row))
  return row
}

function ownsQuestion(row: StoredQuestion, owner: CatalogOwner) {
  return owner.kind === 'user'
    ? row.ownerType === 'user' && row.ownerId === owner.userId
    : row.ownerType !== 'user'
}

/** The chosen row plus copies of the same question stored at other difficulties. */
function idsWithCopies(row: StoredQuestion) {
  const ids = [row.id]
  const siblings = dbLoadQuestions({
    topicId: row.topicId,
    ownerType: row.ownerType,
    ownerId: row.ownerId,
  })
  for (const sibling of siblings) {
    if (sibling.id !== row.id && questionsAreDuplicates(sibling, row)) {
      ids.push(sibling.id)
    }
  }
  return ids
}

/** Delete many questions that belong to this owner. Unknown or foreign ids are skipped. */
export function deleteBankQuestions(
  ids: string[],
  owner: CatalogOwner,
): { removed: number; bankCounts: BankCount[] } {
  const ownedIds = new Set<string>()
  for (const id of ids.filter((value) => value.length > 0)) {
    const row = dbGetQuestion(id)
    if (!row || !ownsQuestion(row, owner)) {
      continue
    }
    for (const matchId of idsWithCopies(row)) {
      ownedIds.add(matchId)
    }
  }
  const removed = dbDeleteQuestions([...ownedIds])
  return {
    removed,
    bankCounts: owner.kind === 'user' ? loadBankCountsForUser(owner.userId) : loadBankCounts(),
  }
}

/** Delete every question for one subject that belongs to this owner. Optional: one difficulty. */
export function deleteQuestionsForTopic(
  topicId: string,
  owner: CatalogOwner,
  difficulty?: Difficulty,
): { removed: number; bankCounts: BankCount[] } {
  const ownerType = owner.kind === 'user' ? 'user' : 'platform'
  const ownerId = owner.kind === 'user' ? owner.userId : undefined
  const removed = dbDeleteQuestionsForTopic(topicId, ownerType, ownerId, difficulty)
  return {
    removed,
    bankCounts: owner.kind === 'user' ? loadBankCountsForUser(owner.userId) : loadBankCounts(),
  }
}
