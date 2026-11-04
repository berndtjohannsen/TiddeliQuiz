import { getConnInfo } from '@hono/node-server/conninfo'
import type { Context } from 'hono'
import { getCookie } from 'hono/cookie'

const FAIL_LIMIT = 5
const PAUSE_MS = 10 * 60 * 1000
const MAX_VISITORS = 30
const VISITOR_MS = 15 * 60 * 1000

type Strike = { fails: number; pausedUntil: number }

const strikes = new Map<string, Strike>()
const visitors = new Map<string, number>()

export const cookieName = 'tiddeli_admin'
export const playerCookie = 'tiddeli_player'
/** In-memory sessions. Lost on restart; fine for v1. */
export const sessions = new Set<string>()
export const playerSessions = new Map<string, { id: string; username: string }>()

export function isAdmin(c: Context) {
  const token = getCookie(c, cookieName)
  return Boolean(token && sessions.has(token))
}

export function playerAccount(c: Context): { id: string; username: string } | null {
  const token = getCookie(c, playerCookie)
  if (!token) {
    return null
  }
  return playerSessions.get(token) ?? null
}

function privatePeer(address: string) {
  return (
    address === '127.0.0.1' ||
    address === '::1' ||
    address.startsWith('10.') ||
    address.startsWith('192.168.') ||
    address.startsWith('172.')
  )
}

/** Visitor address. A forwarded header counts only when the peer is a local proxy. */
export function clientAddress(c: Context) {
  let peer = ''
  try {
    peer = getConnInfo(c).remote.address?.replace(/^::ffff:/i, '') || ''
  } catch {
    peer = ''
  }
  const forwarded = privatePeer(peer) ? c.req.header('x-forwarded-for')?.split(',')[0]?.trim() : ''
  const raw = (forwarded || peer).replace(/^::ffff:/i, '').slice(0, 80)
  return raw || 'unknown'
}

/** True while this address is inside the pause after too many failed logins. */
export function loginPaused(address: string) {
  const row = strikes.get(address)
  if (!row?.pausedUntil) {
    return false
  }
  if (row.pausedUntil > Date.now()) {
    return true
  }
  strikes.delete(address)
  return false
}

/** Count one bad login. The fifth starts a 10 minute pause for this address. */
export function noteLoginFailure(address: string) {
  const now = Date.now()
  const row = strikes.get(address) ?? { fails: 0, pausedUntil: 0 }
  if (row.pausedUntil > now) {
    return true
  }
  row.fails += 1
  row.pausedUntil = row.fails >= FAIL_LIMIT ? now + PAUSE_MS : 0
  if (row.pausedUntil) {
    row.fails = 0
  }
  strikes.set(address, row)
  return row.pausedUntil > 0
}

/** A successful login clears the pause for this address. */
export function noteLoginSuccess(address: string) {
  strikes.delete(address)
}

/** Remember this address for 15 minutes. A new address past the cap is refused. */
export function admitVisitor(address: string) {
  const now = Date.now()
  for (const [ip, seen] of visitors) {
    if (now - seen > VISITOR_MS) {
      visitors.delete(ip)
    }
  }
  if (visitors.has(address)) {
    visitors.set(address, now)
    return true
  }
  if (visitors.size >= MAX_VISITORS) {
    return false
  }
  visitors.set(address, now)
  return true
}
