// Reuses a dev server already serving the app on the port, or starts one for the run.
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { sleep } from './cdp.mjs'

const ROOT = join(import.meta.dirname, '..', '..')
const VITE = join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js')

async function servesApp(origin) {
  try {
    const response = await fetch(origin)
    return response.ok && (await response.text()).includes('<title>Mansion Impossible</title>')
  } catch {
    return false
  }
}

/** Resolves to { origin, stop }. stop() only shuts down a server this call started. */
export async function ensureDevServer(port) {
  const origin = `http://localhost:${port}`
  if (await servesApp(origin)) {
    console.log(`Using the dev server already running at ${origin}`)
    return { origin, stop() {} }
  }
  if (!existsSync(VITE)) throw new Error('Vite not found — run npm install first')

  console.log(`Starting a dev server at ${origin}`)
  const vite = spawn(process.execPath, [VITE, '--port', String(port), '--strictPort'], { cwd: ROOT, stdio: ['ignore', 'ignore', 'pipe'] })
  let stderr = ''
  vite.stderr.on('data', (chunk) => (stderr += chunk))
  let exited = false
  vite.on('exit', () => (exited = true))

  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    if (exited) {
      throw new Error(`The dev server could not start on port ${port} — is something else using it? Set E2E_PORT to use another.\n${stderr.trim()}`)
    }
    if (await servesApp(origin)) return { origin, stop: () => vite.kill() }
    await sleep(250)
  }
  vite.kill()
  throw new Error(`The dev server did not respond at ${origin} within 30 s`)
}
