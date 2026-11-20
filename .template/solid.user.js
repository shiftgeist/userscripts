// ==UserScript==
// @name        TEMPLATE: SOLID
// @namespace   shiftgeist
// @icon        https://www.google.com/s2/favicons?sz=64&domain=violentmonkey.github.io
// @version     0.0.1
// @timestamp   20261120.134
//
// @match       https://example.org/
// @grant       none
// @run-at      document-idle
//
// @author      shiftgeist
// @description Put your description here.
// @license     GNU GPLv3
//
// @homepage    https://github.com/shiftgeist/userscripts
// @updateURL   https://raw.githubusercontent.com/shiftgeist/userscripts/refs/heads/main/.template/solid.user.js
// @downloadURL https://raw.githubusercontent.com/shiftgeist/userscripts/refs/heads/main/.template/solid.user.js
// @supportURL  https://github.com/shiftgeist/userscripts/issues
// ==/UserScript==
;(async () => {
  'use strict'

  const id = '[TEMPLATE: SOLID]'
  const debug = window.localStorage.getItem('debug') === 'true'
  const $ = (selector, parent = document) => parent.querySelector(selector)
  const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)]

  const log = (...params) => debug && console.debug(id, ...params)
  const error = (...params) => console.error(id, ...params)

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

  try {
    const [{ createSignal }, { render }, { default: html }] = await Promise.all([
      import('https://esm.sh/solid-js@2.0.3'),
      import('https://esm.sh/@solidjs/web@2.0.3?deps=solid-js@2.0.3'),
      import('https://esm.sh/@solidjs/html@2.0.1?deps=solid-js@2.0.3,@solidjs/web@2.0.3')
    ])

    function main(element) {
      log('Target element found:', element)
      const mount = createElement('div')
      element.append(mount)

      render(() => {
        const [count, setCount] = createSignal(0)
        return html`
          <button type="button" onClick=${() => setCount(value => value + 1)}>
            Clicks: ${() => count()}
          </button>
        `
      }, mount)
    }

    waitForElement('body', main)
  } catch (e) {
    error(e)
  }
})()
