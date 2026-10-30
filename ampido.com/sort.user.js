// ==UserScript==
// @name        Ampido Sorting
// @namespace   shiftgeist
// @icon        https://www.google.com/s2/favicons?sz=64&domain=ampido.com
// @version     0.0.1
// @timestamp   20261030.1200
//
// @match       https://www.ampido.com/searches*
// @grant       none
// @run-at      document-idle
//
// @author      shiftgeist
// @description Adds sorting (distance, rating, reviews, price) to Ampido parking search results
// @license     GNU GPLv3
//
// @homepage    https://github.com/shiftgeist/userscripts
// @updateURL   https://raw.githubusercontent.com/shiftgeist/userscripts/refs/heads/main/ampido.com/sort.user.js
// @downloadURL https://raw.githubusercontent.com/shiftgeist/userscripts/refs/heads/main/ampido.com/sort.user.js
// @supportURL  https://github.com/shiftgeist/userscripts/issues
// ==/UserScript==
;(() => {
  'use strict'

  const id = '[Ampido Sorting]'
  const debug = window.localStorage.getItem('debug') === 'true'
  const $ = (selector, parent = document) => parent.querySelector(selector)
  const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)]

  const log = (...params) => debug && console.debug(id, ...params)
  const error = (...params) => debug && console.error(id, ...params)

  const storageKey = 'ampido-sorting'
  const missingAscending = 99999
  const missingDescending = -1

  const sortOptions = [
    { value: 'original', label: 'Standard' },
    { value: 'distance-ascending', label: 'Entfernung (nah zuerst)' },
    { value: 'rating-descending', label: 'Bewertung (beste zuerst)' },
    { value: 'reviews-descending', label: 'Anzahl Bewertungen' },
    { value: 'price-ascending', label: 'Preis (günstig zuerst)' }
  ]

  const comparators = {
    original: (a, b) => a.originalIndex - b.originalIndex,
    'distance-ascending': (a, b) => a.distanceMinutes - b.distanceMinutes,
    'rating-descending': (a, b) => b.rating - a.rating,
    'reviews-descending': (a, b) => b.reviewCount - a.reviewCount,
    'price-ascending': (a, b) => a.price - b.price
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

  const firstNumber = (text) => {
    const match = text?.match(/\d+(?:[.,]\d+)?/)
    return match ? parseFloat(match[0].replace(',', '.')) : null
  }

  function readResult(listItem) {
    const distanceLabel = $('[aria-label^="Entfernung"]', listItem)?.getAttribute('aria-label')
    const ratingLabel = $('[aria-label^="Rating"], [aria-label^="Bewertung"]', listItem)
      ?.getAttribute('aria-label')
    const reviewCountText = $('.text-gray-600.text-sm', listItem)?.textContent
    const priceMatch = listItem.textContent.match(/(\d+(?:[.,]\d+)?)\s*€/)

    return {
      listItem,
      originalIndex: Number(listItem.dataset.originalIndex),
      distanceMinutes: firstNumber(distanceLabel) ?? missingAscending,
      rating: firstNumber(ratingLabel) ?? missingDescending,
      reviewCount: firstNumber(reviewCountText) ?? missingDescending,
      price: priceMatch ? firstNumber(priceMatch[1]) : missingAscending
    }
  }

  function main(resultsList) {
    const section = resultsList.closest('section')
    let nextOriginalIndex = 0

    const select = createElement(
      'select',
      { className: 'p-2 m-2 bg-white border border-gray-400 rounded' },
      sortOptions.map(({ value, label }) => createElement('option', { value, textContent: label }))
    )
    select.value = window.localStorage.getItem(storageKey) ?? 'original'
    section.before(select)

    const observer = new MutationObserver(applySorting)

    function applySorting() {
      observer.disconnect()
      try {
        // special_results items live in a nested turbo-frame, flatten them into one list
        const listItems = $$('li', section).filter((listItem) => $('h3', listItem))

        for (const listItem of listItems) {
          if (listItem.dataset.originalIndex) continue
          listItem.dataset.originalIndex = nextOriginalIndex++
        }

        const sortedItems = listItems.map(readResult).sort(comparators[select.value])
        resultsList.append(...sortedItems.map((result) => result.listItem))
        log('Sorted by', select.value, sortedItems.length)
      } catch (e) {
        error(e)
      }
      observer.observe(resultsList, { childList: true, subtree: true })
    }

    select.addEventListener('change', () => {
      window.localStorage.setItem(storageKey, select.value)
      applySorting()
    })

    applySorting()
  }

  try {
    waitForElement('section ul > li', (firstItem) => main(firstItem.parentElement))
  } catch (e) {
    error(e)
  }
})()
