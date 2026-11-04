// Browser test for L: a bookcase secret door between two rooms with a hidden passage behind it;
// a round brainstorm room with screens showing uploaded images (one large, downscaled); painting
// its curved wall inside and out; the tank against it (aquarium glass); a light in it; undo;
// reload (timing the first frames); export, then re-import into a library without the images.
// Every camera move waits for real rendered frames, never a fixed sleep.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'
import { join } from 'node:path'
import { launch, sleep } from './cdp.mjs'
import { config } from './config.mjs'
import { ensureDevServer } from './devServer.mjs'

const OUT = join(config.outDir, 'brainstorm')
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
const _gaugeRow = (name) => b.evaluate(`[...document.querySelectorAll('.gauge__row')].find((r) => r.querySelector('.gauge__name')?.textContent === ${JSON.stringify(name)}).click(), true`)

const mouse = (type, p, extra = {}) => b.send('Input.dispatchMouseEvent', { type, x: p.x, y: p.y, ...extra })
async function drag(from, to, steps = 12) {
  await mouse('mouseMoved', from)
  await mouse('mousePressed', from, { button: 'left', buttons: 1, clickCount: 1 })
  for (let i = 1; i <= steps; i++) {
    await mouse('mouseMoved', { x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps }, { button: 'left', buttons: 1 })
    await sleep(16)
  }
  await mouse('mouseReleased', to, { button: 'left', buttons: 0, clickCount: 1 })
  await b.evaluate('$frames(2)')
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
const DOWNLOADS = join(OUT, 'downloads')

/** A real PNG of w × h pixels: a diagonal two-colour gradient (enough to tell images apart). */
function png(w, h, [r0, g0, b0], [r1, g1, b1]) {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
  const crc = (buf) => { let c = 0xffffffff; for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]) }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2
  const raw = Buffer.alloc((w * 3 + 1) * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const t = (x / w + y / h) / 2, o = y * (w * 3 + 1) + 1 + x * 3
    raw[o] = r0 + (r1 - r0) * t; raw[o + 1] = g0 + (g1 - g0) * t; raw[o + 2] = b0 + (b1 - b0) * t
  }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}

const H2 = `
  window.$room = (name) => $S().design.rooms.find((r) => r.name === name);
  window.$frames = (n = 2) => new Promise((r) => { let k = 0; const tick = () => (++k >= n ? r(true) : requestAnimationFrame(tick)); requestAnimationFrame(tick) });
  window.$screens = () => { const out = []; $three().scene.traverse((o) => { if (o.name === 'screen') out.push({ i: o.userData.index, image: o.userData.imageId, showing: o.material.name === o.userData.imageId && !!o.material.map }) }); return out.sort((a, b) => a.i - b.i) };
  window.$images = () => new Promise((res) => { const q = indexedDB.open('mansion-impossible'); q.onsuccess = () => { const t = q.result.transaction('images').objectStore('images').getAll(); t.onsuccess = () => res(t.result.map((i) => ({ id: i.id, name: i.name, w: i.width, h: i.height, bytes: i.data.byteLength, type: i.type }))) } });
  window.$clearImages = () => new Promise((res) => { const q = indexedDB.open('mansion-impossible'); q.onsuccess = () => { const t = q.result.transaction('images', 'readwrite'); t.objectStore('images').clear(); t.oncomplete = () => res(true) } });
  window.$aquarium = () => { let n = 0; $three().scene.traverse((o) => { if (o.isMesh && o.name === 'aquarium' && o.geometry.getAttribute('position').count) n += o.geometry.getAttribute('position').count }); return n };
  window.$wallMaterials = () => { const out = []; $three().scene.traverse((o) => { if (o.isMesh && o.name === 'walls') out.push(o.userData.material) }); return out.sort() };
  true`
const steps = () => b.evaluate('$S().past.length')
/** Moves the camera, then waits for frames drawn with it (picking uses the last rendered camera). */
const view = async (tx, ty, tz, px, py, pz) => {
  await b.evaluate(`(() => { const t = $three(); t.controls.target.set(${tx}, ${ty}, ${tz}); t.camera.position.set(${px}, ${py}, ${pz}); t.controls.update(); return true })()`)
  await b.evaluate('$frames(3)')
}
const setSelect = (label, text) => b.evaluate(`(() => { const s = document.querySelector('select[aria-label="${label}"]'); const o = [...s.options].find((o) => o.textContent.includes(${JSON.stringify(text)})); s.value = o.value; s.dispatchEvent(new Event('change', { bubbles: true })); return true })()`)
const setField = async (label, value) => {
  await b.evaluate(`(() => { const l = [...document.querySelectorAll('.inspector label.field')].find((f) => f.querySelector('.field__label')?.textContent === ${JSON.stringify(label)}); const i = l.querySelector('input'); i.focus(); i.select(); return true })()`)
  await b.send('Input.insertText', { text: value })
  await key('Enter')
}
async function setFiles(selector, files) {
  const { root } = await b.send('DOM.getDocument', { depth: -1, pierce: true })
  const { nodeId } = await b.send('DOM.querySelector', { nodeId: root.nodeId, selector })
  await b.send('DOM.setFileInputFiles', { nodeId, files })
}
async function drawRoom(x0, z0, x1, z1) {
  await key('r')
  await drag(await screen(x0 + 0.1, 0, z0 + 0.1), await screen(x1 - 0.1, 0, z1 - 0.1))
}

try {
  await b.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
  mkdirSync(DOWNLOADS, { recursive: true })
  await b.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DOWNLOADS }).catch(() => b.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: DOWNLOADS }))
  await b.goto(server.origin)
  await page()
  await b.evaluate(H2)
  await b.waitFor(`!!$btn('+ New mansion')`)
  await clickButton('+ New mansion')
  await b.waitFor(`!!$three()?.controls && !!document.querySelector('.gauge')`)
  await b.evaluate(`(() => { $S().applyDesign({ ...$S().design, name: 'Ideas wing' }, { record: false }); return true })()`)
  await view(2, 0, 0, 2, 40, 14)

  // 1. Two rooms; a bookcase secret door in their shared wall; a hidden passage behind it
  await drawRoom(-10, -3, -4, 3)
  await drawRoom(-4, -3, 2, 3)
  const [A] = await b.evaluate('$S().design.rooms.map((r) => r.id)')
  await key('d')
  await clickButton('Bookcase secret door')
  await view(-7, 1, 0, -12, 9, 2) // from room A's side, looking east at the shared wall
  await clickAt(await screen(-4.1, 1.2, 0))
  let rooms = await b.evaluate('$S().design.rooms')
  const door = rooms.flatMap((r) => r.openings.map((o) => ({ ...o, room: r.id })))[0]
  check('the door tool places a bookcase secret door in the shared wall', door?.style === 'bookcase' && door.type === 'door' && door.hinge === 'left' && door.open === false, JSON.stringify(door))
  check('it belongs to the room it was placed from (A, its east wall)', door?.room === A && door.wall === 'east')
  await b.evaluate(`[...document.querySelectorAll('[aria-label="Hinge side"] button')].find((e) => e.textContent === 'Right').click(), true`)
  await b.evaluate(`document.querySelector('.inspector input[type=checkbox]').click(), true`)
  const stored = (await b.evaluate('$S().design.rooms')).flatMap((r) => r.openings)[0]
  check('hinge side and open state are stored in the design', stored.hinge === 'right' && stored.open === true)
  check('the bookcase is drawn: shelves and book spines', await b.evaluate(`(() => { const n = []; $three().scene.traverse((o) => { if (o.name === 'opening-books' || o.name === 'opening-shelf') n.push(o.name) }); return n.includes('opening-books') && n.includes('opening-shelf') })()`))
  await shot('1-bookcase-door')
  await key('f')
  await clickButton('Hidden passage')
  await view(2, 0, 0, 2, 40, 14)
  await clickAt(await screen(-1, 0, 4.5))
  check('a hidden passage corridor piece is placed', (await b.evaluate(`$S().design.pieces.filter((p) => p.type === 'bookcase-passage').length`)) === 1)
  await key('Escape')

  // 2. A round brainstorm room
  await key('r')
  await b.evaluate(`[...document.querySelectorAll('[aria-label="Shape"] button')].find((e) => e.textContent === 'Round').click(), true`)
  await drag(await screen(6.1, 0, -3.9), await screen(13.9, 0, 3.9))
  let round = await b.evaluate('$S().design.rooms.find((r) => r.shape === "round")')
  check('the room tool draws a round room (a Room with shape round)', round && round.kind === 'room' && round.size[0] === 8 && round.size[2] === 8 && round.position[0] === 10, JSON.stringify(round && { size: round.size, pos: round.position }))
  await b.evaluate(`(() => { const s = [...document.querySelectorAll('.inspector select')].find((s) => [...s.options].some((o) => o.textContent === 'Brainstorm room')); s.value = 'Brainstorm room'; s.dispatchEvent(new Event('change', { bubbles: true })); return true })()`)
  await setField('Radius', '4.5')
  await setField('Screens', '6')
  round = await b.evaluate('$S().design.rooms.find((r) => r.shape === "round")')
  check('type, radius and screen count set in the inspector', round.type === 'Brainstorm room' && round.size[0] === 9 && round.screens.count === 6)
  check('six screens stand round the wall', (await b.evaluate('$screens()')).length === 6)

  // 3. Upload three images (one 2400 × 1600: downscaled) onto the screens; pick one by hand
  const files = [png(2400, 1600, [255, 120, 60], [40, 20, 120]), png(320, 200, [30, 200, 120], [250, 240, 80]), png(400, 300, [60, 120, 255], [255, 255, 255])].map((data, i) => {
    const f = join(OUT, `screen-${i + 1}.png`)
    writeFileSync(f, data)
    return f
  })
  const s0 = await steps()
  await setFiles('input[aria-label="Upload screen images"]', files)
  await b.waitFor(`$S().design.rooms.find((r) => r.shape === 'round').screens.images.filter(Boolean).length === 3`, 15000)
  const lib = await b.evaluate('$images()')
  check('uploads go to the image library in IndexedDB, the big one downscaled to 1280 px', lib.length === 3 && Math.max(...lib.map((i) => Math.max(i.w, i.h))) === 1280 && lib.some((i) => i.w === 1280 && i.h === 853), JSON.stringify(lib.map((i) => `${i.name} ${i.w}×${i.h} ${i.bytes}B`)))
  check('they fill the blank screens in order, as one undo step', (await steps()) === s0 + 1)
  await setSelect('Screen 5 image', 'screen-1.png')
  round = await b.evaluate('$S().design.rooms.find((r) => r.shape === "round")')
  check('an image picked for screen 5', round.screens.images[4] === round.screens.images[0] && round.screens.images[4])
  const designBytes = (await b.evaluate('JSON.stringify($S().design)')).length
  check('the design references images by id only (stays small)', designBytes < 20000 && !(await b.evaluate('JSON.stringify($S().design)')).includes('base64'), `${designBytes} bytes`)
  await view(10, 1.5, 0, 10, 2.6, 1.2)
  await b.waitFor(`$screens().filter((s) => s.showing).length === 4`, 15000)
  check('screens show their images', (await b.evaluate('$screens()')).map((s) => (s.showing ? 'I' : '-')).join('') === 'III-I-')
  await shot('2-screens-inside')

  // 4. Paint the curved wall, inside and out
  await key('p')
  await clickButton('Metal'); await clickButton('Gold')
  await view(10, 1.5, 0, 6, 8, 2)
  await clickAt(await screen(14.38, 1.4, 0)) // the inside face, east, in the gap between two screens
  await clickButton('Brick'); await clickButton('Red brick')
  await view(10, 1.5, 0, 10, 6, 14)
  await clickAt(await screen(10.4, 1.5, 4.64)) // the outside face, south
  round = await b.evaluate('$S().design.rooms.find((r) => r.shape === "round")')
  check('the curved wall paints inside and outside separately', round.materials.faces['curve-in'] === 'gold' && round.materials.faces['curve-out'] === 'brick-red', JSON.stringify(round.materials.faces))
  const wallMats = await b.evaluate('$wallMaterials()')
  check('both show in the scene', wallMats.includes('gold') && wallMats.includes('brick-red'), JSON.stringify(wallMats))
  await key('v')

  // 5. The tank against the round room: aquarium glass in its wall; a light in it
  const glassBefore = await b.evaluate('$aquarium()')
  await b.evaluate(`(async () => { const { placeTank } = await import('/src/editor/tank.ts'); $S().applyDesign(placeTank($S().design, { x: 16.5, z: 0 })); $S().clearSelection(); return true })()`)
  await view(13, 1, 0, 13, 18, 12)
  check('the tank touching the curved wall turns those segments to aquarium glass', (await b.evaluate('$aquarium()')) > glassBefore, `${glassBefore} → ${await b.evaluate('$aquarium()')} glass vertices`)
  await key('l')
  await view(10, 0, 0, 10, 26, 6)
  await clickAt(await screen(9, 0, -2))
  const light = await b.evaluate('$S().design.lights[0]')
  check('a ceiling light goes in the round room, under its ceiling', light && Math.abs(light.position[1] - 2.94) < 1e-6 && light.position[0] === 9)
  await key('v')
  await view(10, 1, 0, 18, 14, 16)
  await shot('3-round-room-tank')

  // 6. Undo and redo
  const done = await b.evaluate('JSON.stringify({ rooms: $S().design.rooms, pieces: $S().design.pieces, tank: $S().design.tank, lights: $S().design.lights })')
  const n = (await steps())
  for (let i = 0; i < 4; i++) await key('z', 2)
  round = await b.evaluate('$S().design.rooms.find((r) => r.shape === "round")')
  check('undo takes back the light, the tank and the paint', (await b.evaluate('$S().design.lights.length')) === 0 && !(await b.evaluate('$S().design.tank')) && !round.materials.faces['curve-in'] && !round.materials.faces['curve-out'])
  for (let i = 0; i < 4; i++) await key('y', 2)
  check('redo puts them back', (await b.evaluate('JSON.stringify({ rooms: $S().design.rooms, pieces: $S().design.pieces, tank: $S().design.tank, lights: $S().design.lights })')) === done && (await steps()) === n)

  // 7. Reload: everything comes back; time the first frames with the round room and screens in view
  await b.waitFor(`window.__mansion.useAppStore.getState().toast?.message === 'Saved' || true`)
  await new Promise((r) => setTimeout(r, 1500)) // autosave writes a short while after the last change
  const t0 = Date.now()
  await b.reload()
  await page()
  await b.evaluate(H2)
  await b.waitFor(`!!$three()?.gl && $three().gl.info.render.frame > 0`, 30000)
  const firstFrame = Date.now() - t0
  const f0 = await b.evaluate('$three().gl.info.render.frame')
  await new Promise((r) => setTimeout(r, 3000))
  const framesIn3s = (await b.evaluate('$three().gl.info.render.frame')) - f0
  check('reloaded intact: rooms (round, screens, bookcase), pieces, tank and light', (await b.evaluate('JSON.stringify({ rooms: $S().design.rooms, pieces: $S().design.pieces, tank: $S().design.tank, lights: $S().design.lights })')) === done)
  check('saved as v7', (await b.evaluate('$S().design.version')) === 7)
  console.log(`FIRST-FRAMES reload → first frame ${firstFrame} ms, then ${framesIn3s} frames in 3 s (software GL, round room with 6 screens, 4 images, tank, bookcase, light)`)
  check('first frames appear after a reload (software timing reported)', firstFrame > 0 && framesIn3s > 0, `first frame ${firstFrame} ms · ${framesIn3s} frames in the next 3 s`)
  await view(10, 1.5, 0, 10, 2.6, 1.2)
  await b.waitFor(`$screens().filter((s) => s.showing).length === 4`, 15000)
  check('screens show their images after the reload', (await b.evaluate('$screens()')).filter((s) => s.showing).length === 4)

  // 8. Export, then open it where the images aren't: clear the library, delete the mansion, import
  await clickButton('My mansions')
  await b.waitFor(`!!$btn('More actions for Ideas wing')`)
  await clickButton('More actions for Ideas wing')
  await clickButton('Export as JSON')
  let exported = []
  for (let i = 0; i < 40 && exported.length === 0; i++) {
    await new Promise((r) => setTimeout(r, 250))
    exported = existsSync(DOWNLOADS) ? readdirSync(DOWNLOADS).filter((f) => f.endsWith('.json')) : []
  }
  const file = exported.length ? JSON.parse(readFileSync(join(DOWNLOADS, exported[0]), 'utf8')) : null
  check('the export carries the images the design uses', file?.embeddedImages?.length === 3 && file.embeddedImages.every((i) => typeof i.data === 'string' && i.data.length > 100), exported.join())
  await b.evaluate('$clearImages()')
  check('library emptied (as on another machine)', (await b.evaluate('$images()')).length === 0)
  await clickButton('More actions for Ideas wing')
  await clickButton('Delete mansion…')
  await b.waitFor(`!!document.querySelector('dialog[open]')`)
  await b.evaluate(`[...document.querySelectorAll('dialog[open] button')].find((e) => /^Delete/.test(e.textContent.trim()) && !/Export/.test(e.textContent)).click(), true`)
  await b.waitFor(`!$btn('More actions for Ideas wing')`)
  await setFiles('input[type=file]', [join(DOWNLOADS, exported[0])])
  await b.waitFor(`!!$btn('Open Ideas wing')`, 15000)
  check('re-importing restores its images to the library', (await b.evaluate('$images()')).length === 3)
  await clickButton('Open Ideas wing')
  await b.waitFor(`$S().design.name === 'Ideas wing' && !!$three()?.controls`)
  await b.evaluate(H2)
  await view(10, 1.5, 0, 10, 2.6, 1.2)
  await b.waitFor(`$screens().filter((s) => s.showing).length === 4`, 15000)
  check('the re-imported design opens complete: screens show their images', (await b.evaluate('$screens()')).filter((s) => s.showing).length === 4)
  check('and matches what was exported', (await b.evaluate('JSON.stringify({ rooms: $S().design.rooms, pieces: $S().design.pieces, tank: $S().design.tank, lights: $S().design.lights })')) === done)
  await shot('4-reimported')

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
