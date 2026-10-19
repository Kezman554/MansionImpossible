// Runs every *.e2e.mjs in this folder against one dev server (started here, or reused).
import { spawnSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { config } from './config.mjs'
import { ensureDevServer } from './devServer.mjs'

const files = readdirSync(import.meta.dirname).filter((f) => f.endsWith('.e2e.mjs')).sort()
const server = await ensureDevServer(config.port)
let failed = 0
try {
  for (const file of files) {
    console.log(`\n── ${file}`)
    const { status } = spawnSync(process.execPath, [join(import.meta.dirname, file)], { stdio: 'inherit' })
    if (status !== 0) failed++
  }
} finally {
  server.stop()
}
console.log(`\n${files.length - failed}/${files.length} browser test files passed`)
process.exit(failed ? 1 : 0)
