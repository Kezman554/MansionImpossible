// Browser test for vertical connectors: on three floors with a big room each, place every
// connector type (straight and spiral stairs, elevator, spiral and straight slides, fireman's
// pole) with the connector tool, set each to run from the ground to the second floor, and check
// their fitted heights and the holes they cut in floors and ceilings. Then click-select, move,
// turn, re-floor, delete and undo them, and change a floor's height.
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { launch, sleep } from './cdp.mjs'
import { config } from './config.mjs'
import { ensureDevServer } from './devServer.mjs'

const OUT = join(config.outDir, 'connectors')
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
  window.$holes = async () => { const { floorHoles } = await import('/src/editor/connectors/connectors.ts'); const d = $S().design;
    return Object.fromEntries(d.floors.map((f) => [f.index, floorHoles(d, f.index, 'slab').length + '/' + floorHoles(d, f.index, 'ceiling').length])) };
  window.$conn = () => $S().design.pieces.map((p) => ({ id: p.id, type: p.type, floor: p.floor, to: p.toFloor, h: p.size[1], x: p.position[0], z: p.position[2], turn: +p.rotation[1].toFixed(4) }));
  window.$scene = () => { const out = { connectors: [], ghosts: 0, slabHoles: [] }; $three().scene.traverse((o) => {
    if (o.name === 'connector') out.connectors.push(o.userData.type);
    if (o.name === 'connector-ghost') out.ghosts++;
    if (o.isMesh && o.name === 'slab') out.slabHoles.push(o.userData.holes) }); return out };
  window.$setSelect = (label, value) => { const s = document.querySelector('select[aria-label="' + label + '"]'); const o = [...s.options].find((o) => o.textContent === value);
    s.value = o.value; s.dispatchEvent(new Event('change', { bubbles: true })); return true };
  true`
const conn = () => b.evaluate('$conn()')
const holes = () => b.evaluate('$holes()')
const scene = () => b.evaluate('$scene()')
const setField = async (label, value) => {
  await b.evaluate(`(() => { const l = [...document.querySelectorAll('.inspector label.field')].find((f) => f.querySelector('.field__label')?.textContent === ${JSON.stringify(label)}); const i = l.querySelector('input'); i.focus(); i.select(); return true })()`)
  await b.send('Input.insertText', { text: value })
  await key('Enter')
}
const view = (tx, ty, tz, px, py, pz) => b.evaluate(`(() => { const t = $three(); t.controls.target.set(${tx}, ${ty}, ${tz}); t.camera.position.set(${px}, ${py}, ${pz}); t.controls.update(); return true })()`)

const TYPES = [
  ['stairs', 'Straight stairs', -10],
  ['spiral-stairs', 'Spiral stairs', -6],
  ['elevator', 'Elevator', -2],
  ['spiral-slide', 'Spiral slide', 2],
  ['slide', 'Straight slide', 6],
  ['fireman-pole', "Fireman's pole", 10],
]

try {
  await b.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
  await b.goto(server.origin)
  await page()
  await b.evaluate(H2)
  await b.waitFor(`!!$btn('+ New mansion')`)
  await clickButton('+ New mansion')
  await b.waitFor(`!!$three()?.controls && !!document.querySelector('.gauge')`)
  await view(0, 0, 0, 0, 34, 30)
  await sleep(500)

  // 1. Three floors, each with one big room
  await drawRoom(-12.5, -7, 12.5, 7)
  await clickButton('+ Floor above')
  await drawRoom(-12.5, -7, 12.5, 7)
  await clickButton('+ Floor above')
  await drawRoom(-12.5, -7, 12.5, 7)
  await gaugeRow('Ground floor')
  check('three floors with a room each', (await b.evaluate('$S().design.rooms.map((r) => r.floor).join()')) === '0,1,2')

  // 2. Place each connector type on the ground floor, then run it up to the Second floor
  await key('c')
  check('C picks the connector tool and its tray', (await b.evaluate('$E().tool')) === 'connector' && !!(await b.evaluate(`!!document.querySelector('[aria-label="Connectors"]')`)))
  for (const [type, label, x] of TYPES) {
    await clickButton(label)
    await clickAt(await screen(x, 0, 0))
    const placed = (await conn()).at(-1)
    check(`${label}: placed from the ground floor to the First floor`, placed?.type === type && placed.floor === 0 && placed.to === 1 && placed.x === x, JSON.stringify(placed))
    await b.evaluate(`$setSelect('To floor', 'Second floor')`)
    await sleep(150)
  }
  let c = await conn()
  check('every connector now runs ground → Second floor', c.length === 6 && c.every((p) => p.floor === 0 && p.to === 2), JSON.stringify(c.map((p) => `${p.type}:${p.floor}-${p.to}`)))
  check('each is sized to fit: 6 m (the elevator shaft 9 m, to the top of the Second floor)', c.every((p) => p.h === (p.type === 'elevator' ? 9 : 6)), JSON.stringify(c.map((p) => `${p.type}:${p.h}`)))
  check('the inspector names the span', (await b.evaluate(`document.querySelector('.inspector')?.innerText ?? ''`)).includes('Ground floor → Second floor'))
  let h = await holes()
  check('holes: ground ceilings, First floor and ceiling, Second floor', JSON.stringify(h) === JSON.stringify({ 0: '0/6', 1: '6/6', 2: '6/0' }), JSON.stringify(h))
  await key('v')
  let s = await scene()
  check('on the ground floor all six are drawn; its slab is whole', s.connectors.length === 6 && s.slabHoles.join() === '0', JSON.stringify(s))
  await view(0, 1.5, 0, 0, 14, 20)
  await sleep(300)
  await shot('1-ground')

  await gaugeRow('First floor')
  s = await scene()
  check('on the First floor they pass through: six holes in its slab', s.connectors.length === 6 && s.slabHoles.join() === '6', JSON.stringify(s))
  await view(0, 3, 0, 4, 22, 18)
  await sleep(300)
  await shot('2-first-floor-holes')
  await gaugeRow('Second floor')
  s = await scene()
  check('on the Second floor they arrive through six more holes', s.connectors.length === 6 && s.slabHoles.join() === '6', JSON.stringify(s))
  await view(0, 6, 0, -4, 26, 18)
  await sleep(300)
  await shot('3-second-floor')

  // 3. Select by clicking, like any piece; move and turn in the inspector
  await gaugeRow('Ground floor')
  await view(0, 0, 0, 0, 34, 30)
  await sleep(300)
  await clickAt(await screen(-2, 1.2, 0.95)) // the elevator car's front
  const elevatorId = c.find((p) => p.type === 'elevator').id
  check('clicking the elevator car selects the elevator', (await b.evaluate('$S().selection.join()')) === elevatorId, await b.evaluate('$S().selection.join()'))
  const stairsId = c.find((p) => p.type === 'stairs').id
  await b.evaluate(`(() => { $S().select(${JSON.stringify(stairsId)}); return true })()`)
  const outline = () => b.evaluate(`import('/src/editor/connectors/connectors.ts').then(({ connectorOutline }) => { const p = $S().design.pieces.find((p) => p.id === ${JSON.stringify(stairsId)}); const o = connectorOutline(p, $S().design.floors); const xs = o.map((q) => q[0]), zs = o.map((q) => q[1]); return [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)].map((v) => +v.toFixed(2)) })`)
  const before = await outline()
  await setField('X', '-9')
  let moved = (await conn()).find((p) => p.id === stairsId)
  let after = await outline()
  check('moving the stairs moves them and their holes', moved.x === -9 && Math.abs(after[0] - before[0] - 1) < 0.01, `${before} → ${after}`)
  await setField('Turn', '90')
  moved = (await conn()).find((p) => p.id === stairsId)
  after = await outline()
  check('turning them 90° turns the holes: the run now lies along x', Math.abs(moved.turn - Math.PI / 2) < 1e-3 && Math.abs(after[1] - after[0] - 8.96) < 0.05, `${moved.turn} ${after}`)
  // Turned and slid over the spiral stairs, their holes overlap: cut as one
  await setField('X', '-8')
  await setField('Z', '-1')
  await gaugeRow('First floor')
  s = await scene()
  check('turned stairs over the spiral stairs: their holes merge into one, slab still cuts cleanly', s.slabHoles.join() === '5', JSON.stringify(s.slabHoles))
  await key('z', 2)
  await key('z', 2)
  await key('z', 2)
  await key('z', 2)
  moved = (await conn()).find((p) => p.id === stairsId)
  check('undo puts them back, one step per edit', moved.x === -10 && moved.z === 0 && moved.turn === 0, JSON.stringify(moved))

  // 4. Re-floor: a spiral slide from the First floor only
  const slideId = c.find((p) => p.type === 'spiral-slide').id
  await b.evaluate(`(() => { $S().select(${JSON.stringify(slideId)}); return true })()`)
  await b.evaluate(`$setSelect('From floor', 'First floor')`)
  await sleep(150)
  const slide = (await conn()).find((p) => p.id === slideId)
  h = await holes()
  check('a slide set to start on the First floor is 3 m and stops cutting the ground ceiling', slide.floor === 1 && slide.to === 2 && slide.h === 3 && h[0] === '0/5' && h[1] === '5/6', `${JSON.stringify(slide)} ${JSON.stringify(h)}`)
  s = await scene()
  check('it shows on the First floor', s.connectors.includes('spiral-slide'))
  await gaugeRow('Ground floor')
  check('and not on the ground floor below it', !(await scene()).connectors.includes('spiral-slide'))
  await key('z', 2)

  // 5. Floors change: connectors refit
  await gaugeRow('First floor')
  await setGaugeField('.gauge__details input', '4')
  c = await conn()
  check('a 4 m First floor makes every connector taller (7 m; elevator 10 m)', c.every((p) => p.h === (p.type === 'elevator' ? 10 : 7)), JSON.stringify(c.map((p) => p.h)))
  await key('z', 2)

  // 6. Delete like any piece (no confirm, Undo toast)
  await key('v')
  await b.evaluate(`(() => { $S().select(${JSON.stringify(elevatorId)}); return true })()`)
  await key('Delete')
  h = await holes()
  check('Delete removes the elevator and its holes, without asking', (await conn()).length === 5 && h[1] === '5/5' && (await b.evaluate(`document.querySelector('.toast')?.innerText ?? ''`)).includes('Elevator deleted'), JSON.stringify(h))
  await key('z', 2)
  check('Undo brings it back', (await conn()).length === 6 && (await holes())[1] === '6/6')
  await b.evaluate(`(() => { $S().select(${JSON.stringify(elevatorId)}); return true })()`)
  await key('d', 2)
  c = await conn()
  check('Ctrl+D duplicates it with its floors', c.length === 7 && c.at(-1).type === 'elevator' && c.at(-1).floor === 0 && c.at(-1).to === 2)
  await key('z', 2)

  await sleep(1200)
  const saved = await b.evaluate('JSON.stringify($S().design.pieces)')
  await b.reload()
  await page()
  await b.waitFor(`$S().design.pieces.length === 6`)
  check('connectors reload intact', (await b.evaluate('JSON.stringify($S().design.pieces)')) === saved)

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
