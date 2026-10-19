// Portable form of DESIGN.md's TS/TSX enforcement check:
//   grep -rnE "#[0-9a-fA-F]{3,8}\b|rgba?\(" src --include=*.ts --include=*.tsx \
//     | grep -vE "src/scene/overlayTokens.ts|src/editor/.*catalog"
// Prints matches as file:line:text and exits 1 if there are any; silent otherwise.
import { readdirSync, readFileSync } from 'node:fs'
import { join, sep } from 'node:path'

const LITERAL = /#[0-9a-fA-F]{3,8}\b|rgba?\(/
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
