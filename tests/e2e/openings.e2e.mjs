// Browser test for doors and windows: place each style on several walls by clicking, edit
// sizes in the inspector, slide one along its wall, then resize the room and check they stay attached.
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { launch, sleep } from './cdp.mjs'
import { config } from './config.mjs'
import { ensureDevServer } from './devServer.mjs'

const OUT = join(config.outDir, 'openings')
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
  window.$E = () => window.__mansion.useEditorStore?.getState();
  window.$three = () => window.__mansion.three?.();
  window.$screen = (x, y, z) => { const t = $three(); const v = t.camera.position.clone().set(x, y, z).project(t.camera);
    const r = t.gl.domElement.getBoundingClientRect(); return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height } };
  window.$room = (name) => $S().design.rooms.find((r) => r.name === name);
  true`
const page = async () => { await b.waitFor('!!window.__mansion'); await b.evaluate(H) }
const screen = (x, y, z) => b.evaluate(`$screen(${x}, ${y}, ${z})`)
const openings = (name) => b.evaluate(`$room(${JSON.stringify(name)}).openings.map((o) => ({ id: o.id, style: o.style, wall: o.wall, offset: o.offset, width: o.width, height: o.height, sill: o.sill }))`)
/** World centre of each opening of a room, via the app's own opening maths. */
const centres = (name) => b.evaluate(`import('/src/editor/openings.ts').then(({ openingSpan }) => { const r = $room(${JSON.stringify(name)});
  return r.openings.map((o) => { const s = openingSpan(r, o); const c = (s.from + s.to) / 2; return { style: o.style, wall: o.wall, x: s.axis === 'x' ? c : s.line, z: s.axis === 'x' ? s.line : c } }) })`)

const mouse = (type, p, extra = {}) => b.send('Input.dispatchMouseEvent', { type, x: p.x, y: p.y, ...extra })
async function clickAt(p) {
  await mouse('mouseMoved', p)
  await sleep(60)
  await mouse('mousePressed', p, { button: 'left', buttons: 1, clickCount: 1 })
  await mouse('mouseReleased', p, { button: 'left', buttons: 0, clickCount: 1 })
  await sleep(250)
}
async function drag(from, to, steps = 14) {
  await mouse('mouseMoved', from)
  await mouse('mousePressed', from, { button: 'left', buttons: 1, clickCount: 1 })
  for (let i = 1; i <= steps; i++) {
    await mouse('mouseMoved', { x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps }, { button: 'left', buttons: 1 })
    await sleep(16)
  }
  await mouse('mouseReleased', to, { button: 'left', buttons: 0, clickCount: 1 })
  await sleep(300)
}
const key = async (k, mods = 0) => {
  const code = k.length === 1 ? `Key${k.toUpperCase()}` : k
  const vk = { Delete: 46, Escape: 27, Enter: 13 }[k] ?? k.toUpperCase().charCodeAt(0)
  await b.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: k, code, windowsVirtualKeyCode: vk, modifiers: mods })
  await b.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk, modifiers: mods })
  await sleep(200)
}
const tile = (label) => b.evaluate(`[...document.querySelectorAll('.tray__tile')].find((t) => t.textContent.trim() === ${JSON.stringify(label)}).click(), true`)
const setField = async (label, value) => {
  await b.evaluate(`(() => { const i = [...document.querySelectorAll('.field')].find((f) => f.querySelector('.field__label')?.textContent === ${JSON.stringify(label)}).querySelector('input'); i.focus(); i.select(); return true })()`)
  await b.send('Input.insertText', { text: value })
  await key('Enter')
}
const T = 0.1 // half the wall thickness
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps

try {
  await b.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
  await b.goto(server.origin)
  await page()
  await b.waitFor(`[...document.querySelectorAll('button')].some((e) => e.textContent.trim() === '+ New mansion')`)
  await b.evaluate(`[...document.querySelectorAll('button')].find((e) => e.textContent.trim() === '+ New mansion').click(), true`)
  await b.waitFor(`!!$three()?.controls`)
  // Hall (0..8 × 0..6) and Study beside it to the east (8..12 × 0..6), sharing the wall at x = 8.
  await b.evaluate(`import('/src/editor/roomTool.ts').then(({ newRoom }) => { const s = $S();
    s.updateObject(s.addObject(newRoom({ x0: 0, z0: 0, x1: 8, z1: 6 }, 0, [])), { name: 'Hall' });
    s.updateObject(s.addObject(newRoom({ x0: 8, z0: 0, x1: 12, z1: 6 }, 0, $S().design.rooms)), { name: 'Study' });
    s.clearSelection(); return true })`)
  await b.evaluate(`(() => { const t = $three(); t.controls.target.set(5, 0, 3); t.camera.position.set(3, 17, 17); t.controls.update(); return true })()`)
  await sleep(600)

  // 1. Place each style on a different wall by clicking the wall
  const stepsBeforePlacing = await b.evaluate('$S().past.length')
  await key('d')
  check('D picks the door tool and shows the style tray', await b.evaluate(`!!document.querySelector('.tray') && document.querySelector('.tray__tile[aria-pressed=true]')?.textContent.trim() === 'Single door'`))
  await mouse('mouseMoved', await screen(2.33, 1.2, 0 + T)) // north wall, inner face
  await sleep(200)
  check('hovering a wall previews the opening', await b.evaluate(`$E().openingPreview?.opening.wall === 'north'`))
  await clickAt(await screen(2.33, 1.2, 0 + T))
  await tile('Double door')
  await clickAt(await screen(4.04, 1.2, 6 + T)) // south wall, outer face
  await key('w')
  check('W picks the window tool', await b.evaluate(`document.querySelector('.tray__tile[aria-pressed=true]')?.textContent.trim() === 'Window'`))
  await clickAt(await screen(0 + T, 1.6, 3.1)) // west wall, inner face
  await tile('Floor-to-ceiling glass')
  await clickAt(await screen(5.6, 1.2, 0 + T)) // north wall again, further along
  await key('d')
  await clickAt(await screen(8 - T, 1.2, 4)) // the shared wall, from the Hall side
  await shot('1-placed')

  const placed = await openings('Hall')
  const summary = placed.map((o) => `${o.style}@${o.wall}:${o.offset}`).join(' ')
  check('each click placed the chosen style on the clicked wall, snapped to 0.1 m',
    summary === 'single-door@north:2.3 double-door@south:4 window@west:3.1 glass-wall@north:5.6 single-door@east:4', summary)
  check('the Study has no openings of its own', (await openings('Study')).length === 0)
  check('each placement is one undo step', (await b.evaluate('$S().past.length')) === stepsBeforePlacing + 5)

  const geometry = await b.evaluate(`import('/src/scene/roomGeometry.ts').then(({ layoutWallBoxes }) => import('/src/editor/openings.ts').then(({ openingSpan }) => {
    const rooms = $S().design.rooms; const boxes = layoutWallBoxes(rooms); const hall = $room('Hall');
    const solid = (s, along, y) => boxes.some((b) => b.axis === s.axis && Math.abs(b.line - s.line) < 1e-6 && along > b.from && along < b.to && y > b.bottom && y < b.top);
    return hall.openings.map((o) => { const s = openingSpan(hall, o); const mid = (s.from + s.to) / 2;
      return { open: !solid(s, mid, (s.bottom + s.top) / 2), under: s.bottom === 0 || solid(s, mid, s.bottom / 2), over: s.top >= hall.size[1] - 1e-6 || solid(s, mid, (s.top + hall.size[1]) / 2) } }) }))`)
  check('every opening is cut through the wall, with wall left under sills and over heads', geometry.every((g) => g.open && g.under && g.over), JSON.stringify(geometry))
  const fills = await b.evaluate(`(() => { const names = new Set(); $three().scene.traverse((o) => { if (o.isMesh && o.name.startsWith('opening-')) names.add(o.name) }); return [...names].sort() })()`)
  check('doors get leaves, windows get frames and glass', fills.join() === 'opening-door,opening-frame,opening-glass', fills.join())

  // 2. Inspector: select the door, change its width; select the window, change sill and height
  await key('v')
  await clickAt(await screen(2.3, 1.0, 0 + T))
  check('clicking a door selects it in the inspector', (await b.evaluate(`document.querySelector('[aria-label=Inspector] .inspector__title')?.textContent`)) === 'Single door')
  check('a door has no editable sill', await b.evaluate(`[...document.querySelectorAll('.field')].find((f) => f.textContent.startsWith('Sill height')).querySelector('input').disabled`))
  await setField('Width', '1.2')
  await clickAt(await screen(0 + T, 1.5, 3.1))
  await setField('Sill height', '1')
  await setField('Height', '1.4')
  const edited = await openings('Hall')
  check('width, height and sill height are adjustable', edited[0].width === 1.2 && edited[2].sill === 1 && edited[2].height === 1.4, `door ${edited[0].width} m; window sill ${edited[2].sill}, height ${edited[2].height}`)
  await shot('2-window-selected')

  // 3. Slide the selected window along its wall
  const before = (await openings('Hall'))[2].offset
  const steps = await b.evaluate('$S().past.length')
  await drag(await screen(0 + T, 1.7, 3.1), await screen(0 + T, 1.7, 4.6))
  const slid = (await openings('Hall'))[2]
  check('dragging a selected window slides it along its wall, snapped', slid.wall === 'west' && slid.offset > before + 1 && near(Math.round(slid.offset * 10) / 10, slid.offset), `${before} → ${slid.offset}`)
  check('the slide is one undo step', (await b.evaluate('$S().past.length')) === steps + 1)

  // 4. Resize the Hall: openings stay attached
  const attachedBefore = await centres('Hall')
  await clickAt(await screen(3, 0, 3)) // select the Hall by its floor
  check('clicking the floor selects the room', await b.evaluate(`$S().selection[0] === $room('Hall').id`))
  const eastHandle = await screen(8, 3.01, 3)
  await drag(eastHandle, await screen(10, 3.01, 3))
  const afterEast = await centres('Hall')
  const pairs = afterEast.map((c, i) => [attachedBefore[i], c])
  check('resizing east: north, south and west openings keep their place',
    pairs.filter(([, c]) => c.wall !== 'east').every(([a, c]) => near(a.x, c.x, 1e-6) && near(a.z, c.z, 1e-6)))
  check('resizing east: the east door moves with its wall', near(afterEast[4].x, 10) && near(afterEast[4].z, attachedBefore[4].z), `x ${attachedBefore[4].x} → ${afterEast[4].x}`)
  await shot('3-resized-east')
  await key('z', 2)
  check('Ctrl+Z puts the room and its openings back', JSON.stringify(await centres('Hall')) === JSON.stringify(attachedBefore))

  const westHandle = await screen(0, 3.01, 3)
  await drag(westHandle, await screen(-3, 3.01, 3))
  const afterWest = await centres('Hall')
  check('resizing west: openings on the north and south walls keep their place in the world',
    afterWest.filter((c) => c.wall === 'north' || c.wall === 'south').every((c) => attachedBefore.some((a) => a.style === c.style && a.wall === c.wall && near(a.x, c.x) && near(a.z, c.z))))
  check('resizing west: the west window moves out with its wall', near(afterWest[2].x, -3))

  const southHandle = await screen(-1.5, 3.01, 6)
  await drag(southHandle, await screen(-1.5, 3.01, 2.2))
  const squeezed = await b.evaluate(`import('/src/editor/openings.ts').then(({ openingSpan, wallOf }) => import('/src/editor/roomTool.ts').then(({ roomRect }) => {
    const r = $room('Hall'); const rect = roomRect(r);
    return r.openings.map((o) => { const w = wallOf(rect, o.wall); return { wall: o.wall, ok: o.offset - o.width / 2 >= 0.2 - 1e-9 && o.offset + o.width / 2 <= w.length - 0.2 + 1e-9 } }) }))`)
  check('shrinking a wall keeps its openings inside it', squeezed.every((s) => s.ok), JSON.stringify(squeezed))
  await shot('4-resized-west-and-shorter')
  await key('z', 2)
  await key('z', 2)
  check('undoing both resizes restores everything', JSON.stringify(await centres('Hall')) === JSON.stringify(attachedBefore))

  // 5. Delete an opening: no confirm, Undo toast
  await clickAt(await screen(5.6, 1.2, 0 + T))
  await key('Delete')
  const toast = await b.evaluate(`document.querySelector('.toast')?.innerText ?? ''`)
  check('Delete removes the selected glass straight away, with an Undo toast', (await openings('Hall')).length === 4 && toast.includes('Floor-to-ceiling glass deleted') && toast.includes('Undo'), toast.replace(/\n/g, ' '))
  await b.evaluate(`document.querySelector('.toast .toast__action').click(), true`)
  await sleep(200)
  check("the toast's Undo brings it back", (await openings('Hall')).length === 5)

  // 6. Reload
  await sleep(1200)
  await b.reload()
  await page()
  await b.waitFor(`$S().design.rooms.length === 2`)
  check('openings reload intact', JSON.stringify(await centres('Hall')) === JSON.stringify(attachedBefore))

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
