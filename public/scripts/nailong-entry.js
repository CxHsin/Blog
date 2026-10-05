// Runs before the body is parsed; independent of the WebGL module's download.
(() => {
  const root = document.documentElement
  try {
    const handoff = JSON.parse(sessionStorage.getItem('nailong-entry-handoff') || 'null')
    sessionStorage.removeItem('nailong-entry-handoff')
    if (handoff && Number.isFinite(handoff.width) && handoff.width > 0 &&
        Number.isFinite(handoff.time) && Date.now() - handoff.time >= 0 && Date.now() - handoff.time < 10000) {
      root.style.setProperty('--weave-start-width', `${Math.min(handoff.width, 240)}px`)
      root.style.setProperty('--weave-start-gap', '10px')
      root.style.setProperty('--weave-start-opacity', '0.3')
    }
  } catch { /* Direct visits and unavailable storage use the normal entrance. */ }
  let hint = 0
  let timeout = 0
  const clear = () => {
    clearTimeout(hint)
    clearTimeout(timeout)
  }
  const settle = (state) => {
    clear()
    root.dataset.nailongEntry = state
    delete root.dataset.nailongWaiting
  }
  const start = () => {
    hint = window.setTimeout(() => { root.dataset.nailongWaiting = '' }, 1000)
    timeout = window.setTimeout(() => {
      settle('fallback')
      document.dispatchEvent(new Event('nailong:timeout'))
    }, 15000)
  }
  root.dataset.nailongEntry = 'loading'
  start()
  document.addEventListener('nailong:reveal', () => settle('ready'))
  document.addEventListener('nailong:fallback', () => settle('fallback'))
  window.addEventListener('pagehide', clear)
  window.addEventListener('pageshow', (event) => {
    if (event.persisted && root.dataset.nailongEntry === 'loading') start()
  })
})()
