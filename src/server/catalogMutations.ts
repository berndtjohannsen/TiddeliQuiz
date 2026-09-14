import type { Context, Hono } from 'hono'
import { log } from './log'
import {
  catalogFail,
  countsForOwner,
  parseCategoryName,
  parseTopicBody,
  parseTopicFields,
  routeParam,
  withCatalogAuth,
  type CatalogAuth,
} from './httpParse'
import { addCategory, addTopic, removeCategory, removeTopic, renameCategory, updateTopic, type CatalogOwner } from './store'

async function handlePostCategory(c: Context, owner: CatalogOwner, who: string) {
  const parsed = parseCategoryName(await c.req.json<{ name?: string }>())
  if ('error' in parsed) {
    return c.json({ error: parsed.error }, 400)
  }
  const result = addCategory(owner, parsed.name)
  if ('error' in result) {
    return catalogFail(c, result.error)
  }
  log('info', `${who} added category ${result.category.name}`)
  return c.json({ category: result.category })
}

async function handlePutCategory(c: Context, owner: CatalogOwner, who: string) {
  const parsed = parseCategoryName(await c.req.json<{ name?: string }>())
  if ('error' in parsed) {
    return c.json({ error: parsed.error }, 400)
  }
  const result = renameCategory(owner, routeParam(c, 'id'), parsed.name)
  if ('error' in result) {
    return catalogFail(c, result.error)
  }
  log('info', `${who} renamed category to ${result.category.name}`)
  return c.json({ category: result.category })
}

function handleDeleteCategory(c: Context, owner: CatalogOwner, who: string) {
  const result = removeCategory(owner, routeParam(c, 'id'))
  if ('error' in result) {
    return catalogFail(c, result.error)
  }
  log('info', `${who} removed a category`)
  return c.json({ ok: true, bankCounts: countsForOwner(owner) })
}

async function handlePostTopic(c: Context, owner: CatalogOwner, who: string) {
  const parsed = parseTopicBody(
    await c.req.json<{
      categoryId?: string
      name?: string
      optionCount?: number
      prompt?: string
      sourceUrl?: string
      sourceFocus?: string
    }>(),
  )
  if ('error' in parsed) {
    return c.json({ error: parsed.error }, 400)
  }
  const result = addTopic(owner, parsed)
  if ('error' in result) {
    return catalogFail(c, result.error)
  }
  log('info', `${who} added subject ${result.topic.name}`)
  return c.json({ topic: result.topic })
}

async function handlePutTopic(c: Context, owner: CatalogOwner, who: string) {
  const parsed = parseTopicFields(
    await c.req.json<{
      name?: string
      optionCount?: number
      prompt?: string
      sourceUrl?: string
      sourceFocus?: string
    }>(),
  )
  if ('error' in parsed) {
    return c.json({ error: parsed.error }, 400)
  }
  const result = updateTopic(owner, routeParam(c, 'id'), parsed)
  if ('error' in result) {
    return catalogFail(c, result.error)
  }
  log('info', `${who} updated subject ${result.topic.name}`)
  return c.json({ topic: result.topic })
}

function handleDeleteTopic(c: Context, owner: CatalogOwner, who: string) {
  const result = removeTopic(owner, routeParam(c, 'id'))
  if ('error' in result) {
    return catalogFail(c, result.error)
  }
  log('info', `${who} removed a subject`)
  return c.json({ ok: true, bankCounts: countsForOwner(owner) })
}

/** Same six row routes for player, platform admin, and admin-as-user. */
export function mountCatalogMutations(
  app: Hono,
  prefix: string,
  resolve: (c: Context) => CatalogAuth,
) {
  app.post(`${prefix}/categories`, withCatalogAuth(resolve, handlePostCategory))
  app.put(`${prefix}/categories/:id`, withCatalogAuth(resolve, handlePutCategory))
  app.delete(`${prefix}/categories/:id`, withCatalogAuth(resolve, handleDeleteCategory))
  app.post(`${prefix}/topics`, withCatalogAuth(resolve, handlePostTopic))
  app.put(`${prefix}/topics/:id`, withCatalogAuth(resolve, handlePutTopic))
  app.delete(`${prefix}/topics/:id`, withCatalogAuth(resolve, handleDeleteTopic))
}
