import fs from 'node:fs'
import path from 'node:path'
import type { AiSettingsPublic, BankCount, Category, Difficulty, LogLevel, QuizQuestion, SourceFocus, StoredQuestion, Topic } from '../shared/types'

const dataDir = path.resolve(process.cwd(), 'data')
const domainsFile = path.join(dataDir, 'domains.json')
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

const emptyCatalog: CatalogFile = { categories: [], topics: [] }

/** URL id from a name. å/ä/ö become a/o so Swedish names stay readable. */
function slugFromName(name: string) {
  return name
    .toLowerCase()
    .replace(/[åä]/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function uniqueSlug(name: string, used: Set<string>, fallback: string) {
  const base = slugFromName(name) || fallback
  let id = base
  let n = 2
  while (used.has(id)) {
    id = `${base}-${n}`
    n += 1
  }
  used.add(id)
  return id
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

function parseCatalog(raw: unknown): CatalogFile {
  if (Array.isArray(raw)) {
    const used = new Set<string>()
    const categoryId = uniqueSlug('Övrigt', used, 'ovrigt')
    const topics = (raw as Array<Partial<Topic>>).map((d, i) => {
      const existing = d.id ? String(d.id) : ''
      const id =
        existing && !used.has(existing)
          ? (used.add(existing), existing)
          : uniqueSlug(String(d.name ?? ''), used, `topic-${i + 1}`)
      return parseTopic({
        id,
        categoryId,
        name: String(d.name ?? ''),
        optionCount: Math.max(2, Number(d.optionCount) || 4),
        prompt: String(d.prompt ?? ''),
        sourceUrl: d.sourceUrl,
        sourceFocus: d.sourceFocus,
      })
    })
    return { categories: [{ id: categoryId, name: 'Övrigt' }], topics }
  }
  const data = (raw ?? emptyCatalog) as Partial<CatalogFile>
  return {
    categories: Array.isArray(data.categories) ? data.categories.map((c) => parseCategory(c)) : [],
    topics: Array.isArray(data.topics) ? data.topics.map((t) => parseTopic(t)) : [],
  }
}

/** Read categories and topics from disk. File name stays domains.json. */
export function loadCatalog(): CatalogFile {
  return parseCatalog(readJson<unknown>(domainsFile, emptyCatalog))
}

/** Replace the catalog on disk. */
function saveCatalog(catalog: CatalogFile) {
  writeJson(domainsFile, catalog)
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

/** Drop bank rows whose subject was removed. Topic ids are globally unique. */
function deleteQuestionsForTopics(topicIds: string[]) {
  const drop = new Set(topicIds)
  if (!drop.size) {
    return
  }
  const bank = loadBank()
  saveBank({ questions: bank.questions.filter((q) => !drop.has(q.topicId)) })
}

export function addCategory(
  owner: CatalogOwner,
  name: string,
): { category: Category } | { error: 'empty' } {
  const trimmed = name.trim()
  if (!trimmed) {
    return { error: 'empty' }
  }
  const catalog = loadCatalog()
  const category = stampNewCategory(trimmed, owner)
  catalog.categories.push(category)
  saveCatalog(catalog)
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
  const index = catalog.categories.findIndex((c) => c.id === id && categoryOwnedBy(c, owner))
  if (index < 0) {
    return { error: 'not_found' }
  }
  const category = parseCategory({ ...catalog.categories[index], name: trimmed })
  catalog.categories[index] = category
  saveCatalog(catalog)
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
  const topicIds = catalog.topics.filter((t) => t.categoryId === id).map((t) => t.id)
  catalog.categories = catalog.categories.filter((c) => c.id !== id)
  catalog.topics = catalog.topics.filter((t) => t.categoryId !== id)
  saveCatalog(catalog)
  deleteQuestionsForTopics(topicIds)
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
  catalog.topics.push(topic)
  saveCatalog(catalog)
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
  const index = catalog.topics.findIndex((t) => t.id === id)
  if (index < 0 || !topicOwnedBy(catalog, catalog.topics[index], owner)) {
    return { error: 'not_found' }
  }
  const existing = catalog.topics[index]
  const topic: Topic = {
    id: existing.id,
    categoryId: existing.categoryId,
    name,
    optionCount: Math.max(2, Number(input.optionCount) || 4),
    prompt,
    ...topicSourceFields(input),
  }
  catalog.topics[index] = topic
  saveCatalog(catalog)
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
  catalog.topics = catalog.topics.filter((t) => t.id !== id)
  saveCatalog(catalog)
  deleteQuestionsForTopics([id])
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

const questionsFile = path.join(dataDir, 'questions.json')

type BankFile = { questions: StoredQuestion[] }

const emptyBank: BankFile = { questions: [] }

function parseBank(raw: unknown): BankFile {
  const data = (raw ?? emptyBank) as Partial<BankFile>
  const rows = Array.isArray(data.questions) ? data.questions : []
  return { questions: rows.filter((q) => q && typeof q.question === 'string' && q.topicId) }
}

function loadBank(): BankFile {
  return parseBank(readJson<unknown>(questionsFile, emptyBank))
}

function saveBank(bank: BankFile) {
  writeJson(questionsFile, bank)
}

function questionKey(text: string) {
  return text.trim().toLowerCase()
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

function questionOwnerKey(q: StoredQuestion) {
  if (q.ownerType === 'user' && q.ownerId) {
    return `user:${q.ownerId}`
  }
  return 'platform'
}

/** Counts per subject and difficulty. Platform by default; pass userId for that player's bank. */
export function loadBankCounts() {
  return loadBankCountsForOwner('platform')
}

export function loadBankCountsForUser(userId: string) {
  return loadBankCountsForOwner('user', userId)
}

function loadBankCountsForOwner(ownerType: 'platform' | 'user', ownerId?: string) {
  const want = ownerType === 'user' && ownerId ? `user:${ownerId}` : 'platform'
  const counts = new Map<string, number>()
  for (const q of loadBank().questions) {
    if (questionOwnerKey(q) !== want) {
      continue
    }
    const key = `${q.topicId}\t${q.difficulty}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...counts.entries()].map(([key, count]) => {
    const [topicId, difficulty] = key.split('\t')
    return { topicId, difficulty: difficulty as Difficulty, count }
  })
}

function isOwnedQuestion(q: StoredQuestion, ownerType: 'platform' | 'user', ownerId?: string) {
  if (ownerType === 'user') {
    return q.ownerType === 'user' && q.ownerId === ownerId
  }
  return q.ownerType !== 'user'
}

/** Existing question titles for one subject+difficulty (to avoid repeats). */
export function loadBankQuestionTexts(
  topicId: string,
  difficulty: Difficulty,
  ownerType: 'platform' | 'user' = 'platform',
  ownerId?: string,
): string[] {
  return loadBank()
    .questions.filter(
      (q) =>
        q.topicId === topicId &&
        q.difficulty === difficulty &&
        isOwnedQuestion(q, ownerType, ownerId),
    )
    .map((q) => q.question.trim())
    .filter(Boolean)
}

/** Append generated questions. Same text in this subject+difficulty+owner is skipped. */
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
  const bank = loadBank()
  const seen = new Set(
    bank.questions
      .filter(
        (q) =>
          q.topicId === topicId &&
          q.difficulty === difficulty &&
          isOwnedQuestion(q, ownerType, ownerId),
      )
      .map((q) => questionKey(q.question)),
  )
  let added = 0
  let skipped = 0
  for (const item of generated) {
    const key = questionKey(item.question)
    if (!key || seen.has(key)) {
      skipped += 1
      continue
    }
    seen.add(key)
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
    bank.questions.push(row)
    added += 1
  }
  saveBank(bank)
  return { added, skipped }
}

/** Questions for one subject and difficulty. Platform by default. */
export function loadBankQuestions(
  topicId: string,
  difficulty: Difficulty,
  ownerType: 'platform' | 'user' = 'platform',
  ownerId?: string,
): StoredQuestion[] {
  return loadBank()
    .questions.filter(
      (q) =>
        q.topicId === topicId &&
        q.difficulty === difficulty &&
        isOwnedQuestion(q, ownerType, ownerId),
    )
    .slice()
    .sort((a, b) => a.question.localeCompare(b.question, 'sv'))
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
  }
  if (row.sourceUrl?.trim()) {
    q.sourceUrl = row.sourceUrl.trim()
  }
  return q
}

/** Guest round: pick unseen questions only. Short round if fewer unseen than requested. */
export function drawPlatformRound(
  topicId: string,
  difficulty: Difficulty,
  count: number,
  exclude: string[],
) {
  return drawOwnedRound(topicId, difficulty, count, exclude, 'platform')
}

/** Logged-in private round: that player's own bank only. */
export function drawUserRound(
  userId: string,
  topicId: string,
  difficulty: Difficulty,
  count: number,
  exclude: string[],
) {
  return drawOwnedRound(topicId, difficulty, count, exclude, 'user', userId)
}

function drawOwnedRound(
  topicId: string,
  difficulty: Difficulty,
  count: number,
  exclude: string[],
  ownerType: 'platform' | 'user',
  ownerId?: string,
):
  | { questions: QuizQuestion[]; unseen: number }
  | { available: number; reason: 'empty' | 'no_new' } {
  const pool = loadBankQuestions(topicId, difficulty, ownerType, ownerId)
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
  const bank = loadBank()
  const index = bank.questions.findIndex((q) => q.id === id)
  if (index < 0) {
    return { error: 'not_found' }
  }
  const current = bank.questions[index]
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
  const key = questionKey(next.question)
  const duplicate = bank.questions.some(
    (q) =>
      q.id !== id &&
      q.topicId === current.topicId &&
      q.difficulty === current.difficulty &&
      questionKey(q.question) === key,
  )
  if (duplicate) {
    return { error: 'duplicate' }
  }
  bank.questions[index] = next
  saveBank(bank)
  return { question: next }
}

/** Delete one stored question. Returns the removed row, or null if missing. */
export function deleteBankQuestion(id: string): StoredQuestion | null {
  const bank = loadBank()
  const index = bank.questions.findIndex((q) => q.id === id)
  if (index < 0) {
    return null
  }
  const [removed] = bank.questions.splice(index, 1)
  saveBank({ questions: bank.questions })
  return removed
}

/** Delete many questions that belong to this owner. Unknown or foreign ids are skipped. */
export function deleteBankQuestions(
  ids: string[],
  owner: CatalogOwner,
): { removed: number; bankCounts: BankCount[] } {
  const want = new Set(ids.filter((id) => id.length > 0))
  const bank = loadBank()
  let removed = 0
  const next = bank.questions.filter((q) => {
    if (!want.has(q.id)) {
      return true
    }
    const owned =
      owner.kind === 'user'
        ? q.ownerType === 'user' && q.ownerId === owner.userId
        : q.ownerType !== 'user'
    if (!owned) {
      return true
    }
    removed += 1
    return false
  })
  if (removed) {
    saveBank({ questions: next })
  }
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
  const bank = loadBank()
  let removed = 0
  const next = bank.questions.filter((q) => {
    if (q.topicId !== topicId) {
      return true
    }
    if (difficulty && q.difficulty !== difficulty) {
      return true
    }
    const owned =
      owner.kind === 'user'
        ? q.ownerType === 'user' && q.ownerId === owner.userId
        : q.ownerType !== 'user'
    if (!owned) {
      return true
    }
    removed += 1
    return false
  })
  if (removed) {
    saveBank({ questions: next })
  }
  return {
    removed,
    bankCounts: owner.kind === 'user' ? loadBankCountsForUser(owner.userId) : loadBankCounts(),
  }
}
