import fs from 'node:fs'
import path from 'node:path'
import tls from 'node:tls'

/** Trust Windows/OS CA store (antivirus HTTPS inspection). Must run before any HTTPS. */
function useSystemCa() {
  try {
    const bundled = tls.getCACertificates('default')
    const system = tls.getCACertificates('system')
    tls.setDefaultCACertificates([...bundled, ...system])
  } catch {
    // Node without this API: start with `node --use-system-ca`
  }
}

useSystemCa()

/** Load .env from the project root if present. Does not override existing env vars. */
export function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env')
  if (!fs.existsSync(envPath)) {
    return
  }

  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) {
      continue
    }
    const eq = trimmed.indexOf('=')
    if (eq === -1) {
      continue
    }
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (process.env[key] === undefined) {
      process.env[key] = value
    }
  }
}

export function getPort() {
  return Number(process.env.PORT ?? 3001)
}

/** Simple v1 admin login. Values come from .env, not from the browser. */
export function getAdminCredentials() {
  return {
    username: process.env.ADMIN_USERNAME ?? 'admin',
    password: process.env.ADMIN_PASSWORD ?? 'changeme',
  }
}
