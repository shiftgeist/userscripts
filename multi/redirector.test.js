import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'

const script = readFileSync(new URL('./redirector.user.js', import.meta.url), 'utf8')

function setup(delay = 65, showTimeLeft = false, bodyReady = true, rule = {}) {
  const menus = new Map()
  const intervals = new Map()
  const timeouts = new Map()
  const events = new Map()
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
    body: bodyReady ? { append: node => children.push(node) } : null,
    createElement: element
  }
  let now = 0
  let nextId = 0
  const redirected = []
  const address = rule.from?.trim() ?? 'https://example.com/'
  const location = { href: new URL(address.includes('://') ? address : `https://${address}`).href,
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
      setTimeout: callback => { timeouts.set(++nextId, callback); return nextId },
      clearTimeout: id => timeouts.delete(id),
      setInterval: callback => { intervals.set(++nextId, callback); return nextId },
      clearInterval: id => intervals.delete(id),
      addEventListener: (name, callback) => events.set(name, callback)
    }
  })
  return {
    menus, intervals, timeouts, events, children, document, values, location, redirected,
    toggle: () => [...menus.values()].find(menu => menu.label === 'Toggle show time left').callback(),
    text: () => children[0]?.shadow.children[1].textContent,
    labels: () => [...menus.values()].map(menu => menu.label),
    tick: milliseconds => {
      now += milliseconds
      for (const callback of intervals.values()) callback()
    }
  }
}

test('toggle shows the remaining time on the page without changing menu commands', () => {
  const app = setup()
  const menus = [...app.menus.keys()]
  assert.equal(app.children.length, 0)
  app.toggle()
  assert.equal(app.values.get('showTimeLeft'), true)
  assert.equal(app.text(), 'Redirect in 1:05')
  app.tick(2100)
  assert.equal(app.text(), 'Redirect in 1:03')
  app.tick(62000)
  assert.equal(app.text(), 'Redirect in 0:01')
  assert.deepEqual([...app.menus.keys()], menus)
  app.toggle()
  assert.equal(app.children.length, 0)
  assert.equal(app.values.get('showTimeLeft'), false)
  assert.equal(app.intervals.size, 0)
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

test('hostname redirects reject a different hostname', () => {
  const app = setup(65, false, true, { match: 'hostname' })
  app.location.href = 'https://other.example.com/'
  for (const callback of app.timeouts.values()) callback()
  assert.deepEqual(app.redirected, [])
})
