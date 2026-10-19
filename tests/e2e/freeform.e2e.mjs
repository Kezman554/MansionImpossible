// Browser test for freeform pieces: place pillars from the palette, check 200 of them draw as one
// instanced mesh and the frame rate holds while orbiting, then build a floating glass tube
// corridor using the inspector, duplicate and the transform gizmo; multi-select and delete.
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { launch, sleep } from './cdp.mjs'
import { config } from './config.mjs'
import { ensureDevServer } from './devServer.mjs'

const OUT = join(config.outDir, 'freeform')
rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })

const server = await ensureDevServer(config.port)
let b
try {
  b = await launch({ chrome: config.chrome, profile: join(OUT, 'profile'), port: config.cdpPort, gpu: true })
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
  window.$pieces = () => $S().design.pieces.map((p) => ({ id: p.id, type: p.type, material: p.material, position: p.position, rotation: p.rotation, size: p.size }));
  window.$instanced = () => { const out = []; $three().scene.traverse((o) => { if (o.isInstancedMesh && o.name === 'pieces') out.push({ type: o.userData.type, count: o.count }) }); return out };
  window.$fps = () => Number(document.querySelector('.viewport__fps-value')?.textContent);
  true`
const page = async () => { await b.waitFor('!!window.__mansion'); await b.evaluate(H) }
const screen = (x, y, z) => b.evaluate(`$screen(${x}, ${y}, ${z})`)
const pieces = () => b.evaluate('$pieces()')

const mouse = (type, p, extra = {}) => b.send('Input.dispatchMouseEvent', { type, x: p.x, y: p.y, ...extra })
async function drag(from, to, steps = 14, button = 'left') {
  const buttons = button === 'left' ? 1 : 2
  await mouse('mouseMoved', from)
  await sleep(80)
  await mouse('mousePressed', from, { button, buttons, clickCount: 1 })
  for (let i = 1; i <= steps; i++) {
    await mouse('mouseMoved', { x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps }, { button, buttons })
    await sleep(16)
  }
  await mouse('mouseReleased', to, { button, buttons: 0, clickCount: 1 })
  await sleep(300)
}
async function clickAt(p, modifiers = 0) {
  await mouse('mouseMoved', p, { modifiers })
  await sleep(60)
  await mouse('mousePressed', p, { button: 'left', buttons: 1, clickCount: 1, modifiers })
  await mouse('mouseReleased', p, { button: 'left', buttons: 0, clickCount: 1, modifiers })
  await sleep(200)
}
const key = async (k, mods = 0) => {
  const code = k.length === 1 ? `Key${k.toUpperCase()}` : k
  const vk = { Delete: 46, Escape: 27, Enter: 13 }[k] ?? k.toUpperCase().charCodeAt(0)
  await b.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: k, code, windowsVirtualKeyCode: vk, modifiers: mods })
  await b.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk, modifiers: mods })
  await sleep(250)
}
const CTRL = 2
const SHIFT = 8
const tile = (label) => b.evaluate(`[...document.querySelectorAll('.tray__tile')].find((t) => t.textContent.trim() === ${JSON.stringify(label)}).click(), true`)
const setField = async (section, label, value) => {
  await b.evaluate(`(() => { const sec = [...document.querySelectorAll('.inspector__section')].find((s) => s.querySelector('.inspector__eyebrow')?.textContent.startsWith(${JSON.stringify(section)}));
    const i = [...sec.querySelectorAll('.field')].find((f) => f.querySelector('.field__label')?.textContent === ${JSON.stringify(label)}).querySelector('input'); i.focus(); i.select(); return true })()`)
  await b.send('Input.insertText', { text: String(value) })
  await key('Enter')
}
/** Orbit for a few seconds (left-drag on empty ground) and return the FPS overlay's readings. */
async function orbitSamples(rounds = 5) {
  const rect = await b.evaluate(`(() => { const r = document.querySelector('.editor__viewport').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height * 0.35 } })()`)
  const out = []
  for (let i = 0; i < rounds; i++) {
    await drag({ x: rect.x - 140, y: rect.y }, { x: rect.x + 140, y: rect.y })
    out.push(await b.evaluate('$fps()'))
  }
  return out
}
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]

try {
  await b.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
  await b.goto(server.origin)
  await page()
  await b.waitFor(`!!$btn('+ New mansion')`)
  await b.evaluate(`window.__mansion.useSettingsStore.getState().update({ showFps: true, quality: 'medium' }), true`)
  await b.evaluate(`$btn('+ New mansion').click(), true`)
  await b.waitFor(`!!$three()?.controls`)
  await b.evaluate(`(() => { const t = $three(); t.controls.target.set(10, 0, 8); t.camera.position.set(-14, 26, 40); t.controls.update(); return true })()`)
  await sleep(800)
  const gpu = await b.evaluate(`(() => { const gl = $three().gl.getContext(); const d = gl.getExtension('WEBGL_debug_renderer_info'); return gl.getParameter(d ? d.UNMASKED_RENDERER_WEBGL : gl.RENDERER) })()`)
  const software = /swiftshader|software/i.test(gpu)
  console.log(`      rendering on: ${gpu}`)
  const baseline = await orbitSamples()
  // Let the orbit's damping settle and go back to the drawing view before clicking on the ground.
  await b.evaluate(`(() => { const t = $three(); t.controls.target.set(10, 0, 8); t.camera.position.set(-14, 26, 40); t.controls.update(); return true })()`)
  await sleep(1200)

  // 1. Pillars from the palette
  await key('f')
  check('F opens the piece palette with all eight pieces', (await b.evaluate(`[...document.querySelectorAll('.tray__tile')].map((t) => t.textContent.trim()).join()`)) === 'Wall segment,Floor panel,Dome,Glass tube,Platform,Pillar,Arch,Ramp')
  await tile('Pillar')
  for (const [x, z] of [[0.2, 0.1], [2.1, -0.2], [3.9, 0.2], [6.2, 0.1]]) await clickAt(await screen(x, 0, z))
  const placed = await pieces()
  check('clicking places pillars, snapped to the 0.5 m grid', placed.length === 4 && placed.map((p) => p.position.join(',')).join(' | ') === '0,0,0 | 2,0,0 | 4,0,0 | 6,0,0', placed.map((p) => p.position.join(',')).join(' | '))
  await b.evaluate(`document.querySelector('.tray__snap input').click(), true`)
  await clickAt(await screen(8.27, 0, 0.13))
  const free = (await pieces()).at(-1).position
  check('with Snap off, pieces go exactly where clicked', free[0] % 0.5 !== 0 || free[2] % 0.5 !== 0, free.join(', '))
  await b.evaluate(`document.querySelector('.tray__snap input').click(), true`)
  check('each placement is one undo step', (await b.evaluate('$S().past.length')) === 5)
  const drawCalls = () => b.evaluate(`(() => { const t = $three(); t.gl.info.autoReset = false; t.gl.info.reset(); t.gl.render(t.scene, t.camera); const c = t.gl.info.render.calls; t.gl.info.autoReset = true; return c })()`)
  const callsWith5 = await drawCalls()

  // 2. 200 pillars: one instanced mesh, and the frame rate holds
  await b.evaluate(`import('/src/editor/freeform/pieces.ts').then(({ newPiece }) => import('/src/store/designStore.ts').then(({ newId }) => {
    const s = $S(); const extra = [];
    for (let i = 0; extra.length < 195; i++) extra.push({ ...newPiece('pillar', 0, { x: (i % 15) * 2, y: 0, z: 3 + Math.floor(i / 15) * 2 }, 0.5), id: newId() });
    s.applyDesign({ ...s.design, pieces: [...s.design.pieces, ...extra] }); return true }))`)
  await sleep(500)
  const instanced = await b.evaluate('$instanced()')
  check('200 pillars draw as instances of one mesh', instanced.length === 1 && instanced[0].type === 'pillar' && instanced[0].count === 200, JSON.stringify(instanced))
  const callsWith200 = await drawCalls()
  check('draw calls do not grow with the number of pillars (instancing)', callsWith200 === callsWith5, `${callsWith5} calls with 5 pillars, ${callsWith200} with 200`)
  await shot('1-200-pillars')
  const loaded = await orbitSamples()
  const detail = `empty ${median(baseline)} fps → 200 pillars ${median(loaded)} fps, medium quality, ${gpu}`
  if (software) console.log(`SKIP  frame rate with 200 pillars: no GPU here, software rendering (${detail})`)
  else check('with 200 pillars, orbiting stays smooth (≥ 55 fps on this GPU)', median(loaded) >= 55, detail)

  // 3. A floating glass tube corridor
  await b.evaluate(`(() => { const s = $S(); s.applyDesign({ ...s.design, pieces: [] }); return true })()`)
  await b.evaluate(`(() => { const t = $three(); t.controls.target.set(8, 3, 0); t.camera.position.set(-6, 14, 22); t.controls.update(); return true })()`)
  await sleep(400)
  await tile('Glass tube')
  await clickAt(await screen(0, 0, 0))
  await setField('Position', 'Height', 4)
  await key('d', CTRL)
  await setField('Position', 'X', 6)
  await setField('Position', 'Z', 0)
  await key('d', CTRL)
  await setField('Position', 'X', 12)
  await setField('Position', 'Z', 0)
  await tile('Pillar')
  for (const x of [-2.5, 14.5]) await clickAt(await screen(x, 0, 0))
  for (const id of (await pieces()).filter((p) => p.type === 'pillar').map((p) => p.id)) {
    await b.evaluate(`(() => { $S().select(${JSON.stringify(id)}); return true })()`)
    await setField('Size', 'Height', 4)
  }
  const corridor = (await pieces()).filter((p) => p.type === 'tube')
  check('three glass tubes join end to end, floating 4 m up', corridor.length === 3 && corridor.every((t) => t.material === 'glass' && t.position[1] === 4 && t.position[2] === 0) && corridor.map((t) => t.position[0]).join() === '0,6,12', corridor.map((t) => t.position.join(',')).join(' | '))
  check('Ctrl+D duplicated the tube (and selected the copy)', (await b.evaluate('$S().selection.length')) === 1)
  await key('v')
  await key('Escape')
  await shot('2-glass-corridor')

  // 4. The transform gizmo: drag the X arrow of a selected tube
  await clickAt(await screen(6, 4 + 1.5, 1.5)) // the middle tube's near side
  const before = (await pieces()).find((p) => p.type === 'tube' && p.position[0] === 6)
  check('clicking a piece selects it', (await b.evaluate('$S().selection[0]')) === before?.id)
  const arrow = await b.evaluate(`(() => { const t = $three(); let gizmo; t.scene.traverse((o) => { if (o.type === 'TransformControlsGizmo') gizmo = o });
    const x = gizmo.picker.translate.children.find((c) => c.name === 'X'); x.updateWorldMatrix(true, true);
    const box = new (t.camera.position.constructor)(); const bb = x.geometry.boundingBox ?? (x.geometry.computeBoundingBox(), x.geometry.boundingBox);
    const c = bb.getCenter(box).applyMatrix4(x.matrixWorld); return $screen(c.x, c.y, c.z) })()`)
  const along = await screen(6 + 4, 4 + 1.5, 0)
  const origin = await screen(6, 4 + 1.5, 0)
  const steps = await b.evaluate('$S().past.length')
  await drag(arrow, { x: arrow.x + (along.x - origin.x), y: arrow.y + (along.y - origin.y) }, 20)
  const moved = (await pieces()).find((p) => p.id === before.id)
  check('dragging the gizmo X arrow moves the tube along x, snapped, keeping height', moved.position[0] > 7 && moved.position[0] % 0.5 === 0 && moved.position[1] === 4 && moved.position[2] === 0, `x 6 → ${moved.position[0]}`)
  check('a gizmo drag is one undo step', (await b.evaluate('$S().past.length')) === steps + 1)
  await key('z', CTRL)
  check('Ctrl+Z puts it back', (await pieces()).find((p) => p.id === before.id).position[0] === 6)
  const colours = await b.evaluate(`import('/src/scene/overlayTokens.ts').then(({ overlayTokens }) => { let gizmo; $three().scene.traverse((o) => { if (o.type === 'TransformControlsGizmo') gizmo = o });
    const hex = (name) => '#' + gizmo.gizmo.translate.children.find((c) => c.name === name).material.color.getHexString().toUpperCase();
    return { x: hex('X') === overlayTokens.gizmo.x, y: hex('Y') === overlayTokens.gizmo.y, z: hex('Z') === overlayTokens.gizmo.z } })`)
  check('the gizmo uses the design gizmo colours for x, y and z', colours.x && colours.y && colours.z, JSON.stringify(colours))
  await key('t')
  check('T switches the gizmo to rotate', (await b.evaluate(`(() => { let mode; $three().scene.traverse((o) => { if (o.type === 'TransformControlsGizmo') mode = o.mode }); return mode })()`)) === 'rotate')
  await key('m')
  await shot('3-gizmo')

  // 5. Multi-select, duplicate, delete
  await clickAt(await screen(12, 4 + 1.5, 1.5), SHIFT)
  check('shift-click adds to the selection', (await b.evaluate('$S().selection.length')) === 2 && (await b.evaluate(`document.querySelector('[aria-label=Inspector] .inspector__eyebrow')?.textContent`)) === '2 selected')
  await key('d', CTRL)
  check('Ctrl+D duplicates both and selects the copies', (await pieces()).filter((p) => p.type === 'tube').length === 5 && (await b.evaluate('$S().selection.length')) === 2)
  await key('Delete')
  const toast = await b.evaluate(`document.querySelector('.toast')?.innerText ?? ''`)
  check('Delete removes the selection at once with an Undo toast', (await pieces()).filter((p) => p.type === 'tube').length === 3 && toast.includes('2 objects deleted') && toast.includes('Undo'), toast.replace(/\n/g, ' '))
  await clickAt(await screen(0, 4 + 1.5, 1.5))
  await key('Delete')
  check('deleting one piece names it in the toast', (await b.evaluate(`document.querySelector('.toast')?.innerText ?? ''`)).includes('Glass tube deleted'))
  await b.evaluate(`document.querySelector('.toast .toast__action').click(), true`)
  await sleep(200)
  check('the toast Undo brings it back', (await pieces()).filter((p) => p.type === 'tube').length === 3)

  // 6. Floors: pieces belong to the active floor
  await b.evaluate(`[...document.querySelectorAll('button')].find((e) => e.textContent.trim() === '+ Floor above').click(), true`)
  await sleep(300)
  check('on the floor above, ground-floor pieces are ghosted, not editable', (await b.evaluate('$instanced().length')) === 0 && (await b.evaluate(`(() => { let n = 0; $three().scene.traverse((o) => { if (o.name === 'ghost-pieces') n++ }); return n })()`)) > 0)

  await sleep(1200)
  await b.reload()
  await page()
  await b.waitFor(`$S().design.pieces.length > 0`)
  check('pieces reload intact', (await pieces()).filter((p) => p.type === 'tube').map((t) => t.position.join(',')).join(' | ') === '0,4,0 | 6,4,0 | 12,4,0')

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
