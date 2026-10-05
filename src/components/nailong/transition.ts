export function mountAvatarTransition() {
  const link = document.querySelector<HTMLAnchorElement>('a[data-nailong-entry]')
  if (!link) return
  let active: { close: () => void } | undefined
  const open = () => {
    if (active) return
    const previousTitle = document.title
    document.title = '奶龙彩蛋 • Cxin Blog'
    const abort = new AbortController()
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
    const duration = reduced ? 150 : 650
    const shell = document.createElement('div')
    shell.className = 'nailong-shell'
    shell.setAttribute('role', 'dialog')
    shell.setAttribute('aria-modal', 'true')
    shell.setAttribute('aria-label', '奶龙图片卷轴')
    const cover = document.createElement('div')
    cover.className = 'nailong-cover'
    const weave = document.createElement('div')
    weave.className = 'nailong-weave'
    weave.setAttribute('aria-hidden', 'true')
    for (let i = 0; i < 6; i++) weave.appendChild(document.createElement('span'))
    const status = document.createElement('p')
    status.className = 'nailong-status'
    status.setAttribute('role', 'status')
    const back = document.createElement('button')
    back.className = 'nailong-shell-back'
    back.textContent = '↖ 返回首页'
    const iframe = document.createElement('iframe')
    iframe.title = '奶龙图片卷轴'
    iframe.src = '/nailong?embedded=1'
    const theme = document.documentElement.classList.contains('dark') ? 'dark' : 'light'
    shell.dataset.theme = theme
    cover.append(weave, status)
    shell.append(iframe, cover, back)
    const background = Array.from(document.body.children)
      .filter((element): element is HTMLElement => element instanceof HTMLElement)
      .map((element) => ({ element, inert: element.inert }))
    for (const { element } of background) element.inert = true
    const previousOverflow = document.documentElement.style.overflow
    document.documentElement.style.overflow = 'hidden'
    document.body.appendChild(shell)
    back.focus()
    const animations: Animation[] = []
    let finished = false
    let revealTimer = 0
    const hint = setTimeout(() => {
      status.textContent = '正在展开卷轴'
    }, 1000)
    const watchdog = setTimeout(() => {
      if (finished) return
      // A failed frame/bootstrap must not leave the parent cover permanently visible.
      cover.hidden = true
      iframe.src = '/nailong?embedded=1&fallback=1'
    }, 15000)
    const close = () => {
      abort.abort()
      clearTimeout(hint)
      clearTimeout(watchdog)
      clearTimeout(revealTimer)
      animations.forEach((animation) => animation.cancel())
      shell.remove()
      document.title = previousTitle
      for (const { element, inert } of background) element.inert = inert
      document.documentElement.style.overflow = previousOverflow
      active = undefined
      link.focus({ preventScroll: true })
    }
    active = { close }
    const returnHome = () => history.back()
    back.addEventListener('click', returnHome, { signal: abort.signal })
    shell.addEventListener(
      'keydown',
      (event) => {
        if (event.key === 'Escape') returnHome()
      },
      { signal: abort.signal }
    )
    window.addEventListener(
      'message',
      (event) => {
        if (event.origin !== location.origin || event.source !== iframe.contentWindow) return
        const message = event.data
        if (!message || typeof message !== 'object') return
        if (message.type === 'nailong:prepared' && !finished) {
          const width = weave.getBoundingClientRect().width
          iframe.contentWindow?.postMessage(
            { type: 'nailong:start', width, theme },
            location.origin
          )
        } else if (
          (message.type === 'nailong:reveal' || message.type === 'nailong:fallback') &&
          !finished
        ) {
          finished = true
          clearTimeout(hint)
          clearTimeout(watchdog)
          status.textContent = ''
          cover.style.background = 'transparent'
          const bounds = weave.getBoundingClientRect()
          const computed = getComputedStyle(weave)
          for (const line of weave.querySelectorAll<HTMLElement>('span')) {
            const style = getComputedStyle(line)
            line.style.transform = style.transform
            line.style.opacity = style.opacity
            line.style.animation = 'none'
          }
          animations.push(
            weave.animate(
              reduced
                ? [{ opacity: computed.opacity }, { opacity: 0 }]
                : [
                    { width: `${bounds.width}px`, gap: computed.gap, opacity: computed.opacity },
                    { width: `${Math.min(innerWidth * 0.7, 760)}px`, gap: '20px', opacity: 0 }
                  ],
              { duration, easing: 'ease-out', fill: 'forwards' }
            )
          )
          animations.push(
            cover.animate([{ opacity: 1 }, { opacity: 0 }], { duration, fill: 'forwards' })
          )
          revealTimer = window.setTimeout(() => {
            if (!abort.signal.aborted) {
              cover.hidden = true
              iframe.contentWindow?.focus()
            }
          }, duration)
        } else if (message.type === 'nailong:return') returnHome()
        else if (message.type === 'nailong:theme' && ['dark', 'light'].includes(message.theme)) {
          shell.dataset.theme = message.theme
        }
      },
      { signal: abort.signal }
    )
  }
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
    if (active) return
    history.pushState({ nailongOverlay: true }, '', '/nailong')
    open()
  })
  window.addEventListener('popstate', () => {
    if (history.state?.nailongOverlay) open()
    else active?.close()
  })
  window.addEventListener('pagehide', () => active?.close())
  window.addEventListener('pageshow', (event) => {
    if (event.persisted && history.state?.nailongOverlay) open()
  })
}
