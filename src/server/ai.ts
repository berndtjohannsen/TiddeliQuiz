import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { generateText } from 'ai'
import { z } from 'zod'
import type { Difficulty, QuizQuestion, Topic } from '../shared/types'
import { log } from './log'
import { loadAiRuntime } from './store'

const difficultyLabel: Record<Difficulty, string> = {
  hard: 'hard',
  medium: 'medium',
  easy: 'easy',
  children: 'children (simple words, suitable for children)',
}

/** Compact keys keep the model output shorter (generation time is mostly output tokens). */
function questionSchema(optionCount: number) {
  const compact = z.object({
    q: z.string().min(1),
    o: z.array(z.string().min(1)).length(optionCount),
    e: z.string().min(1),
    w: z.string().optional(),
  })
  const verbose = z.object({
    question: z.string().min(1),
    options: z.array(z.string().min(1)).length(optionCount),
    correctIndex: z.number().int().min(0).max(optionCount - 1).optional(),
    explanation: z.string().min(1),
    sourceUrl: z.string().optional(),
  })
  return z.object({
    questions: z.array(z.union([compact, verbose])),
  })
}

/** Full URL, or (Wikipedia mode only) a title we turn into sv.wikipedia.org. */
function sourceToUrl(raw?: string, mode: 'wiki' | 'url' = 'wiki'): string | undefined {
  const t = raw?.trim()
  if (!t) {
    return undefined
  }
  if (/^https?:\/\//i.test(t)) {
    return t
  }
  if (mode === 'url') {
    return undefined
  }
  return `https://sv.wikipedia.org/wiki/${t.replace(/\s+/g, '_')}`
}

function toQuizQuestion(
  item: z.infer<ReturnType<typeof questionSchema>>['questions'][number],
  mode: 'wiki' | 'url' = 'wiki',
  fallbackUrl?: string,
): QuizQuestion {
  if ('q' in item) {
    return {
      question: item.q,
      options: item.o,
      correctIndex: 0,
      explanation: item.e,
      sourceUrl: sourceToUrl(item.w, mode) ?? fallbackUrl,
    }
  }
  return {
    question: item.question,
    options: item.options,
    correctIndex: item.correctIndex ?? 0,
    explanation: item.explanation,
    sourceUrl: sourceToUrl(item.sourceUrl, mode) ?? fallbackUrl,
  }
}

const FETCH_MAX_BYTES = 400_000
const FETCH_MAX_CHARS = 12_000
const FETCH_TIMEOUT_MS = 15_000

/** Block loopback and typical private hosts so a source URL cannot hit the LAN. */
function isBlockedHost(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host.endsWith('.localhost') || host === '0.0.0.0' || host === '::1') {
    return true
  }
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host)) {
    return true
  }
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) {
    return true
  }
  return host === 'metadata.google.internal'
}

function htmlToText(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

/** Download a public page. PDFs and private hosts are rejected. */
async function fetchSourceText(url: string, abortSignal?: AbortSignal): Promise<string> {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error('Source must be an http(s) URL')
  }
  if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || isBlockedHost(parsed.hostname)) {
    throw new Error('Source URL is not allowed')
  }
  const timeout = AbortSignal.timeout(FETCH_TIMEOUT_MS)
  const signal = abortSignal ? AbortSignal.any([timeout, abortSignal]) : timeout
  const res = await fetch(parsed.toString(), {
    method: 'GET',
    redirect: 'follow',
    signal,
    headers: { Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.1' },
  })
  let finalHost = parsed.hostname
  try {
    finalHost = new URL(res.url).hostname
  } catch {
    // Keep the original host if the final URL is odd.
  }
  if (isBlockedHost(finalHost)) {
    throw new Error('Source URL is not allowed')
  }
  if (!res.ok) {
    throw new Error(`Could not read the source page (${res.status})`)
  }
  const type = (res.headers.get('content-type') ?? '').toLowerCase()
  if (type.includes('pdf')) {
    throw new Error('PDF files are not supported yet. Use a web page link.')
  }
  const buf = await res.arrayBuffer()
  if (buf.byteLength > FETCH_MAX_BYTES) {
    throw new Error('Source page is too large to read')
  }
  const decoded = new TextDecoder('utf-8').decode(buf)
  const text = type.includes('html') || type.includes('xml') ? htmlToText(decoded) : decoded.replace(/\s+/g, ' ').trim()
  if (!text) {
    throw new Error('Source page had no readable text')
  }
  return text.length > FETCH_MAX_CHARS ? `${text.slice(0, FETCH_MAX_CHARS)}…` : text
}

function fillPrompt(topic: Topic, count: number, difficulty: Difficulty) {
  return topic.prompt
    .replaceAll('{count}', String(count))
    .replaceAll('{difficulty}', difficultyLabel[difficulty])
    .replaceAll('{optionCount}', String(topic.optionCount))
}

function errText(err: unknown) {
  return err instanceof Error ? err.message : String(err)
}

/** Browser left, HMR remount, or server restart — do not retry these. */
export function isCancelledError(err: unknown) {
  const msg = errText(err).toLowerCase()
  if (msg.includes('timeout')) {
    return false
  }
  if (err instanceof Error && err.name === 'AbortError') {
    return true
  }
  return msg.includes('prematurely closed') || msg.includes('econnreset') || msg.includes('cancelled')
}

/** Pull a JSON object out of model text (raw or ```json fences). */
function parseJsonObject(text: string): unknown {
  const trimmed = text.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const raw = (fenced ? fenced[1] : trimmed).trim()
  return JSON.parse(raw)
}

/** Shuffle options so the correct answer is not always first. */
function shuffleQuestion(q: QuizQuestion): QuizQuestion {
  const pairs = q.options.map((text, i) => ({ text, correct: i === q.correctIndex }))
  for (let i = pairs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = pairs[i]
    pairs[i] = pairs[j]
    pairs[j] = tmp
  }
  return {
    ...q,
    options: pairs.map((p) => p.text),
    correctIndex: pairs.findIndex((p) => p.correct),
    sourceUrl: q.sourceUrl?.trim() ? q.sourceUrl.trim() : undefined,
  }
}

function sourceMode(topic: Topic): 'wiki' | 'url' {
  return topic.sourceUrl?.trim() ? 'url' : 'wiki'
}

/** Hidden rules: Wikipedia by default, or the subject source URL when set. */
function sourceInstructions(topic: Topic, fetchedText?: string) {
  const url = topic.sourceUrl?.trim()
  if (!url) {
    return {
      system:
        'w is a Swedish Wikipedia article title only (not a URL); omit w if unsure.',
      exampleW: 'Artikel',
      userExtra: '',
    }
  }
  const focus =
    topic.sourceFocus === 'only'
      ? 'Use only facts from the given source. Do not invent from other knowledge. If the source is not enough for a question, pick another fact from the same source.'
      : 'Prefer facts from the given source. Use a little general knowledge only when needed to form a clear quiz question.'
  const fetched = fetchedText
    ? ' The source page text follows in the user message. Base the questions on that text.'
    : ' You are not given the page text. Still treat the URL as the source to cite.'
  return {
    system: `${focus} w must be this exact source URL (not a Wikipedia title): ${url}.${fetched}`,
    exampleW: url,
    userExtra: fetchedText ? `\n\nSource page text:\n${fetchedText}` : `\n\nSource URL: ${url}`,
  }
}

async function generateOnce(
  topic: Topic,
  count: number,
  difficulty: Difficulty,
  abortSignal?: AbortSignal,
  exclude: string[] = [],
  fetchedText?: string,
): Promise<QuizQuestion[]> {
  const ai = loadAiRuntime()
  if (!ai.apiKey) {
    throw new Error('AI API key is not set')
  }

  const thinkingType = ai.thinkingEnabled ? 'enabled' : 'disabled'
  const provider = createOpenAICompatible({
    name: 'tiddeli-ai',
    baseURL: ai.baseURL.replace(/\/$/, ''),
    apiKey: ai.apiKey,
    // DeepSeek supports json_object, not json_schema structured outputs.
    supportsStructuredOutputs: false,
    // V4 thinking is on by default; we send the admin choice explicitly.
    transformRequestBody: (args) => ({
      ...args,
      thinking: { type: thinkingType },
      // json_object is what DeepSeek supports (not json_schema).
      response_format: { type: 'json_object' },
    }),
  })

  const schema = questionSchema(topic.optionCount)
  const userPrompt = fillPrompt(topic, count, difficulty)
  const source = sourceInstructions(topic, fetchedText)
  const mode = sourceMode(topic)
  const fallbackUrl = mode === 'url' ? topic.sourceUrl?.trim() : undefined

  const optionHint = Array.from({ length: topic.optionCount }, (_, i) => (i === 0 ? 'correct' : 'wrong'))
  const system =
    `You generate quiz questions in Swedish. Reply with one JSON object only. Keep text short. First option is always the correct answer. Explanations: one short sentence. ${source.system} Do not repeat questions.`
  let prompt = `${userPrompt}${source.userExtra}\n\nReturn exactly ${count} questions as json: {"questions":[{"q":"","o":${JSON.stringify(optionHint)},"e":"","w":${JSON.stringify(source.exampleW)}}]}`
  if (exclude.length > 0) {
    const listed = exclude.map((q, i) => `${i + 1}. ${q}`).join('\n')
    prompt += `\n\nDo not repeat or closely paraphrase these questions already used this session:\n${listed}`
  }

  log(
    'info',
    `AI request: ${ai.model} @ ${ai.baseURL} for ${topic.name} (${count} ${difficulty}, thinking=${thinkingType})`,
  )
  log(
    'debug',
    `AI settings: temperature=${ai.temperature} timeoutMs=${ai.timeoutMs} optionCount=${topic.optionCount} thinking=${thinkingType} fetchSource=${ai.fetchSourceEnabled === true} source=${topic.sourceUrl?.trim() ? 'url' : 'wiki'}`,
  )
  log('debug', `AI system: ${system}`)
  log('debug', `AI prompt: ${prompt}`)

  const started = Date.now()
  // generateText + Zod: avoid AI SDK json_schema, which this model does not support.
  const { text, usage } = await generateText({
    model: provider.chatModel(ai.model),
    temperature: ai.temperature,
    abortSignal,
    maxRetries: 0,
    system,
    prompt,
  })
  const ms = Date.now() - started
  log('debug', `AI response: ${ms}ms chars=${text.length} usage=${JSON.stringify(usage ?? {})}`)
  log('debug', `AI raw: ${text.length > 4000 ? `${text.slice(0, 4000)}…` : text}`)

  const object = schema.parse(parseJsonObject(text))

  if (object.questions.length !== count) {
    throw new Error(`Expected ${count} questions, got ${object.questions.length}`)
  }

  return object.questions.map((item) => shuffleQuestion(toQuizQuestion(item, mode, fallbackUrl)))
}

/** Controllers for live DeepSeek calls. Aborted when the Node process stops. */
const inflight = new Set<AbortController>()

/** Cancel outbound AI HTTP calls (server restart or Ctrl+C). */
export function abortAllGenerations() {
  if (inflight.size === 0) {
    return
  }
  log('info', `Stopping ${inflight.size} in-flight AI request(s)`)
  for (const ac of inflight) {
    ac.abort()
  }
  inflight.clear()
}

/** One AI call per round. Retry once on failure, then throw. */
export async function generateQuizRound(input: {
  topic: Topic
  count: number
  difficulty: Difficulty
  abortSignal?: AbortSignal
  exclude?: string[]
}): Promise<QuizQuestion[]> {
  const ai = loadAiRuntime()
  const stop = new AbortController()
  inflight.add(stop)
  const exclude = input.exclude ?? []

  // Fresh timeout per attempt. One shared clock ate the retry (and last Generate all level).
  function callSignal() {
    const parts = [AbortSignal.timeout(ai.timeoutMs), stop.signal]
    if (input.abortSignal) {
      parts.push(input.abortSignal)
    }
    return AbortSignal.any(parts)
  }

  // Fetch once so a JSON retry does not download the page again.
  let fetchedText: string | undefined
  const sourceUrl = input.topic.sourceUrl?.trim()
  if (ai.fetchSourceEnabled && sourceUrl) {
    try {
      fetchedText = await fetchSourceText(
        sourceUrl,
        input.abortSignal ? AbortSignal.any([stop.signal, input.abortSignal]) : stop.signal,
      )
      log('info', `Read source page for ${input.topic.name} (${fetchedText.length} chars)`)
    } catch (err) {
      if (isCancelledError(err)) {
        throw err
      }
      log('error', `Source fetch failed for ${input.topic.name}: ${errText(err)}`)
      throw err
    }
  }

  const run = () =>
    generateOnce(input.topic, input.count, input.difficulty, callSignal(), exclude, fetchedText)

  try {
    const questions = await run()
    log('info', `Generated ${questions.length} questions for ${input.topic.name} using ${ai.model}`)
    return questions
  } catch (err) {
    if (isCancelledError(err)) {
      log('info', 'Quiz generation cancelled (client disconnected or server stopping)')
      throw err
    }
    log('warn', `Quiz generation failed, retrying once: ${errText(err)}`)
    try {
      const questions = await run()
      log('info', `Generated ${questions.length} questions for ${input.topic.name} on retry`)
      return questions
    } catch (err2) {
      if (isCancelledError(err2)) {
        log('info', 'Quiz generation cancelled on retry')
        throw err2
      }
      log('error', `Quiz generation failed after retry: ${errText(err2)}`)
      throw err2
    }
  } finally {
    inflight.delete(stop)
  }
}
