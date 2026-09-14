import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getRequestListener } from '@hono/node-server'
import { app } from './app'
import { getPort, loadEnv } from './config'
import { log, setLogLevel } from './log'
import { abortAllGenerations } from './ai'
import { loadLogLevel } from './store'

loadEnv()
setLogLevel(loadLogLevel())

const port = getPort()
const isProd = process.env.NODE_ENV === 'production'
const projectRoot = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../..')

/** Start API + (in development) the Vite React app on one port. */
async function start() {
  const apiListener = getRequestListener(app.fetch)

  if (isProd) {
    const server = http.createServer((req, res) => {
      void apiListener(req, res)
    })
    // 0.0.0.0 so the container is reachable from the host.
    server.listen(port, '0.0.0.0', () => {
      log('info', `TiddeliQuiz listening on http://0.0.0.0:${port}`)
    })
    return
  }

  const { createServer } = await import('vite')
  const vite = await createServer({
    root: projectRoot,
    server: {
      middlewareMode: true,
      // Bank writes go to data/; a reload here closed the Generate all popup.
      watch: { ignored: ['**/data/**'] },
    },
    appType: 'spa',
  })

  const server = http.createServer((req, res) => {
    const url = req.url ?? '/'
    if (url.startsWith('/api')) {
      void apiListener(req, res)
      return
    }
    vite.middlewares(req, res)
  })

  server.listen(port, () => {
    log('info', `TiddeliQuiz listening on http://localhost:${port}`)
  })
}

function onStop() {
  abortAllGenerations()
  // A SIGINT/SIGTERM listener replaces Node's default exit. Stop the process ourselves.
  process.exit(0)
}

process.once('SIGINT', onStop)
process.once('SIGTERM', onStop)

void start().catch((err) => {
  log('error', `Failed to start: ${String(err)}`)
  process.exit(1)
})
