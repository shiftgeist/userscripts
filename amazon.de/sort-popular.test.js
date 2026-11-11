import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'

const script = readFileSync(new URL('./sort-popular.user.js', import.meta.url), 'utf8')

function setup({ value = 'relevanceblender', ready = true, custom = false, bestseller = true } = {}) {
  const events = []
  let clicks = 0
  let observer
  const options = [
    { value: 'relevanceblender', textContent: 'Empfohlen' },
    ...(bestseller ? [{ value: 'exact-aware-popularity-rank', textContent: 'Bestseller' }] : []),
    { value: 'price-asc-rank', textContent: 'Preis: Aufsteigend' }
  ]
  const select = {
    value,
    options,
    get selectedOptions() { return options.filter(option => option.value === this.value) },
    dispatchEvent: event => events.push(event)
  }
  const recommended = { getAttribute: () => select.value === 'relevanceblender' ? 'true' : 'false' }
  const link = { textContent: 'Bestseller', click: () => clicks++ }
  const document = {
    documentElement: {},
    querySelector: selector => {
      if (!ready) return null
      if (selector === '#s-result-sort-select') return custom ? null : select
      if (selector === '#s-result-sort-select_0') return custom ? recommended : null
      if (selector === '#s-result-sort-select_1') return custom && bestseller ? link : null
      return null
    }
  }
  vm.runInNewContext(script, {
    document,
    Event: class {
      constructor(type, properties) { this.type = type; Object.assign(this, properties) }
    },
    MutationObserver: class {
      constructor(callback) { observer = this; this.callback = callback; this.active = false }
      observe() { this.active = true }
      disconnect() { this.active = false }
    },
    window: { localStorage: { getItem: () => null } },
    console
  })
  return {
    select,
    events,
    get clicks() { return clicks },
    get observing() { return observer?.active ?? false },
    render: () => { ready = true; if (observer?.active) observer.callback() }
  }
}

test('selects Bestseller instead of Empfohlen and notifies Amazon', () => {
  const app = setup()
  assert.equal(app.select.value, 'exact-aware-popularity-rank')
  assert.equal(app.events.length, 1)
  assert.equal(app.events[0].type, 'change')
  assert.equal(app.events[0].bubbles, true)
})

test('leaves an explicit sort choice unchanged', () => {
  for (const value of ['exact-aware-popularity-rank', 'price-asc-rank']) {
    const app = setup({ value })
    assert.equal(app.select.value, value)
    assert.equal(app.events.length, 0)
  }
})

test('waits for the dropdown and then stops observing', () => {
  const app = setup({ ready: false })
  assert.equal(app.observing, true)
  app.render()
  assert.equal(app.select.value, 'exact-aware-popularity-rank')
  assert.equal(app.observing, false)
  app.select.value = 'relevanceblender'
  app.render()
  assert.equal(app.select.value, 'relevanceblender')
  assert.equal(app.events.length, 1)
})

test('defaults to Bestseller independently on each new page', () => {
  const first = setup()
  first.select.value = 'price-asc-rank'
  const second = setup()
  assert.equal(first.select.value, 'price-asc-rank')
  assert.equal(second.select.value, 'exact-aware-popularity-rank')
})

test('clicks the custom Bestseller option when no native select exists', () => {
  const app = setup({ custom: true })
  assert.equal(app.clicks, 1)
})

test('leaves a custom sort choice unchanged', () => {
  const app = setup({ custom: true, value: 'price-asc-rank' })
  assert.equal(app.clicks, 0)
})

test('does not change the sort when Bestseller is unavailable', () => {
  const app = setup({ bestseller: false })
  assert.equal(app.select.value, 'relevanceblender')
  assert.equal(app.events.length, 0)
})
