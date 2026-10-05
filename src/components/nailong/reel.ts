import * as THREE from 'three'

import { fragmentShader, vertexShader } from './shaders'
import { reelLayout } from './viewport'

interface ReelImage {
  src: string
  name: string
  width: number
  height: number
}
interface TextureEntry {
  texture?: THREE.Texture
  loading: boolean
  cancelled: boolean
}
const mod = (value: number, length: number) => ((value % length) + length) % length

function ribbonGeometry(width: number, height: number) {
  const threads = 26,
    segments = 20,
    columns = segments + 1
  const positions: number[] = [],
    uvs: number[] = [],
    rims: number[] = [],
    ids: number[] = [],
    indices: number[] = []
  for (let thread = 0; thread < threads; thread++) {
    const base = positions.length / 3
    for (let row = 0; row < 2; row++) {
      for (let column = 0; column < columns; column++) {
        const x = column / segments,
          y = (thread + row) / threads
        positions.push((x - 0.5) * width, (y - 0.5) * height, 0)
        uvs.push(x, y)
        rims.push(row === 0 ? -1 : 1)
        ids.push(thread)
      }
    }
    for (let column = 0; column < segments; column++) {
      const bottom = base + column,
        top = bottom + columns
      indices.push(bottom, bottom + 1, top, bottom + 1, top + 1, top)
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setAttribute('aRim', new THREE.Float32BufferAttribute(rims, 1))
  geometry.setAttribute('aThread', new THREE.Float32BufferAttribute(ids, 1))
  geometry.setIndex(indices)
  return geometry
}

function placeholder() {
  const canvas = document.createElement('canvas')
  canvas.width = 600
  canvas.height = 360
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#eadb9b'
  ctx.fillRect(0, 0, 600, 360)
  ctx.fillStyle = '#635c42'
  ctx.textAlign = 'center'
  ctx.font = '20px sans-serif'
  ctx.fillText('NAILONG', 300, 170)
  ctx.font = '13px sans-serif'
  ctx.fillText('图片暂未加载', 300, 200)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

// Stable per-file seed: adding an image doesn't change existing ribbon patterns.
function seed(name: string) {
  let value = 0
  for (const char of name) value = (Math.imul(value, 31) + char.charCodeAt(0)) >>> 0
  return (value % 10000) / 1000
}

export function mountReel() {
  const stage = document.querySelector<HTMLElement>('#nailong-stage')
  if (!stage) return
  if (document.documentElement.dataset.nailongEntry === 'fallback') return
  const images: ReelImage[] = JSON.parse(stage.dataset.images ?? '[]')
  const themeButton = document.querySelector<HTMLButtonElement>('#nailong-theme')!
  const current = document.querySelector<HTMLElement>('#nailong-current')!
  const caption = document.querySelector<HTMLElement>('#nailong-caption')!
  const abort = new AbortController()
  const options = { signal: abort.signal }
  const syncButton = () => {
    const dark = document.documentElement.classList.contains('dark')
    themeButton.setAttribute('aria-label', dark ? '切换为浅色主题' : '切换为深色主题')
    themeButton.setAttribute('aria-pressed', String(dark))
  }
  themeButton.addEventListener('click', () => {
    const dark = !document.documentElement.classList.contains('dark')
    document.documentElement.classList.toggle('dark', dark)
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', dark ? '#0B0B10' : '#F7F5ED')
    try {
      localStorage.setItem('theme', dark ? 'dark' : 'light')
    } catch {
      /* Theme still works without storage. */
    }
    syncButton()
  })
  syncButton()
  const fallback = () => document.dispatchEvent(new Event('nailong:fallback'))
  if (!images.length) {
    fallback()
    return
  }

  let renderer: THREE.WebGLRenderer
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  } catch {
    fallback()
    return // Server-rendered gallery remains usable, including without JavaScript.
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 100)
  camera.position.z = 5
  const blank = placeholder()
  const cache = new Map<number, TextureEntry>()
  const loader = new THREE.TextureLoader()
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
  const shared = {
    uEntrance: { value: 0 },
    uEntranceStartScale: { value: 0.02 },
    uTime: { value: 0 },
    uWave: { value: 0 },
    uPitch: { value: 1 },
    uHeight: { value: 1 },
    uViewport: { value: new THREE.Vector2(1, 1) },
    uMotion: { value: reduced.matches ? 0 : 1 },
    uCardSize: { value: new THREE.Vector2(1, 1) },
    uBackground: { value: new THREE.Color() }
  }
  let geometry = ribbonGeometry(1, 1)
  let slots: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>[] = []
  let pitch = 1,
    worldWidth = 1,
    pixelWidth = 1
  // Position is measured in card pitches, independently of total image count.
  let target = 0,
    position = 0,
    lastPosition = 0,
    lastTime = performance.now(),
    frame = 0
  let ready = false
  let entranceStarted = 0
  let interactive = false
  const startupDeadline = performance.now() + 15000
  let disposed = false,
    dragging = false,
    lastX = 0,
    lastY = 0,
    displayed = -1

  function updateTheme() {
    shared.uBackground.value.set(
      document.documentElement.classList.contains('dark') ? '#0b0b10' : '#f7f5ed'
    )
    syncButton()
  }
  const observer = new MutationObserver(updateTheme)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  updateTheme()

  function requestTexture(index: number) {
    const existing = cache.get(index)
    if (existing) return existing.texture ?? blank
    const entry: TextureEntry = { loading: true, cancelled: false }
    cache.set(index, entry)
    loader.load(
      images[index].src,
      (texture) => {
        if (entry.cancelled || disposed) {
          texture.dispose()
          return
        }
        texture.colorSpace = THREE.SRGBColorSpace
        texture.minFilter = THREE.LinearFilter
        texture.generateMipmaps = false
        entry.texture = texture
        entry.loading = false
      },
      undefined,
      () => {
        entry.loading = false
      }
    )
    return blank
  }

  function updateSlots() {
    const anchor = Math.floor(position),
      half = Math.floor(slots.length / 2)
    const needed = new Set<number>()
    for (let i = 0; i < slots.length; i++) {
      const logical = anchor + i - half,
        index = mod(logical, images.length)
      const mesh = slots[i],
        image = images[index]
      needed.add(index)
      mesh.position.x = (logical - position) * pitch
      mesh.material.uniforms.uMap.value = requestTexture(index)
      mesh.material.uniforms.uSeed.value = seed(image.name)
      const aspect = image.width / image.height,
        cardAspect = 5 / 3
      mesh.material.uniforms.uCrop.value.set(
        aspect > cardAspect ? cardAspect / aspect : 1,
        aspect > cardAspect ? 1 : aspect / cardAspect
      )
    }
    // One extra image on each side is prefetched. Cache size tracks viewport, not collection size.
    needed.add(mod(anchor - half - 1, images.length))
    needed.add(mod(anchor + slots.length - half, images.length))
    for (const index of needed) requestTexture(index)
    for (const [index, entry] of cache) {
      if (!needed.has(index)) {
        entry.cancelled = true
        entry.texture?.dispose()
        cache.delete(index)
      }
    }
    const index = mod(Math.round(position), images.length)
    if (displayed !== index) {
      current.textContent = String(index + 1).padStart(2, '0')
      caption.textContent = images[index].name
      displayed = index
    }
  }

  function resize() {
    pixelWidth = Math.max(1, stage!.clientWidth)
    const height = Math.max(1, stage!.clientHeight)
    renderer.setSize(pixelWidth, height)
    camera.aspect = pixelWidth / height
    camera.updateProjectionMatrix()
    const layout = reelLayout(pixelWidth, height)
    worldWidth = layout.worldWidth
    const cardWidth = layout.cardWidth
    const cardHeight = (cardWidth * 3) / 5
    pitch = layout.pitch
    shared.uPitch.value = pitch
    shared.uHeight.value = cardHeight
    shared.uViewport.value.set(pixelWidth, height)
    shared.uCardSize.value.set(
      (cardWidth / worldWidth) * pixelWidth,
      (cardHeight / layout.worldHeight) * height
    )
    for (const mesh of slots) {
      scene.remove(mesh)
      mesh.material.dispose()
    }
    geometry.dispose()
    geometry = ribbonGeometry(cardWidth, cardHeight)
    const count = layout.count
    slots = Array.from({ length: count }, () => {
      const material = new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        transparent: true,
        side: THREE.DoubleSide,
        depthTest: false,
        depthWrite: false,
        uniforms: {
          ...shared,
          uMap: { value: blank },
          uSeed: { value: 0 },
          uCrop: { value: new THREE.Vector2(1, 1) }
        }
      })
      const mesh = new THREE.Mesh(geometry, material)
      mesh.frustumCulled = false
      scene.add(mesh)
      return mesh
    })
    updateSlots()
  }

  function animate(now: number) {
    if (disposed) return
    if (!ready) {
      const entries = [...cache.values()]
      if (entries.some((entry) => !entry.loading && !entry.texture) || now > startupDeadline) {
        dispose()
        return
      }
      if (entries.some((entry) => entry.loading)) {
        frame = requestAnimationFrame(animate)
        return
      }
      try {
        const weave = document.querySelector<HTMLElement>('.entry-weave')
        if (weave) {
          const style = getComputedStyle(weave)
          const width = weave.getBoundingClientRect().width
          weave.style.setProperty('--weave-width', `${width}px`)
          weave.style.setProperty('--weave-gap', style.gap)
          weave.style.setProperty('--weave-opacity', style.opacity)
          for (const line of weave.querySelectorAll<HTMLElement>('span')) {
            const lineStyle = getComputedStyle(line)
            line.style.transform = lineStyle.transform
            line.style.opacity = lineStyle.opacity
            line.style.animation = 'none'
          }
          shared.uEntranceStartScale.value = THREE.MathUtils.clamp(width / pixelWidth, 0.001, 1)
        }
        updateSlots()
        renderer.render(scene, camera)
        if (shaderFailed) {
          dispose()
          return
        }
        stage!.appendChild(renderer.domElement)
        stage!.dataset.ready = ''
        ready = true
        entranceStarted = now
        document.dispatchEvent(new Event('nailong:reveal'))
        lastTime = now
      } catch {
        dispose()
        return
      }
    }
    const dt = Math.min((now - lastTime) / 1000, 0.05)
    lastTime = now
    shared.uEntrance.value = Math.min((now - entranceStarted) / (reduced.matches ? 150 : 650), 1)
    if (!interactive && shared.uEntrance.value === 1) {
      interactive = true
      stage!.dataset.interactive = ''
    }
    position += (target - position) * (reduced.matches ? 1 : 1 - Math.exp(-5 * dt))
    const pixelsPerFrame =
      ((((position - lastPosition) * pitch) / worldWidth) * pixelWidth) / Math.max(dt * 60, 0.001)
    lastPosition = position
    const wave = reduced.matches ? 0 : THREE.MathUtils.clamp(pixelsPerFrame * 0.011, -1.6, 1.6)
    shared.uWave.value = reduced.matches
      ? 0
      : shared.uWave.value + (wave - shared.uWave.value) * (1 - Math.exp(-8 * dt))
    shared.uTime.value = now / 1000
    shared.uMotion.value = reduced.matches ? 0 : 1
    // Bound numeric magnitude without changing the cycle or the target distance.
    if (Math.abs(position) > images.length * 100) {
      const cycles = Math.trunc(position / images.length) * images.length
      position -= cycles
      target -= cycles
      lastPosition -= cycles
    }
    updateSlots()
    renderer.render(scene, camera)
    frame = requestAnimationFrame(animate)
  }

  function move(pixels: number) {
    target += (pixels * worldWidth) / pixelWidth / pitch
  }
  stage.addEventListener(
    'wheel',
    (event) => {
      if (!interactive || event.ctrlKey) return
      event.preventDefault()
      const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX
      move(
        THREE.MathUtils.clamp(
          delta * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? stage.clientHeight : 1),
          -pixelWidth,
          pixelWidth
        )
      )
    },
    { ...options, passive: false }
  )
  stage.addEventListener(
    'pointerdown',
    (event) => {
      if (!interactive || event.button !== 0) return
      dragging = true
      lastX = event.clientX
      lastY = event.clientY
      stage.setPointerCapture(event.pointerId)
      stage.dataset.dragging = ''
    },
    options
  )
  stage.addEventListener(
    'pointermove',
    (event) => {
      if (!dragging) return
      const dx = event.clientX - lastX,
        dy = event.clientY - lastY
      move(-(Math.abs(dx) > Math.abs(dy) ? dx : dy) * (event.pointerType === 'touch' ? 1.5 : 1))
      lastX = event.clientX
      lastY = event.clientY
    },
    options
  )
  const endDrag = () => {
    dragging = false
    delete stage.dataset.dragging
  }
  stage.addEventListener('pointerup', endDrag, options)
  stage.addEventListener('pointercancel', endDrag, options)
  stage.addEventListener('lostpointercapture', endDrag, options)
  window.addEventListener(
    'keydown',
    (event) => {
      if (!interactive) return
      if (
        event.target instanceof HTMLElement &&
        (event.target.matches('button, a, input, textarea, select') ||
          event.target.isContentEditable)
      )
        return
      if (['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(event.key)) {
        event.preventDefault()
        target += ['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : -1
      }
    },
    options
  )
  window.addEventListener('resize', resize, options)
  document.addEventListener(
    'visibilitychange',
    () => {
      cancelAnimationFrame(frame)
      if (!document.hidden) {
        lastTime = performance.now()
        frame = requestAnimationFrame(animate)
      }
    },
    options
  )

  function dispose() {
    if (disposed) return
    disposed = true
    cancelAnimationFrame(frame)
    abort.abort()
    observer.disconnect()
    for (const entry of cache.values()) {
      entry.cancelled = true
      entry.texture?.dispose()
    }
    for (const mesh of slots) mesh.material.dispose()
    geometry.dispose()
    blank.dispose()
    renderer.dispose()
    renderer.domElement.remove()
    delete stage!.dataset.ready
    delete stage!.dataset.interactive
    fallback()
  }
  renderer.domElement.addEventListener(
    'webglcontextlost',
    (event) => {
      event.preventDefault()
      dispose()
    },
    options
  )
  document.addEventListener('nailong:timeout', dispose, { ...options, once: true })
  document.addEventListener('astro:before-swap', dispose, { ...options, once: true })
  // Keep GPU resources alive when entering the back/forward cache; resume once restored.
  window.addEventListener(
    'pagehide',
    (event) => {
      if (event.persisted) cancelAnimationFrame(frame)
      else dispose()
    },
    options
  )
  window.addEventListener(
    'pageshow',
    (event) => {
      if (event.persisted && !disposed) {
        cancelAnimationFrame(frame)
        lastTime = performance.now()
        frame = requestAnimationFrame(animate)
      }
    },
    options
  )
  let shaderFailed = false
  try {
    resize()
    renderer.debug.onShaderError = () => {
      shaderFailed = true
    }
    renderer.compile(scene, camera)
    if (shaderFailed) {
      dispose()
      return
    }
    frame = requestAnimationFrame(animate)
  } catch {
    dispose()
  }
}
