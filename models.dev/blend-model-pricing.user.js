// ==UserScript==
// @name        Blend Model Pricing
// @namespace   shiftgeist
// @icon        https://www.google.com/s2/favicons?sz=64&domain=models.dev
// @version     0.0.4
//
// @match       https://models.dev/*
// @grant       none
// @run-at      document-idle
//
// @author      shiftgeist
// @description Show blended token prices and model release dates
// @license     GNU GPLv3
//
// @homepage    https://github.com/shiftgeist/userscripts
// @updateURL   https://raw.githubusercontent.com/shiftgeist/userscripts/refs/heads/main/models.dev/blend-model-pricing.user.js
// @downloadURL https://raw.githubusercontent.com/shiftgeist/userscripts/refs/heads/main/models.dev/blend-model-pricing.user.js
// @supportURL  https://github.com/shiftgeist/userscripts/issues
// ==/UserScript==
;(() => {
  'use strict'

  const debug = window.localStorage.getItem('debug') === 'true'
  const $ = (selector, parent = document) => parent.querySelector(selector)
  const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)]

  function log(...params) {
    if (debug) console.debug('[Blend]', ...params)
  }

  function createElement(tagName, properties = {}, children = []) {
    const element = document.createElement(tagName)
    Object.assign(element, properties)
    element.append(...children)
    return element
  }

  function waitForElement(selector, callback) {
    const existing = $(selector)
    if (existing) return callback(existing)

    const observer = new MutationObserver(() => {
      const element = $(selector)
      if (!element) return
      observer.disconnect()
      callback(element)
    })
    observer.observe(document.documentElement, { childList: true, subtree: true })
  }

  const usdFormatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 4
  })
  const currency = {
    format: (amount) => usdFormatter.format(amount),
    parse: (text) => /^\$[\d,.]+$/.test(text) ? Number(text.slice(1).replace(/,/g, '')) : NaN
  }

  function parsePrices(prices) {
    return prices.split('/').map(v => v.trim()).map(currency.parse)
  }

  function blend([inputPrice, outputPrice] = [2, 10],
    [inputTokens, outputTokens] = [1_000_000, 1_000_000])
  {
    const totalTokens = inputTokens + outputTokens
    if (totalTokens === 0) return 0

    const inputShare = inputTokens / totalTokens
    const outputShare = outputTokens / totalTokens

    return inputPrice * inputShare + outputPrice * outputShare
  }

  function main(table) {
    log('Target element found:', table)

    const thCells = $$('thead > tr > th', table)
    log('thCells', thCells)

    const priceCellTh = thCells.find(v =>
      v.textContent.replace(/[↑↓]/g, '').trim().toLowerCase() === 'price'
    )
    log('priceCellTh', priceCellTh, thCells.indexOf(priceCellTh))
    if (!priceCellTh) return

    const blendTh = createElement('th', { scope: 'col' })
    blendTh.className = 'sortable'
    blendTh.dataset.type = 'number'
    const indicator = createElement('span', { className: 'sort-indicator' })
    indicator.setAttribute('aria-hidden', 'true')
    const button = createElement('button', { type: 'button', className: 'sort-button' }, ['Blend',
      indicator])
    blendTh.append(button)
    priceCellTh.after(blendTh)
    const releasedTh = createElement('th', { scope: 'col', className: 'sortable' })
    const releasedIndicator = createElement('span', { className: 'sort-indicator' })
    releasedIndicator.setAttribute('aria-hidden', 'true')
    releasedTh.append(createElement('button', { type: 'button', className: 'sort-button' }, [
      'Released', releasedIndicator
    ]))
    thCells.at(-1).after(releasedTh)
    ;[blendTh, ...thCells.slice(thCells.indexOf(priceCellTh) + 1), releasedTh].forEach(header => {
      const sortButton = $('button', header)
      if (!header.classList.contains('sortable') || !sortButton) return
      sortButton.addEventListener('click', event => {
        event.stopImmediatePropagation()
        const direction = header.getAttribute('aria-sort') === 'ascending'
          ? 'descending'
          : 'ascending'
        const tbody = table.tBodies[0]
        const rows = [...tbody.rows].filter(row => !row.classList.contains('empty-row'))
        const sortValue = row => {
          const cell = row.cells[header.cellIndex]
          const value = cell?.dataset.sort ?? cell?.textContent.trim() ?? ''
          return value === '-' ? '' : value
        }
        rows.sort((a, b) => {
          const aValue = sortValue(a)
          const bValue = sortValue(b)
          if (aValue === '') return bValue === '' ? 0 : 1
          if (bValue === '') return -1
          const comparison = header.dataset.type === 'number'
            ? Number(aValue) - Number(bValue)
            : aValue.localeCompare(bValue, undefined, { numeric: true, sensitivity: 'base' })
          return comparison * (direction === 'ascending' ? 1 : -1)
        })
        rows.forEach(row => tbody.append(row))
        $$('.sortable', table).forEach(sortable => {
          sortable.removeAttribute('aria-sort')
          const sortIndicator = $('.sort-indicator', sortable)
          if (sortIndicator) sortIndicator.textContent = ''
        })
        header.setAttribute('aria-sort', direction)
        const sortIndicator = $('.sort-indicator', header)
        if (sortIndicator) sortIndicator.textContent = direction === 'ascending' ? '↑' : '↓'
      }, true)
    })

    const priceCells = $$(`tbody > tr > td:nth-child(${thCells.indexOf(priceCellTh) + 1})`, table)
    log('priceCells', priceCells)

    priceCells.forEach(cell => {
      const parsed = parsePrices(cell.textContent)
      log('parsed', parsed)

      const blended = parsed.length === 2 && parsed.every(Number.isFinite) ? blend(parsed) : NaN
      log('combined', blended)

      const format = Number.isFinite(blended) ? currency.format(blended) : '-'
      log('format', format)

      const blendTd = createElement('td', { innerText: format, className: 'numeric' })
      blendTd.dataset.sort = Number.isFinite(blended) ? String(blended) : ''
      if (cell.dataset.sort !== undefined) cell.dataset.originalSort = cell.dataset.sort
      cell.dataset.sort = blendTd.dataset.sort

      cell.after(blendTd)
    })
    const releaseCells = $$('tbody > tr', table)
      .filter(row => !row.classList.contains('empty-row'))
      .map(row => {
        const cell = createElement('td', { textContent: '-' })
        cell.dataset.sort = ''
        row.append(cell)
        return { row, cell }
      })
    $$('.empty-row > td[colspan]', table).forEach(cell => cell.colSpan += 2)

    fetch('/api.json')
      .then(response => {
        if (!response.ok) throw new Error(`Model metadata request failed: ${response.status}`)
        return response.json()
      })
      .then(providers => {
        const dates = new Map()
        Object.entries(providers).forEach(([providerId, provider]) => {
          Object.values(provider.models).forEach(model => {
            dates.set(`${providerId}/${model.id}`, model.release_date)
            if (model.canonical_model_id && model.release_date) {
              dates.set(model.canonical_model_id, model.release_date)
            }
          })
        })
        releaseCells.forEach(({ row, cell }) => {
          const providerModel = $('[data-copy-value]', row)?.dataset.copyValue
          const modelLink = $('a[href^="/models/"]', row)?.getAttribute('href')
          const date = dates.get(providerModel) ?? dates.get(modelLink?.replace(/^\/models\//, '').replace(/\/$/, ''))
          cell.textContent = date || '-'
          cell.dataset.sort = date || ''
        })
      })
      .catch(error => console.warn('[Blend] Could not load release dates:', error))
  }

  waitForElement('.table-wrap > table', main)
})()
