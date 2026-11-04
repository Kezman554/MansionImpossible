// Browser test for lights and the time of day: at night, place 20 lights of all four types in
// several colours with the light tool; check the quality's light pools and that at most two
// lights cast shadows on Low and Medium (with the FPS overlay's software numbers); lights on the
// floor above are hidden and off; select, move, duplicate, delete and undo a light; the time of
// day and the lights survive a reload; a v5 design opens upgraded to v6.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { launch, sleep } from './cdp.mjs'
import { config } from './config.mjs'
import { ensureDevServer } from './devServer.mjs'

const OUT = join(config.outDir, 'lights')
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
  window.$lights = () => $S().design.lights.map((l) => ({ id: l.id, type: l.type, floor: l.floor, y: l.position[1], x: l.position[0], z: l.position[2], color: l.color, shadow: l.castShadow }));
  window.$rig = () => { const out = { fixtures: 0, pools: { point: 0, spot: 0 }, lit: 0, casting: [], sun: 0, env: !!$three().scene.environment, sky: '#' + $three().scene.background?.getHexString() };
    $three().scene.traverse((o) => {
      if (o.name === 'light-fixtures') out.fixtures += o.count;
      if (o.isLight && o.parent?.name === 'light-pools') { if (o.isPointLight) out.pools.point++; else if (!o.castShadow) out.pools.spot++; if (o.intensity > 0) out.lit++ }
      if (o.isLight && o.castShadow && o.visible) out.casting.push(o.name || o.type);
      if (o.name === 'sun') out.sun = +o.intensity.toFixed(3) });
    return out };
  window.$setTime = (h) => { const i = document.querySelector('input[aria-label="Time of day"]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, String(h)); i.dispatchEvent(new Event('input', { bubbles: true })); return true };
  window.$fps = () => Number(document.querySelector('.viewport__fps-value')?.textContent);
  true`
const rig = () => b.evaluate('$rig()')
const lights = () => b.evaluate('$lights()')
const steps = () => b.evaluate('$S().past.length')
const view = (tx, ty, tz, px, py, pz) => b.evaluate(`(() => { const t = $three(); t.controls.target.set(${tx}, ${ty}, ${tz}); t.camera.position.set(${px}, ${py}, ${pz}); t.controls.update(); return true })()`)
const setQuality = async (label) => {
  await b.evaluate(`[...document.querySelectorAll('[aria-label="Quality"] button')].find((e) => e.textContent === ${JSON.stringify(label)}).click(), true`)
  await sleep(500)
  await b.waitFor(`!!$three()?.controls`)
  await page()
  await b.evaluate(H2)
  await sleep(500)
}
async function orbitFps() {
  const r = await b.evaluate(`(() => { const c = document.querySelector('canvas').getBoundingClientRect(); return { x: c.left + c.width / 2, y: c.top + c.height / 2 } })()`)
  const samples = []
  for (let i = 0; i < 5; i++) {
    await mouse('mouseMoved', { x: r.x - 120, y: r.y })
    await mouse('mousePressed', { x: r.x - 120, y: r.y }, { button: 'left', buttons: 1, clickCount: 1 })
    for (let k = 1; k <= 10; k++) {
      await mouse('mouseMoved', { x: r.x - 120 + k * 24, y: r.y }, { button: 'left', buttons: 1 })
      await sleep(30)
    }
    await mouse('mouseReleased', { x: r.x + 120, y: r.y }, { button: 'left', buttons: 0, clickCount: 1 })
    await sleep(300)
    samples.push(await b.evaluate('$fps()'))
  }
  return samples.sort((a, c) => a - c)[2]
}

try {
  await b.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
  await b.goto(server.origin)
  await page()
  await b.evaluate(H2)
  await b.waitFor(`!!$btn('+ New mansion')`)
  await clickButton('+ New mansion')
  await b.waitFor(`!!$three()?.controls && !!document.querySelector('.gauge')`)
  await clickButton('+ Floor above')
  await gaugeRow('Ground floor')
  await b.evaluate(`(async () => { const { newRoom } = await import('/src/editor/roomTool.ts'); const s = $S();
    s.addObject({ ...newRoom({ x0: -8, z0: -6, x1: 8, z1: 6 }, 0, []), name: 'Great hall' });
    s.addObject({ ...newRoom({ x0: -8, z0: -6, x1: 8, z1: 6 }, 1, []), name: 'Gallery' });
    s.addObject({ kind: 'piece', type: 'pillar', floor: 0, position: [0, 0, 0], size: [0.8, 3, 0.8], material: 'gold' });
    $S().clearSelection(); return true })()`)

  // 1. Night: the slider moves the sun and darkens the sky
  const day = await rig()
  await b.evaluate('$setTime(22)')
  await sleep(300)
  const night = await rig()
  check("the time of day slider sets the design's time", (await b.evaluate('$S().design.settings.timeOfDay')) === 22)
  check('at 22:00 the sun is off and the sky darkens', day.sun > 1 && night.sun === 0 && day.sky !== night.sky, `${day.sky} sun ${day.sun} → ${night.sky} sun ${night.sun}`)
  check('a generated environment map is in the scene (metals reflect it)', night.env && (await b.evaluate(`(() => { let m = 0; $three().scene.traverse((o) => { if (o.isInstancedMesh && o.material?.name === 'gold') m = o.material.metalness }); return m })()`)) === 0.9)

  // 2. Place 20 lights with the light tool, all four types, several colours
  // High enough that the whole room sits clear of the floor gauge and the tray.
  await view(1, 0, -1, 1, 40, 3)
  await sleep(400)
  await key('l')
  check('L picks the light tool and its tray', (await b.evaluate('$E().tool')) === 'light' && (await b.evaluate(`!!document.querySelector('[aria-label="Lights"].tray')`)))
  const TYPES = ['Ceiling light', 'Lamp', 'Spotlight', 'Strip light']
  const COLOURS = ['Warm white', 'Cool white', 'Candle', 'Rose', 'Aqua']
  // The page has had no pointer movement yet; a person's mouse always arrives before a click.
  await mouse('mouseMoved', await screen(0, 0, 0))
  await mouse('mouseMoved', await screen(1, 0, 1))
  await sleep(100)
  const start = await steps()
  for (let i = 0; i < 20; i++) {
    if (i % 5 === 0) await clickButton(TYPES[i / 5])
    await b.evaluate(`document.querySelector('[aria-label="Lights"].tray [aria-label=${JSON.stringify(COLOURS[i % 5])}]').click(), true`)
    const [x, z] = [-6 + (i % 5) * 3, -4.5 + Math.floor(i / 5) * 3]
    await clickAt(await screen(x, 0, z))
  }
  let ls = await lights()
  check('20 lights placed, one undo step each', ls.length === 20 && (await steps()) === start + 20, `${ls.length} lights, ${(await steps()) - start} steps`)
  check('ceiling, spot and strip lights hang under the ceiling; lamps stand on the floor', ls.every((l) => (l.type === 'lamp' ? l.y === 0 : Math.abs(l.y - 2.94) < 1e-6)), JSON.stringify(ls.map((l) => `${l.type}@${l.y}`)))
  check("they take the tray's colours", new Set(ls.map((l) => l.color)).size === 5)
  // One light asks for shadows (inspector)
  await key('v')
  await b.evaluate(`(() => { $S().select($S().design.lights[0].id); return true })()`)
  await b.evaluate(`document.querySelector('.inspector input[type=checkbox]').click(), true`)
  check('Casts shadows is set on one light', (await lights()).filter((l) => l.shadow).length === 1)
  await b.evaluate('$S().clearSelection(), true')
  await view(0, 0, 0, 0, 18, 16)
  await sleep(600)
  await shot('1-night-20-lights-medium')

  // 3. Medium and Low: fixed pools, at most two shadow casters; software frame rates
  let r = await rig()
  check('Medium: 20 fixtures, pools of 12 point + 4 spot lights, all lit by the 20 (16 + the shadow light)', r.fixtures === 20 && r.pools.point === 12 && r.pools.spot === 4 && r.lit === 17, JSON.stringify(r))
  check('Medium: two shadow casters at most (the sun and one light)', r.casting.length <= 2 && r.casting.includes('light-shadow'), r.casting.join())
  await b.evaluate(`window.__mansion.useSettingsStore.getState().update({ showFps: true }), true`)
  await b.waitFor(`$fps() > 0`, 8000)
  const fpsMed = await orbitFps()
  await setQuality('Low')
  r = await rig()
  check('Low: pools of 6 point + 2 spot lights, no light shadows, no sun shadows', r.pools.point === 6 && r.pools.spot === 2 && r.lit === 8 && r.casting.length === 0, JSON.stringify(r))
  const fpsLow = await orbitFps()
  check('FPS overlay reads while orbiting 20 lights at night (software rendering: not a real number)', fpsLow > 0 && fpsMed > 0, `Low ${fpsLow} fps, Medium ${fpsMed} fps — SOFTWARE (SwiftShader), not the laptop GPU`)
  console.log(`SOFTWARE-FPS low=${fpsLow} medium=${fpsMed} (20 lights, 22:00, headless Chrome + SwiftShader; real check on the laptop)`)
  await shot('2-night-20-lights-low')
  await setQuality('Med')

  // 4. Lights on the floor above are hidden and off
  await gaugeRow('First floor')
  await b.evaluate('document.activeElement?.blur(), true')
  await key('l')
  await clickButton('Ceiling light')
  await clickAt(await screen(-3, 3, 0))
  await clickAt(await screen(3, 3, 0))
  await key('v')
  r = await rig()
  check("on the First floor: its 2 lights and the ground floor's 20 show", r.fixtures === 22)
  await gaugeRow('Ground floor')
  await sleep(200)
  r = await rig()
  const upstairsOn = await b.evaluate(`(() => { let on = 0; $three().scene.traverse((o) => { if (o.isLight && o.parent?.name === 'light-pools' && o.intensity > 0 && o.position.y > 3) on++ }); return on })()`)
  check('back on the ground floor: the 2 upstairs are hidden and switched off', r.fixtures === 20 && upstairsOn === 0, `${r.fixtures} fixtures, ${upstairsOn} lights above`)

  // 5. Select by clicking, move, duplicate, delete with Undo
  await view(1, 0, -1, 1, 40, 3)
  await sleep(400)
  const target = (await lights()).find((l) => l.type === 'ceiling' && l.floor === 0 && !l.shadow)
  await clickAt(await screen(target.x, 2.89, target.z))
  check('clicking a fixture selects the light', (await b.evaluate('$S().selection.join()')) === target.id, await b.evaluate('$S().selection.join()'))
  check('the inspector shows it', (await b.evaluate(`document.querySelector('.inspector__title')?.textContent`)) === 'Ceiling light')
  let s0 = await steps()
  await b.evaluate(`(() => { const l = [...document.querySelectorAll('.inspector label.field')].find((f) => f.querySelector('.field__label')?.textContent === 'X'); const i = l.querySelector('input'); i.focus(); i.select(); return true })()`)
  await b.send('Input.insertText', { text: String(target.x + 0.5) })
  await key('Enter')
  check('moving it is one undo step', (await lights()).find((l) => l.id === target.id).x === target.x + 0.5 && (await steps()) === s0 + 1)
  await key('d', 2)
  ls = await lights()
  check('Ctrl+D duplicates it (one undo step)', ls.length === 23 && (await steps()) === s0 + 2 && (await b.evaluate('$S().selection.length')) === 1)
  await key('Delete')
  const toast = await b.evaluate(`document.querySelector('.toast')?.innerText ?? ''`)
  check('Delete removes it without asking, and offers Undo', (await lights()).length === 22 && toast.includes('Ceiling light deleted') && toast.includes('Undo'), toast.replace(/\n/g, ' '))
  await clickButton('Undo')
  check('Undo puts it back', (await lights()).length === 23)
  await key('z', 2)
  await key('z', 2)
  check('undo takes back the duplicate and the move', (await lights()).length === 22 && (await lights()).find((l) => l.id === target.id).x === target.x)

  // 6. Reload: lights and the time of day are saved with the design
  await sleep(1500)
  const saved = await b.evaluate('JSON.stringify({ lights: $S().design.lights, time: $S().design.settings.timeOfDay })')
  await b.reload()
  await page()
  await b.evaluate(H2)
  await b.waitFor(`$S().design.lights?.length === 22 && !!$three()?.controls`)
  await sleep(500)
  check('lights reload intact', (await b.evaluate('JSON.stringify({ lights: $S().design.lights, time: $S().design.settings.timeOfDay })')) === saved)
  check('the time of day survives the reload (22:00, sun off, night sky)', (await b.evaluate('$S().design.settings.timeOfDay')) === 22 && (await rig()).sun === 0 && (await b.evaluate(`document.querySelector('.status-bar__time')?.textContent ?? ''`)).includes('22:00'))
  check('saved as v6', (await b.evaluate('$S().design.version')) === 6)
  await b.evaluate('$setTime(17.5)')
  await sleep(300)
  await view(0, 0, 0, 10, 14, 16)
  await sleep(400)
  await shot('3-evening')

  // 7. Open a v5 design (Import JSON): it upgrades
  const v5 = await b.evaluate(`(async () => { const { createDesign } = await import('/src/store/designStore.ts');
    const d = createDesign('Old v5 villa'); d.version = 5; delete d.lights; d.settings.timeOfDay = 12;
    d.rooms = [{ id: 'r1', kind: 'room', name: 'Hall', type: 'Room', floor: 0, position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], size: [6, 3, 5], wallThickness: 0.2, openings: [], materials: { floor: 'marble', walls: null, ceiling: null, faces: { 'north-in': 'gold' } } }];
    return JSON.stringify(d) })()`)
  const file = join(OUT, 'old-v5-villa.mansion.json')
  writeFileSync(file, v5)
  await clickButton('My mansions')
  await b.waitFor(`!!document.querySelector('input[type=file]')`)
  const { root } = await b.send('DOM.getDocument')
  const { nodeId } = await b.send('DOM.querySelector', { nodeId: root.nodeId, selector: 'input[type=file]' })
  await b.send('DOM.setFileInputFiles', { nodeId, files: [file] })
  await b.waitFor(`!!$btn('Open Old v5 villa')`)
  await clickButton('Open Old v5 villa')
  await b.waitFor(`$S().design.name === 'Old v5 villa' && !!$three()?.controls`)
  const up = await b.evaluate('$S().design')
  check('a v5 design opens upgraded to v6: no lights, the default time of day, its materials kept', up.version === 6 && Array.isArray(up.lights) && up.lights.length === 0 && up.settings.timeOfDay === 12 && up.rooms[0].materials.faces['north-in'] === 'gold', JSON.stringify({ v: up.version, lights: up.lights, t: up.settings.timeOfDay }))
  await key('l')
  await view(0, 0, 0, 0, 14, 8)
  await sleep(300)
  await mouse('mouseMoved', await screen(1, 0, 1)) // the new canvas hasn't seen the pointer yet
  await sleep(100)
  await clickAt(await screen(0, 0, 0))
  check('and takes lights', (await b.evaluate('$S().design.lights.length')) === 1)

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
