// ==UserScript==
// @name        Blend Model Pricing
// @namespace   shiftgeist
// @icon        https://www.google.com/s2/favicons?sz=64&domain=models.dev
// @version     0.0.1
//
// @match       https://models.dev/*
// @grant       none
// @run-at      document-idle
//
// @author      shiftgeist
// @description Show the combined pricing of input and output tokens per 1m
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

  const usdFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
  const currency = {
    format: (amount) => usdFormatter.format(amount),
    parse: (text) => Number(text.replace(/[^0-9.-]/g, ''))
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

    const priceCellTh = $('thead > tr > th:nth-child(5)', table)
    log('priceCellTh', priceCellTh)

    const blendTh = createElement('th', { scope: 'col', innerText: 'Blend' })
    blendTh.className = 'sortable'
    blendTh.dataset.type = 'number'
    priceCellTh.after(blendTh)

    const priceCells = $$('tbody > tr > td:nth-child(5)', table)
    log('priceCells', priceCells)

    priceCells.forEach(cell => {
      const parsed = parsePrices(cell.innerText)
      log('parsed', parsed)

      const blended = blend(parsed)
      log('combined', blended)

      const format = currency.format(blended)
      log('format', format)

      const blendTd = createElement('td', { innerText: format })
      blendTd.dataset.sort = `${blended.toFixed(2)}`

      cell.dataset.sort = `${blended.toFixed(2)}`

      cell.after(blendTd)
    })
  }

  waitForElement('.table-wrap > table', main)
})()
