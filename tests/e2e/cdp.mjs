// Minimal Chrome DevTools Protocol driver (no dependencies).
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export async function launch({ chrome, profile, port }) {
  if (!existsSync(chrome)) throw new Error(`Chrome not found at ${chrome} — set CHROME_PATH`)
  mkdirSync(profile, { recursive: true })
  const proc = spawn(chrome, [
    '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    '--window-size=1440,900', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--no-first-run', '--no-default-browser-check', 'about:blank',
  ], { stdio: 'ignore' })
  let targets
  for (let i = 0; i < 50; i++) {
    try { targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); if (targets.some((t) => t.type === 'page')) break } catch {}
    await sleep(200)
  }
  const page = targets?.find((t) => t.type === 'page')
  if (!page) {
    proc.kill()
    throw new Error(`Chrome didn't open a debuggable page on port ${port} — set E2E_CDP_PORT if it's in use`)
  }
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((r) => ws.addEventListener('open', r, { once: true }))
  let id = 0
  const pending = new Map()
  const listeners = []
  ws.addEventListener('message', (e) => {
    const msg = JSON.parse(e.data)
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id)
      pending.delete(msg.id)
      if (msg.error) reject(new Error(msg.error.message))
      else resolve(msg.result)
    } else if (msg.method) listeners.forEach((l) => l(msg))
  })
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const n = ++id
    pending.set(n, { resolve, reject })
    ws.send(JSON.stringify({ id: n, method, params }))
  })
  const consoleErrors = []
  listeners.push((m) => {
    if (m.method === 'Runtime.exceptionThrown') consoleErrors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text)
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') consoleErrors.push(m.params.args.map((a) => a.value ?? a.description).join(' '))
  })
  await send('Page.enable'); await send('Runtime.enable'); await send('DOM.enable')

  async function evaluate(expression) {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (r.exceptionDetails) throw new Error(`${expression}\n→ ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`)
    return r.result.value
  }
  async function waitFor(expression, timeout = 8000) {
    const end = Date.now() + timeout
    while (Date.now() < end) { if (await evaluate(expression).catch(() => false)) return; await sleep(100) }
    throw new Error(`Timed out waiting for: ${expression}`)
  }
  return {
    send, evaluate, waitFor, consoleErrors,
    async goto(url) { await send('Page.navigate', { url }); await sleep(300) },
    async reload() { await send('Page.reload', { ignoreCache: false }); await sleep(300) },
    async screenshot(path) {
      const { data } = await send('Page.captureScreenshot', { format: 'png' })
      ;(await import('node:fs')).writeFileSync(path, Buffer.from(data, 'base64'))
    },
    close() { ws.close(); proc.kill() },
  }
}
