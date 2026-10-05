import assert from 'node:assert/strict'
import vm from 'node:vm'
import { test } from 'bun:test'
import * as ActualThree from 'three'

import { initialImageIndices, reelLayout } from '../src/components/nailong/viewport.ts'

const source = await Bun.file(new URL('../src/components/nailong/reel.ts', import.meta.url)).text()
const code = new Bun.Transpiler({ loader: 'ts' }).transformSync(
  source.replace(/^import .*\n/gm, '').replace('export function mountReel', 'function mountReel')
)

test('avatar overlay preserves ordinary links, authenticates messages and cleans up on back', async () => {
  const source = await Bun.file(
    new URL('../src/components/nailong/transition.ts', import.meta.url)
  ).text()
  const script = new Bun.Transpiler({ loader: 'ts' }).transformSync(
    source.replace('export function', 'function')
  )
  const timers = new Map(),
    messages = [],
    animations = []
  let id = 0,
    pushes = 0,
    backs = 0
  class Element extends EventTarget {
    children = []
    dataset = {}
    style = {}
    inert = false
    contentWindow = { postMessage: (data) => messages.push(data), focus() {} }
    append(...children) {
      this.children.push(...children)
    }
    appendChild(child) {
      this.append(child)
    }
    setAttribute() {}
    hasAttribute() {
      return false
    }
    focus() {
      document.activeElement = this
    }
    getBoundingClientRect() {
      return { width: 80 }
    }
    querySelectorAll() {
      return this.children
    }
    animate() {
      const animation = {
        cancel() {
          this.cancelled = true
        }
      }
      animations.push(animation)
      return animation
    }
    remove() {
      document.body.children = document.body.children.filter((child) => child !== this)
    }
  }
  const link = new Element(),
    background = new Element()
  const document = {
    title: 'Home',
    body: new Element(),
    activeElement: null,
    documentElement: { style: { overflow: '' }, classList: { contains: () => false } },
    querySelector: () => link,
    createElement: () => new Element()
  }
  document.body.append(background)
  const window = new EventTarget()
  const history = {
    state: null,
    pushState(state) {
      this.state = state
      pushes++
    },
    back() {
      backs++
    }
  }
  const setTimeout = (callback, duration) => {
    timers.set(++id, { callback, duration })
    return id
  }
  window.setTimeout = setTimeout
  vm.runInNewContext(script + '\nmountAvatarTransition()', {
    document,
    window,
    history,
    location: { origin: 'http://localhost' },
    HTMLElement: Element,
    AbortController,
    setTimeout,
    clearTimeout: (key) => timers.delete(key),
    innerWidth: 1440,
    matchMedia: () => ({ matches: false }),
    getComputedStyle: () => ({ gap: '6px', opacity: '.3', transform: 'none' })
  })
  const click = (ctrlKey = false) => {
    const event = new Event('click', { cancelable: true })
    Object.assign(event, { button: 0, ctrlKey })
    link.dispatchEvent(event)
    return event
  }
  assert.equal(click(true).defaultPrevented, false)
  click()
  click()
  assert.equal(pushes, 1)
  assert.equal(background.inert, true)
  const shell = document.body.children[1],
    [iframe, cover, back] = shell.children
  const send = (type, origin = 'http://localhost', source = iframe.contentWindow) => {
    const event = new Event('message')
    Object.assign(event, { origin, source, data: { type } })
    window.dispatchEvent(event)
  }
  send('nailong:prepared', 'http://other')
  send('nailong:prepared', 'http://localhost', {})
  assert.equal(messages.length, 0)
  send('nailong:prepared')
  assert.equal(messages[0].width, 80)
  send('nailong:reveal')
  send('nailong:reveal')
  assert.equal(animations.length, 2)
  for (const timer of [...timers.values()]) if (timer.duration === 650) timer.callback()
  assert.equal(cover.hidden, true)
  back.dispatchEvent(new Event('click'))
  assert.equal(backs, 1)
  history.state = null
  window.dispatchEvent(new Event('popstate'))
  assert.equal(document.body.children.length, 1)
  assert.equal(background.inert, false)
  assert.equal(document.documentElement.style.overflow, '')
  assert.equal(document.activeElement, link)
  assert.equal(document.title, 'Home')
  assert.equal(timers.size, 0)
  assert.ok(animations.every((animation) => animation.cancelled))
  history.state = { nailongOverlay: true }
  window.dispatchEvent(new Event('popstate'))
  assert.equal(document.body.children.length, 2)
  for (const timer of [...timers.values()]) if (timer.duration === 15000) timer.callback()
  assert.equal(document.body.children[1].children[1].hidden, true)
  assert.ok(document.body.children[1].children[0].src.includes('fallback=1'))
  window.dispatchEvent(new Event('pagehide'))
  assert.equal(document.body.children.length, 1)
})

function harness(width = 1440, height = 900, weaveWidth, embedded = false) {
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
    hasAttribute: () => embedded,
    classList: { contains: () => false, toggle() {} }
  }
  document.createElement = () => ({ getContext: () => ({ fillRect() {}, fillText() {} }) })
  const window = new EventTarget()
  const messages = []
  window.parent = { postMessage: (data) => messages.push(data) }
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
    load(src, ok, _progress, fail) {
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
    location: { origin: 'http://localhost', search: '' },
    URLSearchParams,
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
    messages,
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
test('embedded reel waits for an authenticated start and preserves the parent line scale', () => {
  const h = harness(1440, 900, undefined, true)
  h.complete()
  h.tick()
  h.tick()
  assert.equal(h.renders, 0)
  assert.deepEqual(
    h.messages.map((message) => message.type),
    ['nailong:prepared']
  )
  const send = (origin, source, width) => {
    const event = new Event('message')
    Object.assign(event, { origin, source, data: { type: 'nailong:start', width } })
    h.window.dispatchEvent(event)
    h.tick()
  }
  send('http://other', h.window.parent, 80)
  send('http://localhost', {}, 80)
  send('http://localhost', h.window.parent, NaN)
  assert.equal(h.renders, 0)
  send('http://localhost', h.window.parent, 80)
  assert.ok(h.renders > 0)
  assert.equal(h.startScale, 80 / 1440)
  send('http://localhost', h.window.parent, 12)
  assert.equal(h.startScale, 80 / 1440)
  h.window.dispatchEvent(new Event('pagehide'))
  assert.equal(h.disposed, true)
})

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
    window.parent = window
    window.setTimeout = (callback, duration) => {
      timers.set(++id, { callback, duration })
      return id
    }
    const clearTimeout = (key) => timers.delete(key)
    vm.runInNewContext(bootstrap, {
      window,
      document,
      clearTimeout,
      Event,
      URLSearchParams,
      location: { search: '' }
    })
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
