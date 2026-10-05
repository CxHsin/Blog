interface Particle {
  homeX: number
  homeY: number
  x: number
  y: number
  vx: number
  vy: number
}

const mounted = new WeakSet<HTMLElement>()

export function mountParticleWordmarks() {
  document.querySelectorAll<HTMLElement>('[data-particle-wordmark]').forEach((element) => {
    if (mounted.has(element)) return
    const canvas = element.querySelector('canvas')
    const context = canvas?.getContext('2d')
    const mask = document.createElement('canvas')
    const maskContext = mask.getContext('2d', { willReadFrequently: true })
    if (!canvas || !context || !maskContext) return
    mounted.add(element)

    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)')
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const narrowScreen = window.matchMedia('(max-width: 640px)')
    let particles: Particle[] = []
    let width = 0
    let height = 0
    let color = ''
    let radius = 1
    let frame = 0
    let previousTime = 0
    let visible = false
    let disposed = false
    let pointer: { x: number; y: number } | null = null

    const interactive = () => finePointer.matches && !reducedMotion.matches && !narrowScreen.matches
    const stop = () => {
      cancelAnimationFrame(frame)
      frame = 0
      previousTime = 0
    }
    const draw = () => {
      context.clearRect(0, 0, width, height)
      context.fillStyle = color
      context.beginPath()
      for (const particle of particles) {
        context.moveTo(particle.x + radius, particle.y)
        context.arc(particle.x, particle.y, radius, 0, Math.PI * 2)
      }
      context.fill()
    }
    const reset = () => {
      for (const particle of particles) {
        particle.x = particle.homeX
        particle.y = particle.homeY
        particle.vx = particle.vy = 0
      }
    }
    const tick = (time: number) => {
      frame = 0
      if (disposed || !visible || document.hidden || !interactive()) return
      const step = previousTime ? Math.min((time - previousTime) / 16.667, 2) : 1
      previousTime = time
      const influence = Math.min(90, width * 0.18)
      let moving = false
      for (const particle of particles) {
        let fx = (particle.homeX - particle.x) * 0.035
        let fy = (particle.homeY - particle.y) * 0.035
        if (pointer) {
          const dx = particle.x - pointer.x
          const dy = particle.y - pointer.y
          const distance = Math.hypot(dx, dy)
          if (distance < influence) {
            const force = (1 - distance / influence) * 2.4
            fx += (distance > 0.01 ? dx / distance : 1) * force
            fy += (distance > 0.01 ? dy / distance : 0) * force
          }
        }
        const damping = Math.pow(0.82, step)
        particle.vx = (particle.vx + fx * step) * damping
        particle.vy = (particle.vy + fy * step) * damping
        particle.x += particle.vx * step
        particle.y += particle.vy * step
        if (Math.hypot(particle.vx, particle.vy) > 0.03) moving = true
        if (!pointer) {
          if (Math.hypot(particle.homeX - particle.x, particle.homeY - particle.y) > 0.1) {
            moving = true
          } else if (Math.hypot(particle.vx, particle.vy) <= 0.03) {
            particle.x = particle.homeX
            particle.y = particle.homeY
            particle.vx = particle.vy = 0
          }
        }
      }
      draw()
      if (moving) frame = requestAnimationFrame(tick)
      else previousTime = 0
    }
    const wake = () => {
      if (!frame && visible && !document.hidden && interactive() && !disposed) {
        frame = requestAnimationFrame(tick)
      }
    }
    const resize = () => {
      stop()
      pointer = null
      width = element.clientWidth
      height = element.clientHeight
      if (!width || !height) return
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(width * ratio)
      canvas.height = Math.round(height * ratio)
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
      mask.width = Math.ceil(width)
      mask.height = Math.ceil(height)
      const fontSize = Math.min(height * 0.86, width / 2.9)
      maskContext.font = `900 ${fontSize}px Arial, sans-serif`
      const metrics = maskContext.measureText('CXIN')
      maskContext.fillStyle = '#fff'
      maskContext.save()
      maskContext.translate(width * 0.05, 0)
      maskContext.scale((width * 0.9) / metrics.width, 1)
      maskContext.fillText(
        'CXIN',
        0,
        (height + metrics.actualBoundingBoxAscent - metrics.actualBoundingBoxDescent) / 2
      )
      maskContext.restore()
      const pixels = maskContext.getImageData(0, 0, mask.width, mask.height).data
      // Bound the entire sampling grid, rather than truncating one side of the text.
      let spacing = Math.max(3, Math.ceil(Math.sqrt((width * height) / 4000)))
      while (Math.ceil(mask.width / spacing) * Math.ceil(mask.height / spacing) > 4000) {
        spacing += 1
      }
      radius = width < 480 ? 0.8 : 1
      particles = []
      for (let y = Math.floor(spacing / 2); y < mask.height; y += spacing) {
        for (let x = Math.floor(spacing / 2); x < mask.width; x += spacing) {
          if (pixels[(y * mask.width + x) * 4 + 3] > 128) {
            particles.push({ homeX: x, homeY: y, x, y, vx: 0, vy: 0 })
          }
        }
      }
      color = getComputedStyle(element).color
      draw()
      element.dataset.ready = ''
    }
    const move = (event: PointerEvent) => {
      if (!interactive() || event.pointerType === 'touch') return
      const bounds = canvas.getBoundingClientRect()
      pointer = { x: event.clientX - bounds.left, y: event.clientY - bounds.top }
      wake()
    }
    const leave = () => {
      pointer = null
      wake()
    }
    const modeChanged = () => {
      pointer = null
      stop()
      reset()
      draw()
    }
    const visibilityChanged = () => {
      pointer = null
      if (document.hidden) stop()
      else wake()
    }
    const resizeObserver = new ResizeObserver(resize)
    const intersectionObserver = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
      if (visible) wake()
      else {
        pointer = null
        stop()
      }
    })
    const themeObserver = new MutationObserver(() => {
      color = getComputedStyle(element).color
      draw()
    })
    const cleanup = () => {
      disposed = true
      stop()
      resizeObserver.disconnect()
      intersectionObserver.disconnect()
      themeObserver.disconnect()
      element.removeEventListener('pointermove', move)
      element.removeEventListener('pointerleave', leave)
      element.removeEventListener('pointercancel', leave)
      finePointer.removeEventListener('change', modeChanged)
      reducedMotion.removeEventListener('change', modeChanged)
      narrowScreen.removeEventListener('change', modeChanged)
      document.removeEventListener('visibilitychange', visibilityChanged)
      document.removeEventListener('astro:before-swap', cleanup)
      window.removeEventListener('pagehide', pageHide)
      window.removeEventListener('pageshow', pageShow)
      mounted.delete(element)
    }
    // Keep observers intact for a page restored from the browser's back/forward cache.
    const pageHide = (event: PageTransitionEvent) => {
      if (event.persisted) {
        pointer = null
        stop()
      } else cleanup()
    }
    const pageShow = () => wake()

    element.addEventListener('pointermove', move)
    element.addEventListener('pointerleave', leave)
    element.addEventListener('pointercancel', leave)
    finePointer.addEventListener('change', modeChanged)
    reducedMotion.addEventListener('change', modeChanged)
    narrowScreen.addEventListener('change', modeChanged)
    document.addEventListener('visibilitychange', visibilityChanged)
    document.addEventListener('astro:before-swap', cleanup)
    window.addEventListener('pagehide', pageHide)
    window.addEventListener('pageshow', pageShow)
    resizeObserver.observe(element)
    intersectionObserver.observe(element)
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    })
    resize()
  })
}
