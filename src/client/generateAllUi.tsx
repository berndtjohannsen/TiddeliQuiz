import { useEffect, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import type { BankCount, Difficulty } from '../shared/types'
import {
  bankCountIn,
  bankDifficulties,
  btnClass,
  btnSecondary,
  difficultyLabel,
  fillText,
} from './catalogShared'
import { strings } from './strings'

/** One row in the Generate all popup. */
export type GenerateAllRow = {
  id: Difficulty
  status: 'waiting' | 'working' | 'done' | 'failed'
  added?: number
  skipped?: number
}

export function emptyGenerateAllRows(ids?: Difficulty[]): GenerateAllRow[] {
  const selected = ids?.length ? bankDifficulties.filter((d) => ids.includes(d.id)) : bankDifficulties
  return selected.map((d) => ({ id: d.id, status: 'waiting' as const }))
}

/** Lives on App, not Admin/Home, so a catalog re-render cannot take the popup down. */
export type GenerateAllUi = {
  open: boolean
  chrome: 'admin' | 'player'
  topicId: string
  count: number
  rows: GenerateAllRow[]
  busy: boolean
  error: string
  message: string
  counts: BankCount[]
  jobId: string
  pollBase: string
}

const GENERATE_ALL_KEY = 'tiddeli-generate-all'

const emptyGenerateAllUi: GenerateAllUi = {
  open: false,
  chrome: 'admin',
  topicId: '',
  count: 10,
  rows: [],
  busy: false,
  error: '',
  message: '',
  counts: [],
  jobId: '',
  pollBase: '',
}

function readStoredGenerateAll(): GenerateAllUi {
  try {
    const raw = sessionStorage.getItem(GENERATE_ALL_KEY)
    if (!raw) {
      return { ...emptyGenerateAllUi }
    }
    const parsed = JSON.parse(raw) as GenerateAllUi
    if (!parsed.open) {
      return { ...emptyGenerateAllUi }
    }
    return { ...emptyGenerateAllUi, ...parsed }
  } catch {
    return { ...emptyGenerateAllUi }
  }
}

function persistGenerateAll(ui: GenerateAllUi) {
  try {
    if (ui.open) {
      sessionStorage.setItem(GENERATE_ALL_KEY, JSON.stringify(ui))
    } else {
      sessionStorage.removeItem(GENERATE_ALL_KEY)
    }
  } catch {
    // Private mode can block sessionStorage.
  }
}

let generateAllUi: GenerateAllUi = readStoredGenerateAll()
const generateAllListeners = new Set<() => void>()
let generateAllStart: (() => void) | null = null
let generateAllApplyCounts: ((counts: BankCount[]) => void) | null = null
let generateAllPollActive = false

function emitGenerateAll() {
  for (const fn of generateAllListeners) {
    fn()
  }
}

export function patchGenerateAllUi(patch: Partial<GenerateAllUi>) {
  generateAllUi = { ...generateAllUi, ...patch }
  persistGenerateAll(generateAllUi)
  emitGenerateAll()
}

export function getGenerateAllUi() {
  return generateAllUi
}

export function setGenerateAllStart(fn: () => void) {
  generateAllStart = fn
}

export function setGenerateAllApplyCounts(fn: (counts: BankCount[]) => void) {
  generateAllApplyCounts = fn
}

export function applyGenerateAllCounts(counts: BankCount[]) {
  generateAllApplyCounts?.(counts)
}

export function startStoredGenerateAll() {
  generateAllStart?.()
}

export function closeStoredGenerateAll() {
  if (generateAllUi.busy) {
    return
  }
  generateAllUi = { ...emptyGenerateAllUi }
  persistGenerateAll(generateAllUi)
  emitGenerateAll()
}

export function useGenerateAllUi() {
  return useSyncExternalStore(
    (onStoreChange) => {
      generateAllListeners.add(onStoreChange)
      return () => generateAllListeners.delete(onStoreChange)
    },
    () => generateAllUi,
  )
}

export type GenerateAllJobStatus = {
  rows: GenerateAllRow[]
  bankCounts?: BankCount[]
  done: boolean
  added: number
  skipped: number
  failed: Difficulty[]
}

async function pollGenerateAllJob(pollBase: string, jobId: string) {
  if (generateAllPollActive) {
    return
  }
  generateAllPollActive = true
  try {
    while (true) {
      const res = await fetch(`${pollBase}/${encodeURIComponent(jobId)}`, { credentials: 'include' })
      const job = (await res.json()) as GenerateAllJobStatus & { error?: string }
      if (!res.ok) {
        throw new Error(job.error ?? strings.bankGenerateFailed)
      }
      patchGenerateAllUi({
        rows: job.rows?.length ? job.rows : getGenerateAllUi().rows,
        counts: job.bankCounts ?? getGenerateAllUi().counts,
        busy: !job.done,
        jobId,
        pollBase,
      })
      if (job.done) {
        return job
      }
      await new Promise((resolve) => window.setTimeout(resolve, 800))
    }
  } finally {
    generateAllPollActive = false
  }
}

/** If Vite reloaded the page, reopen the popup and keep polling the same job. */
export function resumeGenerateAllPoll() {
  const ui = generateAllUi
  if (!ui.open || !ui.jobId || !ui.pollBase || !ui.busy) {
    return
  }
  void (async () => {
    try {
      const job = await pollGenerateAllJob(ui.pollBase, ui.jobId)
      if (!job) {
        return
      }
      applyGenerateAllCounts(job.bankCounts ?? getGenerateAllUi().counts)
      const failed = (job.failed ?? []).map((id) => difficultyLabel(id))
      patchGenerateAllUi({
        busy: false,
        message:
          job.added || job.skipped
            ? job.skipped
              ? fillText(strings.bankAddedSome, { added: job.added, skipped: job.skipped })
              : fillText(strings.bankAdded, { added: job.added })
            : '',
        error: failed.length ? fillText(strings.bankGenerateAllFailed, { failed: failed.join(', ') }) : '',
      })
    } catch (err) {
      patchGenerateAllUi({
        busy: false,
        error: err instanceof Error ? err.message : strings.bankGenerateFailed,
      })
    }
  })()
}

/** Always mounted from App so the popup survives Admin/Home remounts. */
export function GenerateAllHost() {
  const ui = useGenerateAllUi()
  useEffect(() => {
    resumeGenerateAllPoll()
  }, [])
  if (!ui.open) {
    return null
  }
  return (
    <GenerateAllDialog
      chrome={ui.chrome}
      topicId={ui.topicId}
      counts={ui.counts}
      count={ui.count}
      rows={ui.rows}
      busy={ui.busy}
      error={ui.error}
      message={ui.message}
      onStart={startStoredGenerateAll}
      onClose={closeStoredGenerateAll}
    />
  )
}

/** Start a server job, then poll until Children has finished too. */
export async function runGenerateAllJob(
  startUrl: string,
  statusUrl: (jobId: string) => string,
  body: { topicId: string; count: number; difficulties?: Difficulty[] },
  onStatus: (job: GenerateAllJobStatus) => void,
): Promise<{ added: number; skipped: number; failed: string[] }> {
  const started = await fetch(startUrl, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const startData = (await started.json()) as { jobId?: string; error?: string }
  if (!started.ok || !startData.jobId) {
    throw new Error(startData.error ?? strings.bankGenerateFailed)
  }
  patchGenerateAllUi({ jobId: startData.jobId, pollBase: startUrl })
  const job = await pollGenerateAllJob(startUrl, startData.jobId)
  if (!job) {
    return { added: 0, skipped: 0, failed: [] }
  }
  onStatus(job)
  return {
    added: job.added,
    skipped: job.skipped,
    failed: (job.failed ?? []).map((id) => difficultyLabel(id)),
  }
}

/** Popup for Generate all. Start runs one server job through Children. */
export function GenerateAllDialog(props: {
  chrome: 'admin' | 'player'
  topicId: string
  counts: BankCount[] | undefined
  count: number
  rows: GenerateAllRow[]
  busy: boolean
  error?: string
  message?: string
  onStart: () => void
  onClose: () => void
}) {
  const admin = props.chrome === 'admin'
  const rows = props.rows ?? []
  const canStart = !props.busy && rows.every((row) => row.status === 'waiting')
  const dialog = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="generate-all-title"
    >
      <div
        className="w-full max-w-md rounded-lg border border-slate-600 bg-slate-900 p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="generate-all-title" className="text-lg font-medium">
          {admin ? strings.bankGenerateAllTitle : strings.myBankGenerateAllTitle}
        </h2>
        <p className="mt-1 text-xs text-slate-400">
          {fillText(admin ? strings.bankGenerateAllHint : strings.myBankGenerateAllHint, {
            count: props.count,
          })}
        </p>
        <ul className="mt-4 flex flex-col gap-2">
          {rows.map((row) => (
            <li
              key={row.id}
              className={`flex items-center justify-between gap-3 rounded border px-3 py-2 text-sm ${
                row.status === 'working' ? 'border-sky-500' : 'border-slate-700'
              }`}
            >
              <span>
                <span className="block font-medium">{difficultyLabel(row.id)}</span>
                <span className="text-xs text-slate-400">
                  {fillText(admin ? strings.bankCount : strings.myBankCount, {
                    count: bankCountIn(props.counts, props.topicId, row.id),
                  })}
                </span>
              </span>
              <span
                className={
                  row.status === 'failed'
                    ? 'text-red-400'
                    : row.status === 'done'
                      ? 'text-emerald-400'
                      : row.status === 'working'
                        ? 'text-sky-300'
                        : 'text-slate-400'
                }
              >
                {generateAllRowText(row, admin)}
              </span>
            </li>
          ))}
        </ul>
        {!props.busy && props.error ? (
          <p className="mt-3 text-sm text-red-400">{props.error}</p>
        ) : null}
        {!props.busy && props.message ? (
          <p className="mt-3 text-sm text-emerald-400">{props.message}</p>
        ) : null}
        {props.busy ? (
          <p className="mt-4 text-sm text-sky-300">
            {admin ? strings.bankGenerating : strings.generating}
          </p>
        ) : (
          <div className="mt-4 flex flex-wrap gap-3">
            {canStart ? (
              <button type="button" className={btnClass} onClick={props.onStart}>
                {admin ? strings.bankGenerateAllStart : strings.myBankGenerateAllStart}
              </button>
            ) : (
              <button type="button" className={btnClass} onClick={props.onClose}>
                {admin ? strings.bankGenerateAllClose : strings.myBankGenerateAllClose}
              </button>
            )}
            {canStart ? (
              <button type="button" className={btnSecondary} onClick={props.onClose}>
                {admin ? strings.cancel : strings.myCancel}
              </button>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
  return createPortal(dialog, document.body)
}

function generateAllRowText(row: GenerateAllRow, admin: boolean) {
  if (row.status === 'waiting') {
    return admin ? strings.bankGenerateAllWaiting : strings.myBankGenerateAllWaiting
  }
  if (row.status === 'working') {
    return admin ? strings.bankGenerateAllWorking : strings.myBankGenerateAllWorking
  }
  if (row.status === 'failed') {
    return admin ? strings.bankGenerateAllRowFailed : strings.myBankGenerateAllRowFailed
  }
  if (row.added == null) {
    return admin ? strings.bankGenerateAllDone : strings.myBankGenerateAllDone
  }
  return fillText(admin ? strings.bankGenerateAllRowDone : strings.myBankGenerateAllRowDone, {
    added: row.added ?? 0,
  })
}
