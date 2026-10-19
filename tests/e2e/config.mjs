// Browser-test settings. Override any of them with an environment variable.
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export const config = {
  /** Chrome or Chromium executable. */
  chrome: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  /** Dev-server port: reused if the app is already served there, otherwise started on it. */
  port: Number(process.env.E2E_PORT ?? 5199),
  /** Chrome's remote-debugging port. */
  cdpPort: Number(process.env.E2E_CDP_PORT ?? 9333),
  /** Screenshots, downloads and the throwaway Chrome profile (wiped each run). */
  outDir: process.env.E2E_OUT ?? join(tmpdir(), 'mansion-impossible-e2e'),
}
