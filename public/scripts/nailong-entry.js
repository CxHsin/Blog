// Runs before the body is parsed; independent of the WebGL module's download.
;(() => {
  const root = document.documentElement
  const fallback = new URLSearchParams(location.search).get('fallback') === '1'
  const embedded =
    window.parent !== window && new URLSearchParams(location.search).get('embedded') === '1'
  if (embedded) {
    root.dataset.nailongEmbedded = ''
    window.addEventListener('message', (event) => {
      if (event.origin !== location.origin || event.source !== window.parent) return
      if (event.data?.type === 'nailong:start' && ['dark', 'light'].includes(event.data.theme)) {
        root.classList.toggle('dark', event.data.theme === 'dark')
      }
    })
    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape')
        window.parent.postMessage({ type: 'nailong:return' }, location.origin)
    })
    document.addEventListener('DOMContentLoaded', () => {
      document.querySelector('.back')?.addEventListener('click', (event) => {
        event.preventDefault()
        window.parent.postMessage({ type: 'nailong:return' }, location.origin)
      })
    })
  }
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
    if (embedded)
      window.parent.postMessage(
        { type: `nailong:${state === 'ready' ? 'reveal' : 'fallback'}` },
        location.origin
      )
  }
  const start = () => {
    hint = window.setTimeout(() => {
      root.dataset.nailongWaiting = ''
    }, 1000)
    timeout = window.setTimeout(() => {
      settle('fallback')
      document.dispatchEvent(new Event('nailong:timeout'))
    }, 15000)
  }
  root.dataset.nailongEntry = fallback ? 'fallback' : 'loading'
  if (!fallback) start()
  document.addEventListener('nailong:reveal', () => settle('ready'))
  document.addEventListener('nailong:fallback', () => settle('fallback'))
  window.addEventListener('pagehide', clear)
  window.addEventListener('pageshow', (event) => {
    if (event.persisted && root.dataset.nailongEntry === 'loading') start()
  })
})()
