// ==UserScript==
// @name        Redirector
// @namespace   shiftgeist
// @icon        https://fav.farm/↗️
// @version     0.0.4
// @timestamp   20261105.094
//
// @match       http://*/*
// @match       https://*/*
// @grant       GM_openInTab
// @grant       window.close
// @grant       GM_getValue
// @grant       GM_setValue
// @grant       GM_registerMenuCommand
// @run-at      document-start
// @noframes
//
// @author      shiftgeist
// @description Redirect pages with a configurable list of URLs.
// @license     GNU GPLv3
//
// @homepage    https://github.com/shiftgeist/userscripts
// @updateURL   https://raw.githubusercontent.com/shiftgeist/userscripts/refs/heads/main/multi/redirector.user.js
// @downloadURL https://raw.githubusercontent.com/shiftgeist/userscripts/refs/heads/main/multi/redirector.user.js
// @supportURL  https://github.com/shiftgeist/userscripts/issues
// ==/UserScript==
;(() => {
  'use strict'

  let timer
  let countdown
  let countdownHost
  let countdownText
  let deadline
  let editor

  const id = '[Redirector]'
  const log = (...params) => {
    try {
      if (window.localStorage.getItem('debug') === 'true') console.debug(id, ...params)
    } catch {}
  }
  const error = (...params) => console.error(id, ...params)

  function stopTimer() {
    window.clearTimeout(timer)
    window.clearInterval(countdown)
    deadline = undefined
    hideCountdown()
  }

  function hideCountdown() {
    window.clearInterval(countdown)
    countdownHost?.remove()
    countdownHost = undefined
    countdownText = undefined
  }

  function updateCountdown() {
    if (!document.body) return
    if (!countdownHost) {
      countdownHost = createElement('div')
      countdownHost.style.cssText =
        'all: initial; position: fixed; bottom: 16px; right: 16px; z-index: 2147483647; pointer-events: none;'
      const shadow = countdownHost.attachShadow({ mode: 'closed' })
      countdownText = createElement('span')
      shadow.append(createElement('style', {
        textContent:
          'span { display: block; padding: 8px 12px; border-radius: 8px; background: #202124; color: #fff; font: 14px/1.5 system-ui, sans-serif; font-variant-numeric: tabular-nums; }'
      }), countdownText)
      document.body.append(countdownHost)
    }
    const seconds = Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
    const minutes = Math.floor(seconds / 60)
    countdownText.textContent = `Redirect in ${minutes}:${String(seconds % 60).padStart(2, '0')}`
  }

  function showCountdown() {
    if (deadline === undefined) return
    updateCountdown()
    countdown = window.setInterval(updateCountdown, 1000)
  }

  function startCountdown(timestamp) {
    deadline = timestamp
    showCountdown()
  }

  function restoreDeadline(source, destination, delay, clearHistory) {
    const rule = JSON.stringify([host(source), source.pathname, destination.href, delay, clearHistory])
    const timestamp = Date.now() + delay * 1000
    try {
      const saved = JSON.parse(window.sessionStorage.getItem('redirectorDeadline') ?? 'null')
      if (saved?.rule === rule && Number.isFinite(saved.deadline)
        && saved.deadline <= timestamp) return saved.deadline
      window.sessionStorage.setItem('redirectorDeadline', JSON.stringify({ rule, deadline: timestamp }))
    } catch (e) {
      log('Could not restore the deadline:', e)
    }
    return timestamp
  }

  function clearSavedDeadline() {
    try {
      window.sessionStorage.removeItem('redirectorDeadline')
    } catch (e) {
      log('Could not clear the deadline:', e)
    }
  }

  function validateRule(rule) {
    if (!rule || typeof rule !== 'object' || Array.isArray(rule)) {
      throw new Error('Each redirect must be an object.')
    }
    const { from, to, delay = 0, clearHistory = false } = rule
    if (typeof from !== 'string' || typeof to !== 'string') {
      throw new Error('Each redirect needs from and to URLs.')
    }
    const source = parseAddress(from)
    const destination = parseAddress(to)
    if (![source, destination].every(url => ['http:', 'https:'].includes(url.protocol))) {
      throw new Error('The URLs must use HTTP or HTTPS.')
    }
    if (!Number.isFinite(delay) || delay < 0 || delay * 1000 > 2147483647) {
      throw new Error('The delay must be a non-negative number within the timer limit.')
    }
    if (typeof clearHistory !== 'boolean') {
      throw new Error('The clearHistory option must be a boolean.')
    }
    return { source, destination, delay, clearHistory }
  }

  function parseAddress(value) {
    const address = value.trim()
    if (!address) throw new Error('Each redirect needs a source and destination address.')
    const hasPort = /^[^/?#:\s]+:\d+(?:[/?#]|$)/.test(address)
    const hasProtocol = !hasPort && /^[a-z][a-z\d+.-]*:/i.test(address)
    return new URL(hasProtocol ? address : `https://${address}`)
  }

  function host(url) {
    return url.host.replace(/^www\./, '')
  }

  function matches(source, current) {
    return host(source) === host(current)
      && (source.pathname === '/' || source.pathname === current.pathname)
  }

  function addDefaults() {
    if (GM_getValue('smallwebDefaultsAdded', false)) return
    const redirects = GM_getValue('redirects', [])
    if (!Array.isArray(redirects)) throw new Error('The stored list must be an array.')
    for (const [domain, delay] of [['instagram.com', 600], ['youtube.com', 1200]]) {
      const from = `https://${domain}/`
      const exists = redirects.some(rule => {
        try {
          const { source } = validateRule(rule)
          return host(source) === domain
        } catch {
          return false
        }
      })
      if (!exists) {
        redirects.push({ from, to: 'https://kagi.com/smallweb', delay, clearHistory: true })
      }
    }
    GM_setValue('redirects', redirects)
    GM_setValue('smallwebDefaultsAdded', true)
  }

  function createElement(tag, properties = {}, children = []) {
    const element = document.createElement(tag)
    Object.assign(element, properties)
    element.append(...children)
    return element
  }

  function editRedirects() {
    if (editor) {
      editor.focus()
      return
    }
    if (!document.body) {
      document.addEventListener('DOMContentLoaded', editRedirects, { once: true })
      return
    }

    stopTimer()
    const host = createElement('div')
    const shadow = host.attachShadow({ mode: 'closed' })
    const style = createElement('style', {
      textContent: `
        :host { all: initial; }
        * { box-sizing: border-box; }
        dialog { width: min(960px, calc(100vw - 32px)); max-height: calc(100vh - 32px);
          padding: 24px; border: 1px solid #bbb; border-radius: 12px;
          background: #fff; color: #202124; font: 15px/1.5 system-ui, sans-serif; }
        dialog::backdrop { background: #0008; }
        h2 { margin: 0 0 12px; }
        p { margin: 0 0 16px; }
        fieldset { display: grid; grid-template-columns: 1fr 1fr; gap: 12px;
          margin: 0 0 16px; padding: 16px; border: 1px solid #ccc; border-radius: 8px; }
        label { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
        label.checkbox { flex-direction: row; align-items: center; }
        input, select { width: 100%; padding: 8px; border: 1px solid #888; border-radius: 4px;
          background: #fff; color: #202124; font: inherit; }
        input[type=checkbox] { width: auto; }
        button { padding: 8px 14px; border: 1px solid #888; border-radius: 4px;
          background: #f3f4f6; color: #202124; cursor: pointer; font: inherit; }
        button[type=submit] { background: #185abc; border-color: #185abc; color: #fff; }
        .actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
        .actions > :first-child { margin-right: auto; }
        .error { color: #b3261e; white-space: pre-wrap; }
        @media (max-width: 640px) { fieldset { grid-template-columns: 1fr; } }
      `
    })
    const title = createElement('h2', { id: 'redirector-title', textContent: 'Redirects' })
    const help = createElement('p', {
      textContent:
        'The first matching rule applies. The host and port must match. A source path matches only that path. A bare domain matches all paths. Rules ignore the protocol and www. Addresses do not need https://. Changes apply on the next page visit. “Close old tab” does not delete your browser history.'
    })
    const rows = createElement('div')
    const message = createElement('p', { className: 'error' })
    message.setAttribute('role', 'alert')
    const fields = []
    const form = document.createElement('form')
    const dialog = document.createElement('dialog')
    dialog.setAttribute('aria-labelledby', title.id)
    let saved = false

    function addRow(rule = {}) {
      const from = createElement('input', { type: 'text', required: true, value: rule.from ?? '' })
      const to = createElement('input', { type: 'text', required: true, value: rule.to ?? '' })
      const delay = createElement('input', {
        type: 'number',
        min: '0',
        max: '2147483.647',
        step: 'any',
        required: true,
        value: String(rule.delay ?? 0)
      })
      const clearHistory = createElement('input', { type: 'checkbox',
        checked: rule.clearHistory === true })
      const remove = createElement('button', { type: 'button', textContent: 'Delete' })
      const row = createElement('fieldset', {}, [
        createElement('legend', { textContent: 'Redirect' }),
        createElement('label', {}, ['Source address', from]),
        createElement('label', {}, ['Destination address', to]),
        createElement('label', {}, ['Delay in seconds', delay]),
        createElement('label', { className: 'checkbox' }, [clearHistory, 'Close old tab']),
        remove
      ])
      const entry = { row, from, to, delay, clearHistory }
      fields.push(entry)
      remove.addEventListener('click', () => {
        fields.splice(fields.indexOf(entry), 1)
        row.remove()
      })
      rows.append(row)
      return from
    }

    const add = createElement('button', { type: 'button', textContent: 'Add' })
    const cancel = createElement('button', { type: 'button', textContent: 'Cancel' })
    const save = createElement('button', { type: 'submit', textContent: 'Save' })
    add.addEventListener('click', () => addRow({ from: window.location.href }).focus())
    cancel.addEventListener('click', () => dialog.close())
    form.addEventListener('submit', event => {
      event.preventDefault()
      message.textContent = ''
      try {
        const redirects = fields.map(({ from, to, delay, clearHistory }, index) => {
          const rule = {
            from: from.value.trim(),
            to: to.value.trim(),
            delay: Number(delay.value),
            clearHistory: clearHistory.checked
          }
          try {
            validateRule(rule)
          } catch (e) {
            throw new Error(`Redirect ${index + 1}: ${e.message}`)
          }
          return rule
        })
        GM_setValue('redirects', redirects)
        saved = true
        dialog.close()
      } catch (e) {
        error(e)
        message.textContent = `Could not save: ${e.message}`
      }
    })
    dialog.addEventListener('close', () => {
      host.remove()
      editor = undefined
      if (!saved) {
        try {
          main()
        } catch (e) {
          error(e)
        }
      }
    }, { once: true })

    try {
      const redirects = GM_getValue('redirects', [])
      if (!Array.isArray(redirects)) throw new Error('The stored list must be an array.')
      redirects.forEach(rule => addRow(rule ?? {}))
    } catch (e) {
      error(e)
      message.textContent = `Could not open the complete list: ${e.message}`
    }
    form.append(title, help, rows, message,
      createElement('div', { className: 'actions' }, [add, cancel, save]))
    dialog.append(form)
    shadow.append(style, dialog)
    document.body.append(host)
    editor = dialog
    dialog.showModal()
  }

  function redirect(source, destination, clearHistory) {
    const current = new URL(window.location.href)
    if (!matches(source, current)) return
    if (destination.href === current.href) return

    try {
      log('Redirect:', current.href, destination.href)
      if (clearHistory) {
        const tab = GM_openInTab(destination.href, { active: true })
        if (!tab) throw new Error('Could not open the destination tab.')
        window.close()
      } else {
        window.location.replace(destination.href)
      }
    } catch (e) {
      error(e)
    }
  }

  function main() {
    const redirects = GM_getValue('redirects', [])
    if (!Array.isArray(redirects)) throw new Error('The stored list must be an array.')
    for (const rule of redirects) {
      try {
        const { source, destination, delay, clearHistory } = validateRule(rule)
        const current = new URL(window.location.href)
        if (!matches(source, current)) continue
        if (destination.href === window.location.href) return

        const remaining = Math.max(0,
          restoreDeadline(source, destination, delay, clearHistory) - Date.now())
        if (remaining === 0) {
          clearSavedDeadline()
          redirect(source, destination, clearHistory)
        } else {
          startCountdown(Date.now() + remaining)
          timer = window.setTimeout(() => {
            stopTimer()
            clearSavedDeadline()
            redirect(source, destination, clearHistory)
          }, remaining)
          window.addEventListener('pagehide', stopTimer, { once: true })
        }
        return
      } catch (e) {
        error(e)
      }
    }
  }

  try {
    addDefaults()
    GM_registerMenuCommand('Edit redirects', editRedirects)
    main()
  } catch (e) {
    error(e)
  }
})()
