// Browser test for the room tool: draw adjoining rooms with real mouse drags, check shared
// walls merge, select and resize one by a handle, undo it, move, rename, delete with Undo.
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { launch, sleep } from './cdp.mjs'
import { config } from './config.mjs'
import { ensureDevServer } from './devServer.mjs'

const OUT = join(config.outDir, 'rooms')
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
  window.$btn = (label) => [...document.querySelectorAll('button')].find((el) => el.textContent.trim() === label || el.getAttribute('aria-label') === label);
  window.$click = (label) => { const el = $btn(label); if (!el) throw new Error('No button: ' + label); el.click(); return true };
  window.$S = () => window.__mansion.useDesignStore.getState();
  window.$three = () => window.__mansion.three?.();
  window.$rooms = () => $S().design.rooms.map((r) => ({ id: r.id, name: r.name, type: r.type, x0: r.position[0] - r.size[0] / 2, x1: r.position[0] + r.size[0] / 2, z0: r.position[2] - r.size[2] / 2, z1: r.position[2] + r.size[2] / 2, h: r.size[1], t: r.wallThickness }));
  // World point → page pixel, through the live camera.
  window.$screen = (x, y, z) => { const t = $three(); const v = t.camera.position.clone().set(x, y, z).project(t.camera);
    const r = t.gl.domElement.getBoundingClientRect(); return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height } };
  true`
const page = async () => { await b.waitFor('!!window.__mansion'); await b.evaluate(H) }
const click = (label) => b.evaluate(`$click(${JSON.stringify(label)})`)
const rooms = () => b.evaluate('$rooms()')
const screen = (x, y, z) => b.evaluate(`$screen(${x}, ${y}, ${z})`)

const mouse = (type, p, extra = {}) => b.send('Input.dispatchMouseEvent', { type, x: p.x, y: p.y, ...extra })
async function drag(from, to, steps = 14) {
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
  await mouse('mousePressed', p, { button: 'left', buttons: 1, clickCount: 1 })
  await mouse('mouseReleased', p, { button: 'left', buttons: 0, clickCount: 1 })
  await sleep(250)
}
const key = async (k, mods = 0) => {
  const code = k.length === 1 ? `Key${k.toUpperCase()}` : k
  const vk = { Delete: 46, Escape: 27, Enter: 13 }[k] ?? k.toUpperCase().charCodeAt(0)
  await b.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: k, code, windowsVirtualKeyCode: vk, modifiers: mods })
  await b.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk, modifiers: mods })
  await sleep(200)
}
const CTRL = 2
/** Draw a room by dragging from world (x0, z0) to (x1, z1) on the ground, nudged off the grid to test snapping. */
const drawRoom = async (x0, z0, x1, z1) => drag(await screen(x0 + 0.13, 0, z0 - 0.17), await screen(x1 - 0.11, 0, z1 + 0.2))

try {
  await b.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
  await b.goto(server.origin)
  await page()
  await b.waitFor(`!!$btn('+ New mansion')`)
  await click('+ New mansion')
  await b.waitFor(`!!$three()?.controls`)
  // A closer, steadier view for drawing.
  await b.evaluate(`(() => { const t = $three(); t.controls.target.set(4, 0, 2); t.camera.position.set(4, 26, 20); t.controls.update(); return true })()`)
  await sleep(600)

  // 1. Draw several adjoining rooms with the room tool (R)
  check('placeholder boxes are gone: an empty design has no meshes but the ground', await b.evaluate(`(() => { let n = 0; $three().scene.traverse((o) => { if (o.isMesh && o.material.type !== 'ShadowMaterial') n++ }); return n === 0 })()`))
  await key('r')
  check('R switches to the room tool', await b.evaluate(`document.querySelector('.tool-rail__tool[aria-pressed=true]')?.textContent.trim() === 'Room'`))
  await drawRoom(-4, -3, 2, 2) // A
  await drawRoom(2, -3, 8, 2)  // B shares A's east wall
  await drawRoom(-4, 2, 4, 6)  // C under A and half of B
  await drawRoom(4, 2, 10, 6)  // D beside C, under B
  await shot('1-four-rooms')
  const drawn = await rooms()
  const rects = drawn.map((r) => [r.x0, r.z0, r.x1, r.z1].join(','))
  check('four rooms drawn, snapped to 0.5 m', drawn.length === 4 && rects.join(' | ') === '-4,-3,2,2 | 2,-3,8,2 | -4,2,4,6 | 4,2,10,6', rects.join(' | '))
  check('new rooms get names, a type label and default walls', drawn.map((r) => r.name).join() === 'Room 1,Room 2,Room 3,Room 4' && drawn.every((r) => r.type === 'Room' && r.h === 3 && r.t === 0.2))
  check('each room drawn is one undo step', (await b.evaluate('$S().past.length')) === 4)
  check('a too-small drag makes no room', await (async () => { await drag(await screen(12, 0, 0), await screen(12.4, 0, 3)); return (await rooms()).length === 4 })())

  const walls = await b.evaluate(`import('/src/scene/roomGeometry.ts').then(({ layoutWalls }) => {
    const ps = layoutWalls($S().design.rooms);
    const along = (axis, line) => ps.filter((p) => p.axis === axis && Math.abs(p.line - line) < 1e-6);
    return { total: ps.length, sharedAB: along('z', 2).filter((p) => p.from < 2 && p.to > -3).length, sharedRow: along('x', 2).length } })`)
  check('shared walls are merged, not doubled', walls.sharedAB === 1 && walls.sharedRow === 1, JSON.stringify(walls))
  const meshes = await b.evaluate(`(() => { const out = []; $three().scene.traverse((o) => { if (o.isMesh && o.material.type !== 'ShadowMaterial') out.push({ v: o.geometry.attributes.position.count, cast: o.castShadow, indexed: !!o.geometry.index, type: o.geometry.type }) }); return out })()`)
  const wallMesh = meshes.find((m) => m.type === 'BufferGeometry' && m.cast && m.v === walls.total * 24)
  check('walls render as one merged mesh (24 vertices per piece) casting shadows', !!wallMesh, JSON.stringify(meshes.map((m) => `${m.type}:${m.v}${m.cast ? ':cast' : ''}`)))

  // 2. Select a room, resize it with a handle, undo
  await key('v')
  await clickAt(await screen(5, 0, -0.5)) // inside B
  const selected = await b.evaluate('$S().selection')
  const b0 = (await rooms())[1]
  check('clicking a room selects it and the inspector shows it', selected.length === 1 && selected[0] === b0.id && (await b.evaluate(`document.querySelector('[aria-label=Inspector] input[aria-label="Room name"]')?.value`)) === 'Room 2')
  await shot('2-selected')

  const stepsBefore = await b.evaluate('$S().past.length')
  const handle = await screen(8, 3.01, -0.5) // east edge midpoint, on top of the wall
  await drag(handle, await screen(11.2, 3.01, -0.5))
  const b1 = (await rooms())[1]
  check('dragging the east handle resizes the room, snapped', b1.x1 === 11 && b1.x0 === 2 && b1.z0 === -3 && b1.z1 === 2, `x ${b1.x0}…${b1.x1}`)
  check('the resize is one undo step', (await b.evaluate('$S().past.length')) === stepsBefore + 1)
  await shot('3-resized')
  await key('z', CTRL)
  const b2 = (await rooms())[1]
  check('Ctrl+Z undoes the resize', b2.x1 === 8 && b2.x0 === 2, `x ${b2.x0}…${b2.x1}`)
  await key('y', CTRL)
  check('Ctrl+Y redoes it', (await rooms())[1].x1 === 11)
  await key('z', CTRL)

  const corner = await screen(-4, 3.01, -3) // A's north-west corner handle
  await clickAt(await screen(-1, 0, 0))
  await drag(corner, await screen(-6.2, 3.01, -4.8))
  const a1 = (await rooms())[0]
  check('a corner handle resizes both sides', a1.x0 === -6 && a1.z0 === -5 && a1.x1 === 2 && a1.z1 === 2, `${a1.x0},${a1.z0} → ${a1.x1},${a1.z1}`)
  await key('z', CTRL)

  // 3. Move a selected room by dragging it
  await clickAt(await screen(7, 0, 4)) // D
  await drag(await screen(7, 0, 4), await screen(9.1, 0, 5.4))
  const d1 = (await rooms())[3]
  check('dragging a selected room moves it by snapped steps', d1.x0 === 6 && d1.z0 === 3.5 && d1.x1 - d1.x0 === 6, `${d1.x0},${d1.z0}`)
  await key('z', CTRL)

  // 4. Name and type in the inspector, wall height and thickness
  await clickAt(await screen(0, 0, 4)) // C
  await b.evaluate(`(() => { const i = document.querySelector('input[aria-label="Room name"]'); i.focus(); i.select(); return true })()`)
  await b.send('Input.insertText', { text: 'Library' })
  await key('Enter')
  await b.evaluate(`(() => { const s = document.querySelector('[aria-label=Inspector] select'); const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(s, 'Library'); s.dispatchEvent(new Event('change', { bubbles: true })); return true })()`)
  const setField = async (label, value) => {
    await b.evaluate(`(() => { const i = [...document.querySelectorAll('.field')].find((f) => f.querySelector('.field__label')?.textContent === ${JSON.stringify(label)}).querySelector('input'); i.focus(); i.select(); return true })()`)
    await b.send('Input.insertText', { text: value })
    await key('Enter')
  }
  await setField('Wall height', '4.5')
  await setField('Wall thickness', '0.3')
  const c1 = (await rooms())[2]
  check('the inspector names the room and sets its type label', c1.name === 'Library' && c1.type === 'Library')
  check('wall height and thickness are editable', c1.h === 4.5 && c1.t === 0.3, `h ${c1.h}, t ${c1.t}`)
  check('the wall shared with a taller room takes the taller height', await b.evaluate(`import('/src/scene/roomGeometry.ts').then(({ layoutWalls }) => layoutWalls($S().design.rooms).filter((p) => p.axis === 'x' && p.line === 2 && p.from < 0 && p.to > -2).every((p) => p.height === 4.5))`))
  await shot('4-inspector')

  // 5. Delete never confirms; the toast offers Undo
  await key('Delete')
  const afterDelete = await rooms()
  const toast = await b.evaluate(`document.querySelector('.toast')?.innerText ?? ''`)
  check('Delete removes the room straight away, no dialog', afterDelete.length === 3 && !(await b.evaluate(`!!document.querySelector('dialog[open]')`)))
  check('a toast says what was deleted and offers Undo', toast.includes('Library deleted') && toast.includes('Undo'), toast.replace(/\n/g, ' '))
  await shot('5-deleted-toast')
  await sleep(1500) // autosave's Saved must not replace the Undo toast
  check('the Undo toast survives the autosave', (await b.evaluate(`document.querySelector('.toast')?.innerText ?? ''`)).includes('Undo'))
  await b.evaluate(`document.querySelector('.toast .toast__action').click(), true`) // the toast's own button, not the top bar's
  await sleep(200)
  check("the toast's Undo brings the room back and closes the toast", (await rooms()).some((r) => r.name === 'Library') && !(await b.evaluate(`!!document.querySelector('.toast')`)))

  // 6. Grid fades with distance, Low quality
  await b.evaluate(`[...document.querySelectorAll('[aria-label="Quality"] button')].find((e) => e.textContent === 'Low').click(), true`)
  await b.waitFor(`!!$three()?.controls && document.querySelector('.viewport').dataset.quality === 'low'`)
  await page()
  await b.evaluate(`(() => { const t = $three(); t.controls.target.set(0, 0, 0); t.camera.position.set(45, 18, 45); t.controls.update(); return true })()`)
  await sleep(600)
  const fade = await b.evaluate(`(() => { const out = []; $three().scene.traverse((o) => { if (o.isLineSegments && o.material.uniforms?.fadeEnd) out.push([o.material.uniforms.fadeStart.value, o.material.uniforms.fadeEnd.value]) }); return out })()`)
  check('grid lines fade out with distance (minor sooner than major)', fade.length === 2 && fade.every(([s, e]) => e > s && e < 300) && fade[0][1] < fade[1][1], JSON.stringify(fade.map((f) => f.map(Math.round))))
  await shot('6-low-quality-grid-fade')

  // 7. Survives a reload
  await sleep(1200)
  await b.reload()
  await page()
  await b.waitFor(`$S().design.rooms.length === 4`)
  check('rooms reload intact', (await rooms()).map((r) => r.name).join() === 'Room 1,Room 2,Library,Room 4')

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
