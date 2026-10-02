// ==UserScript==
// @name        DeepL: Text Chunker
// @namespace   shiftgeist
// @icon        https://www.google.com/s2/favicons?sz=64&domain=deepl.com
// @version     0.0.5
// @timestamp   20261002.1310
//
// @match       https://www.deepl.com/*/translator
// @grant       none
// @run-at      document-idle
//
// @author      shiftgeist
// @description Chunk long text, step through chunks, copy all translations
// @license     GNU GPLv3
//
// @homepage    https://github.com/shiftgeist/userscripts
// @updateURL   https://raw.githubusercontent.com/shiftgeist/userscripts/refs/heads/main/deepl.com/text-chunker.user.js
// @downloadURL https://raw.githubusercontent.com/shiftgeist/userscripts/refs/heads/main/deepl.com/text-chunker.user.js
// @supportURL  https://github.com/shiftgeist/userscripts/issues
// ==/UserScript==
;(() => {
  'use strict'

  const id = '[DeepL Text Chunker]'
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

  const SOURCE_BOX_SELECTOR = '[data-testid="translator-source-input"] [role="textbox"]'
  const TARGET_BOX_SELECTOR = '[data-testid="translator-target-input"]'

  let chunks = []
  let translations = []
  let chunkIndex = 0
  let targetBeforeSwitch = ''
  let renderedKey = ''
  let pastedText = ''

  // DeepL cuts pasted text at the limit, so keep the full text from the paste event.
  document.addEventListener(
    'paste',
    (event) => {
      pastedText = event.clipboardData.getData('text/plain')
    },
    true
  )

  function readCounter() {
    const element = $$('p').find((p) => /^\d+\/\d+$/.test(p.textContent.trim()))
    if (!element) return null

    const [used, limit] = element.textContent.trim().split('/').map(Number)
    return { element, used, limit }
  }

  function readSourceLines() {
    return $$('p', $(SOURCE_BOX_SELECTOR)).map((p) => p.textContent)
  }

  function readTargetText() {
    const targetBox = $(TARGET_BOX_SELECTOR)
    return targetBox ? targetBox.innerText.trim() : ''
  }

  function writeSourceText(text) {
    const sourceBox = $(SOURCE_BOX_SELECTOR)
    sourceBox.focus()
    document.execCommand('selectAll')
    document.execCommand('insertText', false, text)
    sourceBox.blur()
  }

  function isTyping(element) {
    return element.isContentEditable || ['INPUT', 'TEXTAREA'].includes(element.tagName)
  }

  function handleKeydown(event) {
    const hasChunks = chunks.length > 0
    const hasModifier = event.ctrlKey || event.altKey || event.metaKey
    if (!hasChunks || hasModifier || isTyping(event.target)) return

    const isPrevious = event.key === 'ArrowLeft' || event.key === 'h'
    const isNext = event.key === 'ArrowRight' || event.key === 'l'
    const targetIndex = chunkIndex + (isNext ? 1 : -1)
    const isInRange = targetIndex >= 0 && targetIndex < chunks.length
    if (!(isPrevious || isNext) || !isInRange) return

    event.preventDefault()
    showChunk(targetIndex)
  }

  // The target still shows the previous chunk until DeepL delivers the new translation.
  // isForced: the user moved on, so whatever is shown counts as this chunk's translation.
  function captureTranslation(isForced = false) {
    const target = readTargetText()
    const isNewTranslation = target && target !== targetBeforeSwitch
    const isAccepted = isNewTranslation || (isForced && target && !translations[chunkIndex])
    if (!isAccepted) return

    translations[chunkIndex] = target
    log(`Captured translation ${chunkIndex + 1}/${chunks.length}:`, target.length)
  }

  async function copyAllTranslations() {
    captureTranslation(true)
    await navigator.clipboard.writeText(translations.join('\n'))
    log('Copied all translations')
  }

  // Only used when a single line is longer than the limit: split between words.
  function splitLineAtWords(line, limit) {
    const pieces = []
    let piece = ''

    for (const word of line.split(' ')) {
      const candidate = piece ? `${piece} ${word}` : word
      if (candidate.length <= limit) {
        piece = candidate
        continue
      }
      if (piece) pieces.push(piece)
      piece = word
    }

    if (piece) pieces.push(piece)
    return pieces
  }

  function chunkLines(lines, limit) {
    const fittingLines = lines.flatMap((line) =>
      line.length <= limit ? [line] : splitLineAtWords(line, limit)
    )
    const result = []
    let currentLines = []

    for (const line of fittingLines) {
      const candidate = [...currentLines, line].join('\n')
      if (candidate.length <= limit) {
        currentLines.push(line)
        continue
      }
      result.push(currentLines.join('\n'))
      currentLines = [line]
    }

    if (currentLines.length) result.push(currentLines.join('\n'))
    return result
  }

  function openChunk(index) {
    chunkIndex = index
    targetBeforeSwitch = readTargetText()
    writeSourceText(chunks[chunkIndex])
    log(`Showing chunk ${chunkIndex + 1}/${chunks.length}`)
    render()
  }

  function showChunk(index) {
    captureTranslation(true)
    openChunk(Math.min(Math.max(index, 0), chunks.length - 1))
  }

  function splitIntoChunks() {
    const { limit } = readCounter()
    const isPasteTruncated = pastedText.length > limit
    const lines = isPasteTruncated ? pastedText.split(/\r?\n/) : readSourceLines()

    chunks = chunkLines(lines, limit)
    translations = new Array(chunks.length)
    pastedText = ''
    log('Chunks:', chunks.map((chunk) => chunk.length))
    openChunk(0)
  }

  function closeChunks() {
    pastedText = ''
    chunks = []
    translations = []
    chunkIndex = 0
    render()
  }

  const panel = createElement('div')
  Object.assign(panel.style, {
    display: 'none',
    gap: '8px',
    alignItems: 'center',
    font: 'inherit',
    color: 'inherit'
  })

  function createButton(label, onClick, disabled = false) {
    return createElement('button', {
      className: 'Button as-ghost as-small',
      type: 'button',
      textContent: label,
      onclick: onClick,
      disabled
    })
  }

  function render() {
    const counter = readCounter()
    if (!counter) return

    const hasChunks = chunks.length > 0
    if (hasChunks) captureTranslation()

    // The counter group sits right of the spacer; the panel goes directly before it.
    const counterGroup = counter.element.parentElement
    const isPlaced = panel.nextElementSibling === counterGroup
    const translatedCount = translations.filter(Boolean).length

    const key = [
      chunks.length,
      chunkIndex,
      translatedCount,
      counter.used,
      counter.limit,
      pastedText.length,
      isPlaced
    ].join('|')
    if (key === renderedKey) return
    renderedKey = key

    if (!isPlaced) counterGroup.before(panel)
    panel.replaceChildren()

    if (hasChunks) {
      panel.append(
        createButton('◀', () => showChunk(chunkIndex - 1), chunkIndex === 0),
        createElement('span', { textContent: `${chunkIndex + 1} / ${chunks.length}` }),
        createButton('▶', () => showChunk(chunkIndex + 1), chunkIndex === chunks.length - 1),
        createButton(`Copy all (${translatedCount}/${chunks.length})`, copyAllTranslations),
        createButton('✕', closeChunks)
      )
      panel.style.display = 'flex'
      return
    }

    const isOverLimit = counter.used > counter.limit || pastedText.length > counter.limit
    if (!isOverLimit) {
      panel.style.display = 'none'
      return
    }

    panel.append(createButton('Split into chunks', splitIntoChunks))
    panel.style.display = 'flex'
  }

  function main(sourceBox) {
    log('Target element found:', sourceBox)
    document.addEventListener('keydown', handleKeydown)

    // Counter lives outside the textbox and DeepL may re-render the bar,
    // so watch the whole body. render() skips work when nothing changed.
    let frame = 0
    new MutationObserver(() => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(render)
    }).observe(document.body, { childList: true, subtree: true, characterData: true })

    render()
  }

  try {
    waitForElement(SOURCE_BOX_SELECTOR, main)
  } catch (e) {
    error(e)
  }
})()
