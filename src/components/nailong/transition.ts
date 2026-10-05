export function mountAvatarTransition() {
  const link = document.querySelector<HTMLAnchorElement>('a[data-nailong-entry]')
  if (!link) return
  let leaving = false
  let navigation = 0
  let recovery = 0
  let overlay: HTMLElement | undefined
  let avatar: HTMLElement | undefined
  const animations: Animation[] = []
  const reset = () => {
    clearTimeout(navigation)
    clearTimeout(recovery)
    animations.splice(0).forEach((animation) => animation.cancel())
    overlay?.remove()
    avatar?.remove()
    leaving = false
  }
  window.addEventListener('pagehide', reset)
  window.addEventListener('pageshow', reset)
  link.addEventListener('click', (event) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      link.target === '_blank' ||
      link.hasAttribute('download')
    )
      return
    event.preventDefault()
    if (leaving) return
    leaving = true
    try {
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      const duration = reduced ? 120 : 220
      const image = link.querySelector('img')
      const bounds = (image ?? link).getBoundingClientRect()
      const x = bounds.x + bounds.width / 2
      const y = bounds.y + bounds.height / 2
      const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y))
      overlay = document.createElement('div')
      overlay.className = 'nailong-departure'
      overlay.setAttribute('aria-hidden', 'true')
      document.body.appendChild(overlay)
      animations.push(
        overlay.animate(
          reduced
            ? [{ opacity: 0 }, { opacity: 1 }]
            : [
                { clipPath: `circle(${bounds.width / 2}px at ${x}px ${y}px)` },
                { clipPath: `circle(${radius}px at ${x}px ${y}px)` }
              ],
          { duration, easing: 'cubic-bezier(.22,.61,.36,1)', fill: 'forwards' }
        )
      )
      if (image && !reduced) {
        avatar = image.cloneNode(true) as HTMLElement
        avatar.className = `${image.className} nailong-departure-avatar`
        Object.assign(avatar.style, {
          left: `${bounds.x}px`,
          top: `${bounds.y}px`,
          width: `${bounds.width}px`,
          height: `${bounds.height}px`
        })
        avatar.setAttribute('aria-hidden', 'true')
        document.body.appendChild(avatar)
        animations.push(
          avatar.animate(
            [
              { transform: 'scale(1)', opacity: 1 },
              { transform: 'scale(1.1)', opacity: 0 }
            ],
            { duration, easing: 'ease-out', fill: 'forwards' }
          )
        )
      }
      navigation = window.setTimeout(() => {
        window.location.assign(link.href)
      }, duration)
      // Restore the homepage if navigation fails instead of leaving a permanent cover.
      recovery = window.setTimeout(reset, 10000)
    } catch {
      reset()
      window.location.assign(link.href)
    }
  })
}
