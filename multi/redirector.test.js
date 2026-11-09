import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'

const script = readFileSync(new URL('./redirector.user.js', import.meta.url), 'utf8')

function setup(delay = 65, showTimeLeft = undefined, bodyReady = true, rule = {}, session = {}) {
  const menus = new Map()
  const intervals = new Map()
  const timeouts = new Map()
  const events = new Map()
  const windowListeners = new Map()
  const values = new Map([['showTimeLeft', showTimeLeft]])
  const children = []
  function element() {
    return {
      style: {},
      children: [],
      append(...nodes) { this.children.push(...nodes) },
      attachShadow() { this.shadow = element(); return this.shadow },
      remove() { children.splice(children.indexOf(this), 1) }
    }
  }
  const document = {
    visibilityState: session.hidden ? 'hidden' : 'visible',
    addEventListener: (name, callback) => events.set(name, callback),
    removeEventListener: (name, callback) => {
      if (events.get(name) === callback) events.delete(name)
    },
    body: bodyReady ? { append: node => children.push(node) } : null,
    createElement: element
  }
  const storage = session.storage ?? new Map()
  let now = session.now ?? 0
  let nextId = 0
  const redirected = []
  const address = rule.from?.trim() ?? 'https://example.com/'
  const location = { href: session.href ?? new URL(address.includes('://') ? address : `https://${address}`).href,
    replace: url => redirected.push(url) }
  vm.runInNewContext(script, {
    URL,
    console,
    document,
    Date: { now: () => now },
    GM_getValue: (key, fallback) => key === 'redirects'
      ? [{ from: location.href, to: 'https://example.org/', delay, ...rule }]
      : key === 'smallwebDefaultsAdded' ? true : values.get(key) ?? fallback,
    GM_setValue: (key, value) => values.set(key, value),
    GM_registerMenuCommand: (label, callback) => {
      const id = ++nextId
      menus.set(id, { label, callback })
      return id
    },
    GM_unregisterMenuCommand: id => menus.delete(id),
    window: {
      location,
      sessionStorage: {
        getItem: key => storage.get(key) ?? null,
        setItem: (key, value) => storage.set(key, value),
        removeItem: key => storage.delete(key)
      },
      setTimeout: (callback, delay) => {
        session.timeoutDelay = delay
        timeouts.set(++nextId, callback)
        return nextId
      },
      clearTimeout: id => timeouts.delete(id),
      setInterval: callback => { intervals.set(++nextId, callback); return nextId },
      clearInterval: id => intervals.delete(id),
      addEventListener: (name, callback, options) => {
        events.set(name, callback)
        windowListeners.set(name, { callback, options })
      },
      removeEventListener: (name, callback) => {
        if (events.get(name) === callback) events.delete(name)
        if (windowListeners.get(name)?.callback === callback) windowListeners.delete(name)
      }
    }
  })
  return {
    menus, intervals, timeouts, events, windowListeners, children, document, values, location, redirected, storage,
    text: () => children[0]?.shadow.children[1].textContent,
    labels: () => [...menus.values()].map(menu => menu.label),
    visibility: state => {
      document.visibilityState = state
      events.get('visibilitychange')?.()
    },
    tick: milliseconds => {
      now += milliseconds
      for (const callback of intervals.values()) callback()
    }
  }
}

test('the countdown always appears even with a legacy hidden preference', () => {
  const app = setup(65, false)
  assert.equal(app.text(), 'Redirect in 1:05')
  app.tick(2100)
  assert.equal(app.text(), 'Redirect in 1:03')
  app.tick(62000)
  assert.equal(app.text(), 'Redirect in 0:01')
  assert.deepEqual(app.labels(), ['Edit redirects'])
})

test('the countdown appears by default', () => {
  const app = setup()
  assert.equal(app.text(), 'Redirect in 1:05')
})

test('saved preference shows the countdown once the page body exists', () => {
  const app = setup(65, true, false)
  assert.equal(app.children.length, 0)
  app.document.body = { append: node => app.children.push(node) }
  app.tick(1000)
  assert.equal(app.text(), 'Redirect in 1:04')
})

test('redirect removes the countdown and its interval', () => {
  const app = setup(65, true)
  for (const callback of app.timeouts.values()) callback()
  assert.equal(app.children.length, 0)
  assert.equal(app.intervals.size, 0)
})

test('pagehide clears the redirect timer and countdown', () => {
  const app = setup(65, true)
  app.events.get('pagehide')()
  assert.equal(app.children.length, 0)
  assert.equal(app.intervals.size, 0)
  assert.equal(app.timeouts.size, 0)
})

test('immediate redirects do not start a countdown', () => {
  const app = setup(0, true)
  assert.equal(app.children.length, 0)
  assert.equal(app.intervals.size, 0)
})

test('hostname redirects survive YouTube navigation without restarting the timer', () => {
  const app = setup(1200, true, true, { from: 'https://youtube.com/', match: 'hostname' })
  app.tick(600000)
  app.location.href = 'https://www.youtube.com/watch?v=example'
  app.tick(599000)
  assert.equal(app.text(), 'Redirect in 0:01')
  assert.equal(app.timeouts.size, 1)
  for (const callback of app.timeouts.values()) callback()
  assert.deepEqual(app.redirected, ['https://example.org/'])
})

test('legacy exact rules also match other paths on the same hostname', () => {
  const app = setup(65, false, true, { match: 'exact' })
  app.location.href = 'https://example.com/other'
  for (const callback of app.timeouts.values()) callback()
  assert.deepEqual(app.redirected, ['https://example.org/'])
})

test('rules accept addresses without a protocol', () => {
  const app = setup(65, false, true, {
    from: ' youtube.com/watch ', to: ' example.org/destination '
  })
  app.location.href = 'https://www.youtube.com/watch?v=example'
  for (const callback of app.timeouts.values()) callback()
  assert.deepEqual(app.redirected, ['https://example.org/destination'])
})

test('destination addresses accept localhost with a port and path', () => {
  const app = setup(0, false, true, { to: 'localhost:3000/search-ui/de-be' })
  assert.deepEqual(app.redirected, ['https://localhost:3000/search-ui/de-be'])
})

test('destination addresses preserve explicit HTTP for local servers', () => {
  const app = setup(0, false, true, { to: 'http://localhost:3000/search-ui/de-be' })
  assert.deepEqual(app.redirected, ['http://localhost:3000/search-ui/de-be'])
})

test('destination addresses accept a domain with a port', () => {
  const app = setup(0, false, true, { to: 'example.org:8443/path' })
  assert.deepEqual(app.redirected, ['https://example.org:8443/path'])
})

test('rules do not match a different port', () => {
  const app = setup(65, false, true, { from: 'https://localhost:3000/' })
  app.location.href = 'https://localhost:3001/search-ui/de-be'
  for (const callback of app.timeouts.values()) callback()
  assert.deepEqual(app.redirected, [])
})

test('rules match another path on the same port', () => {
  const app = setup(65, false, true, { from: 'https://localhost:3000/' })
  app.location.href = 'https://localhost:3000/search-ui/de-be'
  for (const callback of app.timeouts.values()) callback()
  assert.deepEqual(app.redirected, ['https://example.org/'])
})

test('a local route rule never starts on a different port', () => {
  const app = setup(0, true, true, {
    from: 'localhost:3000/search-ui/de-be', to: 'http://localhost:3000/search-ui/de-de'
  }, { href: 'http://localhost:3005/search-ui/de-be' })
  assert.deepEqual(app.redirected, [])
  assert.equal(app.timeouts.size, 0)
})

test('a local route rule matches its source across HTTP and HTTPS', () => {
  const app = setup(0, true, true, {
    from: 'localhost:3000/search-ui/de-be', to: 'http://localhost:3000/search-ui/de-de'
  }, { href: 'http://localhost:3000/search-ui/de-be' })
  assert.deepEqual(app.redirected, ['http://localhost:3000/search-ui/de-de'])
})

test('a local route rule does not redirect other paths on the same port', () => {
  const app = setup(0, true, true, {
    from: 'localhost:3000/search-ui/de-be', to: 'http://localhost:3000/search-ui/de-de'
  }, { href: 'http://localhost:3000/search-ui/fr-fr' })
  assert.deepEqual(app.redirected, [])
})

test('hostname redirects reject a different hostname', () => {
  const app = setup(65, false, true, { match: 'hostname' })
  app.location.href = 'https://other.example.com/'
  for (const callback of app.timeouts.values()) callback()
  assert.deepEqual(app.redirected, [])
})

test('reload keeps the original deadline', () => {
  const first = setup(65, true)
  first.tick(30000)
  first.events.get('pagehide')()
  const session = { storage: first.storage, now: 30000 }
  const reloaded = setup(65, true, true, {}, session)
  assert.equal(reloaded.text(), 'Redirect in 0:35')
  assert.equal(session.timeoutDelay, 35000)
})

test('reload after the deadline redirects immediately and clears the saved deadline', () => {
  const first = setup()
  const reloaded = setup(65, true, true, {}, { storage: first.storage, now: 70000 })
  assert.deepEqual(reloaded.redirected, ['https://example.org/'])
  assert.equal(reloaded.storage.size, 0)
})

test('a changed rule starts a new timer', () => {
  const first = setup()
  const session = { storage: first.storage, now: 30000 }
  const reloaded = setup(90, true, true, {}, session)
  assert.equal(reloaded.text(), 'Redirect in 1:30')
  assert.equal(session.timeoutDelay, 90000)
})

test('a fresh tab starts its own timer', () => {
  setup()
  const session = { now: 30000 }
  const fresh = setup(65, true, true, {}, session)
  assert.equal(fresh.text(), 'Redirect in 1:05')
  assert.equal(session.timeoutDelay, 65000)
})

test('a completed timer clears its saved deadline', () => {
  const app = setup()
  for (const callback of app.timeouts.values()) callback()
  assert.equal(app.storage.size, 0)
})

test('hidden tabs pause the delay until they become visible again', () => {
  const session = {}
  const app = setup(65, true, true, {}, session)
  app.tick(10000)
  app.visibility('hidden')
  assert.equal(app.timeouts.size, 0)
  assert.equal(app.intervals.size, 0)
  app.tick(120000)
  app.visibility('visible')
  assert.equal(app.text(), 'Redirect in 0:55')
  assert.equal(session.timeoutDelay, 55000)
  app.tick(5000)
  app.visibility('hidden')
  app.tick(120000)
  app.visibility('visible')
  assert.equal(app.text(), 'Redirect in 0:50')
  assert.deepEqual(app.redirected, [])
})

test('visibility changes reach the timer before document listeners can block them', () => {
  const app = setup()
  const listener = app.windowListeners.get('visibilitychange')
  assert.equal(listener?.options, true)
  app.tick(10000)
  app.document.visibilityState = 'hidden'
  listener.callback()
  assert.equal(app.timeouts.size, 0)
  app.tick(120000)
  app.document.visibilityState = 'visible'
  listener.callback()
  assert.equal(app.text(), 'Redirect in 0:55')
  app.events.get('pagehide')()
  assert.equal(app.windowListeners.has('visibilitychange'), false)
})

test('tabs that start hidden wait for visibility before starting the delay', () => {
  const app = setup(65, true, true, {}, { hidden: true })
  assert.equal(app.timeouts.size, 0)
  app.tick(120000)
  app.visibility('visible')
  assert.equal(app.text(), 'Redirect in 1:05')
})

test('reload preserves the remaining delay while hidden', () => {
  const first = setup()
  first.tick(10000)
  first.visibility('hidden')
  first.events.get('pagehide')()
  const app = setup(65, true, true, {}, { storage: first.storage, now: 130000, hidden: true })
  app.tick(120000)
  app.visibility('visible')
  assert.equal(app.text(), 'Redirect in 0:55')
})

test('hidden tabs defer immediate redirects until visible', () => {
  const app = setup(0, true, true, {}, { hidden: true })
  assert.deepEqual(app.redirected, [])
  app.visibility('visible')
  assert.deepEqual(app.redirected, ['https://example.org/'])
})

test('the countdown fades near the pointer and returns when the pointer leaves', () => {
  const app = setup()
  const badge = app.children[0]
  badge.getBoundingClientRect = () => ({ left: 800, right: 950, top: 700, bottom: 740 })
  app.events.get('mousemove')({ clientX: 760, clientY: 720 })
  assert.equal(badge.style.opacity, '0.1')
  app.events.get('mousemove')({ clientX: 400, clientY: 300 })
  assert.equal(badge.style.opacity, '1')
  app.events.get('pagehide')()
  assert.equal(app.events.has('mousemove'), false)
})
