// Browser test for the editor: chrome layout, orbit camera and its limits, the FPS overlay,
// and the quality levels (pixel ratio, antialiasing, shadows), watched while orbiting.
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { launch, sleep } from './cdp.mjs'
import { config } from './config.mjs'
import { ensureDevServer } from './devServer.mjs'

const OUT = join(config.outDir, 'editor')
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
  window.$cam = () => { const t = $three(); const p = t.camera.position, g = t.controls.target;
    const d = p.distanceTo(g); return { p: p.toArray(), t: g.toArray(), d, polar: Math.acos((p.y - g.y) / d) } };
  window.$gfx = () => { const t = $three(); const c = t.gl.domElement; const sun = t.scene.getObjectsByProperty('type', 'DirectionalLight')[0];
    return { dpr: c.width / c.clientWidth, antialias: t.gl.getContextAttributes().antialias, shadows: t.gl.shadowMap.enabled,
      castShadow: sun.castShadow, mapSize: sun.shadow.mapSize.x } };
  window.$fps = () => Number(document.querySelector('.viewport__fps-value')?.textContent);
  true`
const page = async () => { await b.waitFor('!!window.__mansion'); await b.evaluate(H) }
const click = (label) => b.evaluate(`$click(${JSON.stringify(label)})`)
const ready = () => b.waitFor(`!!$three()?.controls && $three().gl.domElement.clientWidth > 0`)

const mouse = (type, x, y, extra = {}) => b.send('Input.dispatchMouseEvent', { type, x, y, ...extra })
async function drag(from, to, button = 'left') {
  const buttons = button === 'left' ? 1 : 2
  await mouse('mouseMoved', from.x, from.y)
  await mouse('mousePressed', from.x, from.y, { button, buttons, clickCount: 1 })
  for (let i = 1; i <= 12; i++) {
    await mouse('mouseMoved', from.x + ((to.x - from.x) * i) / 12, from.y + ((to.y - from.y) * i) / 12, { button, buttons })
    await sleep(16)
  }
  await mouse('mouseReleased', to.x, to.y, { button, buttons: 0, clickCount: 1 })
  await sleep(700) // let damping settle
}
async function wheel(at, deltaY, times = 1) {
  for (let i = 0; i < times; i++) {
    await mouse('mouseWheel', at.x, at.y, { deltaX: 0, deltaY })
    await sleep(20)
  }
  await sleep(700)
}
const close = (a, b, eps = 1e-3) => a.every((v, i) => Math.abs(v - b[i]) < eps)

try {
  // A 2× display, so pixel-ratio caps (1 / 1.5 / 2) are observable.
  await b.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false })
  await b.goto(server.origin)
  await page()
  await b.waitFor(`!!$btn('+ New mansion')`)
  await click('+ New mansion')
  await b.waitFor(`location.hash.startsWith('#/mansion/')`)
  await ready()
  await b.evaluate(`(() => {
    const s = $S();
    s.addObject({ kind: 'room', name: 'Hall', type: 'Room', wallThickness: 0.2, size: [12, 4, 9], position: [0, 0, 0], openings: [], materials: { floor: null, walls: null, ceiling: null } });
    s.addObject({ kind: 'room', name: 'Tower', type: 'Room', wallThickness: 0.2, size: [5, 12, 5], position: [10, 0, -8], openings: [], materials: { floor: null, walls: null, ceiling: null } });
    s.addObject({ kind: 'piece', type: 'fish-tank', size: [3, 9, 3], position: [-9, 0, 6], material: null });
    s.addObject({ kind: 'furniture', catalogId: 'sofa', position: [2, 0, 1], material: null });
    return true })()`)

  // 1. Chrome
  const chrome = await b.evaluate(`(() => {
    const pressed = (group) => [...document.querySelectorAll('[aria-label="' + group + '"] [aria-pressed="true"]')].map((e) => e.textContent.trim());
    const disabled = (sel) => [...document.querySelectorAll(sel)].filter((e) => e.disabled).map((e) => e.textContent.trim());
    return {
      name: document.querySelector('.editor-bar__name')?.innerText,
      undo: !$btn('Undo').disabled, redo: !$btn('Redo').disabled,
      view: pressed('View mode'), viewDisabled: disabled('[aria-label="View mode"] button'),
      tool: pressed('Tools'), toolsDisabled: disabled('.tool-rail__tool').length, toolsTotal: document.querySelectorAll('.tool-rail__tool').length,
      quality: pressed('Quality'), designs: !!$btn('My mansions'), settings: !!$btn('Settings'),
      inspector: document.querySelector('[aria-label=Inspector]')?.innerText ?? '',
      status: document.querySelector('.status-bar')?.innerText ?? '',
    } })()`)
  check('top bar: name, undo/redo, view modes, quality, designs, settings',
    chrome.name?.includes('Untitled mansion') && chrome.name.includes('saved') && chrome.undo && !chrome.redo &&
    chrome.view.join() === 'Orbit' && chrome.viewDisabled.join() === 'First-person,Tour,Dollhouse' &&
    chrome.quality.join() === 'Med' && chrome.designs && chrome.settings)
  check('tool rail: Select active, unbuilt tools shown disabled', chrome.tool.join() === 'Select' && chrome.toolsTotal === 12 && chrome.toolsDisabled === 10, `${chrome.toolsDisabled}/${chrome.toolsTotal} disabled`)
  check('inspector summarises the mansion', /Rooms\s*2/.test(chrome.inspector) && /Pieces\s*1/.test(chrome.inspector) && /Furniture\s*1/.test(chrome.inspector))
  check('status bar shows snap and ground-floor rooms', chrome.status.includes('Snap 0.5 m') && chrome.status.includes('Ground floor · 2 rooms'))

  // 2. FPS overlay, switched on in Settings
  check('FPS overlay is off by default', !(await b.evaluate(`!!document.querySelector('.viewport__fps')`)))
  await click('Settings')
  await b.waitFor(`!!document.querySelector('dialog[open]')`)
  await b.evaluate(`document.querySelector('dialog[open] input[type=checkbox]').click(), true`)
  await click('Close')
  await b.waitFor(`$fps() > 0`, 5000)
  check('FPS overlay shows a live frame rate', true, `${await b.evaluate('$fps()')} fps`)

  // 3. Orbit camera
  const rect = await b.evaluate(`(() => { const r = document.querySelector('.editor__viewport').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height } })()`)
  const mid = { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 }

  await mouse('mouseMoved', mid.x + 40, mid.y + 60)
  await sleep(200)
  check('status bar shows the cursor position on the ground', /Cursor -?\d+\.\d, -?\d+\.\d m/.test(await b.evaluate(`document.querySelector('.status-bar').innerText`)))

  const c0 = await b.evaluate('$cam()')
  await drag(mid, { x: mid.x + 220, y: mid.y })
  const c1 = await b.evaluate('$cam()')
  check('left-drag rotates around the target', !close(c0.p, c1.p, 0.5) && Math.abs(c0.d - c1.d) < 0.5 && close(c0.t, c1.t, 0.01))

  await drag(mid, { x: mid.x + 150, y: mid.y + 80 }, 'right')
  const c2 = await b.evaluate('$cam()')
  check('right-drag pans the target', !close(c1.t, c2.t, 0.5) && Math.abs(c2.t[1]) < 1e-6, `target ${c2.t.map((v) => v.toFixed(1)).join(', ')}`)

  await wheel(mid, -120, 5)
  const c3 = await b.evaluate('$cam()')
  check('wheel zooms in', c3.d < c2.d - 1, `${c2.d.toFixed(1)} → ${c3.d.toFixed(1)} m`)

  await wheel(mid, 120, 80)
  const far = await b.evaluate('$cam()')
  check('zoom out stops at the max distance (350 m)', far.d <= 350.01, `${far.d.toFixed(1)} m`)

  await wheel(mid, -120, 120)
  const near = await b.evaluate('$cam()')
  check('zoom in stops at the min distance (1.5 m)', near.d >= 1.499, `${near.d.toFixed(2)} m`)
  await wheel(mid, 120, 25)

  const startPolar = (await b.evaluate('$cam()')).polar
  await drag({ x: mid.x, y: rect.y + rect.h - 40 }, { x: mid.x, y: rect.y + 40 })
  await drag({ x: mid.x, y: rect.y + rect.h - 40 }, { x: mid.x, y: rect.y + 40 })
  const low = await b.evaluate('$cam()')
  const maxPolar = Math.PI / 2 - 0.04
  check('tilting down stops just above the horizon', low.polar > startPolar && Math.abs(low.polar - maxPolar) < 0.01 && low.p[1] > low.t[1],
    `polar ${(startPolar * 180 / Math.PI).toFixed(1)}° → ${(low.polar * 180 / Math.PI).toFixed(1)}°, limit ${(maxPolar * 180 / Math.PI).toFixed(1)}°`)

  await wheel(mid, 120, 80)
  for (let i = 0; i < 8; i++) await drag({ x: rect.x + rect.w - 40, y: rect.y + 40 }, { x: rect.x + 40, y: rect.y + rect.h - 40 }, 'right')
  const panned = await b.evaluate('$cam()')
  const atEdge = Math.max(Math.abs(panned.t[0]), Math.abs(panned.t[2]))
  check('panning stops at the edge of the plot (±100 m)', Math.abs(atEdge - 100) < 0.01 && Math.abs(panned.t[0]) <= 100.001 && Math.abs(panned.t[2]) <= 100.001,
    `target ${panned.t.map((v) => v.toFixed(1)).join(', ')}`)

  // Back to a useful view for the quality checks
  await b.evaluate(`(() => { const t = $three(); t.controls.target.set(0, 0, 0); t.camera.position.set(28, 22, 28); t.controls.update(); return true })()`)
  await sleep(500)

  // 4. Quality levels while orbiting, watching the FPS overlay
  const expected = { Low: { dpr: 1, antialias: false, shadows: false }, Med: { dpr: 1.5, antialias: true, shadows: true, mapSize: 1024 }, High: { dpr: 2, antialias: true, shadows: true, mapSize: 2048 } }
  const fpsByLevel = {}
  for (const level of ['Low', 'Med', 'High']) {
    const before = await b.evaluate('$cam()')
    await b.evaluate(`[...document.querySelectorAll('[aria-label="Quality"] button')].find((e) => e.textContent === ${JSON.stringify(level)}).click(), true`)
    await sleep(400)
    await ready()
    await page()
    const after = await b.evaluate('$cam()')
    const gfx = await b.evaluate('$gfx()')
    const want = expected[level]
    const ok = Math.abs(gfx.dpr - want.dpr) < 0.01 && gfx.antialias === want.antialias && gfx.shadows === want.shadows && gfx.castShadow === want.shadows && (!want.shadows || gfx.mapSize === want.mapSize)
    check(`${level}: pixel ratio ${want.dpr}, antialias ${want.antialias ? 'on' : 'off'}, shadows ${want.shadows ? `on (${want.mapSize})` : 'off'}`, ok, JSON.stringify(gfx))
    check(`${level}: camera view kept across the switch`, close(before.p, after.p, 0.05) && close(before.t, after.t, 0.05))

    // Orbit for ~3 s while sampling the overlay
    const samples = []
    for (let i = 0; i < 6; i++) {
      await drag({ x: mid.x - 120, y: mid.y }, { x: mid.x + 120, y: mid.y })
      samples.push(await b.evaluate('$fps()'))
    }
    fpsByLevel[level] = samples
    check(`${level}: FPS overlay updates while orbiting`, samples.every((v) => v > 0), samples.join(', '))
    await shot(`quality-${level.toLowerCase()}`)
  }
  console.log('      (headless Chrome renders in software, so these frame rates say nothing about a real GPU)')

  // 5. Undo button (before the reload, which starts a fresh history)
  await click('Undo')
  check('Undo button undoes the last change', (await b.evaluate('$S().design.furniture.length')) === 0 && !(await b.evaluate(`$btn('Redo').disabled`)))
  await b.waitFor(`$S().design.updatedAt && !document.querySelector('[role=alert]')`)
  await sleep(1200) // let autosave write the undo before reloading

  // 6. Settings persist across a reload
  await b.reload()
  await page()
  await ready()
  const persisted = await b.evaluate(`({ quality: [...document.querySelectorAll('[aria-label="Quality"] [aria-pressed="true"]')].map((e) => e.textContent).join(), fps: !!document.querySelector('.viewport__fps') })`)
  check('quality and FPS overlay are remembered after a reload', persisted.quality === 'High' && persisted.fps, JSON.stringify(persisted))

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
