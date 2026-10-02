// ==UserScript==
// @name        ${NAME}
// @namespace   shiftgeist
// @icon        https://www.google.com/s2/favicons?sz=64&domain=${WEBSITE}
// @version     0.0.1
// @timestamp   20261001.1113
//
// @match       https://${MATCH_WEBSITE}*
// @grant       none
// @run-at      document-idle
//
// @author      shiftgeist
// @description ${DESCRIPTION}
// @license     GNU GPLv3
//
// @homepage    https://github.com/shiftgeist/userscripts
// @updateURL   https://raw.githubusercontent.com/shiftgeist/userscripts/refs/heads/main/${PATH}.user.js
// @downloadURL https://raw.githubusercontent.com/shiftgeist/userscripts/refs/heads/main/${PATH}.user.js
// @supportURL  https://github.com/shiftgeist/userscripts/issues
// ==/UserScript==
;(() => {
  'use strict'

  const id = '[${NAME}]'
  const debug = window.localStorage.getItem('debug') === 'true'
  const $ = (selector, parent = document) => parent.querySelector(selector)
  const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)]

  const log = (...params) => debug && console.debug(id, ...params)
  const error = (...params) => debug && console.error(id, ...params)

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

  function main(element) {
    log('Target element found:', element)
  }

  try {
    waitForElement('${SELECTOR}', main)
  } catch (e) {
    error(e)
  }
})()
