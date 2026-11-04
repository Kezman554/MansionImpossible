// Browser test for the central fish tank: place it with the tank tool, build rooms against it on
// three floors (aquarium walls appear where they touch), check it spans every floor and resizes
// with them, drag it away (aquarium walls go) and onto another room (they follow), reshape it,
// undo, and render it on High quality (caustics).
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { launch, sleep } from './cdp.mjs'
import { config } from './config.mjs'
import { ensureDevServer } from './devServer.mjs'

const OUT = join(config.outDir, 'tank')
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


const H2 = `
  // Aquarium stretches per floor, from the same layout the scene draws.
  window.$aquarium = async () => { const { layoutFloorWalls } = await import('/src/scene/roomGeometry.ts'); const d = $S().design;
    return Object.fromEntries(d.floors.map((f) => [f.index, layoutFloorWalls(d.rooms.filter((r) => r.floor === f.index), d.tank).aquarium.map((a) => a.axis + '@' + a.line + ':' + a.from + '..' + a.to)])) };
  window.$scene = () => { const out = { aquarium: 0, ghostAquarium: 0, water: null }; $three().scene.traverse((o) => {
    if (o.isMesh && o.name === 'aquarium') { let g = false; for (let p = o.parent; p; p = p.parent) if (p.name === 'ghost-floor') g = true; g ? out.ghostAquarium++ : out.aquarium++ }
    if (o.isMesh && o.name === 'tank-water') { o.geometry.computeBoundingBox(); const bb = o.geometry.boundingBox; out.water = { h: +(bb.max.y - bb.min.y).toFixed(3), y: +o.position.y.toFixed(3), x: o.position.x, z: o.position.z, caustics: 'CAUSTICS' in o.material.defines } } });
    return out };
  true`
const tank = () => b.evaluate('$S().design.tank')
const aquarium = () => b.evaluate('$aquarium()')
const scene = () => b.evaluate('$scene()')
const count = (a) => Object.fromEntries(Object.entries(a).map(([k, v]) => [k, v.length]))
const setField = async (label, value) => {
  await b.evaluate(`(() => { const l = [...document.querySelectorAll('.inspector label.field')].find((f) => f.querySelector('.field__label')?.textContent === ${JSON.stringify(label)}); const i = l.querySelector('input'); i.focus(); i.select(); return true })()`)
  await b.send('Input.insertText', { text: value })
  await key('Enter')
}

try {
  await b.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
  await b.goto(server.origin)
  await page()
  await b.evaluate(H2)
  await b.waitFor(`!!$btn('+ New mansion')`)
  await clickButton('+ New mansion')
  await b.waitFor(`!!$three()?.controls && !!document.querySelector('.gauge')`)
  await b.evaluate(`(() => { const t = $three(); t.controls.target.set(0, 0, 0); t.camera.position.set(14, 26, 24); t.controls.update(); return true })()`)
  await sleep(500)

  // 1. Place the tank with the tool (K): one click, snapped, selected, back to the select tool
  await key('k')
  check('K picks the fish tank tool', (await b.evaluate('$E().tool')) === 'tank')
  await clickAt(await screen(0.2, 0, -0.1))
  let t = await tank()
  check('a click places a 4 × 4 m rectangular tank, snapped to the grid', t && t.shape === 'rectangular' && t.position.join() === '0,0' && t.size.join() === '4,4', JSON.stringify(t))
  check('the new tank is selected and the select tool is back', (await b.evaluate('$S().selection[0]')) === t.id && (await b.evaluate('$E().tool')) === 'select')
  check('the inspector shows the tank', (await b.evaluate(`document.querySelector('.inspector__title')?.textContent`)) === 'Fish tank')
  check('it starts one floor high', (await scene()).water?.h === 3, JSON.stringify(await scene()))

  // 2. Rooms against it on three floors
  await drawRoom(2, -3, 7, 3) // ground, east of the tank, its west wall on the tank's east face
  await drawRoom(-2, -7, 2, -2) // ground, north of the tank
  await clickButton('+ Floor above')
  await drawRoom(-4, 2, 4, 6) // first floor, south, wider than the tank
  await clickButton('+ Basement')
  await drawRoom(-8, -2, -2, 2) // basement, west
  await key('v')
  let a = await aquarium()
  check('each room touching the tank gets an aquarium wall on its own floor', JSON.stringify(count(a)) === JSON.stringify({ '-1': 1, 0: 2, 1: 1 }), JSON.stringify(a))
  // Where a wall meets another at the tank's corner, the corner square stays solid (it belongs to one wall).
  check('glass covers exactly the stretch along the tank', a[0].includes('z@2:-2..2') && a[0].includes('x@-2:-2..1.9') && a[1].includes('x@2:-2..2') && a[-1].includes('z@-2:-1.9..1.9'), JSON.stringify(a))
  let s = await scene()
  check('the tank spans the basement to the active floor (floors above hidden)', s.water.h === 3 && s.water.y === -1.5, JSON.stringify(s.water))
  check('the basement shows its aquarium wall', s.aquarium === 1)
  await shot('1-basement')
  await gaugeRow('First floor')
  s = await scene()
  check('on the First floor the tank runs from the basement to its top (9 m)', s.water.h === 9 && s.water.y === 1.5, JSON.stringify(s.water))
  check('the First floor shows its aquarium wall, the floors below show theirs ghosted', s.aquarium === 1 && s.ghostAquarium === 2, JSON.stringify(s))
  await b.evaluate(`(() => { const t = $three(); t.controls.target.set(0, 3, 3); t.camera.position.set(-6, 9, 16); t.controls.update(); return true })()`)
  await sleep(300)
  await shot('2-first-floor')

  // 3. It resizes as floors change: a taller first floor, a floor on top
  await setGaugeField('.gauge__details input', '5')
  await clickButton('+ Floor above')
  s = await scene()
  t = await tank()
  check('a taller floor and a new floor on top grow the tank (basement → second floor = 14 m)', s.water.h === 14, JSON.stringify(s.water))
  await gaugeRow('Ground floor')
  await b.evaluate(`(() => { const t = $three(); t.controls.target.set(0, 0, 0); t.camera.position.set(14, 26, 24); t.controls.update(); return true })()`)
  await sleep(300)
  check('the selection inspector says it spans every floor', (await b.evaluate(`(() => { $S().select($S().design.tank.id); return true })()`)) && (await b.evaluate(`document.querySelector('.inspector')?.innerText ?? ''`)).includes('Basement → Second floor'))
  await shot('3-ground-selected')

  // 4. Drag the tank away: the aquarium walls go back to plain walls everywhere
  const steps = await b.evaluate('$S().past.length')
  await drag(await screen(0, 0, 0), await screen(-12, 0, 0), 16)
  t = await tank()
  check('dragging the selected tank moves it, snapped', t.position.join() === '-12,0', JSON.stringify(t.position))
  check('the drag is one undo step', (await b.evaluate('$S().past.length')) === steps + 1)
  a = await aquarium()
  check('no room touches it now: no aquarium walls on any floor', Object.values(a).every((v) => v.length === 0), JSON.stringify(a))
  check('the scene drops the ground floor glass', (await scene()).aquarium === 0)
  await shot('4-moved-away')

  // 5. Move it (inspector) against the basement room's west wall: glass follows
  await setField('X', '-10')
  a = await aquarium()
  check('moved against the basement room, that wall turns to glass', JSON.stringify(count(a)) === JSON.stringify({ '-1': 1, 0: 0, 1: 0, 2: 0 }) && a[-1][0] === 'z@-8:-1.9..1.9', JSON.stringify(a))

  // 6. Moving a room against it works too
  const roomId = await b.evaluate(`$S().design.rooms.find((r) => r.floor === 0 && r.position[0] > 3).id`)
  await b.evaluate(`(() => { $S().updateObject(${JSON.stringify(roomId)}, { position: [-5.5, 0, 0] }); return true })()`) // east room moved so its west wall sits at x = -8
  a = await aquarium()
  check('a room moved against the tank gets its aquarium wall', a[0].length === 1 && a[0][0] === 'z@-8:-2..2', JSON.stringify(a))
  await key('z', 2)
  await key('z', 2)
  await key('z', 2)
  t = await tank()
  a = await aquarium()
  check('undo puts the room and the tank back, and the glass with them', t.position.join() === '0,0' && JSON.stringify(count(a)) === JSON.stringify({ '-1': 1, 0: 2, 1: 1, 2: 0 }), `${t.position} ${JSON.stringify(count(a))}`)

  // 7. Shape and size: cylindrical, diameter in metres; tangent walls keep a window onto the curve
  await b.evaluate(`(() => { $S().select($S().design.tank.id); return true })()`)
  await clickButton('Cylindrical')
  t = await tank()
  check('the tank becomes a cylinder', t.shape === 'cylindrical' && t.size.join() === '4,4')
  a = await aquarium()
  check('walls tangent to the cylinder still get glass', JSON.stringify(count(a)) === JSON.stringify({ '-1': 1, 0: 2, 1: 1, 2: 0 }), JSON.stringify(a))
  await setField('Diameter', '6')
  a = await aquarium()
  check('a 6 m cylinder pushes past the rooms; walls no longer just touching lose their glass', (await tank()).size.join() === '6,6' && Object.values(a).every((v) => v.length === 0), JSON.stringify(a))
  await key('z', 2)
  await shot('5-cylinder')

  // 8. High quality: the water shader compiles with caustics
  await b.evaluate(`window.__mansion.useSettingsStore.getState().update({ quality: 'high' }), true`)
  await b.waitFor(`!!$three()?.controls`)
  await sleep(800)
  await b.evaluate(H2)
  s = await scene()
  check('High quality turns caustics on', s.water?.caustics === true, JSON.stringify(s.water))
  await b.evaluate(`(() => { const t = $three(); t.controls.target.set(0, 1.5, 0); t.camera.position.set(6, 2.5, 9); t.controls.update(); return true })()`)
  await sleep(500)
  await shot('6-high-caustics')
  await b.evaluate(`window.__mansion.useSettingsStore.getState().update({ quality: 'medium' }), true`)
  await sleep(500)

  // 9. Delete without asking; Undo brings it back; it all reloads
  await b.evaluate(`(() => { $S().select($S().design.tank.id); return true })()`)
  await key('Delete')
  check('Delete removes the tank without asking, with an Undo toast', (await tank()) === null && (await b.evaluate(`document.querySelector('.toast')?.innerText ?? ''`)).includes('Fish tank deleted'))
  await key('z', 2)
  const saved = await b.evaluate('JSON.stringify($S().design.tank)')
  check('Undo brings it back', saved !== 'null')
  await sleep(1200)
  await b.reload()
  await page()
  await b.waitFor(`!!$S().design.tank`)
  check('the tank reloads intact', (await b.evaluate('JSON.stringify($S().design.tank)')) === saved)

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
