// Browser test for the DesignManager: two designs survive a refresh intact; a failed save shows the banner.
// Run with `npm run test:e2e` (settings in config.mjs). Not part of `npm test`.
import { existsSync, mkdirSync, readdirSync, rmSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { launch, sleep } from './cdp.mjs'
import { config } from './config.mjs'
import { ensureDevServer } from './devServer.mjs'

const OUT = join(config.outDir, 'designManager')
const DOWNLOADS = join(OUT, 'downloads')
rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })

const server = await ensureDevServer(config.port)
const ORIGIN = server.origin
let b
try {
  b = await launch({ chrome: config.chrome, profile: join(OUT, 'profile'), port: config.cdpPort })
} catch (error) {
  server.stop()
  console.log('ERROR', error.message)
  process.exit(1)
}
const results = []
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }
const shot = (name) => b.screenshot(join(OUT, `${name}.png`))

// Page helpers
const H = `
  window.$btn = (label) => [...document.querySelectorAll('button')].find((el) => el.textContent.trim() === label || el.getAttribute('aria-label') === label);
  window.$click = (label) => { const el = $btn(label); if (!el) throw new Error('No button: ' + label); el.click(); return true };
  window.$S = () => window.__mansion.useDesignStore.getState();
  window.$A = () => window.__mansion.useAppStore.getState();
  window.$json = () => JSON.stringify($S().design);
  window.$text = () => document.body.innerText;
  true`
const page = async () => { await b.waitFor('!!window.__mansion'); await b.evaluate(H) }
const click = (label) => b.evaluate(`$click(${JSON.stringify(label)})`)
const text = () => b.evaluate('$text()')

try {
  await b.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DOWNLOADS }).catch(() =>
    b.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: DOWNLOADS }))

  // 1. Empty state
  await b.goto(ORIGIN)
  await page()
  await b.waitFor(`$text().includes('No mansions yet')`)
  const empty = await text()
  check('empty state offers New mansion and Import JSON', empty.includes('+ New mansion') && empty.includes('Import JSON'))
  await shot('1-empty')

  // 2. Design A: three rooms on two floors, a piece, furniture
  await click('+ New mansion')
  await b.waitFor(`location.hash.startsWith('#/mansion/') && !!$btn('My mansions')`)
  await b.evaluate(`(() => {
    const s = $S();
    s.addObject({ kind: 'room', name: 'Great hall', size: [12, 5, 9], position: [0, 0, 0], openings: [{ id: 'd1', type: 'door', wall: 'south', offset: 6, width: 2, height: 3, sill: 0 }], materials: { floor: 'marble', walls: null, ceiling: null } });
    s.addObject({ kind: 'room', name: 'Library', size: [8, 4, 6], position: [12, 0, 0], rotation: [0, Math.PI / 2, 0], openings: [], materials: { floor: null, walls: 'oak', ceiling: null } });
    s.addObject({ kind: 'room', name: 'Observatory', floor: 1, size: [6, 6, 6], position: [0, 0, 0], openings: [], materials: { floor: null, walls: null, ceiling: 'glass' } });
    s.addObject({ kind: 'piece', type: 'fish-tank', size: [4, 15, 4], position: [6, -3, 4.5], material: null });
    s.addObject({ kind: 'furniture', catalogId: 'grand-piano', position: [3, 0, 2], scale: [1.2, 1.2, 1.2], material: null });
    s.updateObject($S().design.rooms[0].id, { name: 'Grand hall' });
    return true })()`)
  await b.waitFor(`$A().toast?.message === 'Saved'`, 4000)
  await shot('2-editor-saved')
  check('autosave shows Saved toast', true)
  const idA = await b.evaluate('$S().design.id')
  const jsonA = await b.evaluate('$json()')

  // 3. Design B
  await click('My mansions')
  await b.waitFor(`$text().includes('My mansions') && !location.hash`)
  await click('+ New mansion')
  await b.waitFor(`location.hash.startsWith('#/mansion/') && $S().design.id !== ${JSON.stringify(idA)}`)
  await b.evaluate(`(() => {
    const s = $S();
    s.addObject({ kind: 'room', name: 'Boathouse', floor: -1, size: [10, 3, 10], openings: [], materials: { floor: null, walls: null, ceiling: null } });
    s.addObject({ kind: 'piece', type: 'slide', size: [1, 8, 12], rotation: [0.3, 0, 0], material: 'chrome' });
    return true })()`)
  await b.waitFor(`$A().toast?.message === 'Saved'`, 4000)
  const idB = await b.evaluate('$S().design.id')
  const jsonB = await b.evaluate('$json()')
  await click('My mansions')
  await b.waitFor(`document.querySelectorAll('.design-card').length === 2`)

  // 4. Refresh, then reopen both from their cards
  await b.reload()
  await page()
  await b.waitFor(`document.querySelectorAll('.design-card').length === 2`)
  const list = await text()
  check('cards show name, edited date, floor and room counts', list.includes('Untitled mansion') && list.includes('Untitled mansion 2') && /Edited today, \d\d:\d\d · 1 floor · 3 rooms/.test(list) && /1 floor · 1 room\b/.test(list), '2 designs')
  await shot('3-start-two-designs')

  for (const [label, id, json] of [['Untitled mansion', idA, jsonA], ['Untitled mansion 2', idB, jsonB]]) {
    await click(`Open ${label}`)
    await b.waitFor(`$S().design.id === ${JSON.stringify(id)}`)
    check(`after refresh, "${label}" reopens intact`, (await b.evaluate('$json()')) === json)
    await click('My mansions')
    await b.waitFor(`!location.hash && document.querySelectorAll('.design-card').length === 2`)
  }

  // 5. Refresh while in the editor reopens the same design
  await click(`Open Untitled mansion`)
  await b.waitFor(`$S().design.id === ${JSON.stringify(idA)}`)
  await b.reload()
  await page()
  await b.waitFor(`$S().design.id === ${JSON.stringify(idA)} && !!$btn('My mansions')`)
  check('refresh inside the editor reopens the design intact', (await b.evaluate('$json()')) === jsonA)

  // 6. Failed save. Chrome's Storage.overrideQuotaForOrigin isn't enforced on an already-created
  // database, so make IndexedDB writes fail the way a full disk does: QuotaExceededError.
  await b.evaluate(`(() => {
    window.__realPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function () { throw new DOMException('The quota has been exceeded.', 'QuotaExceededError') };
    return true })()`)
  await b.evaluate(`$S().addObject({ kind: 'furniture', catalogId: 'chandelier', position: [6, 4.5, 4.5], material: null }), true`)
  await b.waitFor(`!!document.querySelector('[role=alert]')`, 5000)
  const banner = await b.evaluate(`document.querySelector('[role=alert]').innerText`)
  check('failed save shows persistent banner with Export JSON and Try again', banner.includes("Couldn't save — this browser's storage is full") && banner.includes('Export JSON') && banner.includes('Try again'), banner.split('\n')[0])
  check('top bar marks the design not saved', (await text()).includes('· not saved'))
  await shot('4-save-failed-banner')
  await sleep(6000)
  check('banner is still there after 6 s', await b.evaluate(`!!document.querySelector('[role=alert]')`))

  await click('My mansions')
  await sleep(800)
  check('leaving the editor is refused while the save is failing', await b.evaluate(`location.hash.startsWith('#/mansion/') && !!$btn('My mansions')`))

  await click('Export JSON')
  await sleep(1000)
  const exported = existsSync(DOWNLOADS) ? readdirSync(DOWNLOADS).filter((f) => f.endsWith('.json')) : []
  const exportedOk = exported.length === 1 && JSON.parse(readFileSync(join(DOWNLOADS, exported[0]), 'utf8')).furniture.length === 2
  check('banner Export JSON downloads the unsaved design', exportedOk, exported.join(', '))

  await b.evaluate('(IDBObjectStore.prototype.put = window.__realPut), true')
  await click('Try again')
  await b.waitFor(`!document.querySelector('[role=alert]') && $A().toast?.message === 'Saved'`, 4000)
  check('Try again saves and clears the banner', !(await text()).includes('· not saved'))
  const jsonA2 = await b.evaluate('$json()')
  await b.reload()
  await page()
  await b.waitFor(`$S().design.id === ${JSON.stringify(idA)}`)
  check('the retried save persisted', (await b.evaluate('$json()')) === jsonA2 && (await b.evaluate('$S().design.furniture.length')) === 2)

  // 7. Card menu: rename, duplicate, import, delete (with confirm + Export first)
  await click('My mansions')
  await b.waitFor(`document.querySelectorAll('.design-card').length === 2`)
  await click('More actions for Untitled mansion 2')
  await b.waitFor(`!!document.querySelector('[role=menu]')`)
  check('menu focuses its first item', await b.evaluate(`document.activeElement?.textContent === 'Open'`))
  await shot('5-card-menu')
  await click('Rename')
  await b.waitFor(`document.activeElement?.classList.contains('design-card__rename')`)
  await b.send('Input.insertText', { text: 'The Moat House' })
  await b.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
  await b.waitFor(`$text().includes('The Moat House')`)
  check('rename', true)

  await click('More actions for The Moat House')
  await click('Duplicate')
  await b.waitFor(`$text().includes('The Moat House copy')`)
  check('duplicate', (await b.evaluate(`document.querySelectorAll('.design-card').length`)) === 3)

  const { root } = await b.send('DOM.getDocument')
  const { nodeId } = await b.send('DOM.querySelector', { nodeId: root.nodeId, selector: 'input[type=file]' })
  await b.send('DOM.setFileInputFiles', { nodeId, files: [join(DOWNLOADS, exported[0])] })
  await b.waitFor(`document.querySelectorAll('.design-card').length === 4`)
  check('import JSON adds a fourth mansion', (await text()).includes('Imported Untitled mansion'))

  await click('More actions for The Moat House copy')
  await click('Delete mansion…')
  await b.waitFor(`!!document.querySelector('dialog[open]')`)
  const dialog = await b.evaluate(`document.querySelector('dialog[open]').innerText`)
  check('delete asks first and offers Export first', dialog.includes('Delete The Moat House copy?') && dialog.includes('Export first') && dialog.includes('Cancel'))
  check('Cancel is focused by default', await b.evaluate(`document.activeElement?.textContent === 'Cancel'`))
  await shot('6-delete-confirm')
  await click('Export first')
  await sleep(800)
  check('Export first downloads and keeps the dialog open', readdirSync(DOWNLOADS).some((f) => f.startsWith('the-moat-house-copy')) && (await b.evaluate(`!!document.querySelector('dialog[open]')`)))
  await click('Delete mansion')
  await b.waitFor(`document.querySelectorAll('.design-card').length === 3`)
  check('delete removes the mansion', !(await b.evaluate(`[...document.querySelectorAll('.design-card__name')].some((n) => n.textContent === 'The Moat House copy')`)))
  await shot('7-after-delete')

  const unexpected = b.consoleErrors.filter((e) => !e.startsWith('Save failed'))
  check('no unexpected console errors', unexpected.length === 0, unexpected.join(' | ').slice(0, 300))
} catch (error) {
  console.log('ERROR', error.message)
  console.log('PAGE TEXT:', await b.evaluate('document.body.innerText').catch((e) => e.message))
  console.log('CONSOLE:', b.consoleErrors)
  await shot('error').catch(() => {})
  results.push({ ok: false })
} finally {
  b.close()
  server.stop()
}
const failed = results.filter((r) => !r.ok).length
console.log(`\n${results.length - failed}/${results.length} passed · screenshots in ${OUT}`)
process.exit(failed ? 1 : 0)
