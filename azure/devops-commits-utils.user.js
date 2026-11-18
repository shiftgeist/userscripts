// ==UserScript==
// @name        Azure DevOps Repository Commit History Utils
// @namespace   shiftgeist
// @icon        https://www.google.com/s2/favicons?sz=64&domain=dev.azure.com
// @version     0.0.1
// @timestamp   20261118.124
//
// @match       https://dev.azure.com/*/*/_git/*/commits*
// @grant       none
// @run-at      document-idle
//
// @author      shiftgeist
// @description Adds a button to copy the commit hash on Azure DevOps repository commit history pages
// @license     GNU GPLv3
//
// @homepage    https://github.com/shiftgeist/userscripts
// @updateURL   https://raw.githubusercontent.com/shiftgeist/userscripts/refs/heads/main/azure/repo-commit-utils.user.js
// @downloadURL https://raw.githubusercontent.com/shiftgeist/userscripts/refs/heads/main/azure/repo-commit-utils.user.js
// @supportURL  https://github.com/shiftgeist/userscripts/issues
// ==/UserScript==
;(() => {
  'use strict'

  const id = '[Azure DevOps Commit Utils]'
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

  function extractCommitHash(row) {
    const shortSpan = $('span.monospaced-xs', row)
    return shortSpan?.textContent?.trim() || null
  }

  function createCopyButton(commitHash) {
    const icon = createElement('span', {
      className: 'small left-icon flex-noshrink fabric-icon ms-Icon--Copy medium'
    })
    icon.setAttribute('aria-hidden', 'true')

    const iconWrapper = createElement('span', { className: 'fluent-icons-enabled' }, [icon])

    const button = createElement(
      'button',
      {
        type: 'button',
        className: 'icon-only bolt-button bolt-icon-button enabled subtle bolt-focus-treatment',
        title: 'Copy commit hash'
      },
      [iconWrapper]
    )
    button.dataset.copyCommitHash = commitHash
    button.setAttribute('aria-label', 'Copy commit hash')
    Object.assign(button.style, {
      marginLeft: '4px',
      padding: '0 4px',
      minWidth: '20px',
      height: '20px'
    })

    let resetTimer
    button.addEventListener('click', async event => {
      event.preventDefault()
      event.stopPropagation()

      const currentHash = button.dataset.copyCommitHash
      if (!currentHash) return

      try {
        await navigator.clipboard.writeText(currentHash)
        log('Copied commit hash:', currentHash)
        icon.className = 'small left-icon flex-noshrink fabric-icon ms-Icon--CheckMark medium'
        button.title = 'Copied!'
        clearTimeout(resetTimer)
        resetTimer = setTimeout(() => {
          icon.className = 'small left-icon flex-noshrink fabric-icon ms-Icon--Copy medium'
          button.title = 'Copy commit hash'
        }, 1500)
      } catch (e) {
        error(e)
      }
    })

    return button
  }

  function enhanceRows() {
    for (const row of $$('table.repos-commits-table tbody tr.bolt-table-row')) {
      const commitHash = extractCommitHash(row)
      const shortSpan = $('span.monospaced-xs', row)
      if (!commitHash || !shortSpan) continue

      const existingButton = $('[data-copy-commit-hash]', row)
      if (existingButton) {
        existingButton.dataset.copyCommitHash = commitHash
        continue
      }

      const button = createCopyButton(commitHash)
      ;(shortSpan.parentElement ?? shortSpan).after(button)
    }
  }

  try {
    enhanceRows()
    const observer = new MutationObserver(enhanceRows)
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['href']
    })
  } catch (e) {
    error(e)
  }
})()
