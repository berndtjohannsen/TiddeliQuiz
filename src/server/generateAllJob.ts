import type { Context } from 'hono'
import type { BankCount, Difficulty, QuizQuestion, Topic } from '../shared/types'
import { generateQuizRound, isCancelledError } from './ai'
import { difficulties } from './httpParse'
import { log } from './log'

type GenerateAllJobRow = {
  id: Difficulty
  status: 'waiting' | 'working' | 'done' | 'failed'
  added?: number
  skipped?: number
}

type GenerateAllJob = {
  id: string
  rows: GenerateAllJobRow[]
  bankCounts: BankCount[]
  done: boolean
  added: number
  skipped: number
  failed: Difficulty[]
  createdAt: number
}

/** Lives past the HTTP request so Children still runs if the popup closes. */
const generateAllJobs = new Map<string, GenerateAllJob>()
const GENERATE_ALL_JOB_MS = 30 * 60 * 1000

function pruneGenerateAllJobs() {
  const now = Date.now()
  for (const [id, job] of generateAllJobs) {
    if (now - job.createdAt > GENERATE_ALL_JOB_MS) {
      generateAllJobs.delete(id)
    }
  }
}

export function generateAllJobJson(c: Context, jobId: string) {
  const job = generateAllJobs.get(jobId)
  if (!job) {
    return c.json({ error: 'Unknown job' }, 404)
  }
  return c.json(jobPayload(job))
}

function jobPayload(job: GenerateAllJob) {
  return {
    jobId: job.id,
    rows: job.rows,
    bankCounts: job.bankCounts,
    done: job.done,
    added: job.added,
    skipped: job.skipped,
    failed: job.failed,
  }
}

export function startGenerateAllJob(opts: {
  topic: Topic
  count: number
  who: string
  difficulties?: Difficulty[]
  exclude: (difficulty: Difficulty) => string[]
  append: (difficulty: Difficulty, questions: QuizQuestion[], visibleOn?: Difficulty[]) => { added: number; skipped: number }
  counts: () => BankCount[]
}) {
  pruneGenerateAllJobs()
  const selected = (opts.difficulties?.length ? opts.difficulties : difficulties).filter((id, i, all) =>
    all.indexOf(id) === i,
  )
  const job: GenerateAllJob = {
    id: crypto.randomUUID(),
    rows: selected.map((id) => ({ id, status: 'waiting' as const })),
    bankCounts: opts.counts(),
    done: false,
    added: 0,
    skipped: 0,
    failed: [],
    createdAt: Date.now(),
  }
  generateAllJobs.set(job.id, job)
  void runGenerateAllJob(job, { ...opts, difficulties: selected })
  return job.id
}

async function runGenerateAllJob(
  job: GenerateAllJob,
  opts: {
    topic: Topic
    count: number
    who: string
    difficulties: Difficulty[]
    exclude: (difficulty: Difficulty) => string[]
    append: (difficulty: Difficulty, questions: QuizQuestion[], visibleOn?: Difficulty[]) => { added: number; skipped: number }
    counts: () => BankCount[]
  },
) {
  try {
    const difficulty = opts.difficulties[0]
    job.rows = job.rows.map((row) => ({ ...row, status: 'working' as const }))
    try {
      const questions = await generateQuizRound({
        topic: opts.topic,
        count: opts.count,
        difficulty,
        exclude: opts.exclude(difficulty).slice(0, 60).map((q) => q.slice(0, 200)),
      })
      const { added, skipped } = opts.append(difficulty, questions, opts.difficulties)
      job.added = added
      job.skipped = skipped
      job.rows = job.rows.map((row, index) => ({
        ...row,
        status: 'done' as const,
        added: index === 0 ? added : undefined,
        skipped: index === 0 ? skipped : undefined,
      }))
      job.bankCounts = opts.counts()
      log(
        'info',
        `${opts.who} generate selected: +${added} for ${opts.topic.name} (${opts.difficulties.join(', ')}), skipped ${skipped}`,
      )
    } catch (err) {
      job.failed.push(...opts.difficulties)
      job.rows = job.rows.map((row) => ({ ...row, status: 'failed' as const }))
      if (isCancelledError(err)) {
        log('info', `${opts.who} generate selected cancelled for ${opts.topic.name}`)
      } else {
        log('error', `${opts.who} generate selected failed for ${opts.topic.name}: ${String(err)}`)
      }
    }
  } finally {
    job.done = true
    job.bankCounts = opts.counts()
  }
}
