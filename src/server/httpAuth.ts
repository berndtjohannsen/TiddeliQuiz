import type { Context } from 'hono'
import { getCookie } from 'hono/cookie'

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
