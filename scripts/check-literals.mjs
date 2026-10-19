// Portable form of DESIGN.md's TS/TSX enforcement check (keep the two in step).
// Catches colour literals, quoted font values that aren't var(...), and numeric
// radii (borderRadius / border-*-radius). Prints matches as file:line:text and
// exits 1 if there are any; silent otherwise.
import { readdirSync, readFileSync } from 'node:fs'
import { join, sep } from 'node:path'

const COLOUR = String.raw`#[0-9a-fA-F]{3,8}\b|rgba?\(`
const FONT = String.raw`\b(font|fontFamily)\s*:\s*['"]([^v'"]|v[^a])`
const RADIUS = String.raw`\b[bB]order\w*Radius\s*:\s*['"]?[0-9.]|border(-[a-z]+)*-radius\s*:\s*[0-9.]`
const LITERAL = new RegExp(`${COLOUR}|${FONT}|${RADIUS}`)
const ALLOWED = /src\/scene\/overlayTokens.ts|src\/editor\/.*catalog/

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(path)
    else if (/\.tsx?$/.test(entry.name)) yield path.split(sep).join('/')
  }
}

const hits = []
for (const file of walk('src')) {
  readFileSync(file, 'utf8').split(/\r?\n/).forEach((text, i) => {
    const line = `${file}:${i + 1}:${text}`
    if (LITERAL.test(text) && !ALLOWED.test(line)) hits.push(line)
  })
}

if (hits.length) {
  console.log(hits.join('\n'))
  process.exit(1)
}
