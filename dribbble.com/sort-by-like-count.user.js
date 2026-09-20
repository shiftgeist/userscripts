// ==UserScript==
// @name        Dribbble: Sort by Likes
// @namespace   shiftgeist
// @icon        https://www.google.com/s2/favicons?sz=64&domain=dribbble.com
// @version     20260826.0
//
// @match       https://dribbble.com/search/*
// @grant       none
// @run-at      document-idle
//
// @author      shiftgeist
// @description Sorts Dribbble search results by like count, descending
// @license     GNU GPLv3
//
// @updateURL   https://raw.githubusercontent.com/shiftgeist/userscripts/refs/heads/main/dribbble.com/sort-by-like-count.user.js
// @downloadURL https://raw.githubusercontent.com/shiftgeist/userscripts/refs/heads/main/dribbble.com/sort-by-like-count.user.js
// ==/UserScript==
;(() => {
  'use strict'

  let isSorting = false

  function parseLikeCount(text) {
    const match = text.trim().match(/^([\d.]+)(k)?$/i)
    if (!match) return 0
    const value = parseFloat(match[1])
    return match[2] ? value * 1000 : value
  }

  function getLikeCount(item) {
    const el = item.querySelector('[data-shot-like-count]')
    if (!el) return -1
    return parseLikeCount(el.textContent)
  }

  function sortGrid() {
    const grid = document.querySelector('.js-thumbnail-grid')
    if (!grid) return

    const items = Array.from(grid.querySelectorAll(':scope > li.shot-thumbnail'))
    if (items.length < 2) return

    const ads = items.filter((item) => item.dataset.boostId)
    const shots = items.filter((item) => !item.dataset.boostId)
    shots.sort((a, b) => getLikeCount(b) - getLikeCount(a))

    isSorting = true
    const fragment = document.createDocumentFragment()
    shots.forEach((item) => fragment.appendChild(item))
    ads.forEach((item) => fragment.appendChild(item))
    grid.appendChild(fragment)
    isSorting = false
  }

  function observeGrid(grid) {
    let debounceTimer = null
    const observer = new MutationObserver(() => {
      if (isSorting) return
      clearTimeout(debounceTimer)
      debounceTimer = setTimeout(sortGrid, 300)
    })
    observer.observe(grid, { childList: true })
  }

  function waitForGrid(callback) {
    const existing = document.querySelector('.js-thumbnail-grid')
    if (existing) {
      callback(existing)
      return
    }
    const bodyObserver = new MutationObserver(() => {
      const grid = document.querySelector('.js-thumbnail-grid')
      if (!grid) return
      bodyObserver.disconnect()
      callback(grid)
    })
    bodyObserver.observe(document.body, { childList: true, subtree: true })
  }

  waitForGrid((grid) => {
    sortGrid()
    observeGrid(grid)
  })
})()
