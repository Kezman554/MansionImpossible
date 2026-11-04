// Browser test for materials: paint wall faces (inside and outside, each side of a shared wall),
// floors, a ceiling, a freeform piece and a connector by clicking with the paint tool; mix a
// custom colour; count draw calls and material instances before and after; undo; reload; open a
// v4 design through Import JSON and check it upgrades. Then the click-through fix: the hidden
// part of a tall elevator above the floor being edited no longer catches clicks.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { launch, sleep } from './cdp.mjs'
import { config } from './config.mjs'
import { ensureDevServer } from './devServer.mjs'

const OUT = join(config.outDir, 'paint')
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
const H2 = `
  window.$room = (name) => $S().design.rooms.find((r) => r.name === name);
  window.$stats = () => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => {
    const t = $three(); const mats = new Set(); let meshes = 0;
    t.scene.traverse((o) => { if (o.isMesh && o.visible) { meshes++; (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => mats.add(m)) } });
    res({ calls: t.gl.info.render.calls, triangles: t.gl.info.render.triangles, programs: t.gl.info.programs.length, meshes, materials: mats.size, textures: t.gl.info.memory.textures }) })));
  window.$wallMaterials = () => { const out = []; $three().scene.traverse((o) => { if (o.isMesh && o.name === 'walls') out.push(o.userData.material) }); return out.sort() };
  true`
const stats = () => b.evaluate('$stats()')
const steps = () => b.evaluate('$S().past.length')
const view = (tx, ty, tz, px, py, pz) => b.evaluate(`(() => { const t = $three(); t.controls.target.set(${tx}, ${ty}, ${tz}); t.camera.position.set(${px}, ${py}, ${pz}); t.controls.update(); return true })()`)
const pick = async (tab, name) => { await clickButton(tab); await clickButton(name) }
/** Looks at (x, y, z) from (px, py, pz), roughly square-on to the surface, then paints there. */
async function aim(px, py, pz, x, y, z, mods = 0) {
  await view(x, y, z, px, py, pz)
  await sleep(250)
  await paint(x, y, z, mods)
}
async function paint(x, y, z, mods = 0) {
  const p = await screen(x, y, z)
  await mouse('mouseMoved', p)
  await sleep(60)
  await mouse('mousePressed', p, { button: 'left', buttons: 1, clickCount: 1, modifiers: mods })
  await mouse('mouseReleased', p, { button: 'left', buttons: 0, clickCount: 1, modifiers: mods })
  await sleep(250)
}

try {
  await b.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
  await b.goto(server.origin)
  await page()
  await b.evaluate(H2)
  await b.waitFor(`!!$btn('+ New mansion')`)
  await clickButton('+ New mansion')
  await b.waitFor(`!!$three()?.controls && !!document.querySelector('.gauge')`)

  // A test scene: rooms A and B sharing a wall, a pillar in A, an elevator in B up to the Second floor
  await clickButton('+ Floor above')
  await clickButton('+ Floor above')
  await gaugeRow('Ground floor')
  await b.evaluate(`(async () => {
    const { newRoom } = await import('/src/editor/roomTool.ts'); const { newConnector, setConnectorFloors } = await import('/src/editor/connectors/connectors.ts');
    const s = $S(); const d = () => $S().design;
    s.addObject({ ...newRoom({ x0: -4, z0: -3, x1: 2, z1: 3 }, 0, []), name: 'A' });
    s.addObject({ ...newRoom({ x0: 2, z0: -3, x1: 8, z1: 3 }, 0, []), name: 'B' });
    s.addObject({ ...newRoom({ x0: -4, z0: -3, x1: 8, z1: 3 }, 1, []), name: 'Upstairs' });
    s.addObject({ kind: 'piece', type: 'pillar', floor: 0, position: [-2, 0, 0], size: [0.6, 3, 0.6], material: 'marble' });
    const lift = newConnector('elevator', d().floors, 0, { x: 5, z: 0 }, 0.5);
    s.addObject({ ...lift, ...setConnectorFloors({ ...lift, id: 'x' }, 0, 2, d().floors) });
    $S().clearSelection(); return true })()`)
  await view(2, 1, 0, 2, 16, 16)
  await sleep(600)
  const before = await stats()
  check('test scene drawn', before.calls > 0, JSON.stringify(before))
  await shot('1-before')

  // 1. Paint with the tool (P): every click is one undo step
  await key('p')
  check('P picks the paint tool and its tray', (await b.evaluate('$E().tool')) === 'paint' && (await b.evaluate(`!!document.querySelector('[aria-label="Materials"].tray')`)))
  const start = await steps()
  await pick('Metal', 'Gold')
  await aim(-8, 10, 4, 1.9, 1.5, 0) // A's east wall, the side facing into A
  let A = await b.evaluate(`$room('A').materials`)
  let B = await b.evaluate(`$room('B').materials`)
  check('a shared wall: the side facing A paints A\'s east-in face only', A.faces['east-in'] === 'gold' && !B.faces['west-in'], JSON.stringify({ A: A.faces, B: B.faces }))
  await pick('Tile', 'Azure tiles')
  await aim(12, 10, 4, 2.1, 1.5, 0) // the same wall, from B's side
  B = await b.evaluate(`$room('B').materials`)
  check('the other side paints B\'s west-in face', B.faces['west-in'] === 'tile-azure' && (await b.evaluate(`$room('A').materials.faces['east-in']`)) === 'gold')
  await pick('Brick', 'Red brick')
  await aim(-1, 6, 14, -1, 1.5, 3.1) // A's south wall, outside
  await pick('Plain colours', 'Sage')
  await aim(-1, 12, 8, -1, 1.5, -2.9) // A's north wall, inside
  A = await b.evaluate(`$room('A').materials`)
  check('outside and inside faces of a wall are separate', A.faces['south-out'] === 'brick-red' && A.faces['north-in'] === 'sage' && !A.faces['south-in'] && !A.faces['north-out'], JSON.stringify(A.faces))
  await pick('Carpet', 'Red carpet')
  await aim(-1, 30, 4, -3, 0.02, 1.5) // A's floor
  await pick('Marble', 'Black marble')
  await aim(5, 30, 4, 3.5, 0.02, 2, 8) // Shift-click B's floor: its ceiling
  A = await b.evaluate(`$room('A').materials`)
  B = await b.evaluate(`$room('B').materials`)
  check('floor and (shift-click) ceiling', A.floor === 'carpet-red' && B.ceiling === 'marble-noir' && B.floor === null, JSON.stringify({ A, B }))
  await pick('Metal', 'Copper')
  await aim(-2, 12, 10, -2, 1.5, 0.3) // the pillar's south side
  check('a freeform piece', (await b.evaluate(`$S().design.pieces.find((p) => p.type === 'pillar').material`)) === 'copper')
  await pick('Wood', 'Walnut boards')
  await shot('1b-tray')
  await aim(5, 14, 12, 5, 1.5, 0.95) // the elevator's south glass / posts
  check('a connector', (await b.evaluate(`$S().design.pieces.find((p) => p.type === 'elevator').material`)) === 'walnut')
  // Custom colour: the picker's colour becomes a material saved with the design
  await clickButton('Custom')
  await b.evaluate(`(() => { const i = document.querySelector('input[aria-label="Custom colour"]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, '#3a7bd5'); i.dispatchEvent(new Event('input', { bubbles: true })); return true })()`)
  await sleep(150)
  check('the picker picks its colour to paint with', (await b.evaluate('$E().paintMaterial')) === 'custom-3a7bd5')
  await aim(-1, 30, 4, -2, 0.02, -2) // A's floor again, now the custom colour
  const custom = await b.evaluate('$S().design.customMaterials')
  check('a custom colour is saved with the design when first used', custom.length === 1 && custom[0].color === '#3a7bd5' && (await b.evaluate(`$room('A').materials.floor`)) === 'custom-3a7bd5', JSON.stringify(custom))
  await paint(-2, 0.02, -2) // again: no change, no undo step
  check('nine clicks that changed something, nine undo steps', (await steps()) === start + 9, `${(await steps()) - start}`)
  check('the scene shows the painted wall faces', JSON.stringify(await b.evaluate('$wallMaterials()')) === JSON.stringify(['brick-red', 'gold', 'sage', 'tile-azure', 'warm-white']), JSON.stringify(await b.evaluate('$wallMaterials()')))
  check('and the floor, ceiling, piece and connector', (await b.evaluate(`(() => { const out = new Set(); $three().scene.traverse((o) => { if (o.isMesh && o.material?.name) out.add(o.material.name) }); return ['custom-3a7bd5', 'marble-noir', 'copper', 'walnut'].every((m) => out.has(m)) })()`)))
  await key('v')
  await b.evaluate('$S().clearSelection(), true')
  await view(2, 1, 0, 2, 16, 16)
  await sleep(600)
  const after = await stats()
  check('draw calls and material instances counted before and after', after.calls > 0, `before ${JSON.stringify(before)} · after ${JSON.stringify(after)}`)
  console.log(`DRAWCALLS before=${before.calls} after=${after.calls} · materials ${before.materials}→${after.materials} · meshes ${before.meshes}→${after.meshes} · programs ${before.programs}→${after.programs} · textures ${before.textures}→${after.textures}`)
  const cache = await b.evaluate(`import('/src/scene/materialCache.ts').then((m) => m.materialCacheSize())`)
  check('materials are shared: no more instances than distinct materials in use', after.materials <= after.meshes && cache.materials < 40, JSON.stringify(cache))
  await shot('2-painted')
  await view(-1, 1.5, 0, -1, 2.6, 2.4) // inside A, looking north: carpet, sage wall, gold side
  await sleep(400)
  await shot('3-inside-A')

  // 2. Undo and redo
  const painted = await b.evaluate('JSON.stringify({ rooms: $S().design.rooms, pieces: $S().design.pieces, customMaterials: $S().design.customMaterials })')
  await key('z', 2)
  check('undo takes back the last click only (the custom floor)', (await b.evaluate(`$room('A').materials.floor`)) === 'carpet-red' && (await b.evaluate('$S().design.customMaterials.length')) === 0)
  for (let i = 0; i < 8; i++) await key('z', 2)
  A = await b.evaluate(`$room('A').materials`)
  check('undoing every step returns every surface to its default', A.floor === null && Object.keys(A.faces).length === 0 && (await b.evaluate(`$S().design.pieces.find((p) => p.type === 'pillar').material`)) === 'marble' && JSON.stringify(await b.evaluate('$wallMaterials()')) === '["warm-white"]')
  for (let i = 0; i < 9; i++) await key('y', 2)
  check('redo puts it all back', (await b.evaluate('JSON.stringify({ rooms: $S().design.rooms, pieces: $S().design.pieces, customMaterials: $S().design.customMaterials })')) === painted)

  // 3. Reload: materials are saved with the design
  await sleep(1500)
  await b.reload()
  await page()
  await b.evaluate(H2)
  await b.waitFor(`$S().design.rooms.length === 3 && !!$three()?.controls`)
  await sleep(500)
  check('reloaded intact: faces, floors, ceilings, pieces and custom colours', (await b.evaluate('JSON.stringify({ rooms: $S().design.rooms, pieces: $S().design.pieces, customMaterials: $S().design.customMaterials })')) === painted)
  check('and drawn painted', JSON.stringify(await b.evaluate('$wallMaterials()')) === JSON.stringify(['brick-red', 'gold', 'sage', 'tile-azure', 'warm-white']))
  check('saved as v5', (await b.evaluate('$S().design.version')) === 5)

  // 4. Click-through: the elevator runs to the Second floor; on the ground floor its upper part is hidden
  await key('v')
  // Seen almost level, a point a floor and a half up has only the hidden part of the shaft in
  // front of it, and nothing visible behind (from above, the ray would go on into the visible shaft).
  await view(5, 4.6, 0.95, 5, 5, 16)
  await sleep(400)
  const above = { x: 5, y: 4.6, z: 0.95 } // the shaft's south face, a floor and a half up: hidden
  const wouldHit = await b.evaluate(`(() => { const t = $three(); const ray = new t.raycaster.constructor(); const p = $screen(${above.x}, ${above.y}, ${above.z}); const r = t.gl.domElement.getBoundingClientRect();
    ray.setFromCamera({ x: (p.x - r.left) / r.width * 2 - 1, y: -((p.y - r.top) / r.height * 2 - 1) }, t.camera); let hits = 0;
    t.scene.traverse((o) => { if (o.isMesh && o.parent?.name === 'connector') { const out = []; Object.getPrototypeOf(o).raycast.call(o, ray, out); hits += out.length } }); return hits })()`)
  check('without the fix, a ray through the hidden part would hit the shaft', wouldHit > 0, `${wouldHit} hits`)
  await clickAt(await screen(above.x, above.y, above.z))
  check('clicking empty space above the shaft selects nothing', (await b.evaluate('$S().selection.length')) === 0, await b.evaluate(`$S().selection.map((id) => { const o = $S().design.rooms.find((r) => r.id === id) ?? $S().design.pieces.find((p) => p.id === id); return o?.name ?? o?.type }).join()`))
  await view(5, 1.5, 0, 5, 14, 12)
  await sleep(400)
  await clickAt(await screen(5, 1.5, 0.95))
  check('clicking the shaft below the cut still selects it', (await b.evaluate(`$S().selection[0] === $S().design.pieces.find((p) => p.type === 'elevator').id`)))
  await b.evaluate('$S().clearSelection(), true')
  // The tank, placed through all three floors: nothing above the ground floor's top catches clicks
  await b.evaluate(`(async () => { const { placeTank } = await import('/src/editor/tank.ts'); $S().applyDesign(placeTank($S().design, { x: -10, z: 0 })); $S().clearSelection(); return true })()`)
  await view(-10, 1.5, 0, -10, 9, 14)
  await sleep(400)
  await clickAt(await screen(-10, 5, 2))
  check("clicking above the tank's visible water selects nothing", (await b.evaluate('$S().selection.length')) === 0)
  await clickAt(await screen(-10, 1.5, 2))
  check('clicking the water selects the tank', (await b.evaluate('$S().selection[0] === $S().design.tank.id')))
  await shot('4-click-through')

  // 5. Open a v4 design (Import JSON): it upgrades
  const v4 = await b.evaluate(`(async () => {
    const { createDesign } = await import('/src/store/designStore.ts');
    const d = createDesign('Old v4 manor'); d.version = 4; delete d.customMaterials;
    d.rooms = [{ id: 'r1', kind: 'room', name: 'Hall', type: 'Room', floor: 0, position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], size: [6, 3, 5], wallThickness: 0.2, openings: [], materials: { floor: 'marble', walls: 'oak', ceiling: null } }];
    d.pieces = [
      { id: 'p1', kind: 'piece', type: 'fish-tank', floor: 0, position: [8, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], size: [3, 9, 3], material: null },
      { id: 'p2', kind: 'piece', type: 'stairs', floor: 0, position: [-6, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], size: [1.2, 3, 4.48], material: 'oak' } ];
    return JSON.stringify(d) })()`)
  const file = join(OUT, 'old-v4-manor.mansion.json')
  writeFileSync(file, v4)
  await clickButton('My mansions')
  await b.waitFor(`!!document.querySelector('input[type=file]')`)
  const { root } = await b.send('DOM.getDocument')
  const { nodeId } = await b.send('DOM.querySelector', { nodeId: root.nodeId, selector: 'input[type=file]' })
  await b.send('DOM.setFileInputFiles', { nodeId, files: [file] })
  await b.waitFor(`!!$btn('Open Old v4 manor')`)
  await clickButton('Open Old v4 manor')
  await b.waitFor(`$S().design.name === 'Old v4 manor' && !!$three()?.controls`)
  await b.evaluate(H2)
  const up = await b.evaluate('$S().design')
  check('a v4 design opens upgraded to v5', up.version === 5 && Array.isArray(up.customMaterials) && JSON.stringify(up.rooms[0].materials) === '{"floor":"marble","walls":"oak","ceiling":null,"faces":{}}', JSON.stringify({ v: up.version, m: up.rooms[0].materials }))
  check('its fish-tank piece is gone, its stairs gained toFloor', up.pieces.length === 1 && up.pieces[0].type === 'stairs' && up.pieces[0].toFloor === 0, JSON.stringify(up.pieces.map((p) => [p.type, p.toFloor])))
  await key('p')
  await pick('Wood', 'Pale ash')
  await view(0, 1, 0, 0, 14, 12)
  await sleep(400)
  await paint(-2.9, 1.5, 0) // the hall's west wall, inside
  check('and can be painted', (await b.evaluate(`$S().design.rooms[0].materials.faces['west-in']`)) === 'ash')

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
