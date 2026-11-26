// ==UserScript==
// @name        Geizhals: Copy as CSV
// @namespace   shiftgeist
// @icon        https://www.google.com/s2/favicons?sz=64&domain=geizhals.de
// @version     0.0.1
// @timestamp   20261123.164
// @match       https://geizhals.de/*-a*.html
// @match       https://geizhals.at/*-a*.html
// @match       https://geizhals.eu/*-a*.html
// @grant       none
// @run-at      document-idle
// @author      shiftgeist
// @description Copy product specifications in category-specific column order.
// @license     GNU GPLv3
// @homepage    https://github.com/shiftgeist/userscripts
// @updateURL   https://raw.githubusercontent.com/shiftgeist/userscripts/refs/heads/main/geizhals.de/copy-as-csv.user.js
// @downloadURL https://raw.githubusercontent.com/shiftgeist/userscripts/refs/heads/main/geizhals.de/copy-as-csv.user.js
// @supportURL  https://github.com/shiftgeist/userscripts/issues
// ==/UserScript==
;(() => {
  'use strict'

  const $ = (selector, parent = document) => parent.querySelector(selector)
  const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)]
  const clean = value => String(value ?? '').replace(/\u200b/g, '').replace(/\s+/g, ' ').trim()
  const text = element => clean(element?.textContent)
  const label = value => clean(value).replace(/:$/, '').toLowerCase()
  const escapeRegExp = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

  const numberToken = /[+−-]?(?:\d{1,3}(?:[. ]\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?)/.source

  const identitySelectors = {
    name: '.variant__header__headline',
    ratingUser: '.variant__header__rating',
    ratingTester: '.variant__header__metascore-wrapper'
  }

  const defaultColumns = [
    {
      name: 'Family',
      source: () => {
        const link = $('#variant-dropdown-list .variant-dropdown-item--more-link')
          ?? $('#variant-dropdown-list-template')?.content?.querySelector('.variant-dropdown-item--more-link')
        const href = link?.getAttribute('href')
        if (!href) return ''
        const slug = capture(new URL(href, document.baseURI).pathname, /^\/([^/]+)-v\d+\.html$/i)
        const family = slug.replaceAll('-', ' ')
        const prefix = text($(identitySelectors.name)).slice(0, family.length)
        return prefix.toLowerCase() === family.toLowerCase() ? prefix : family
      }
    },
    {
      name: 'Name',
      source: () => text($(identitySelectors.name))
    },
    {
      name: 'Copied at',
      source: (_, copiedAt) => copiedAt ? formatDateTime(copiedAt) : ''
    },
    {
      name: 'Source',
      source: () => location.href
    },
    {
      name: 'Offer count',
      source: () => parseNumber(text($('#toc-offercount .count')))
    },
    {
      name: 'Manufacturer URL',
      source: manufacturerUrl,
      links: () => [manufacturerUrl()].filter(Boolean)
    },
    {
      name: 'Bedienungsanleitung',
      source: manualUrl,
      links: () => [manualUrl()].filter(Boolean)
    },
    {
      name: 'Price',
      source: () => $('.barometer')?.dataset.bestprice ?? ''
    },
    {
      name: 'Price level (%)',
      source: () => {
        const position = $('.barometer')?.style.getPropertyValue('--_percent').trim()
        const ratio = Number(position)
        return position && ratio >= 0 && ratio <= 1 ? `${Number((ratio * 100).toPrecision(12))}%` : ''
      }
    },
    {
      name: 'User rating',
      source: () => percent(capture(text($(identitySelectors.ratingUser)), /Bewertung:\s*(\d+(?:[.,]\d+)?)/i), 5)
    },
    {
      name: 'User rating count',
      source: () => capture(text($(identitySelectors.ratingUser)), /[/]\s*(\d+)\s+Bewertung/i)
    },
    {
      name: 'Test rating',
      source: () => percent(capture(text($(identitySelectors.ratingTester)), /Testbewertung:\s*(\d+)/i), 100)
    },
    {
      name: 'Test rating count',
      source: () => capture(text($(identitySelectors.ratingTester)), /aus\s+(\d+)\s+Testbericht/i)
    },
    parsedColumn('Letztes Preisupdate', 'Letztes Preisupdate', parseGermanDateTime),
    parsedColumn('Gelistet seit', 'Gelistet seit', parseGermanDateTime)
  ]

  const phoneColumns = [
    parsedColumn(
      'Android',
      'Betriebssystem',
      v => capture(v, /\bAndroid (\d+(?:[.,]\d+)*)/i)
    ),
    parsedColumn(
      'Android-Oberfläche',
      'Betriebssystem',
      v => capture(v, /\bAndroid [\d.,]+\s*\([^)/]+\/\s*([^)]+)\)/i)
    ),
    parsedColumn(
      'Support Betriebssystem',
      'Betriebssystem',
      v => captureNumber(v, /(\d+)\s+Betriebssystem-Updates?\b/i)
    ),
    parsedColumn(
      'Support Sicherheits',
      'Betriebssystem',
      v => captureNumber(v, /(\d+)\s+Jahre?\s+Sicherheits-Updates?\b/i)
    ),
    parsedColumn(
      'Display (Zoll)',
      'Display',
      v => captureNumber(v, /(\d+(?:[.,]\d+)?)\s*["″]/)
    ),
    parsedColumn(
      'Vertikale Pixel',
      'Display',
      v => captureNumber(v, /(\d+)\s*[x×]\s*\d+\s*Pixel/i)
    ),
    parsedColumn(
      'Horizontale Pixel',
      'Display',
      v => captureNumber(v, /\d+\s*[x×]\s*(\d+)\s*Pixel/i)
    ),
    parsedColumn(
      'Farben (Mio.)',
      'Display',
      v => captureNumber(v, /(\d+(?:[.,]\d+)?)\s*Mio\.?\s*Farben/i)
    ),
    parsedColumn(
      'Displaytyp',
      'Display',
      v => capture(v, /(?:^|,)\s*([^,]*(?:AMOLED|OLED|LCD|IPS|TFT|LTPS|IGZO|Mini[- ]LED)[^,]*?)(?=\s*,|$)/i)
    ),
    parsedColumn(
      'Aktualisierungsrate (Hz)',
      'Display',
      v => captureNumber(v, /(\d+(?:[.,]\d+)?)\s*Hz\b/i)
    ),
    parsedColumn(
      'PPI',
      'Display',
      v => numberInUnit(v, 'ppi')
    ),
    parsedColumn(
      'Kamera hinten: Anzahl',
      'Kamera hinten',
      countLenses
    ),
    ...mainCameraColumns('Kamera hinten'),
    ...rearLensColumns('Weitwinkel', /\b(?:Ultra[- ]?)?Weitwinkelobjektiv\b/i),
    ...rearLensColumns('Makro', /\bMakroobjektiv\b/i),
    ...mainCameraColumns('Kamera vorne'),
    parsedColumn('USB-C Version', 'Schnittstellen', v => capture(v, /\bUSB-C (\d+(?:\.\d+)*)\b/i)),
    parsedColumn('Wi-Fi Version', 'Schnittstellen', v => {
      const version = capture(v, /\bWi-Fi (\d+)E?\b/i)
      return version && Number(version).toFixed(1)
    }),
    parsedColumn('Bluetooth Version', 'Schnittstellen', v => capture(v, /\bBluetooth (\d+(?:\.\d+)*)\b/i)),
    parsedColumn('has NFC', 'Schnittstellen', v => v && (/\bNFC\b/i.test(v) ? 'TRUE' : 'FALSE')),
    ...['Beschleunigungssensor', 'Gyroskop', 'Annäherungssensor', 'Lichtsensor', 'Kompass', 'Barometer']
      .map(name =>
        parsedColumn(name, 'Sensoren', v =>
          v && (v.split(',').some(sensor => label(sensor.split('(')[0]) === label(name)) ? 'TRUE' : 'FALSE'))
      ),
    parsedColumn('Fingerabdrucksensor Typ', 'Sensoren', v => capture(v, /\bFingerabdrucksensor\s*\(([^)]+)\)/i)),
    fieldColumn('SoC'),
    fieldColumn('CPU'),
    cpuColumn('CPU gesamt (GHz)', 'total'),
    cpuColumn('CPU Effizienz (GHz)', 'efficiency'),
    cpuColumn('CPU Leistung (GHz)', 'performance'),
    cpuColumn('CPU-Kerne', 'cores'),
    fieldColumn('GPU'),
    parsedColumn('RAM (GB)', 'RAM', v => numberInUnit(v, 'GB')),
    fieldColumn('Speicher'),
    parsedColumn('Interner Speicher (GB)', 'Speicher', storageInGb),
    parsedColumn(
      'Speicher erweiterbar',
      'Speicher',
      v => capture(v, /\b(microSD(?:HC|XC|UC)?|SD(?:HC|XC|UC)?|Nano[- ]Memory|NM[- ]Card)\b/i)
    ),
    fieldColumn('Navigation'),
    fieldColumn('Modem'),
    parsedColumn('has 5G', 'Frequenzbänder', v => v && (/\b5G\b/i.test(v) ? 'TRUE' : 'FALSE')),
    fieldColumn('Akku'),
    parsedColumn('Akku (mAh)', 'Akku', v => numberInUnit(v, 'mAh')),
    fieldColumn('Ladeleistung'),
    parsedColumn('Ladeleistung (W)', 'Ladeleistung', v => numberInUnit(v, 'W')),
    fieldColumn('SAR-Wert'),
    fieldColumn('Gehäuseform'),
    fieldColumn('Gehäusematerial'),
    parsedColumn('SIM-Steckplätze', 'SIM-Karte', v => parseSim(v).slots),
    parsedColumn('SIM-Typen', 'SIM-Karte', v => parseSim(v).types),
    fieldColumn('Besonderheiten'),
    parsedColumn('IP Staub', 'Besonderheiten', v => capture(v, /\bIP([0-9X])[0-9X]K?\b/i).toUpperCase()),
    parsedColumn('IP Wasser', 'Besonderheiten', v => capture(v, /\bIP[0-9X]([0-9X])K?\b/i).toUpperCase()),
    fieldColumn('Farbe'),
    fieldColumn('Abmessungen'),
    fieldColumn('Gewicht'),
    fieldColumn('Screen-to-Body-Ratio'),
    accessoryColumn('Taschen & Hüllen'),
    accessoryColumn('Displayschutz')
  ]

  const notebookColumns = [
    parsedColumn('Display (Zoll)', 'Display', v => numberInUnit(v, '"')),
    parsedColumn('Displayauflösung', 'Display',
      v => capture(v, /\b(\d+\s*[x×]\s*\d+)\b/i).replace(/\s/g, '').replace('×', 'x')),
    parsedColumn('PPI', 'Display', v => numberInUnit(v, 'ppi')),
    parsedColumn('Aktualisierungsrate (Hz)', 'Display', v => captureNumber(v, /(\d+(?:[.,]\d+)?)\s*Hz\b/i)),
    parsedColumn('Helligkeit (cd/m²)', 'Display', v => numberInUnit(v.replace(/\u200b/g, ''), 'cd/m²')),
    parsedColumn('Reaktionszeit (ms)', 'Display', v => numberInUnit(v, 'ms')),
    parsedColumn('CPU', 'CPU', v => v.split(',')[0].trim()),
    parsedColumn('CPU (GHz)', 'CPU', maxClock),
    parsedColumn('RAM (GB)', 'RAM', storageInGb),
    { name: 'Storage', source: sources => notebookStorage(sources)?.capacity ?? '' },
    { name: 'Storage type', source: sources => notebookStorage(sources)?.type ?? '' },
    parsedColumn('Grafik', 'Grafik', v => v.split(',')[0].trim()),
    parsedColumn('Grafik (GHz)', 'Grafik', maxClock),
    ...[
      ['USB-C', /(\d+)\s*x\s*USB-C\b/gi],
      ['USB-A', /(\d+)\s*x\s*USB-A\b/gi],
      ['HDMI', /(\d+)\s*x\s*HDMI\b/gi],
      ['3.5mm Klinke', /(\d+)\s*x\s*3[.,]5\s*mm\s+Klinke\b/gi]
    ].map(([name, pattern]) =>
      parsedColumn(name, 'Anschlüsse', v =>
        v && String([...v.matchAll(pattern)].reduce((sum, match) => sum + Number(match[1]), 0)))
    ),
    parsedColumn('Wi-Fi Version', 'Wireless', v => capture(v, /\bWi-Fi\s+(\d+)(?:E)?\b/i)),
    parsedColumn('Bluetooth Version', 'Wireless', v => capture(v, /\bBluetooth\s+(\d+(?:\.\d+)*)\b/i)),
    parsedColumn('Kamera', 'Kamera', v => v && (/^(?:nein|keine?|nicht vorhanden|[-–])$/i.test(v) ? 'No' : 'Yes')),
    parsedColumn('Akku (Wh)', 'Akku', v => numberInUnit(v, 'Wh')),
    parsedColumn('Netzteil (W)', 'Netzteil', v => numberInUnit(v, 'W')),
    parsedColumn('Gewicht (kg)', 'Gewicht', v => numberInUnit(v, 'kg')),
    {
      name: 'USB-Schreibweise',
      source: sources => {
        const source = sources.get('usb-schreibweise')
        for (const value of [source?.value ?? '', ...(source?.links ?? []).map(link => link.href)]) {
          const [, version, generation] = /USB\s*(\d+(?:\.\d+)?)\s*Gen\s*(\d+x\d+)/i.exec(value) ?? []
          if (version) return `USB ${version} Gen ${generation.toLowerCase()}`
        }
        return ''
      }
    }
  ]

  function notebookStorage(sources) {
    for (const type of ['ssd', 'flash']) {
      const capacity = storageInGb(sources.get(type)?.value ?? '')
      if (capacity !== '') return { capacity, type }
    }
  }

  function maxClock(value) {
    const clocks = [...value.matchAll(/(\d+(?:[.,]\d+)?)\s*GHz\b/gi)]
    return clocks.length ? String(Math.max(...clocks.map(match => Number(match[1].replace(',', '.'))))) : ''
  }

  const allColumns = [
    ...defaultColumns,
    ...phoneColumns,
    ...notebookColumns
  ]

  function parseNumber(value) {
    let token = value.match(numberToken)?.[0]
    if (!token) return ''
    token = token.replace(/ /g, '').replace('−', '-')
    if (token.includes(',') || /^[+-]?\d{1,3}(?:\.\d{3})+$/.test(token)) {
      token = token.replace(/\./g, '').replace(',', '.')
    }
    const number = Number(token)
    if (!Number.isFinite(number)) return ''
    return String(number)
  }

  function readSources(section) {
    const sources = new Map()
    for (const item of $$('.specs-grid__item', section)) {
      const name = text($('dt', item))
      const key = label(name)
      if (!key) continue
      const details = $('dd', item)
      const source = { name, value: text(details) }
      if ((key === 'zubehör' || key === 'usb-schreibweise') && details) {
        source.links = $$('a[href]', details)
          .filter(link => /^https?:\/\//i.test(link.href))
          .map(link => ({ key: label(text(link)), href: link.href }))
      }
      sources.set(key, source)
    }
    return sources
  }

  function fieldColumn(name) {
    const key = label(name)
    return { name, source: sources => sources.get(key)?.value ?? '' }
  }

  function parsedColumn(name, field, parse) {
    const key = label(field)
    return { name, source: sources => parse(sources.get(key)?.value ?? '') }
  }

  function manufacturerUrl() {
    const links = $$('#links .variant__content__list-item__link')
      .filter(link => /^https?:\/\//i.test(link.href) && /^Information beim Hersteller\b/i.test(text(link)))
    return (links.find(link => /\(deutsch\)$/i.test(text(link))) ?? links[0])?.href ?? ''
  }

  function manualUrl() {
    const links = $$('#downloads .variant__content__list-item__link')
      .filter(link => /^https?:\/\//i.test(link.href) && /^Bedienungsanleitung\b/i.test(text(link)))
    return (links.find(link => link.parentElement?.querySelector('img[alt="deutsch" i]')) ?? links[0])?.href ?? ''
  }

  function accessoryColumn(name) {
    const key = label(name)
    const links = sources =>
      (sources.get('zubehör')?.links ?? []).filter(link => link.key === key).map(link => link.href)
    return { name, links, source: sources => links(sources).join(', ') }
  }

  function cpuColumn(name, metric) {
    return parsedColumn(name, 'CPU', v => parseCpu(v)[metric])
  }

  function parseCpu(value) {
    const groups = [...value.matchAll(/\b(\d+)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*GHz\b/gi)]
      .map(([, count, speed]) => ({ cores: Number(count), ghz: Number(speed.replace(',', '.')) }))
    if (!groups.length) {
      return {
        total: '',
        efficiency: '',
        performance: numberInUnit(value, 'GHz'),
        cores: captureNumber(value, /(\d+)\s+Kerne?\b/i)
      }
    }
    const speeds = groups.map(group => group.ghz)
    const fastest = Math.max(...speeds)
    const slowest = Math.min(...speeds)
    const total = groups.reduce((sum, group) => sum + group.cores * group.ghz, 0)
    return {
      total: String(Number(total.toPrecision(12))),
      efficiency: slowest === fastest ? '' : String(slowest),
      performance: String(fastest),
      cores: String(groups.reduce((sum, group) => sum + group.cores, 0))
    }
  }

  function storageInGb(value) {
    const match = /^(\d+(?:[.,]\d+)?)\s*(GB|TB)\b/i.exec(value)
    if (!match) return ''
    const [, capacity, unit] = match
    return String(Number(capacity.replace(',', '.')) * (unit.toLowerCase() === 'tb' ? 1000 : 1))
  }

  function parseSim(value) {
    const sims = [...value.matchAll(/\b(?:(\d+)\s*[x×]\s*)?(Nano-SIM|Micro-SIM|Mini-SIM|Standard-SIM|eSIM)\b/gi)]
    const types = [...new Set(sims.map(([, , type]) => type))].join(', ')
    if (!sims.length) return { slots: '', types }
    const physical = sims.filter(([, , type]) => !/^esim$/i.test(type))
    if (sims.length === 1 && physical.length && !sims[0][1] && /\bDual-SIM\b/i.test(value)) {
      return { slots: '2', types }
    }
    const slots = physical.reduce((sum, [, count]) => sum + Number(count ?? 1), 0)
    return { slots: String(slots), types }
  }

  function mainCameraColumns(field) {
    const column = (name, parse) => parsedColumn(`${field}: Hauptkamera ${name}`, field, v => parse(v.split(';', 1)[0]))
    return [
      column('(MP)', cameraMegapixels),
      column('Blende (f/)', cameraAperture),
      column('Videoauflösung', v => capture(v, /Videos?\s*@\s*(\d+p)\s*\//i)),
      column('Video (fps)', v => capture(v, /Videos?\s*@\s*\d+p\s*\/\s*(\d+)\s*fps\b/i))
    ]
  }

  function rearLensColumns(name, pattern) {
    const field = 'Kamera hinten'
    const lens = value => value.split(';').find(part => pattern.test(part)) ?? ''
    return [
      parsedColumn(`${field}: ${name}`, field, v => v && String(Boolean(lens(v)))),
      parsedColumn(`${field}: ${name} (MP)`, field, v => cameraMegapixels(lens(v))),
      parsedColumn(`${field}: ${name} Blende (f/)`, field, v => cameraAperture(lens(v)))
    ]
  }

  function cameraMegapixels(value) {
    return captureNumber(value, /(\d+(?:[.,]\d+)?)\s*MP\b/i)
  }

  function cameraAperture(value) {
    return capture(value, /\bf\/\s*(\d+(?:[.,]\d+)?(?:-\d+(?:[.,]\d+)?)?)/i).replace(/,/g, '.')
  }

  function capture(value, pattern) {
    return pattern.exec(value)?.[1] ?? ''
  }

  function captureNumber(value, pattern) {
    return parseNumber(capture(value, pattern))
  }

  function parseGermanDateTime(value) {
    const [date, time] = value.split(', ')
    const [day, month, year] = date.split('.')
    return formatDateTime(new Date(`${year}-${month}-${day}T${time}`))
  }

  function formatDateTime(date) {
    return date.toLocaleString('sv-SE', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  function numberInUnit(value, unit) {
    const pattern = new RegExp(`(${numberToken})\\s*${escapeRegExp(unit)}(?![\\p{L}\\p{N}])`, 'iu')
    return captureNumber(value, pattern)
  }

  function percent(value, max) {
    const score = parseNumber(value)
    if (score === '') return ''
    return `${Number((Number(score) * 100 / max).toPrecision(12))}%`
  }

  function countLenses(value) {
    if (!value) return ''
    let count = 0
    for (const lens of value.split(';')) {
      if (/\d+(?:[.,]\d+)?\s*MP\b/i.test(lens)) count++
    }
    return String(count)
  }

  function escapeFormula(value) {
    const cell = clean(value)
    return /^[=+@-]/.test(cell) && !/^[+-]?\d+(?:[.,]\d+)?$/.test(cell) ? `'${cell}` : cell
  }

  const toTsv = values => values.map(escapeFormula).join('\t')

  function categoryId() {
    const crumbs = $$(
      '.breadcrumbs__nav .breadcrumbs__item > a, .breadcrumbs__nav .breadcrumbs__item > .locitem > a'
    )
    for (const crumb of crumbs.reverse()) {
      const href = crumb.getAttribute('href')
      if (!href) continue
      const id = new URL(href, document.baseURI).searchParams.get('cat')
      if (id !== null) return id
    }
    return ''
  }

  function getColumns(id, sources) {
    if (id === 'nb') return [...defaultColumns, ...notebookColumns]
    if (id === 'umtsover') return [...defaultColumns, ...phoneColumns]

    const knownKeys = new Set(allColumns.map(column => label(column.name)))
    for (const [key, { name }] of sources) {
      if (knownKeys.has(key)) continue
      allColumns.push(fieldColumn(name))
    }
    return allColumns
  }

  function showFacts(section, columns, sources) {
    const element = (tag, className) => Object.assign(document.createElement(tag), { className })
    const facts = document.createElement('section')
    facts.id = 'parsed-product-facts'
    const grid = element('dl', 'specs-grid opened extra-spacing')
    for (const column of columns) {
      const links = column.links?.(sources) ?? []
      const value = links.length ? '' : column.source(sources)
      if (!links.length && value === '') continue

      const row = element('div', 'specs-grid__item')
      row.style.display = 'grid'
      row.style.gridTemplateColumns = 'minmax(0, 45%) minmax(0, 1fr)'
      const header = document.createElement('dt')
      header.textContent = column.name
      const cell = document.createElement('dd')
      if (!links.length) cell.textContent = value
      for (const [index, href] of links.entries()) {
        if (index) cell.append(', ')
        const link = document.createElement('a')
        link.href = href
        link.textContent = href
        cell.append(link)
      }
      row.append(header, cell)
      grid.append(row)
    }

    const head = element('div', 'variant__content__head')
    const title = element('h2', 'variant__content__title')
    const anchor = document.createElement('a')
    anchor.href = '#parsed-product-facts'
    const count = element('span', 'count')
    count.textContent = String(grid.children.length)
    const titleText = element('span', 'text')
    titleText.textContent = 'Parsed product facts'
    anchor.append(count, ' ', titleText)
    title.append(anchor)
    head.append(title)

    const specs = element('div', 'variant__content__specs')
    const wrapper = element('div', 'variant__content__specs-grid-wrapper opened')
    wrapper.append(grid)
    specs.append(wrapper)
    facts.append(head, specs)
    section.after(facts)
  }

  function copyButton(name, onClick) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'button'
    button.textContent = name
    button.addEventListener('click', onClick)
    return button
  }

  try {
    const section = $('#data')
    if (!section) return

    const id = categoryId()
    const sources = readSources(section)
    const columns = getColumns(id, sources)
    showFacts(section, columns, sources)

    const controls = document.createElement('div')
    controls.style.cssText = `
      position: fixed;
      right: 1rem;
      bottom: 1rem;
      z-index: 1000;
      background: Canvas;
      color: CanvasText;
      padding: 0.5rem;
      border-radius: 0.5rem;
      box-shadow: 0 2px 8px #0004;
    `
    const status = document.createElement('div')
    status.setAttribute('role', 'status')
    let statusTimer

    async function copy(read, message) {
      try {
        const currentSources = readSources(section)
        const currentColumns = getColumns(id, currentSources)
        const copiedAt = new Date()
        const values = currentColumns.map(column => read(column, currentSources, copiedAt))
        await navigator.clipboard.writeText(toTsv(values))
        clearTimeout(statusTimer)
        status.textContent = message
        statusTimer = setTimeout(() => {
          status.textContent = ''
        }, 3000)
      } catch (error) {
        clearTimeout(statusTimer)
        status.textContent = error.message
      }
    }

    const copyRow = copyButton('Copy row', () =>
      copy((column, sources, copiedAt) => column.source(sources, copiedAt), 'Row copied.'))
    const copyHeaders = copyButton('Copy headers', () => copy(column => column.name, 'Headers copied.'))
    copyRow.title = 'Control+Shift+F9'
    copyRow.setAttribute('aria-keyshortcuts', copyRow.title)
    document.addEventListener('keydown', event => {
      if (event.key !== 'F9' || !event.ctrlKey || !event.shiftKey || event.altKey || event.metaKey) return
      if (event.defaultPrevented || event.repeat
        || event.target?.closest?.('input, textarea, select, [contenteditable]')) return
      event.preventDefault()
      copyRow.click()
    })
    const buttons = document.createElement('div')
    buttons.style.display = 'flex'
    buttons.style.gap = '0.5rem'
    buttons.append(copyRow, copyHeaders)
    controls.append(status, buttons)
    section.append(controls)
  } catch (error) {
    console.error('[Geizhals: Copy as CSV]', error)
  }
})()
