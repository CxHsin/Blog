import assert from 'node:assert/strict'
import vm from 'node:vm'
import { test } from 'bun:test'
import * as ActualThree from 'three'

import { initialImageIndices, reelLayout } from '../src/components/nailong/viewport.ts'

const source = await Bun.file(new URL('../src/components/nailong/reel.ts', import.meta.url)).text()
const code = new Bun.Transpiler({ loader: 'ts' }).transformSync(
  source.replace(/^import .*\n/gm, '').replace('export function mountReel', 'function mountReel')
)
function harness(width = 1440, height = 900, weaveWidth) {
  let now = 0,
    next = 0,
    renders = 0,
    disposed = false
  const frames = new Map(),
    loads = []
  class Element extends EventTarget {
    dataset = {}
    clientWidth = width
    clientHeight = height
    textContent = ''
    children = []
    setAttribute() {}
    matches() {
      return false
    }
    setPointerCapture() {}
    appendChild(child) {
      this.children.push(child)
    }
  }
  const stage = new Element()
  stage.dataset.images = JSON.stringify(
    Array.from({ length: 20 }, (_, i) => ({
      src: `image-${i}`,
      name: `${i}`,
      width: 500,
      height: 300
    }))
  )
  const nodes = new Map([
    ['#nailong-stage', stage],
    ['#nailong-theme', new Element()],
    ['#nailong-current', new Element()],
    ['#nailong-caption', new Element()]
  ])
  const properties = new Map()
  const line = { style: {}, computed: { transform: 'matrix(0.94, 0, 0, 1, 0, 0)', opacity: '0.7' } }
  if (weaveWidth !== undefined)
    nodes.set('.entry-weave', {
      style: { setProperty: (key, value) => properties.set(key, value) },
      computed: { gap: '6px', opacity: '0.2' },
      getBoundingClientRect: () => ({ width: weaveWidth }),
      querySelectorAll: () => [line]
    })
  let startScale
  const document = new EventTarget()
  document.querySelector = (k) => nodes.get(k)
  document.hidden = false
  document.documentElement = {
    dataset: { nailongEntry: 'loading' },
    classList: { contains: () => false, toggle() {} }
  }
  document.createElement = () => ({ getContext: () => ({ fillRect() {}, fillText() {} }) })
  const window = new EventTarget()
  window.devicePixelRatio = 1
  window.matchMedia = () => ({ matches: false })
  class Renderer {
    domElement = new Element()
    debug = {}
    constructor() {
      this.domElement.remove = () => {
        stage.children = []
      }
    }
    setPixelRatio() {}
    setSize() {}
    compile() {}
    render(scene) {
      assert.ok(
        scene.children.every((m) => m.material.uniforms.uMap.value.image?.loaded),
        'rendered unloaded texture'
      )
      startScale = scene.children[0].material.uniforms.uEntranceStartScale.value
      renders++
    }
    dispose() {
      disposed = true
    }
  }
  class Loader {
    load(src, ok, progress, fail) {
      loads.push({ src, ok, fail })
    }
  }
  const context = vm.createContext({
    Event,
    getComputedStyle: (element) => element.computed,
    THREE: { ...ActualThree, WebGLRenderer: Renderer, TextureLoader: Loader },
    reelLayout,
    vertexShader: '',
    fragmentShader: '',
    document,
    window,
    HTMLElement: Element,
    AbortController,
    MutationObserver: class {
      observe() {}
      disconnect() {}
    },
    localStorage: { setItem() {} },
    performance: { now: () => now },
    requestAnimationFrame: (cb) => {
      frames.set(++next, cb)
      return next
    },
    cancelAnimationFrame: (id) => frames.delete(id)
  })
  vm.runInContext(code + '\nmountReel()', context)
  return {
    stage,
    properties,
    line,
    get startScale() {
      return startScale
    },
    window,
    document,
    loads,
    get renders() {
      return renders
    },
    get disposed() {
      return disposed
    },
    tick(ms = 16) {
      now += ms
      const callbacks = [...frames.values()]
      frames.clear()
      callbacks.forEach((cb) => cb(now))
    },
    complete() {
      loads.forEach((l) => l.ok(new ActualThree.Texture({ loaded: true })))
    }
  }
}
test('startup waits for textures and entrance before allowing reel input', () => {
  for (const [w, h] of [
    [1440, 900],
    [390, 844],
    [844, 390],
    [2560, 1080]
  ]) {
    const harn = harness(w, h)
    const indices = initialImageIndices(20, w, h)
    assert.equal(indices[0], 0)
    assert.deepEqual(new Set(indices), new Set(harn.loads.map((l) => Number(l.src.slice(6)))))
    harn.tick()
    assert.equal(harn.stage.dataset.ready, undefined)
    assert.equal(harn.renders, 0)
    const wheel = new Event('wheel', { cancelable: true })
    harn.stage.dispatchEvent(wheel)
    assert.equal(wheel.defaultPrevented, false)
    harn.complete()
    harn.tick()
    assert.equal(harn.stage.dataset.ready, '')
    assert.ok(harn.renders > 0)
    assert.equal(harn.stage.dataset.interactive, undefined)
    for (let i = 0; i < 14; i++) harn.tick(50)
    assert.equal(harn.stage.dataset.interactive, '')
    const activeWheel = new Event('wheel', { cancelable: true })
    Object.assign(activeWheel, { deltaX: 0, deltaY: 0, deltaMode: 0 })
    harn.stage.dispatchEvent(activeWheel)
    assert.equal(activeWheel.defaultPrevented, true)
    harn.window.dispatchEvent(new Event('resize'))
    harn.tick()
    assert.equal(harn.stage.children.length, 1)
  }
})
test('failure, timeout and navigation release the renderer without exposing an unloaded reel', () => {
  const failed = harness()
  failed.loads[0].fail()
  failed.tick()
  assert.equal(failed.disposed, true)
  assert.equal(failed.stage.dataset.ready, undefined)
  const timeout = harness()
  timeout.tick(15001)
  assert.equal(timeout.disposed, true)
  assert.equal(timeout.renders, 0)
  const leaving = harness()
  leaving.document.dispatchEvent(new Event('astro:before-swap'))
  leaving.complete()
  leaving.tick()
  assert.equal(leaving.stage.children.length, 0)
  assert.deepEqual(initialImageIndices(0, 390, 844), [])
  assert.deepEqual(initialImageIndices(1, 390, 844), [0])
})

test('independent entry watchdog reveals a fallback when the WebGL module never loads', async () => {
  const bootstrap = await Bun.file(
    new URL('../public/scripts/nailong-entry.js', import.meta.url)
  ).text()
  const setup = () => {
    const timers = new Map()
    let id = 0
    const root = { dataset: {} }
    const document = new EventTarget()
    document.documentElement = root
    const window = new EventTarget()
    window.setTimeout = (callback, duration) => {
      timers.set(++id, { callback, duration })
      return id
    }
    const clearTimeout = (key) => timers.delete(key)
    vm.runInNewContext(bootstrap, { window, document, clearTimeout, Event })
    return {
      root,
      document,
      window,
      timers,
      fire(duration) {
        for (const [key, timer] of [...timers]) {
          if (timer.duration === duration) {
            timers.delete(key)
            timer.callback()
          }
        }
      }
    }
  }
  const failed = setup()
  assert.equal(failed.root.dataset.nailongEntry, 'loading')
  failed.fire(1000)
  assert.equal(failed.root.dataset.nailongWaiting, '')
  failed.fire(15000)
  assert.equal(failed.root.dataset.nailongEntry, 'fallback')
  assert.equal(failed.root.dataset.nailongWaiting, undefined)
  assert.equal(failed.timers.size, 0)
  const success = setup()
  success.document.dispatchEvent(new Event('nailong:reveal'))
  assert.equal(success.root.dataset.nailongEntry, 'ready')
  assert.equal(success.timers.size, 0)
  const bfcache = setup()
  bfcache.window.dispatchEvent(new Event('pagehide'))
  assert.equal(bfcache.timers.size, 0)
  const restored = new Event('pageshow')
  restored.persisted = true
  bfcache.window.dispatchEvent(restored)
  assert.equal(bfcache.timers.size, 2)
})

test('avatar entry preserves modified clicks, navigates once and resets on history restore', async () => {
  const source = await Bun.file(
    new URL('../src/components/nailong/transition.ts', import.meta.url)
  ).text()
  const code = new Bun.Transpiler({ loader: 'ts' }).transformSync(
    source.replace('export function', 'function')
  )
  const setup = (reduced = false) => {
    const timers = new Map(),
      animations = [],
      navigations = []
    let id = 0
    const nodes = []
    class Element extends EventTarget {
      style = {}
      appendChild() {}
      target = ''
      href = '/nailong'
      hasAttribute() {
        return false
      }
      querySelector() {
        return null
      }
      getBoundingClientRect() {
        return { x: 200, y: 100, width: 112, height: 112 }
      }
      setAttribute() {}
      animate(frames, options) {
        const animation = {
          frames,
          options,
          cancelled: false,
          cancel() {
            this.cancelled = true
          }
        }
        animations.push(animation)
        return animation
      }
      remove() {
        const index = nodes.indexOf(this)
        if (index >= 0) nodes.splice(index, 1)
      }
    }
    const link = new Element()
    const window = new EventTarget()
    window.matchMedia = () => ({ matches: reduced })
    window.location = { assign: (href) => navigations.push(href) }
    window.setTimeout = (callback, duration) => {
      timers.set(++id, { callback, duration })
      return id
    }
    const document = {
      querySelector: () => link,
      createElement: () => new Element(),
      body: { appendChild: (el) => nodes.push(el) }
    }
    const storage = new Map()
    vm.runInNewContext(code + '\nmountAvatarTransition()', {
      document,
      window,
      sessionStorage: { setItem: (key, value) => storage.set(key, value) },
      innerWidth: 1440,
      innerHeight: 900,
      clearTimeout: (key) => timers.delete(key)
    })
    return {
      link,
      window,
      nodes,
      timers,
      animations,
      navigations,
      storage,
      click(properties = {}) {
        const event = new Event('click', { cancelable: true })
        Object.assign(event, { button: 0, ...properties })
        link.dispatchEvent(event)
        return event
      },
      fire(duration) {
        for (const [key, timer] of [...timers])
          if (timer.duration === duration) {
            timers.delete(key)
            timer.callback()
          }
      }
    }
  }
  for (const properties of [
    { ctrlKey: true },
    { metaKey: true },
    { shiftKey: true },
    { altKey: true },
    { button: 1 }
  ]) {
    const entry = setup()
    assert.equal(entry.click(properties).defaultPrevented, false)
    assert.equal(entry.nodes.length, 0)
  }
  const blank = setup()
  blank.link.target = '_blank'
  assert.equal(blank.click().defaultPrevented, false)
  const entry = setup()
  assert.equal(entry.click().defaultPrevented, true)
  entry.click()
  assert.equal(entry.nodes.length, 2)
  assert.equal(entry.animations[0].options.duration, 220)
  assert.equal(entry.animations[1].frames[0].left, '256px')
  assert.equal(entry.animations[1].frames[1].left, '720px')
  entry.fire(220)
  assert.equal(JSON.parse(entry.storage.get('nailong-entry-handoff')).width, 240)
  assert.deepEqual(entry.navigations, ['/nailong'])
  entry.window.dispatchEvent(new Event('pagehide'))
  entry.window.dispatchEvent(new Event('pageshow'))
  assert.equal(entry.nodes.length, 0)
  assert.equal(entry.timers.size, 0)
  assert.ok(entry.animations.every((a) => a.cancelled))
  entry.click()
  assert.equal(entry.nodes.length, 2)
  const reduced = setup(true)
  reduced.click()
  assert.equal(reduced.animations[0].options.duration, 120)
  assert.equal(reduced.animations[0].frames[0].clipPath, undefined)
  reduced.fire(120)
  assert.deepEqual(reduced.navigations, ['/nailong'])
  reduced.fire(10000)
  assert.equal(reduced.nodes.length, 0)
})

test('reel captures the waiting lines current size and freezes their motion before revealing', () => {
  for (const width of [12, 80, 240]) {
    const entry = harness(1440, 900, width)
    entry.complete()
    entry.tick()
    assert.equal(entry.properties.get('--weave-width'), `${width}px`)
    assert.equal(entry.properties.get('--weave-gap'), '6px')
    assert.equal(entry.properties.get('--weave-opacity'), '0.2')
    assert.equal(entry.line.style.animation, 'none')
    assert.equal(entry.line.style.transform, entry.line.computed.transform)
    assert.equal(entry.startScale, width / 1440)
    assert.equal(entry.stage.dataset.ready, '')
  }
})
