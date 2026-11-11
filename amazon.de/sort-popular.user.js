// ==UserScript==
// @name        Amazon.de — Bestseller by default
// @namespace   shiftgeist
// @icon        https://www.google.com/s2/favicons?sz=64&domain=amazon.de
// @version     0.0.1
// @timestamp   20261111.001
//
// @match       https://www.amazon.de/*
// @match       https://amazon.de/*
// @grant       none
// @run-at      document-idle
//
// @author      shiftgeist
// @description Select Bestseller when Amazon.de defaults to Empfohlen. Keep manual sort choices.
// @license     GNU GPLv3
//
// @homepage    https://github.com/shiftgeist/userscripts
// @updateURL   https://raw.githubusercontent.com/shiftgeist/userscripts/refs/heads/main/amazon.de/sort-popular.user.js
// @downloadURL https://raw.githubusercontent.com/shiftgeist/userscripts/refs/heads/main/amazon.de/sort-popular.user.js
// @supportURL  https://github.com/shiftgeist/userscripts/issues
// ==/UserScript==
;(() => {
  'use strict'

  const $ = selector => document.querySelector(selector)

  function applyDefault() {
    const select = $('#s-result-sort-select')
    if (select) {
      if (select.selectedOptions[0]?.textContent.trim() !== 'Empfohlen') return true

      const bestseller = [...select.options].find(option =>
        option.textContent.trim() === 'Bestseller'
      )
      if (!bestseller) return false

      select.value = bestseller.value
      select.dispatchEvent(new Event('change', { bubbles: true }))
      return true
    }

    const recommended = $('#s-result-sort-select_0')
    if (!recommended) return false
    if (recommended.getAttribute('aria-selected') !== 'true') return true

    const bestseller = $('#s-result-sort-select_1')
    if (bestseller?.textContent.trim() !== 'Bestseller') return false
    bestseller.click()
    return true
  }

  if (applyDefault()) return

  const observer = new MutationObserver(() => {
    if (applyDefault()) observer.disconnect()
  })
  observer.observe(document.documentElement, { childList: true, subtree: true })
})()
