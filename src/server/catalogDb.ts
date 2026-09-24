import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import type { BankCount, Category, Difficulty, SourceFocus, StoredQuestion, Topic } from '../shared/types'

const dataDir = path.resolve(process.cwd(), 'data')
const dbFile = path.join(dataDir, 'catalog.sqlite')

type CatalogFile = { categories: Category[]; topics: Topic[] }

let db: Database.Database | null = null

function nowIso() {
  return new Date().toISOString()
}

/** Create tables that can grow (PDF/files later) without rewriting questions. */
const SCHEMA_V1 = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner_type TEXT NOT NULL DEFAULT 'platform' CHECK (owner_type IN ('platform', 'user')),
  owner_id TEXT,
  meta_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_categories_owner ON categories (owner_type, owner_id);

CREATE TABLE IF NOT EXISTS topics (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  option_count INTEGER NOT NULL DEFAULT 4,
  prompt TEXT NOT NULL DEFAULT '',
  meta_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_topics_category ON topics (category_id);

-- Files live on disk later (storage_path). SQLite only keeps metadata + optional extracted text.
CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  owner_type TEXT NOT NULL DEFAULT 'platform' CHECK (owner_type IN ('platform', 'user')),
  owner_id TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('url', 'pdf', 'html', 'text', 'image', 'other')),
  title TEXT,
  url TEXT,
  storage_path TEXT,
  mime_type TEXT,
  byte_size INTEGER,
  extracted_text TEXT,
  meta_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS topic_sources (
  id TEXT PRIMARY KEY,
  topic_id TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'focus' CHECK (role IN ('focus', 'extra', 'attachment')),
  focus TEXT NOT NULL DEFAULT 'mainly' CHECK (focus IN ('only', 'mainly', 'optional')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_topic_sources_topic ON topic_sources (topic_id);

CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY,
  topic_id TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  difficulty TEXT NOT NULL CHECK (difficulty IN ('hard', 'medium', 'easy', 'children')),
  owner_type TEXT NOT NULL DEFAULT 'platform' CHECK (owner_type IN ('platform', 'user')),
  owner_id TEXT,
  question TEXT NOT NULL,
  explanation TEXT NOT NULL DEFAULT '',
  meta_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_questions_bank ON questions (topic_id, difficulty, owner_type, owner_id);

CREATE TABLE IF NOT EXISTS question_options (
  question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL,
  text TEXT NOT NULL,
  is_correct INTEGER NOT NULL DEFAULT 0 CHECK (is_correct IN (0, 1)),
  PRIMARY KEY (question_id, sort_order)
);

CREATE TABLE IF NOT EXISTS question_sources (
  question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  asset_id TEXT REFERENCES assets(id) ON DELETE SET NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (question_id, sort_order)
);
`

type CategoryRow = {
  id: string
  name: string
  owner_type: string
  owner_id: string | null
}

type TopicRow = {
  id: string
  category_id: string
  name: string
  option_count: number
  prompt: string
  source_url: string | null
  source_focus: string | null
}

type QuestionRow = {
  id: string
  topic_id: string
  difficulty: string
  owner_type: string
  owner_id: string | null
  question: string
  explanation: string
  source_url: string | null
}

function mapCategory(row: CategoryRow): Category {
  const cat: Category = { id: row.id, name: row.name }
  if (row.owner_type === 'user' && row.owner_id) {
    cat.ownerType = 'user'
    cat.ownerId = row.owner_id
  }
  return cat
}

function mapTopic(row: TopicRow): Topic {
  const topic: Topic = {
    id: row.id,
    categoryId: row.category_id,
    name: row.name,
    optionCount: row.option_count,
    prompt: row.prompt,
  }
  const url = row.source_url?.trim()
  if (url) {
    topic.sourceUrl = url
    topic.sourceFocus = row.source_focus === 'only' ? 'only' : 'mainly'
  }
  return topic
}

function mapQuestion(row: QuestionRow, options: { text: string; is_correct: number }[]): StoredQuestion {
  const texts = options.map((o) => o.text)
  const correctIndex = Math.max(0, options.findIndex((o) => o.is_correct === 1))
  const q: StoredQuestion = {
    id: row.id,
    topicId: row.topic_id,
    difficulty: row.difficulty as Difficulty,
    ownerType: row.owner_type === 'user' ? 'user' : 'platform',
    question: row.question,
    options: texts,
    correctIndex,
    explanation: row.explanation,
  }
  if (row.owner_type === 'user' && row.owner_id) {
    q.ownerId = row.owner_id
  }
  if (row.source_url?.trim()) {
    q.sourceUrl = row.source_url.trim()
  }
  return q
}

function insertUrlAsset(
  database: Database.Database,
  url: string,
  ownerType: 'platform' | 'user',
  ownerId: string | null,
) {
  const id = crypto.randomUUID()
  const ts = nowIso()
  database
    .prepare(
      `INSERT INTO assets (id, owner_type, owner_id, kind, url, created_at, updated_at)
       VALUES (?, ?, ?, 'url', ?, ?, ?)`,
    )
    .run(id, ownerType, ownerId, url, ts, ts)
  return id
}

function replaceTopicUrl(
  database: Database.Database,
  topicId: string,
  sourceUrl: string | undefined,
  sourceFocus: SourceFocus | undefined,
  ownerType: 'platform' | 'user',
  ownerId: string | null,
) {
  const old = database
    .prepare(`SELECT asset_id AS assetId FROM topic_sources WHERE topic_id = ?`)
    .all(topicId) as { assetId: string }[]
  database.prepare(`DELETE FROM topic_sources WHERE topic_id = ?`).run(topicId)
  for (const row of old) {
    const still = database
      .prepare(
        `SELECT 1 AS ok FROM topic_sources WHERE asset_id = ?
         UNION ALL
         SELECT 1 FROM question_sources WHERE asset_id = ?`,
      )
      .get(row.assetId, row.assetId)
    if (!still) {
      database.prepare(`DELETE FROM assets WHERE id = ? AND kind = 'url'`).run(row.assetId)
    }
  }
  const url = sourceUrl?.trim()
  if (!url) {
    return
  }
  const assetId = insertUrlAsset(database, url, ownerType, ownerId)
  const ts = nowIso()
  database
    .prepare(
      `INSERT INTO topic_sources (id, topic_id, asset_id, role, focus, sort_order, created_at)
       VALUES (?, ?, ?, 'focus', ?, 0, ?)`,
    )
    .run(crypto.randomUUID(), topicId, assetId, sourceFocus === 'only' ? 'only' : 'mainly', ts)
}

function replaceQuestionUrl(
  database: Database.Database,
  questionId: string,
  sourceUrl: string | undefined,
  ownerType: 'platform' | 'user',
  ownerId: string | null,
) {
  const old = database
    .prepare(`SELECT asset_id AS assetId FROM question_sources WHERE question_id = ?`)
    .all(questionId) as { assetId: string | null }[]
  database.prepare(`DELETE FROM question_sources WHERE question_id = ?`).run(questionId)
  for (const row of old) {
    if (!row.assetId) {
      continue
    }
    const still = database
      .prepare(
        `SELECT 1 AS ok FROM topic_sources WHERE asset_id = ?
         UNION ALL
         SELECT 1 FROM question_sources WHERE asset_id = ?`,
      )
      .get(row.assetId, row.assetId)
    if (!still) {
      database.prepare(`DELETE FROM assets WHERE id = ? AND kind = 'url'`).run(row.assetId)
    }
  }
  const url = sourceUrl?.trim()
  if (!url) {
    return
  }
  const assetId = insertUrlAsset(database, url, ownerType, ownerId)
  database
    .prepare(
      `INSERT INTO question_sources (question_id, asset_id, sort_order) VALUES (?, ?, 0)`,
    )
    .run(questionId, assetId)
}

function replaceOptions(database: Database.Database, questionId: string, options: string[], correctIndex: number) {
  database.prepare(`DELETE FROM question_options WHERE question_id = ?`).run(questionId)
  const insert = database.prepare(
    `INSERT INTO question_options (question_id, sort_order, text, is_correct) VALUES (?, ?, ?, ?)`,
  )
  options.forEach((text, i) => {
    insert.run(questionId, i, text, i === correctIndex ? 1 : 0)
  })
}

const TOPIC_SELECT = `
  SELECT t.id, t.category_id, t.name, t.option_count, t.prompt,
    (SELECT a.url FROM topic_sources ts JOIN assets a ON a.id = ts.asset_id
      WHERE ts.topic_id = t.id AND a.kind = 'url' ORDER BY ts.sort_order LIMIT 1) AS source_url,
    (SELECT ts.focus FROM topic_sources ts JOIN assets a ON a.id = ts.asset_id
      WHERE ts.topic_id = t.id AND a.kind = 'url' ORDER BY ts.sort_order LIMIT 1) AS source_focus
  FROM topics t
`

const QUESTION_SELECT = `
  SELECT q.id, q.topic_id, q.difficulty, q.owner_type, q.owner_id, q.question, q.explanation,
    (SELECT a.url FROM question_sources qs JOIN assets a ON a.id = qs.asset_id
      WHERE qs.question_id = q.id AND a.kind = 'url' ORDER BY qs.sort_order LIMIT 1) AS source_url
  FROM questions q
`

function optionsFor(database: Database.Database, questionId: string) {
  return database
    .prepare(
      `SELECT text, is_correct FROM question_options WHERE question_id = ? ORDER BY sort_order`,
    )
    .all(questionId) as { text: string; is_correct: number }[]
}

function loadQuestion(database: Database.Database, id: string): StoredQuestion | null {
  const row = database.prepare(`${QUESTION_SELECT} WHERE q.id = ?`).get(id) as QuestionRow | undefined
  if (!row) {
    return null
  }
  return mapQuestion(row, optionsFor(database, id))
}

/** Open (or create) an empty catalog database if it does not exist yet. */
export function openCatalogDb() {
  if (db) {
    return db
  }
  fs.mkdirSync(dataDir, { recursive: true })
  db = new Database(dbFile)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(SCHEMA_V1)
  const migrated = db.prepare(`SELECT version FROM schema_migrations WHERE version = 1`).get()
  if (!migrated) {
    db.prepare(`INSERT INTO schema_migrations (version, applied_at) VALUES (1, ?)`).run(nowIso())
  }
  return db
}

export function dbLoadCatalog(): CatalogFile {
  const database = openCatalogDb()
  const categories = (database.prepare(`SELECT id, name, owner_type, owner_id FROM categories`).all() as CategoryRow[])
    .map(mapCategory)
  const topics = (database.prepare(TOPIC_SELECT).all() as TopicRow[]).map(mapTopic)
  return { categories, topics }
}

export function dbInsertCategory(category: Category) {
  const database = openCatalogDb()
  const ts = nowIso()
  const ownerType = category.ownerType === 'user' ? 'user' : 'platform'
  database
    .prepare(
      `INSERT INTO categories (id, name, owner_type, owner_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(category.id, category.name, ownerType, ownerType === 'user' ? category.ownerId ?? null : null, ts, ts)
}

export function dbUpdateCategory(category: Category) {
  const database = openCatalogDb()
  database
    .prepare(`UPDATE categories SET name = ?, updated_at = ? WHERE id = ?`)
    .run(category.name, nowIso(), category.id)
}

export function dbDeleteCategory(id: string) {
  openCatalogDb().prepare(`DELETE FROM categories WHERE id = ?`).run(id)
}

export function dbInsertTopic(topic: Topic, ownerType: 'platform' | 'user', ownerId: string | null) {
  const database = openCatalogDb()
  const ts = nowIso()
  const tx = database.transaction(() => {
    database
      .prepare(
        `INSERT INTO topics (id, category_id, name, option_count, prompt, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(topic.id, topic.categoryId, topic.name, topic.optionCount, topic.prompt, ts, ts)
    replaceTopicUrl(database, topic.id, topic.sourceUrl, topic.sourceFocus, ownerType, ownerId)
  })
  tx()
}

export function dbUpdateTopic(topic: Topic, ownerType: 'platform' | 'user', ownerId: string | null) {
  const database = openCatalogDb()
  const tx = database.transaction(() => {
    database
      .prepare(
        `UPDATE topics SET name = ?, option_count = ?, prompt = ?, updated_at = ? WHERE id = ?`,
      )
      .run(topic.name, topic.optionCount, topic.prompt, nowIso(), topic.id)
    replaceTopicUrl(database, topic.id, topic.sourceUrl, topic.sourceFocus, ownerType, ownerId)
  })
  tx()
}

export function dbDeleteTopic(id: string) {
  openCatalogDb().prepare(`DELETE FROM topics WHERE id = ?`).run(id)
}

export function dbLoadQuestions(filter: {
  topicId?: string
  difficulty?: Difficulty
  ownerType?: 'platform' | 'user'
  ownerId?: string
}): StoredQuestion[] {
  const database = openCatalogDb()
  const where: string[] = []
  const params: unknown[] = []
  if (filter.topicId) {
    where.push('q.topic_id = ?')
    params.push(filter.topicId)
  }
  if (filter.difficulty) {
    // New rows can play at every level; older rows stay on their stored difficulty.
    where.push(`(q.difficulty = ? OR json_extract(q.meta_json, '$.playAllDifficulties') = 1)`)
    params.push(filter.difficulty)
  }
  if (filter.ownerType === 'user') {
    where.push(`q.owner_type = 'user' AND q.owner_id = ?`)
    params.push(filter.ownerId ?? '')
  } else if (filter.ownerType === 'platform') {
    where.push(`q.owner_type = 'platform'`)
  }
  const sql = `${QUESTION_SELECT}${where.length ? ` WHERE ${where.join(' AND ')}` : ''}`
  const rows = database.prepare(sql).all(...params) as QuestionRow[]
  return rows.map((row) => mapQuestion(row, optionsFor(database, row.id)))
}

function metaPlayAll(raw: string | null) {
  try {
    return (JSON.parse(raw || '{}') as { playAllDifficulties?: boolean }).playAllDifficulties === true
  } catch {
    return false
  }
}

const COUNT_DIFFICULTIES: Difficulty[] = ['hard', 'medium', 'easy', 'children']

export function dbBankCounts(ownerType: 'platform' | 'user', ownerId?: string): BankCount[] {
  const database = openCatalogDb()
  const rows =
    ownerType === 'user'
      ? (database
          .prepare(`SELECT topic_id AS topicId, difficulty, meta_json AS metaJson FROM questions WHERE owner_type = 'user' AND owner_id = ?`)
          .all(ownerId ?? '') as { topicId: string; difficulty: string; metaJson: string }[])
      : (database
          .prepare(`SELECT topic_id AS topicId, difficulty, meta_json AS metaJson FROM questions WHERE owner_type = 'platform'`)
          .all() as { topicId: string; difficulty: string; metaJson: string }[])
  const counts = new Map<string, number>()
  for (const row of rows) {
    const playAll = metaPlayAll(row.metaJson)
    for (const difficulty of COUNT_DIFFICULTIES) {
      if (!playAll && row.difficulty !== difficulty) {
        continue
      }
      const key = `${row.topicId}\t${difficulty}`
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  }
  return [...counts.entries()].map(([key, count]) => {
    const [topicId, difficulty] = key.split('\t')
    return { topicId, difficulty: difficulty as Difficulty, count }
  })
}

export function dbInsertQuestion(row: StoredQuestion) {
  const database = openCatalogDb()
  const ts = nowIso()
  const ownerType = row.ownerType === 'user' ? 'user' : 'platform'
  const ownerId = ownerType === 'user' ? row.ownerId ?? null : null
  const tx = database.transaction(() => {
    database
      .prepare(
        `INSERT INTO questions (id, topic_id, difficulty, owner_type, owner_id, question, explanation, meta_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        row.id,
        row.topicId,
        row.difficulty,
        ownerType,
        ownerId,
        row.question,
        row.explanation,
        JSON.stringify({ playAllDifficulties: true }),
        ts,
        ts,
      )
    replaceOptions(database, row.id, row.options, row.correctIndex)
    replaceQuestionUrl(database, row.id, row.sourceUrl, ownerType, ownerId)
  })
  tx()
}

export function dbUpdateQuestion(row: StoredQuestion) {
  const database = openCatalogDb()
  const ownerType = row.ownerType === 'user' ? 'user' : 'platform'
  const ownerId = ownerType === 'user' ? row.ownerId ?? null : null
  const tx = database.transaction(() => {
    database
      .prepare(
        `UPDATE questions SET question = ?, explanation = ?, updated_at = ? WHERE id = ?`,
      )
      .run(row.question, row.explanation, nowIso(), row.id)
    replaceOptions(database, row.id, row.options, row.correctIndex)
    replaceQuestionUrl(database, row.id, row.sourceUrl, ownerType, ownerId)
  })
  tx()
}

export function dbGetQuestion(id: string): StoredQuestion | null {
  return loadQuestion(openCatalogDb(), id)
}

export function dbDeleteQuestion(id: string): StoredQuestion | null {
  const database = openCatalogDb()
  const row = loadQuestion(database, id)
  if (!row) {
    return null
  }
  database.prepare(`DELETE FROM questions WHERE id = ?`).run(id)
  return row
}

export function dbDeleteQuestions(ids: string[]): number {
  if (!ids.length) {
    return 0
  }
  const database = openCatalogDb()
  const del = database.prepare(`DELETE FROM questions WHERE id = ?`)
  const tx = database.transaction(() => {
    let n = 0
    for (const id of ids) {
      const info = del.run(id)
      n += info.changes
    }
    return n
  })
  return tx()
}

export function dbDeleteQuestionsForTopic(
  topicId: string,
  ownerType: 'platform' | 'user',
  ownerId?: string,
  difficulty?: Difficulty,
): number {
  const database = openCatalogDb()
  if (ownerType === 'user') {
    if (difficulty) {
      return database
        .prepare(
          `DELETE FROM questions WHERE topic_id = ? AND owner_type = 'user' AND owner_id = ? AND difficulty = ?`,
        )
        .run(topicId, ownerId ?? '', difficulty).changes
    }
    return database
      .prepare(`DELETE FROM questions WHERE topic_id = ? AND owner_type = 'user' AND owner_id = ?`)
      .run(topicId, ownerId ?? '').changes
  }
  if (difficulty) {
    return database
      .prepare(`DELETE FROM questions WHERE topic_id = ? AND owner_type = 'platform' AND difficulty = ?`)
      .run(topicId, difficulty).changes
  }
  return database.prepare(`DELETE FROM questions WHERE topic_id = ? AND owner_type = 'platform'`).run(topicId)
    .changes
}
