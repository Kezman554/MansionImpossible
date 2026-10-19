// Browser test for floors: build rooms on three floors and a basement through the gauge, switch
// between them (above hides, below ghosts or hides), rename and resize a floor, place a door
// upstairs, then remove a floor with rooms on it and undo.
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { launch, sleep } from './cdp.mjs'
import { config } from './config.mjs'
import { ensureDevServer } from './devServer.mjs'

const OUT = join(config.outDir, 'floors')
rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })

const server = await ensureDevServer(config.port)
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

const H = `
  window.$S = () => window.__mansion.useDesignStore.getState();
  window.$E = () => window.__mansion.useEditorStore.getState();
  window.$three = () => window.__mansion.three?.();
  window.$screen = (x, y, z) => { const t = $three(); const v = t.camera.position.clone().set(x, y, z).project(t.camera);
    const r = t.gl.domElement.getBoundingClientRect(); return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height } };
  window.$btn = (label) => [...document.querySelectorAll('button')].find((el) => el.textContent.trim() === label || el.getAttribute('aria-label') === label);
  window.$floors = () => $S().design.floors.map((f) => ({ index: f.index, name: f.name, elevation: f.elevation, height: f.height }));
  window.$rooms = () => $S().design.rooms.map((r) => ({ name: r.name, floor: r.floor, h: r.size[1], doors: r.openings.length }));
  // What the scene shows: the y of the editable floor's walls, and of each ghosted floor.
  window.$shown = () => { const out = { active: [], ghosts: [] }; $three().scene.traverse((o) => {
    if (o.isMesh && o.name === 'walls') out.active.push(o.parent.position.y);
    if (o.name === 'ghost-floor') out.ghosts.push(o.position.y) }); out.ghosts.sort((a, b) => a - b); return out };
  window.$gauge = () => [...document.querySelectorAll('.gauge__list > li')].map((li) => li.querySelector('input')?.value ?? li.querySelector('.gauge__name')?.textContent);
  true`
const page = async () => { await b.waitFor('!!window.__mansion'); await b.evaluate(H) }
const screen = (x, y, z) => b.evaluate(`$screen(${x}, ${y}, ${z})`)
const clickButton = (label) => b.evaluate(`(() => { const e = $btn(${JSON.stringify(label)}); if (!e) throw new Error('No button ' + ${JSON.stringify(label)}); e.click(); return true })()`)
const gaugeRow = (name) => b.evaluate(`[...document.querySelectorAll('.gauge__row')].find((r) => r.querySelector('.gauge__name')?.textContent === ${JSON.stringify(name)}).click(), true`)
const floors = () => b.evaluate('$floors()')
const rooms = () => b.evaluate('$rooms()')
const shown = () => b.evaluate('$shown()')
const active = () => b.evaluate('$E().activeFloor')

const mouse = (type, p, extra = {}) => b.send('Input.dispatchMouseEvent', { type, x: p.x, y: p.y, ...extra })
async function drag(from, to, steps = 12) {
  await mouse('mouseMoved', from)
  await mouse('mousePressed', from, { button: 'left', buttons: 1, clickCount: 1 })
  for (let i = 1; i <= steps; i++) {
    await mouse('mouseMoved', { x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps }, { button: 'left', buttons: 1 })
    await sleep(16)
  }
  await mouse('mouseReleased', to, { button: 'left', buttons: 0, clickCount: 1 })
  await sleep(250)
}
async function clickAt(p) {
  await mouse('mouseMoved', p)
  await sleep(60)
  await mouse('mousePressed', p, { button: 'left', buttons: 1, clickCount: 1 })
  await mouse('mouseReleased', p, { button: 'left', buttons: 0, clickCount: 1 })
  await sleep(250)
}
const key = async (k, mods = 0) => {
  const code = k.length === 1 ? `Key${k.toUpperCase()}` : k
  const vk = { Delete: 46, Escape: 27, Enter: 13, PageUp: 33, PageDown: 34 }[k] ?? k.toUpperCase().charCodeAt(0)
  await b.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: k, code, windowsVirtualKeyCode: vk, modifiers: mods })
  await b.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk, modifiers: mods })
  await sleep(250)
}
/** Draw a room on the active floor: drag from (x0, z0) to (x1, z1) at that floor's height. */
async function drawRoom(x0, z0, x1, z1) {
  const y = await b.evaluate(`$floors().find((f) => f.index === $E().activeFloor).elevation`)
  await key('r')
  await drag(await screen(x0 + 0.1, y, z0 + 0.1), await screen(x1 - 0.1, y, z1 - 0.1))
}
const setGaugeField = async (selector, value) => {
  await b.evaluate(`(() => { const i = document.querySelector(${JSON.stringify(selector)}); i.focus(); i.select(); return true })()`)
  await b.send('Input.insertText', { text: value })
  await key('Enter')
}

try {
  await b.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
  await b.goto(server.origin)
  await page()
  await b.waitFor(`!!$btn('+ New mansion')`)
  await clickButton('+ New mansion')
  await b.waitFor(`!!$three()?.controls && !!document.querySelector('.gauge')`)
  await b.evaluate(`(() => { const t = $three(); t.controls.target.set(3, 0, 2); t.camera.position.set(3, 24, 22); t.controls.update(); return true })()`)
  await sleep(500)

  // 1. Build: two rooms on the ground floor, one each on the First and Second floors, one in a basement
  check('the gauge starts on the ground floor', (await active()) === 0 && (await b.evaluate('$gauge()')).join() === 'Ground floor')
  await drawRoom(-4, -2, 2, 3)
  await drawRoom(2, -2, 8, 3)
  await clickButton('+ Floor above')
  check('+ Floor above adds the First floor and switches to it', (await active()) === 1)
  await drawRoom(-4, -2, 4, 3)
  await clickButton('+ Floor above')
  await drawRoom(-2, -2, 3, 2)
  await clickButton('+ Basement')
  check('+ Basement adds a floor below ground and switches to it', (await active()) === -1)
  await drawRoom(-4, -2, 8, 3)
  await shot('1-basement')

  const fl = await floors()
  check('four floors, stacked by height', fl.map((f) => `${f.index}:${f.name}@${f.elevation}`).join(' ') === '-1:Basement@-3 0:Ground floor@0 1:First floor@3 2:Second floor@6', fl.map((f) => `${f.index}@${f.elevation}`).join(' '))
  const built = await rooms()
  check('each room was drawn on the active floor', built.map((r) => `${r.name}@${r.floor}`).join(' ') === 'Room 1@0 Room 2@0 Room 3@1 Room 4@2 Room 5@-1', built.map((r) => `${r.name}@${r.floor}`).join(' '))
  check('the gauge lists floors top to bottom', (await b.evaluate('$gauge()')).join(' | ') === 'Second floor | First floor | Ground floor | Basement')

  // 2. Switch floors: the active floor is solid, floors above hide, floors below ghost
  await gaugeRow('Second floor')
  let s = await shown()
  check('on the Second floor: it is drawn solid, the three below are ghosted', s.active.join() === '6' && s.ghosts.join() === '-3,0,3', JSON.stringify(s))
  await shot('2-second-floor')
  await gaugeRow('Ground floor')
  s = await shown()
  check('on the Ground floor: floors above are hidden, the basement is ghosted', s.active.join() === '0' && s.ghosts.join() === '-3', JSON.stringify(s))
  await b.evaluate(`[...document.querySelectorAll('[aria-label="Floors below"] button')].find((e) => e.textContent === 'Hide').click(), true`)
  s = await shown()
  check('the toggle hides floors below instead of ghosting them', s.active.join() === '0' && s.ghosts.length === 0)
  await b.evaluate(`[...document.querySelectorAll('[aria-label="Floors below"] button')].find((e) => e.textContent === 'Ghost').click(), true`)
  await key('PageUp')
  check('Page Up goes up a floor', (await active()) === 1)
  await key('PageDown')
  await key('PageDown')
  check('Page Down goes down', (await active()) === -1)
  check('the camera follows the floor', Math.abs((await b.evaluate('$three().controls.target.y')) - -3) < 0.01)

  // 3. Building tools only affect the active floor: a door upstairs goes on the upstairs room
  await gaugeRow('First floor')
  await key('d')
  await clickAt(await screen(0, 3 + 1.2, -2 + 0.1)) // north wall of Room 3, inner face, at First floor height
  const afterDoor = await rooms()
  check('the door tool places on the active floor only', afterDoor.find((r) => r.name === 'Room 3').doors === 1 && afterDoor.filter((r) => r.name !== 'Room 3').every((r) => r.doors === 0))
  await key('v')

  // 4. Rename and resize a floor; each is one undo step
  const steps = await b.evaluate('$S().past.length')
  await setGaugeField('.gauge__name-input', 'Bedrooms')
  await setGaugeField('.gauge__details input', '4')
  const resized = await floors()
  check('renaming a floor in the gauge', resized.find((f) => f.index === 1).name === 'Bedrooms')
  check('a taller floor lifts the floors above it', resized.find((f) => f.index === 1).height === 4 && resized.find((f) => f.index === 2).elevation === 7)
  check('rooms on it grow with it', (await rooms()).find((r) => r.name === 'Room 3').h === 4)
  check('rename and resize are one undo step each', (await b.evaluate('$S().past.length')) === steps + 2)
  await shot('3-renamed-resized')

  // 5. Remove a floor with a room on it, then undo
  const beforeRemove = await b.evaluate('JSON.stringify({ floors: $S().design.floors, rooms: $S().design.rooms })')
  const stepsBeforeRemove = await b.evaluate('$S().past.length')
  await b.evaluate(`document.querySelector('.gauge__remove').click(), true`)
  await sleep(200)
  const removed = await floors()
  check('Remove takes the floor away without asking', removed.length === 3 && !removed.some((f) => f.name === 'Bedrooms') && !(await b.evaluate(`!!document.querySelector('dialog[open]')`)))
  check('its room goes with it, in the same undo step', !(await rooms()).some((r) => r.name === 'Room 3') && (await b.evaluate('$S().past.length')) === stepsBeforeRemove + 1)
  check('the floor above moves down to close the gap', removed.map((f) => `${f.index}:${f.name}@${f.elevation}`).join(' ') === '-1:Basement@-3 0:Ground floor@0 1:Second floor@3')
  check('Room 4 is now on floor 1', (await rooms()).find((r) => r.name === 'Room 4').floor === 1)
  const toast = await b.evaluate(`document.querySelector('.toast')?.innerText ?? ''`)
  check('a toast says what went and offers Undo', toast.includes('Bedrooms and 1 thing on it removed') && toast.includes('Undo'), toast.replace(/\n/g, ' '))
  await shot('4-floor-removed')
  await key('z', 2)
  check('Ctrl+Z brings the floor and its room back exactly', (await b.evaluate('JSON.stringify({ floors: $S().design.floors, rooms: $S().design.rooms })')) === beforeRemove)
  check('the gauge shows all four floors again', (await b.evaluate('$gauge()')).join(' | ') === 'Second floor | Bedrooms | Ground floor | Basement')

  // 6. The last floor can't be removed; everything reloads
  const lonely = await b.evaluate(`import('/src/editor/floors.ts').then(({ removeFloor }) => { let d = $S().design; for (const i of [2, 1, -1]) d = removeFloor(d, i); return removeFloor(d, 0).floors.length })`)
  check('the last floor is never removed', lonely === 1)
  await sleep(1200)
  await b.reload()
  await page()
  await b.waitFor(`$S().design.floors.length === 4`)
  check('floors and rooms reload intact', (await b.evaluate('JSON.stringify({ floors: $S().design.floors, rooms: $S().design.rooms })')) === beforeRemove)

  const errors = b.consoleErrors
  check('no console errors', errors.length === 0, errors.join(' | ').slice(0, 300))
} catch (error) {
  console.log('ERROR', error.message)
  await shot('error').catch(() => {})
  results.push({ ok: false })
} finally {
  b.close()
  server.stop()
}
const failed = results.filter((r) => !r.ok).length
console.log(`\n${results.length - failed}/${results.length} passed · screenshots in ${OUT}`)
process.exit(failed ? 1 : 0)
