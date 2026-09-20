import type { LogLevel } from '../shared/types'

const rank: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
}

type LogEntry = {
  level: LogLevel
  line: string
}

const memory: LogEntry[] = []
const maxLines = 200

let minLevel: LogLevel = 'info'

export function getLogLevel(): LogLevel {
  return minLevel
}

/** Apply admin log level. The UI log is filtered to this level and above. */
export function setLogLevel(level: LogLevel) {
  minLevel = level
}

function allowed(level: LogLevel) {
  return rank[level] <= rank[minLevel]
}

/** One line to Docker/Portainer. stdout is often fully buffered when not a TTY. */
function writeContainerLog(line: string, isError = false) {
  const stream = isError ? process.stderr : process.stdout
  stream.write(`${line}\n`)
}

/** Store a line for the admin log. Also print so Portainer can see it. */
export function log(level: LogLevel, message: string) {
  const line = `${new Date().toISOString()} [${level}] ${message}`
  memory.push({ level, line })
  if (memory.length > maxLines) {
    memory.shift()
  }
  if (process.env.NODE_ENV === 'production') {
    writeContainerLog(line, level === 'error')
  }
}

/** Lines visible at the current admin log level (error ⊂ warn ⊂ info ⊂ debug). */
export function getLogLines() {
  return memory.filter((entry) => allowed(entry.level)).map((entry) => entry.line)
}
