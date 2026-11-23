import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'

const script = readFileSync(new URL('./copy-as-csv.user.js', import.meta.url), 'utf8')
const page = 'https://geizhals.de/phone-a123.html'

function node(tagName) {
  return {
    tagName,
    style: {},
    children: [],
    append(...children) {
      this.children.push(...children)
    },
    setAttribute() {},
    addEventListener(event, callback) {
      this[event] = callback
    },
    after(sibling) {
      this.sibling = sibling
    }
  }
}

function phone(rawSpecs, links = [], barometer = null, identity = {}) {
  const copied = []
  const timers = new Map()
  const events = {}
  const section = node()
  section.querySelectorAll = () =>
    Object.entries(rawSpecs).map(([field, value]) => ({
      querySelector: selector =>
        selector === 'dt'
          ? { textContent: field }
          : { textContent: value, querySelectorAll: () => links }
    }))

  vm.runInNewContext(script, {
    setTimeout(callback, delay) {
      timers.set(callback, delay)
      return callback
    },
    clearTimeout: callback => timers.delete(callback),
    document: {
      addEventListener: (name, callback) => { events[name] = callback },
      baseURI: page,
      querySelector: selector => selector === '#data' ? section : selector === '.barometer' ? barometer : identity[selector] ?? null,
      querySelectorAll: selector => selector.endsWith(' .variant__content__list-item__link')
        ? identity[selector] ?? []
        : [{ getAttribute: () => '/?cat=umtsover' }],
      createElement: node
    },
    location: { href: page },
    navigator: { clipboard: { writeText: value => copied.push(value) } },
    URL,
    console: { error: error => {
      throw error
    } }
  })

  const [controls] = section.children
  const [head, specs] = section.sibling.children
  const [grid] = specs.children[0].children
  const facts = Object.fromEntries(grid.children.map(({ children: [header, cell] }) => [
    header.textContent,
    cell
  ]))
  return {
    facts,
    head,
    specs,
    grid,
    controls,
    timers,
    events,
    copied,
    async copy() {
      const [copyRow, copyHeaders] = controls.children[1].children
      await copyHeaders.click()
      await copyRow.click()
      const [headers, values] = copied.map(row => row.split('\t'))
      return Object.fromEntries(headers.map((header, index) => [header, values[index]]))
    }
  }
}

test('shows copy feedback above the buttons', async () => {
  const { controls, timers } = phone({})
  const [status, buttons] = controls.children
  const [row, headers] = buttons.children
  assert.equal(buttons.style.display, 'flex')
  assert.equal(buttons.style.gap, '0.5rem')
  assert.equal(status.tagName, 'div')
  await headers.click()
  assert.equal(status.textContent, 'Headers copied.')
  await row.click()
  assert.equal(status.textContent, 'Row copied.')
  assert.deepEqual([...timers.values()], [3000])
  const [expire] = timers.keys()
  expire()
  assert.equal(status.textContent, '')
})

test('copies a row with Control+Shift+F9 outside editable fields', async () => {
  const { events, copied, controls } = phone({ RAM: '6GB' })
  const [status, buttons] = controls.children
  const [row] = buttons.children
  let prevented = false
  const shortcut = { key: 'F9', ctrlKey: true, shiftKey: true, preventDefault: () => { prevented = true } }
  events.keydown({ ...shortcut, target: { closest: () => ({}) } })
  events.keydown({ ...shortcut, repeat: true })
  events.keydown({ ...shortcut, altKey: true })
  assert.equal(copied.length, 0)
  assert.equal(prevented, false)
  events.keydown(shortcut)
  await Promise.resolve()
  assert.equal(prevented, true)
  assert.equal(row.title, 'Control+Shift+F9')
  assert.equal(copied.length, 1)
  assert.equal(status.textContent, 'Row copied.')
})

test('shows and copies parsed phone specs and exports accessory URLs', async () => {
  const links = [
    { textContent: 'Displayschutz', href: 'https://geizhals.de/?cat=gsmzubds&xf=1958_Samsung+Galaxy+A34+5G' },
    { textContent: 'Taschen & Hüllen', href: 'https://geizhals.de/?cat=gsmzubth&xf=1953_Samsung+Galaxy+A34+5G' }
  ]
  const app = phone({
    CPU: '2x 2.60GHz Cortex-A78 + 6x 2.00GHz Cortex-A55, 8 Kerne',
    RAM: '6GB',
    Speicher: '128GB (UFS), microSD-Slot (shared, bis 1TB)',
    Akku: '5000mAh, fest verbaut',
    Ladeleistung: '25W (Samsung AFC)',
    'SIM-Karte': 'Dual-SIM (2x Nano-SIM)',
    Besonderheiten: 'IP67-zertifiziert, Stereo-Lautsprecher (hybrid)',
    Zubehör: 'Taschen & Hüllen, Displayschutz'
  }, links)

  const exported = await app.copy()
  for (const [field, value] of Object.entries({
    'CPU gesamt (GHz)': '17.2',
    'CPU Effizienz (GHz)': '2',
    'CPU Leistung (GHz)': '2.6',
    'CPU-Kerne': '8',
    'RAM (GB)': '6',
    'Interner Speicher (GB)': '128',
    'Speicher erweiterbar': 'microSD',
    'Akku (mAh)': '5000',
    'Ladeleistung (W)': '25',
    'IP Staub': '6',
    'IP Wasser': '7',
    'SIM-Steckplätze': '2',
    'SIM-Typen': 'Nano-SIM'
  })) {
    assert.equal(app.facts[field]?.textContent, value, field)
    assert.equal(exported[field], value, field)
  }
  assert.equal(app.facts.Zubehör, undefined)
  assert.equal(exported.Zubehör, undefined)
  for (const { textContent, href } of links) {
    assert.equal(app.facts[textContent].children[0].href, href)
    assert.equal(exported[textContent], href)
  }
})

test('distinguishes fixed storage, unspecified specs and a SIM with eSIM support', async () => {
  const exported = await phone({ Speicher: '1TB (UFS)', 'SIM-Karte': 'Dual-SIM (1x Nano-SIM, 1x eSIM)' }).copy()
  assert.equal(exported['Speicher erweiterbar'], '')
  assert.equal(exported['Interner Speicher (GB)'], '1000')
  assert.equal(exported['SIM-Steckplätze'], '1')
  assert.equal(exported['SIM-Typen'], 'Nano-SIM, eSIM')
  assert.equal(exported['IP Staub'], '')
  assert.equal(exported['CPU gesamt (GHz)'], '')
})

test('shows and copies the main, wide-angle, and macro camera specs', async () => {
  const app = phone({
    'Kamera hinten': [
      '48.0MP, f/\u200b1.8, Phasenvergleich-AF, OIS, LED-Blitz, Videos @2160p/\u200b30fps (Kamera 1)',
      '8.0MP, f/\u200b2.2, Weitwinkelobjektiv (Kamera 2)',
      '5.0MP, f/\u200b2.4, Makroobjektiv (Kamera 3)'
    ].join('; '),
    'Kamera vorne': '13.0MP, f/\u200b2.2, Videos @1080p/\u200b30fps'
  })
  const exported = await app.copy()
  for (const [field, value] of Object.entries({
    'Kamera hinten: Anzahl': '3',
    'Kamera hinten: Hauptkamera (MP)': '48',
    'Kamera hinten: Hauptkamera Blende (f/)': '1.8',
    'Kamera hinten: Hauptkamera Videoauflösung': '2160p',
    'Kamera hinten: Hauptkamera Video (fps)': '30',
    'Kamera hinten: Weitwinkel': 'true',
    'Kamera hinten: Weitwinkel (MP)': '8',
    'Kamera hinten: Weitwinkel Blende (f/)': '2.2',
    'Kamera hinten: Makro': 'true',
    'Kamera hinten: Makro (MP)': '5',
    'Kamera hinten: Makro Blende (f/)': '2.4',
    'Kamera vorne: Hauptkamera (MP)': '13',
    'Kamera vorne: Hauptkamera Blende (f/)': '2.2',
    'Kamera vorne: Hauptkamera Videoauflösung': '1080p',
    'Kamera vorne: Hauptkamera Video (fps)': '30'
  })) {
    assert.equal(app.facts[field]?.textContent, value, field)
    assert.equal(exported[field], value, field)
  }
})

test('does not borrow video or auxiliary camera specs from other lenses', async () => {
  const exported = await phone({ 'Kamera hinten': '48MP; 12MP, f/2.2, Videos @2160p/60fps, Teleobjektiv' }).copy()
  assert.equal(exported['Kamera hinten: Hauptkamera Video (fps)'], '')
  assert.equal(exported['Kamera hinten: Weitwinkel'], 'false')
  assert.equal(exported['Kamera hinten: Makro (MP)'], '')
  assert.equal(exported['Kamera vorne: Hauptkamera (MP)'], '')
})

test('keeps standard and periscope telephoto lenses separate', async () => {
  const exported = await phone({
    'Kamera hinten': [
      '200.0MP, f/\u200b1.4, Videos @4320p/\u200b30fps (Kamera 1)',
      '50.0MP, f/\u200b2.9, 5x optischer Zoom, Periskop-Teleobjektiv (Kamera 2)',
      '50.0MP, f/\u200b1.9, Weitwinkelobjektiv (Kamera 3)',
      '10.0MP, f/\u200b2.4, 3x optischer Zoom, Teleobjektiv (Kamera 4)'
    ].join('; ')
  }).copy()
  assert.equal(exported['Kamera hinten: Tele'], 'true')
  assert.equal(exported['Kamera hinten: Tele (MP)'], '10')
  assert.equal(exported['Kamera hinten: Tele Blende (f/)'], '2.4')
  assert.equal(exported['Kamera hinten: Periskop-Tele'], 'true')
  assert.equal(exported['Kamera hinten: Periskop-Tele (MP)'], '50')
  assert.equal(exported['Kamera hinten: Periskop-Tele Blende (f/)'], '2.9')
})

test('omits empty facts from the table and copies them as blank', async () => {
  const app = phone({ RAM: '0GB' })
  const exported = await app.copy()
  for (const field of ['IP Staub', 'Taschen & Hüllen', 'Displayschutz']) {
    assert.equal(app.facts[field], undefined)
    assert.equal(exported[field], '')
  }
  assert.equal(app.facts['RAM (GB)'].textContent, '0')
})

test('renders parsed facts using the Geizhals heading and specs grid', () => {
  const { head, specs, grid } = phone({ RAM: '6GB' })
  const [title] = head.children
  const [anchor] = title.children
  const [count, , text] = anchor.children
  assert.equal(head.className, 'variant__content__head')
  assert.equal(title.tagName, 'h2')
  assert.equal(title.className, 'variant__content__title')
  assert.equal(anchor.href, '#parsed-product-facts')
  assert.equal(count.textContent, String(grid.children.length))
  assert.equal(text.textContent, 'Parsed product facts')
  assert.equal(specs.className, 'variant__content__specs')
  assert.equal(grid.className, 'specs-grid opened extra-spacing')
  assert.equal(grid.tagName, 'dl')
  assert.ok(grid.children.every(row => row.className === 'specs-grid__item'))
  assert.ok(grid.children.every(row => row.style.gridTemplateColumns === 'minmax(0, 45%) minmax(0, 1fr)'))
  assert.deepEqual(grid.children[0].children.map(cell => cell.tagName), ['dt', 'dd'])
})

test('shows and copies Wi-Fi, Bluetooth, and NFC from Schnittstellen', async () => {
  const app = phone({ Schnittstellen: 'USB-C 2.0 (480Mb/s), Wi-Fi 5 (WLAN 802.11a/b/g/n/ac), Bluetooth 5.3, NFC' })
  const exported = await app.copy()
  for (const [field, value] of Object.entries({ 'Wi-Fi Version': '5.0', 'Bluetooth Version': '5.3', 'has NFC': 'TRUE' })) {
    assert.equal(app.facts[field]?.textContent, value, field)
    assert.equal(exported[field], value, field)
  }
  const withoutNfc = await phone({ Schnittstellen: 'Wi-Fi 6E, Bluetooth 5.4' }).copy()
  assert.equal(withoutNfc['Wi-Fi Version'], '6.0')
  assert.equal((await phone({ Schnittstellen: 'Wi-Fi' }).copy())['Wi-Fi Version'], '')
  assert.equal(withoutNfc['has NFC'], 'FALSE')
  assert.equal((await phone({}).copy())['has NFC'], '')
})

test('exports a positive maximum display refresh rate from a range', async () => {
  const field = 'Aktualisierungsrate (Hz)'
  for (const [display, expected] of [['1-120Hz Aktualisierungsrate', '120'], ['60–90 Hz', '90'], ['120Hz', '120']]) {
    const app = phone({ Display: display })
    assert.equal(app.facts[field]?.textContent, expected)
    assert.equal((await app.copy())[field], expected)
  }
})

test('shows and copies the USB-C version from Schnittstellen', async () => {
  for (const [interfaces, version] of [
    ['USB-C 3.2 (5Gb/s, DisplayPort), Wi-Fi 7, Bluetooth 6.0, NFC, UWB', '3.2'],
    ['USB-C 2.0 (480Mb/s), Wi-Fi 5, Bluetooth 5.3, NFC', '2.0']
  ]) {
    const app = phone({ Schnittstellen: interfaces })
    assert.equal(app.facts['USB-C Version']?.textContent, version)
    assert.equal((await app.copy())['USB-C Version'], version)
  }
  assert.equal((await phone({ Schnittstellen: 'USB-C, Wi-Fi 7' }).copy())['USB-C Version'], '')
})

test('exports sensor flags and the fingerprint sensor type separately', async () => {
  const sensors = ['Beschleunigungssensor', 'Gyroskop', 'Annäherungssensor', 'Lichtsensor', 'Kompass', 'Barometer']
  const app = phone({ Sensoren: [...sensors, 'Fingerabdrucksensor (Display)'].join(', ') })
  const exported = await app.copy()
  for (const sensor of sensors) {
    assert.equal(app.facts[sensor]?.textContent, 'TRUE')
    assert.equal(exported[sensor], 'TRUE')
  }
  assert.equal(exported['Fingerabdrucksensor Typ'], 'Display')
  const partial = await phone({ Sensoren: 'Gyroskop, Fingerabdrucksensor (seitlich)' }).copy()
  assert.equal(partial.Barometer, 'FALSE')
  assert.equal(partial['Fingerabdrucksensor Typ'], 'seitlich')
  assert.equal((await phone({}).copy()).Barometer, '')
})

test('reports 5G support from frequency bands', async () => {
  const app = phone({ Frequenzbänder: '4G (B1/B3), 5G (n1/n78)' })
  assert.equal(app.facts['has 5G'].textContent, 'TRUE')
  assert.equal((await app.copy())['has 5G'], 'TRUE')
  assert.equal((await phone({ Frequenzbänder: '4G (B1/B3)' }).copy())['has 5G'], 'FALSE')
  assert.equal((await phone({}).copy())['has 5G'], '')
})

test('shows and copies the current price and its barometer position', async () => {
  const barometer = {
    dataset: { bestprice: '293.5' },
    style: { getPropertyValue: property => property === '--_percent' ? ' 0.5 ' : '' }
  }
  const app = phone({}, [], barometer)
  const exported = await app.copy()
  for (const [field, value] of Object.entries({ 'Current price': '293.5', 'Price level (%)': '50%' })) {
    assert.equal(app.facts[field]?.textContent, value, field)
    assert.equal(exported[field], value, field)
  }
  assert.equal((await phone({}).copy())['Price level (%)'], '')
})

test('shows and copies the family from the link inside the dropdown template', async () => {
  const app = phone({}, [], null, {
    '.variant__header__headline': { textContent: 'Samsung Galaxy A57 5G Enterprise Edition 128GB awesome gray' },
    '#variant-dropdown-list-template': {
      content: {
        querySelector: selector => selector === '.variant-dropdown-item--more-link'
          ? { getAttribute: name => name === 'href' ? '/samsung-galaxy-a57-5g-v231493.html' : null }
          : null
      }
    }
  })
  assert.equal(app.facts.Family?.textContent, 'Samsung Galaxy A57 5G')
  assert.equal((await app.copy()).Family, 'Samsung Galaxy A57 5G')
  assert.equal((await phone({}).copy()).Family, '')
})

test('shows and copies the offer count and manufacturer link', async () => {
  const href = 'https://www.samsung.com/de/smartphones/galaxy-a/'
  const app = phone({}, [], null, {
    '#toc-offercount .count': { textContent: '24' },
    '#links .variant__content__list-item__link': [
      { textContent: 'Information beim Hersteller (englisch)', href: 'https://www.samsung.com/uk/smartphones/galaxy-a/' },
      { textContent: 'Information beim Hersteller (deutsch)', href }
    ]
  })
  const exported = await app.copy()
  assert.equal(app.facts['Offer count'].textContent, '24')
  assert.equal(exported['Offer count'], '24')
  assert.equal(app.facts['Manufacturer URL'].children[0].href, href)
  assert.equal(exported['Manufacturer URL'], href)
})

test('shows and copies the German manual instead of a datasheet or English manual', async () => {
  const href = 'https://gzhls.at/blob/ldb/manual-de.pdf'
  const app = phone({}, [], null, {
    '#downloads .variant__content__list-item__link': [
      { textContent: 'Datenblatt', href: 'https://gzhls.at/blob/ldb/datasheet.pdf' },
      { textContent: 'Bedienungsanleitung', href: 'https://gzhls.at/blob/ldb/manual-en.pdf' },
      { textContent: 'Bedienungsanleitung', href, parentElement: { querySelector: () => ({}) } }
    ]
  })
  assert.equal(app.facts.Bedienungsanleitung.children[0].href, href)
  assert.equal((await app.copy()).Bedienungsanleitung, href)
})

test('exports the copy time in the same format as listing dates', async () => {
  const app = phone({ 'Gelistet seit': '23.11.2026, 15:35' })
  const exported = await app.copy()
  assert.equal(app.facts['Copied at'], undefined)
  assert.equal(exported['Gelistet seit'], '2026-11-23 15:35')
  assert.match(exported['Copied at'], /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
  assert.ok(Math.abs(Date.now() - new Date(exported['Copied at'].replace(' ', 'T')).getTime()) < 120_000)
})
