// Browser test for the tank's fish: a tank through three floors, watched on Low and High quality.
// Fish counts per floor follow the quality; fish move and stay inside the tank; hidden floors'
// schools pause (no steps) and resume where they were; the FPS overlay is read while orbiting
// (software GL here, so those numbers are not real). Camera moves wait for rendered frames.
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { launch, sleep } from './cdp.mjs'
import { config } from './config.mjs'
import { ensureDevServer } from './devServer.mjs'

const OUT = join(config.outDir, 'fish')
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
const clickButton = (label) => b.evaluate(`(() => { const e = $btn(${JSON.stringify(label)}); if (!e) throw new Error('No button ' + ${JSON.stringify(label)}); e.click(); return true })()`)
const FLOOR_INDEX = { 'Ground floor': 0, 'First floor': 1, 'Second floor': 2 }
/** Switches floors by clicking the floor's row in the gauge (unless it is already the one being edited). */
const gaugeRow = async (name) => {
  if ((await b.evaluate('$E().activeFloor')) === FLOOR_INDEX[name]) return
  await b.evaluate(`[...document.querySelectorAll('.gauge__row')].find((r) => r.querySelector('.gauge__name')?.textContent === ${JSON.stringify(name)}).click(), true`)
  await b.evaluate('$frames(2)')
}

const mouse = (type, p, extra = {}) => b.send('Input.dispatchMouseEvent', { type, x: p.x, y: p.y, ...extra })
const H2 = `
  window.$fish = () => { const g = $three().scene.getObjectByName('fish'); return g ? { schools: g.userData.schools, drawn: g.userData.drawn } : null };
  window.$fishPositions = () => { const out = []; const m = new ($three().camera.matrix.constructor)(); const p = $three().camera.position.clone();
    $three().scene.traverse((o) => { if (o.isInstancedMesh && o.name.startsWith('fish-')) for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, m); p.setFromMatrixPosition(m); out.push([+p.x.toFixed(3), +p.y.toFixed(3), +p.z.toFixed(3)]) } }); return out };
  window.$expected = async () => { const { fishCount } = await import('/src/scene/fishSchool.ts'); const { QUALITY_PRESETS } = await import('/src/scene/quality.ts');
    const q = document.querySelector('.viewport').dataset.quality; return fishCount($S().design.tank, QUALITY_PRESETS[q].fishPerFloor) };
  window.$frames = (n = 2) => new Promise((r) => { let k = 0; const tick = () => (++k >= n ? r(true) : requestAnimationFrame(tick)); requestAnimationFrame(tick) });
  window.$fps = () => Number(document.querySelector('.viewport__fps-value')?.textContent);
  true`
const fish = () => b.evaluate('$fish()')
const expected = () => b.evaluate('$expected()')
const view = async (tx, ty, tz, px, py, pz) => {
  await b.evaluate(`(() => { const t = $three(); t.controls.target.set(${tx}, ${ty}, ${tz}); t.camera.position.set(${px}, ${py}, ${pz}); t.controls.update(); return true })()`)
  await b.evaluate('$frames(3)')
}
const setQuality = async (label) => {
  await b.evaluate(`[...document.querySelectorAll('[aria-label="Quality"] button')].find((e) => e.textContent === ${JSON.stringify(label)}).click(), true`)
  await b.waitFor(`!!window.__mansion.three?.()?.controls && document.querySelector('.viewport').dataset.quality === ${JSON.stringify({ Low: 'low', Med: 'medium', High: 'high' }[label])}`)
  await page()
  await b.evaluate(H2)
  await b.waitFor('!!$fish()?.schools')
  await b.evaluate('$frames(5)')
}
/** Steps taken by each floor's school over `ms` of real time. */
async function stepsOver(ms) {
  const a = (await fish()).schools
  await sleep(ms)
  const c = (await fish()).schools
  return Object.fromEntries(Object.keys(c).map((k) => [k, c[k].steps - (a[k]?.steps ?? 0)]))
}
const screen = (x, y, z) => b.evaluate(`$screen(${x}, ${y}, ${z})`)
async function clickAt(p) {
  await mouse('mouseMoved', p)
  await b.evaluate('$frames(2)')
  await mouse('mousePressed', p, { button: 'left', buttons: 1, clickCount: 1 })
  await mouse('mouseReleased', p, { button: 'left', buttons: 0, clickCount: 1 })
  await b.evaluate('$frames(2)')
}
const key = async (k, mods = 0) => {
  const code = k.length === 1 ? `Key${k.toUpperCase()}` : k
  const vk = { Delete: 46, Escape: 27, Enter: 13 }[k] ?? k.toUpperCase().charCodeAt(0)
  await b.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: k, code, windowsVirtualKeyCode: vk, modifiers: mods })
  await b.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk, modifiers: mods })
  await b.evaluate('$frames(2)')
}
/** Every drawn fish inside the tank's current shape and its floor's slice (per the floors as they are now). */
const allInside = () => b.evaluate(`(() => { const t = $S().design.tank; const fl = $S().design.floors; const [cx, cz] = t.position;
  return $fishPositions().every(([x, y, z]) => {
    const inPlan = t.shape === 'cylindrical' ? Math.hypot(x - cx, z - cz) <= t.size[0] / 2 : Math.abs(x - cx) <= t.size[0] / 2 && Math.abs(z - cz) <= t.size[1] / 2;
    return inPlan && fl.some((f) => y >= f.elevation && y <= f.elevation + f.height) }) })()`)
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
  await clickButton('+ Floor above')
  await gaugeRow('Ground floor')
  await b.evaluate(`(async () => { const { placeTank } = await import('/src/editor/tank.ts'); $S().applyDesign(placeTank($S().design, { x: 0, z: 0 })); $S().clearSelection(); return true })()`)
  await b.evaluate(`window.__mansion.useSettingsStore.getState().update({ showFps: true }), true`)
  const fpsLog = {}
  let firstFrames = ''

  for (const quality of ['Low', 'High']) {
    await setQuality(quality)
    const perFloor = await expected()
    await gaugeRow('Ground floor')
    await view(0, 1.5, 0, 6, 4, 8)

    // Ground floor: its school swims; the two floors above are hidden, so theirs are paused
    let f = await fish()
    check(`${quality}: on the ground floor, ${perFloor} fish are drawn (its school only)`, f.drawn === perFloor, JSON.stringify(f))
    const p0 = await b.evaluate('$fishPositions()')
    let steps = await stepsOver(1000)
    const p1 = await b.evaluate('$fishPositions()')
    const moved = p0.filter((p, i) => p1[i] && Math.hypot(p[0] - p1[i][0], p[1] - p1[i][1], p[2] - p1[i][2]) > 0.01).length
    check(`${quality}: they swim (positions change over a second)`, moved >= perFloor * 0.8, `${moved}/${perFloor} moved`)
    check(`${quality}: hidden floors above are paused (no steps)`, steps[0] > 0 && steps[1] === 0 && steps[2] === 0, JSON.stringify(steps))
    const inside = (await b.evaluate('$fishPositions()')).every(([x, y, z]) => Math.abs(x) < 2 && Math.abs(z) < 2 && y > 0 && y < 3)
    check(`${quality}: every fish is inside the tank's ground-floor slice`, inside)
    await shot(`${quality.toLowerCase()}-1-ground`)

    // First floor: ground (ghosted) and first swim; second still paused
    await gaugeRow('First floor')
    await view(0, 4.5, 0, 6, 7, 8)
    f = await fish()
    steps = await stepsOver(1000)
    check(`${quality}: on the First floor, two floors' fish are drawn and swim; the Second is paused`, f.drawn === perFloor * 2 && steps[0] > 0 && steps[1] > 0 && steps[2] === 0, `${f.drawn} drawn · ${JSON.stringify(steps)}`)
    // Second floor: all three
    await gaugeRow('Second floor')
    await view(0, 4.5, 0, 9, 9, 12)
    steps = await stepsOver(1000)
    f = await fish()
    check(`${quality}: on the Second floor, all three floors' fish swim`, f.drawn === perFloor * 3 && steps[0] > 0 && steps[1] > 0 && steps[2] > 0, `${f.drawn} drawn · ${JSON.stringify(steps)}`)
    const ys = (await b.evaluate('$fishPositions()')).map((p) => Math.floor(p[1] / 3))
    check(`${quality}: each school stays in its own floor's slice`, [0, 1, 2].every((k) => ys.filter((y) => y === k).length === perFloor), JSON.stringify([0, 1, 2].map((k) => ys.filter((y) => y === k).length)))
    await shot(`${quality.toLowerCase()}-2-all-floors`)
    // Below: Hide — the lower floors are hidden, so they pause too
    await b.evaluate(`[...document.querySelectorAll('[aria-label="Floors below"] button')].find((e) => e.textContent === 'Hide').click(), true`)
    await b.evaluate('$frames(3)')
    steps = await stepsOver(1000)
    check(`${quality}: with floors below hidden, only the Second floor's fish swim`, (await fish()).drawn === perFloor && steps[0] === 0 && steps[1] === 0 && steps[2] > 0, JSON.stringify(steps))
    await b.evaluate(`[...document.querySelectorAll('[aria-label="Floors below"] button')].find((e) => e.textContent === 'Ghost').click(), true`)
    // Paused schools resume where they were
    const before = (await fish()).schools
    await gaugeRow('Ground floor')
    await view(0, 1.5, 0, 6, 4, 8)
    const after = (await fish()).schools
    check(`${quality}: back on the ground floor, the floors above keep their place (paused, not reset)`, after[1].steps === before[1].steps && after[2].steps === before[2].steps && after[1].steps > 0, `${JSON.stringify(before)} → ${JSON.stringify(after)}`)

    // FPS while orbiting with three floors of fish on screen (software GL)
    await gaugeRow('Second floor')
    await view(0, 4.5, 0, 9, 9, 12)
    await b.waitFor('$fps() > 0', 8000)
    fpsLog[quality] = await orbitFps()
    if (quality === 'High') {
      // First frames with a full tank: High, three floors of fish on screen, after a reload
      await new Promise((r) => setTimeout(r, 1500)) // let autosave write before reloading
      const t0 = Date.now()
      await b.reload()
      await page()
      await b.evaluate(H2)
      await b.waitFor('!!$three()?.gl && $three().gl.info.render.frame > 0 && ($fish()?.drawn ?? 0) > 0', 30000)
      const first = Date.now() - t0
      const f0 = await b.evaluate('$three().gl.info.render.frame')
      await new Promise((r) => setTimeout(r, 3000))
      const frames3 = (await b.evaluate('$three().gl.info.render.frame')) - f0
      firstFrames = `${first} ms to the first frame with fish, then ${frames3} frames in 3 s (${(await fish()).drawn} fish on 3 floors, High, software GL)`
      console.log('FIRST-FRAMES', firstFrames)
      check('first frames with a full tank after a reload (software timing reported)', first > 0 && frames3 > 0, firstFrames)
    }
  }
  check('FPS overlay reads on Low and High with fish on three floors (software rendering: not a real number)', fpsLog.Low > 0 && fpsLog.High > 0, `Low ${fpsLog.Low} fps, High ${fpsLog.High} fps — SOFTWARE (SwiftShader), not the laptop GPU`)
  console.log(`SOFTWARE-FPS low=${fpsLog.Low} high=${fpsLog.High} (fish on 3 floors; headless Chrome + SwiftShader; real check on the laptop)`)
  await setQuality('Med')
  await gaugeRow('Ground floor')

  // Fish never catch clicks: clicking the water through a school selects the tank
  await key('v')
  await view(0, 1.5, 0, 0, 3, 7)
  const tankId = await b.evaluate('$S().design.tank.id')
  await clickAt(await screen(0, 1.5, 2))
  check('with fish swimming, clicking the water selects the tank', (await b.evaluate('$S().selection.join()')) === tankId)
  const fishHits = await b.evaluate(`(() => { const t = $three(); const ray = new t.raycaster.constructor(); ray.setFromCamera({ x: 0, y: 0 }, t.camera); let n = 0;
    t.scene.traverse((o) => { if (o.isInstancedMesh && o.name.startsWith('fish-')) { const out = []; o.raycast(ray, out); n += out.length } }); return n })()`)
  check('fish meshes take no part in picking', fishHits === 0)
  // O's click-through: above the ground floor's water (floors above hidden) a click selects nothing
  await key('Escape')
  await view(0, 4.6, 2, 0, 5, 16)
  await clickAt(await screen(0, 4.6, 2))
  check("O's click-through still holds: clicking above the visible water selects nothing", (await b.evaluate('$S().selection.length')) === 0)

  // The tank's shape and the floors change: fish stay inside whatever the tank is now
  await b.evaluate(`(async () => { const { setTankShape } = await import('/src/editor/tank.ts'); const d = $S().design; $S().applyDesign({ ...d, tank: setTankShape(d.tank, 'cylindrical') }); return true })()`)
  await clickButton('+ Floor above') // a fourth floor: the tank grows
  await b.evaluate(`(async () => { const { setFloorHeight } = await import('/src/editor/floors.ts'); $S().applyDesign(setFloorHeight($S().design, 1, 4.5)); return true })()`)
  await view(0, 6, 0, 10, 12, 14)
  await b.evaluate('$frames(10)')
  let f = await fish()
  check('a cylindrical tank, a fourth floor and a taller First floor: four schools, all fish inside', Object.keys(f.schools).length === 4 && f.drawn === (await expected()) * 4 && (await allInside()), `${f.drawn} drawn · inside ${await allInside()}`)
  await shot('3-cylinder-four-floors')

  // Deleting the tank removes the fish; undo brings both back
  await gaugeRow('Ground floor')
  await b.evaluate(`(() => { $S().select($S().design.tank.id); return true })()`)
  await key('Delete')
  check('deleting the tank removes the fish', !(await b.evaluate('$S().design.tank')) && !(await fish()))
  await key('z', 2)
  await b.evaluate('$frames(5)')
  check('undo brings the tank and its fish back', !!(await b.evaluate('$S().design.tank')) && ((await fish())?.drawn ?? 0) > 0)
  check('fish store nothing in the design (save format stays v7)', (await b.evaluate('$S().design.version')) === 7 && !(await b.evaluate('JSON.stringify($S().design)')).toLowerCase().includes('fish'))

  // prefers-reduced-motion: the fish hold still
  await b.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
  await b.evaluate('$frames(5)')
  const r0 = await b.evaluate('$fishPositions()')
  const rs = await stepsOver(1000)
  const r1 = await b.evaluate('$fishPositions()')
  check('with reduced motion the fish hold still', (await b.evaluate(`$three().scene.getObjectByName('fish').userData.still`)) && rs[0] === 0 && JSON.stringify(r0) === JSON.stringify(r1), JSON.stringify(rs))
  await b.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] })
  await b.evaluate('$frames(5)')
  check('and swim again when it is turned off', (await stepsOver(500))[0] > 0)

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
