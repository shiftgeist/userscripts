import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'

const script = readFileSync(new URL('./repo-commit-utils.user.js', import.meta.url), 'utf8')

function createNode(tagName, properties = {}, children = []) {
  const attributes = new Map()
  const classes = new Set()
  const listeners = new Map()
  const node = {
    tagName: tagName.toUpperCase(),
    style: {},
    dataset: {},
    children: [],
    parentElement: null,
    textContent: '',
    classList: {
      add: (...names) => names.forEach(name => classes.add(name)),
      remove: (...names) => names.forEach(name => classes.delete(name)),
      contains: name => classes.has(name)
    },
    get className() {
      return [...classes].join(' ')
    },
    set className(value) {
      classes.clear()
      String(value).split(/\s+/).filter(Boolean).forEach(name => classes.add(name))
    },
    setAttribute(name, value) {
      attributes.set(name, String(value))
      if (name === 'class') this.className = value
      if (name === 'href') this.href = String(value)
    },
    getAttribute(name) {
      if (name === 'class') return this.className
      return attributes.get(name) ?? null
    },
    append(...items) {
      for (const item of items) {
        const child = typeof item === 'string'
          ? createNode('#text', { textContent: item })
          : item
        child.parentElement = this
        this.children.push(child)
      }
    },
    after(...items) {
      if (!this.parentElement) return
      const siblings = this.parentElement.children
      const index = siblings.indexOf(this)
      const nodes = items.map(item =>
        typeof item === 'string' ? createNode('#text', { textContent: item }) : item
      )
      nodes.forEach(item => {
        item.parentElement = this.parentElement
      })
      siblings.splice(index + 1, 0, ...nodes)
    },
    addEventListener(type, listener) {
      const list = listeners.get(type) ?? []
      list.push(listener)
      listeners.set(type, list)
    },
    dispatchClick() {
      let stopped = false
      let prevented = false
      const event = {
        preventDefault() {
          prevented = true
        },
        stopPropagation() {
          stopped = true
        }
      }
      for (const listener of listeners.get('click') ?? []) {
        listener(event)
      }
      return { stopped, prevented }
    },
    matches(selector) {
      if (selector === 'table.repos-commits-table tbody tr.bolt-table-row') {
        return this.tagName === 'TR' && classes.has('bolt-table-row')
          && this.parentElement?.tagName === 'TBODY'
          && this.parentElement?.parentElement?.tagName === 'TABLE'
          && this.parentElement.parentElement.classList.contains('repos-commits-table')
      }
      if (selector === 'table.repos-commits-table') {
        return this.tagName === 'TABLE' && classes.has('repos-commits-table')
      }
      if (selector === 'tbody tr.bolt-table-row') {
        return this.tagName === 'TR' && classes.has('bolt-table-row')
          && this.parentElement?.tagName === 'TBODY'
      }
      if (selector === 'a.bolt-table-link[href*="/commit/"]') {
        return this.tagName === 'A' && classes.has('bolt-table-link')
          && (this.getAttribute('href') ?? '').includes('/commit/')
      }
      if (selector === 'span.monospaced-xs') {
        return this.tagName === 'SPAN' && classes.has('monospaced-xs')
      }
      if (selector === '[data-copy-commit-hash]') {
        return 'copyCommitHash' in this.dataset
          || attributes.has('data-copy-commit-hash')
      }
      return false
    },
    querySelector(selector) {
      return this.querySelectorAll(selector)[0] ?? null
    },
    querySelectorAll(selector) {
      const results = []
      const visit = current => {
        for (const child of current.children) {
          if (child.matches?.(selector)) results.push(child)
          visit(child)
        }
      }
      visit(this)
      return results
    }
  }
  Object.assign(node, properties)
  if (properties.href) attributes.set('href', properties.href)
  node.append(...children)
  return node
}

function createCommitRow(fullHash = '53c0af9169becb6efc68f5dc068ff9407a473d1b') {
  const shortSpan = createNode('span', {
    className: 'text-ellipsis monospaced-xs',
    textContent: fullHash.slice(0, 8)
  })
  const hashWrap = createNode('div', { className: 'flex-row flex-center scroll-hidden' }, [
    shortSpan
  ])
  const link = createNode('a', {
    className: 'bolt-table-link bolt-link no-underline-link',
    href: `/igus-digITal/Agentur/_git/search-suite/commit/${fullHash}?refName=refs/heads/main`
  })
  const cell = createNode('td', { className: 'bolt-table-two-line-cell bolt-table-cell' }, [
    link,
    hashWrap
  ])
  return {
    row: createNode('tr', { className: 'bolt-table-row bolt-list-row' }, [cell]),
    shortSpan,
    hashWrap
  }
}

function setup({ ready = true, hashes = ['53c0af9169becb6efc68f5dc068ff9407a473d1b'] } = {}) {
  const copied = []
  const observers = []
  const timeouts = []
  const tbody = createNode('tbody')
  const rows = hashes.map(hash => {
    const entry = createCommitRow(hash)
    tbody.append(entry.row)
    return entry
  })
  const table = createNode('table', { className: 'repos-commits-table with-graph bolt-table' }, [
    tbody
  ])
  const root = createNode('html')
  const body = createNode('body')
  root.append(body)
  if (ready) body.append(table)

  const document = {
    documentElement: root,
    body,
    createElement: tag => createNode(tag),
    querySelector: selector => root.querySelector(selector),
    querySelectorAll: selector => root.querySelectorAll(selector)
  }

  vm.runInNewContext(script, {
    console,
    document,
    navigator: {
      clipboard: {
        writeText: async text => {
          copied.push(text)
        }
      }
    },
    setTimeout: callback => {
      timeouts.push(callback)
      return timeouts.length
    },
    clearTimeout: () => {},
    MutationObserver: class {
      constructor(callback) {
        this.callback = callback
        this.active = false
        observers.push(this)
      }
      observe() {
        this.active = true
      }
      disconnect() {
        this.active = false
      }
    },
    window: {
      localStorage: { getItem: () => null }
    }
  })

  return {
    copied,
    rows,
    tbody,
    table,
    body,
    timeouts,
    flushObservers: () => {
      for (const observer of [...observers]) {
        if (observer.active) observer.callback()
      }
    }
  }
}

test('adds a copy button to each commit row and copies the eight-character hash without row navigation', async () => {
  const hash = '53c0af9169becb6efc68f5dc068ff9407a473d1b'
  const app = setup({ hashes: [hash] })
  const buttons = app.table.querySelectorAll('[data-copy-commit-hash]')

  assert.equal(buttons.length, 1)
  const clickResult = buttons[0].dispatchClick()
  await Promise.resolve()

  assert.deepEqual(app.copied, [hash.slice(0, 8)])
  assert.equal(clickResult.stopped, true)
  assert.equal(clickResult.prevented, true)
})

test('does not duplicate buttons across repeated mutations and handles newly added rows', async () => {
  const firstHash = '53c0af9169becb6efc68f5dc068ff9407a473d1b'
  const secondHash = 'd41f3a30fa845ad72f99cc8cfa6ff1417d28abd6'
  const app = setup({ ready: false, hashes: [firstHash] })

  assert.equal(app.table.querySelectorAll('[data-copy-commit-hash]').length, 0)

  app.body.append(app.table)
  app.flushObservers()
  assert.equal(app.table.querySelectorAll('[data-copy-commit-hash]').length, 1)

  const nextRow = createCommitRow(secondHash)
  app.tbody.append(nextRow.row)
  app.flushObservers()
  app.flushObservers()

  const buttons = app.table.querySelectorAll('[data-copy-commit-hash]')
  assert.equal(buttons.length, 2)

  buttons[1].dispatchClick()
  await Promise.resolve()
  assert.deepEqual(app.copied, [secondHash.slice(0, 8)])
})

test('updates existing button when a virtualized row reuses DOM for a different commit', async () => {
  const firstHash = '53c0af9169becb6efc68f5dc068ff9407a473d1b'
  const secondHash = 'd41f3a30fa845ad72f99cc8cfa6ff1417d28abd6'
  const app = setup({ hashes: [firstHash] })

  const link = app.table.querySelector('a.bolt-table-link[href*="/commit/"]')
  link.setAttribute(
    'href',
    `/igus-digITal/Agentur/_git/search-suite/commit/${secondHash}?refName=refs/heads/main`
  )
  app.rows[0].shortSpan.textContent = secondHash.slice(0, 8)
  app.flushObservers()

  const buttons = app.table.querySelectorAll('[data-copy-commit-hash]')
  assert.equal(buttons.length, 1)

  buttons[0].dispatchClick()
  await Promise.resolve()
  assert.deepEqual(app.copied, [secondHash.slice(0, 8)])
})
