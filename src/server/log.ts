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

/** Store a line for the admin log. In production also print so Portainer can see it. */
export function log(level: LogLevel, message: string) {
  const line = `${new Date().toISOString()} [${level}] ${message}`
  memory.push({ level, line })
  if (memory.length > maxLines) {
    memory.shift()
  }
  if (process.env.NODE_ENV === 'production') {
    if (level === 'error') {
      console.error(line)
    } else {
      console.log(line)
    }
  }
}

/** Lines visible at the current admin log level (error ⊂ warn ⊂ info ⊂ debug). */
export function getLogLines() {
  return memory.filter((entry) => allowed(entry.level)).map((entry) => entry.line)
}
