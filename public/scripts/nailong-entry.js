// Runs before the body is parsed; independent of the WebGL module's download.
(() => {
  const root = document.documentElement
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
