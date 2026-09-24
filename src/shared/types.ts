/** Shared types used by both the React client and the Node server. */

/** How much the admin debug log keeps. */
export type LogLevel = 'error' | 'warn' | 'info' | 'debug'

/** Difficulty sent to the AI prompt and stored on each question. */
export type Difficulty = 'hard' | 'medium' | 'easy' | 'children'
/** Start/play filter. `all` mixes every stocked difficulty in the subject. */
export type PlayDifficulty = Difficulty | 'all'

/** How strictly generation should stick to a subject source URL. */
export type SourceFocus = 'only' | 'mainly'

/** One folder of related quiz topics, e.g. Historia. */
export type Category = {
  id: string
  name: string
  /** Missing or platform = everyone can play. user = private to ownerId. */
  ownerType?: 'platform' | 'user'
  ownerId?: string
}

/** One playable subject with its own AI prompt. */
export type Topic = {
  id: string
  categoryId: string
  name: string
  /** How many multiple-choice options each question has. */
  optionCount: number
  /** Prompt template; server fills in count, difficulty, language. */
  prompt: string
  /** Optional http(s) page or book link to focus questions on. */
  sourceUrl?: string
  /** Default mainly when sourceUrl is set. */
  sourceFocus?: SourceFocus
}

/** One generated question after options have been shuffled. */
export type QuizQuestion = {
  question: string
  options: string[]
  correctIndex: number
  explanation: string
  sourceUrl?: string
  /** Stored level. Shown discreetly when the round is Alla. */
  difficulty?: Difficulty
}

/** Score shown on the summary screen. */
export type QuizScore = {
  good: number
  bad: number
  skipped: number
}

/** One finished quiz. Names are a snapshot so history still reads after a rename. */
export type QuizAttempt = {
  id: string
  finishedAt: string
  topicId: string
  categoryId: string
  categoryName: string
  topicName: string
  difficulty: PlayDifficulty
  count: number
  good: number
  bad: number
  skipped: number
}

/** AI engine settings shown in admin. The raw API key is never included. */
export type AiSettingsPublic = {
  baseURL: string
  model: string
  timeoutMs: number
  temperature: number
  /** DeepSeek thinking/reasoning. Off by default (faster). */
  thinkingEnabled: boolean
  /** Download the subject source URL and send page text to the model. Extra tokens. */
  fetchSourceEnabled: boolean
  apiKeySet: boolean
}

/** How many platform questions exist for one subject and difficulty. */
export type BankCount = {
  topicId: string
  difficulty: Difficulty
  count: number
}

/** Catalog the start screen loads. Guests also get bank counts. */
export type CatalogResponse = {
  categories: Category[]
  topics: Topic[]
  bankCounts?: BankCount[]
}

/** One platform (or later private) question stored in the bank. */
export type StoredQuestion = {
  id: string
  topicId: string
  difficulty: Difficulty
  ownerType: 'platform' | 'user'
  ownerId?: string
  question: string
  options: string[]
  correctIndex: number
  explanation: string
  sourceUrl?: string
}

/** Player account shown in Admin Users. Password is never included. */
export type PlayerPublic = {
  id: string
  username: string
}

/** Full admin payload after login. */
export type AdminConfig = {
  ai: AiSettingsPublic
  categories: Category[]
  topics: Topic[]
  logLevel: LogLevel
  /** Counts only; the admin list does not load every question. */
  bankCounts: BankCount[]
}
