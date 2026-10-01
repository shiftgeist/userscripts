// ==UserScript==
// @name        WhatsApp: Chat Text and Image URL Exporter
// @namespace   shiftgeist
// @icon        https://www.google.com/s2/favicons?sz=64&domain=web.whatsapp.com
// @version     0.0.1
// @timestamp   20261001.0928
//
// @match       https://web.whatsapp.com/*
// @grant       GM_getValue
// @grant       GM_setValue
// @grant       GM_deleteValue
// @grant       GM_setClipboard
// @grant       GM_registerMenuCommand
// @run-at      document-idle
//
// @author      shiftgeist
// @description Read the open WhatsApp Web chat while you scroll, cache it and export it as JSON.
// @license     GNU GPLv3
//
// @homepage    https://github.com/shiftgeist/userscripts
// @updateURL   https://raw.githubusercontent.com/shiftgeist/userscripts/refs/heads/main/web.whatsapp.com/export/script.user.js
// @downloadURL https://raw.githubusercontent.com/shiftgeist/userscripts/refs/heads/main/web.whatsapp.com/export/script.user.js
// @supportURL  https://github.com/shiftgeist/userscripts/issues
// ==/UserScript==
;(function() {
'use strict'

const PANEL_ID = 'wau-export-panel'
const TOGGLE_ID = 'wau-export-toggle'
const STYLE_ID = 'wau-export-style'
const STORAGE_PREFIX = 'wau-export:chat:'
const CACHE_VERSION = 1
const EXPORT_VERSION = 9
const EVENT_LOG_LIMIT = 200
const CAPTURE_DELAY_MS = 100
const SAVE_DELAY_MS = 1500
const SYNC_INTERVAL_MS = 250
const STABLE_SYNCS = 2
const NOTICE_MS = 6000

const SCROLLER_SELECTOR = '[data-testid="conversation-panel-messages"]'
const MESSAGE_SELECTOR = '[data-id][data-testid^="conv-msg-"]'
const DEBUG_ENABLED = typeof location !== 'undefined'
  && new URLSearchParams(location.search).get('debug') === 'true'

const OLDER_PROMPT = 'get older messages from your phone'
const PHONE_NOTICE = 'use whatsapp on your phone to see older messages'
const UNAVAILABLE_PROMPT = "this message couldn't load"
const HISTORY_START_MARKERS = ['you joined from the community']
const IGNORED_CHAT_TITLES = new Set(['profile details', 'contact info', 'group info'])

const eventLog = []

function logEvent(message) {
  if (!DEBUG_ENABLED) {
    return
  }

  const time = new Date().toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
  eventLog.push(`${time} ${message}`)
  eventLog.splice(0, eventLog.length - EVENT_LOG_LIMIT)
  const log = document.getElementById(PANEL_ID)?.querySelector('[data-role="event-log"]')
  if (log) {
    log.textContent = eventLog.join('\n')
    log.scrollTop = log.scrollHeight
  }
}

function normalizeText(value) {
  return String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function stripEmojis(value) {
  return normalizeText(
    normalizeText(value)
      .replace(/[0-9#*]\uFE0F?\u20E3/gu, '')
      .replace(/\p{Regional_Indicator}/gu, '')
      .replace(/\p{Extended_Pictographic}/gu, '')
      .replace(/\p{Emoji_Modifier}/gu, '')
      .replace(/[\u200D\uFE0E\uFE0F]/gu, '')
      .replace(/[ \t]{2,}/g, ' ')
  )
}

function isEmojiOnly(text) {
  return Boolean(normalizeText(text)) && stripEmojis(text) === ''
}

function isDeletedMessage(text) {
  return /^this message was deleted(?: by admin(?:\s+.+)?)?$/iu.test(normalizeText(text))
}

function getDefaultLocale() {
  if (typeof document !== 'undefined' && document.documentElement?.lang) {
    return document.documentElement.lang
  }

  return typeof navigator !== 'undefined' && navigator.language ? navigator.language : 'en-US'
}

function getDatePartOrder(locale) {
  try {
    return new Intl.DateTimeFormat(locale, {
      calendar: 'gregory',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      timeZone: 'UTC'
    })
      .formatToParts(new Date(Date.UTC(2006, 10, 22)))
      .map((part) => part.type)
      .filter((part) => ['year', 'month', 'day'].includes(part))
  } catch {
    return ['month', 'day', 'year']
  }
}

function formatIsoDate(year, month, day) {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${
    String(day).padStart(2, '0')
  }`
}

function normalizeDateLabel(value, locale = getDefaultLocale(), now = new Date()) {
  const label = normalizeText(value)
  const lowerLabel = label.toLocaleLowerCase(locale)
  const relativeDays = new Map([['today', 0], ['yesterday', 1], ['heute', 0], ['gestern', 1]])
  let daysAgo = relativeDays.get(lowerLabel)

  for (let offset = 0; daysAgo === undefined && offset < 7; offset += 1) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset)
    const weekdayNames = ['long', 'short'].map((weekday) =>
      new Intl.DateTimeFormat(locale, { weekday }).format(date).toLocaleLowerCase(locale)
    )
    if (weekdayNames.includes(lowerLabel)) {
      daysAgo = offset
    }
  }

  if (daysAgo !== undefined) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo)
    return formatIsoDate(date.getFullYear(), date.getMonth() + 1, date.getDate())
  }

  const parts = label.match(/\d+/g)
  if (!parts || parts.length !== 3) {
    return null
  }

  let year
  let month
  let day
  if (parts[0].length === 4) {
    ;[year, month, day] = parts.map(Number)
  } else {
    const order = getDatePartOrder(locale)
    ;({ year, month, day } = Object.fromEntries(
      order.map((part, index) => [part, Number(parts[index])])
    ))
  }

  if (year < 100) {
    year += 2000
  }

  const parsed = new Date(Date.UTC(year, month - 1, day))
  const valid = parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day

  return valid ? formatIsoDate(year, month, day) : null
}

function normalizeTimeLabel(value) {
  const match = normalizeText(value)
    .replace(/\./g, '')
    .match(/^(\d{1,2}):(\d{2})\s*([ap]m)?$/i)

  if (!match) {
    return null
  }

  let hour = Number(match[1])
  const minute = Number(match[2])
  const meridiem = match[3]?.toLowerCase()

  if (minute > 59 || (meridiem ? hour < 1 || hour > 12 : hour > 23)) {
    return null
  }

  if (meridiem) {
    hour = (hour % 12) + (meridiem === 'pm' ? 12 : 0)
  }

  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

function extractTimeLabel(value) {
  return normalizeText(value).match(/\d{1,2}:\d{2}(?:\s*[ap]\.?m\.?)?/gi)?.at(-1)?.trim() || null
}

function parseChatId(messageId) {
  return String(messageId ?? '').match(/^(?:true|false)_([^_]+)_/)?.[1] || null
}

function findChatId(messageIds) {
  const chatIds = new Set(messageIds.map(parseChatId).filter(Boolean))

  return chatIds.size === 1 ? [...chatIds][0] : null
}

function parseMetadata(rawMetadata) {
  const match = String(rawMetadata ?? '').trim().match(/^\[(.*?),\s+(.*?)\]\s+(.*?):\s*$/s)

  return match ? { timeLabel: match[1], dateLabel: match[2], sender: match[3] } : null
}

function textWithEmoji(element) {
  const clone = element.cloneNode(true)

  for (const lineBreak of clone.querySelectorAll('br')) {
    lineBreak.replaceWith('\n')
  }
  for (const image of clone.querySelectorAll('img')) {
    image.replaceWith(image.dataset.plainText || image.alt || '')
  }

  return normalizeText(clone.textContent)
}

function readMessageText(element) {
  const parts = [...element.querySelectorAll('[data-testid~="selectable-text"]')]
    .filter((node) => node.tagName !== 'IMG')
    .filter((node) => !node.parentElement?.closest('[data-testid~="selectable-text"]'))
    .map(textWithEmoji)
    .filter(Boolean)

  return [...new Set(parts)].join('\n')
}

function isDatePill(element) {
  if (element.children.length > 0 || element.closest(MESSAGE_SELECTOR)) {
    return false
  }

  const text = normalizeText(element.textContent)
  return text.length > 0 && text.length <= 20 && Boolean(normalizeDateLabel(text))
}

function collectDatePills(scroller) {
  return [...scroller.querySelectorAll('span')]
    .filter(isDatePill)
    .map((element) => ({ element, label: normalizeText(element.textContent) }))
}

function findDatePillLabel(messageElement, datePills) {
  return datePills.findLast(({ element }) =>
    element.compareDocumentPosition(messageElement) & Node.DOCUMENT_POSITION_FOLLOWING
  )?.label || null
}

function readMetadata(element, datePills) {
  const parsed = [...element.querySelectorAll('[data-pre-plain-text]')]
    .map((node) => parseMetadata(node.getAttribute('data-pre-plain-text')))
    .find(Boolean)
  const authors = [...element.querySelectorAll('[data-testid="author"]')]
    .map((node) => normalizeText(node.textContent))
    .filter(Boolean)

  return {
    sender: parsed?.sender || authors.at(-1) || null,
    timeLabel: parsed?.timeLabel
      || extractTimeLabel(element.querySelector('[data-testid="msg-meta"]')?.textContent),
    dateLabel: parsed?.dateLabel || findDatePillLabel(element, datePills)
  }
}

function readMessage(element, datePills, locale = getDefaultLocale()) {
  const id = element.dataset.id
  const visibleText = normalizeText(element.innerText).toLowerCase()

  if (element.querySelector('[data-testid="msg-notification-container"]')) {
    return {
      id,
      kind: 'notice',
      historyStart: HISTORY_START_MARKERS.some((marker) => visibleText.includes(marker))
    }
  }

  if (!element.querySelector('[data-testid="msg-container"]')) {
    return { id, kind: 'unknown' }
  }

  const metadata = readMetadata(element, datePills)
  return {
    id,
    kind: 'message',
    sender: metadata.sender,
    dateLabel: normalizeDateLabel(metadata.dateLabel, locale),
    time: normalizeTimeLabel(metadata.timeLabel),
    text: readMessageText(element),
    poll: Boolean(element.querySelector('[data-testid="poll-bubble"]')),
    unavailable: visibleText.includes(UNAVAILABLE_PROMPT)
  }
}

function mergeMessage(existing, incoming) {
  if (!existing) {
    return incoming
  }
  if (incoming.kind === 'unknown') {
    return existing
  }

  const merged = { ...existing }
  for (const [field, value] of Object.entries(incoming)) {
    if (value !== null && value !== undefined) {
      merged[field] = value
    }
  }
  for (const flag of ['poll', 'unavailable', 'historyStart']) {
    if (flag in existing || flag in incoming) {
      merged[flag] = Boolean(existing[flag] || incoming[flag])
    }
  }
  if ('text' in existing || 'text' in incoming) {
    const existingText = existing.text || ''
    const incomingText = incoming.text || ''
    merged.text = incomingText.length >= existingText.length ? incomingText : existingText
  }

  return JSON.stringify(merged) === JSON.stringify(existing) ? existing : merged
}

function mergeVisibleOrder(orderedIds, visibleIds) {
  const newIds = [...new Set(visibleIds)]
  const existingIds = new Set(orderedIds)

  if (!newIds.some((id) => existingIds.has(id))) {
    orderedIds.unshift(...newIds)
    return
  }

  let cursor = -1
  newIds.forEach((id, index) => {
    const existingIndex = orderedIds.indexOf(id)
    if (existingIndex !== -1) {
      cursor = existingIndex
      return
    }

    const nextAnchor = newIds.slice(index + 1).find((candidate) => orderedIds.includes(candidate))
    const insertionIndex = nextAnchor ? orderedIds.indexOf(nextAnchor) : cursor + 1
    orderedIds.splice(insertionIndex, 0, id)
    cursor = insertionIndex
  })
}

function createChatCache(saved) {
  const valid = saved?.version === CACHE_VERSION
  const messages = new Map(Object.entries(valid ? saved.messages : {}))
  let runs = valid ? saved.runs.map((run) => [...run]) : []

  const runKey = (run) => {
    const first = run.map((id) => messages.get(id)).find((message) =>
      message?.dateLabel && message.time
    )
    return first ? `${first.dateLabel}T${first.time}` : '\uffff'
  }
  const sortRuns = (list) => list.sort((left, right) => runKey(left).localeCompare(runKey(right)))
  const signature = () => runs.map((run) => `${run.length}:${run[0]}:${run.at(-1)}`).join('|')

  function addView(views) {
    const known = views.filter((view) => view.id)
    if (known.length === 0) {
      return { added: 0, changed: false }
    }

    const signatureBefore = signature()
    let added = 0
    let changed = false
    for (const view of known) {
      const existing = messages.get(view.id)
      const merged = mergeMessage(existing, view)
      added += existing ? 0 : 1
      if (merged !== existing) {
        messages.set(view.id, merged)
        changed = true
      }
    }

    const viewIds = new Set(known.map((view) => view.id))
    const joined = [...viewIds]
    const separate = []
    for (const run of runs) {
      if (run.some((id) => viewIds.has(id))) {
        mergeVisibleOrder(joined, run)
      } else {
        separate.push(run)
      }
    }
    runs = sortRuns([...separate, joined])

    return { added, changed: changed || signature() !== signatureBefore }
  }

  return {
    addView,
    clear() {
      messages.clear()
      runs = []
    },
    getMessages: () => runs.flat().map((id) => messages.get(id)),
    hasHistoryStart: () => runs.some((run) => run.some((id) => messages.get(id)?.historyStart)),
    get size() {
      return messages.size
    },
    get gapCount() {
      return Math.max(0, runs.length - 1)
    },
    serialize: () => ({ version: CACHE_VERSION, messages: Object.fromEntries(messages), runs })
  }
}

function analyzeMessage(message) {
  if (message.kind !== 'message') {
    return { excludedReasons: [`kind:${message.kind}`], exported: null }
  }

  const reasons = []
  const text = stripEmojis(message.text)
  if (message.poll) {
    reasons.push('poll')
  }
  if (message.unavailable) {
    reasons.push('unavailable')
  }
  if (!message.sender) {
    reasons.push('missing-sender')
  }
  if (!message.time) {
    reasons.push('missing-time')
  }
  if (!message.dateLabel) {
    reasons.push('missing-date')
  }
  if (isDeletedMessage(message.text)) {
    reasons.push('deleted')
  } else if (isEmojiOnly(message.text)) {
    reasons.push('emoji-only')
  } else if (!text) {
    reasons.push('no-text')
  }

  return {
    excludedReasons: reasons,
    exported: reasons.length
      ? null
      : { sender: message.sender, timestamp: `${message.dateLabel}T${message.time}`, text }
  }
}

function summarizeCache(cache) {
  const analyses = cache.getMessages().map(analyzeMessage)
  const exported = analyses.map((analysis) => analysis.exported).filter(Boolean)
  const excluded = {}
  for (const reason of analyses.flatMap((analysis) => analysis.excludedReasons)) {
    excluded[reason] = (excluded[reason] || 0) + 1
  }

  return {
    exported,
    excluded,
    complete: cache.hasHistoryStart() && cache.gapCount === 0
  }
}

function buildPayload(chatName, cache, now = new Date()) {
  const { exported, excluded, complete } = summarizeCache(cache)
  const warnings = []
  if (cache.gapCount > 0) {
    warnings.push(`The cache has ${cache.gapCount} gap(s). Messages between them are missing.`)
  }
  if (!cache.hasHistoryStart()) {
    warnings.push('The history start is not captured. Older messages can be missing.')
  }
  if (excluded['missing-date']) {
    warnings.push(`${excluded['missing-date']} messages have no date and are not exported.`)
  }

  return {
    format: 'whatsapp-web-chat-export',
    version: EXPORT_VERSION,
    exportedAt: now.toISOString(),
    chat: { name: chatName },
    complete,
    gaps: cache.gapCount,
    stats: { captured: cache.size, messages: exported.length, excluded },
    messages: exported,
    warnings
  }
}

function describeStatus(
  { chatName, size, exported, gapCount, complete, hint, saveFailed, notice }
) {
  if (!chatName) {
    return 'Open a chat to start the capture.'
  }

  const gaps = gapCount ? ` · ${gapCount} ${gapCount === 1 ? 'gap' : 'gaps'}` : ''
  const lines = [`${size} captured · ${exported} exportable${gaps}`]

  if (complete) {
    lines.push('Complete. Export now.')
  } else if (size === 0) {
    lines.push('Scroll to the top of the chat. The script reads what WhatsApp shows.')
  } else if (gapCount > 0) {
    lines.push('Scroll up until the loaded messages reach the cached ones.')
  } else {
    lines.push('Scroll to the top for the full history, or export a partial result.')
  }

  if (hint === 'older-prompt') {
    lines.push('Click “get older messages from your phone” yourself.')
  } else if (hint === 'phone-notice') {
    lines.push('WhatsApp Web has no older messages. Re-link this device to load more.')
  }
  if (saveFailed) {
    lines.push('The cache could not be saved.')
  }
  if (notice) {
    lines.push(notice)
  }

  return lines.join('\n')
}

function detectHint(scroller) {
  const root = scroller.closest('#main') || scroller
  const hasText = (element, phrase) =>
    normalizeText(element.textContent).toLowerCase().includes(phrase)

  if ([...root.querySelectorAll('button, [role="button"]')].some((el) =>
    hasText(el, OLDER_PROMPT)
  )) {
    return 'older-prompt'
  }

  const isPhoneNotice = [...scroller.children]
    .filter((child) => !child.querySelector(MESSAGE_SELECTOR))
    .some((child) => hasText(child, PHONE_NOTICE))

  return isPhoneNotice ? 'phone-notice' : null
}

function sanitizeFilename(value) {
  return String(value)
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    || 'whatsapp-chat'
}

function formatFilenameTimestamp(date = new Date()) {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z').replace(/:/g, '-')
}

function downloadJson(payload, chatName) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${sanitizeFilename(chatName)}-${formatFilenameTimestamp()}.json`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 30000)
}

async function copyText(text) {
  try {
    if (typeof GM_setClipboard === 'function') {
      GM_setClipboard(text, 'text')
      return true
    }
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

const storage = {
  read(key) {
    try {
      const raw = typeof GM_getValue === 'function'
        ? GM_getValue(key, null)
        : localStorage.getItem(key)
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  },
  write(key, value) {
    try {
      const raw = JSON.stringify(value)
      if (typeof GM_setValue === 'function') {
        GM_setValue(key, raw)
      } else {
        localStorage.setItem(key, raw)
      }
      return true
    } catch {
      return false
    }
  },
  remove(key) {
    if (typeof GM_deleteValue === 'function') {
      GM_deleteValue(key)
    } else {
      localStorage.removeItem(key)
    }
  }
}

function readChatName(header) {
  const isUsable = (title) => title && !IGNORED_CHAT_TITLES.has(title.toLowerCase())
  const titles = [...header.querySelectorAll('span[title], div[title]')]
    .map((element) => element.getAttribute('title')?.trim())
  const firstLine = header.innerText?.split('\n')[0]?.trim()

  return titles.find(isUsable) || (isUsable(firstLine) ? firstLine : null)
}

function getChatContext(session) {
  const main = document.querySelector('#main[data-testid="conversation-panel-wrapper"]')
  const scroller = main?.querySelector(SCROLLER_SELECTOR) || null
  const header = main?.querySelector('header')
  const name = (header && readChatName(header))
    || (session?.scroller === scroller ? session.name : null)

  return { scroller, name }
}

function createSession({ scroller, name, staleChatId, onChange }) {
  let chatId = null
  let key = null
  let cache = createChatCache(null)
  let warnedIds = false
  const expandedButtons = new WeakSet()
  let captureTimer = null
  let saveTimer = null
  let dirty = false
  let saveFailed = false
  let stopped = false

  function flush() {
    clearTimeout(saveTimer)
    saveTimer = null
    if (dirty) {
      saveFailed = !storage.write(key, cache.serialize())
      dirty = false
      logEvent(saveFailed ? 'Saving the cache failed.' : `Saved ${cache.size} messages.`)
    }
  }

  function capture() {
    captureTimer = null
    if (stopped) {
      return
    }

    for (const button of scroller.querySelectorAll('[data-testid="caption-read-more-button"]')) {
      if (!expandedButtons.has(button)) {
        expandedButtons.add(button)
        button.click()
      }
    }

    const elements = [...scroller.querySelectorAll(MESSAGE_SELECTOR)]
    const ids = elements.map((element) => element.dataset.id)
    const idsCarryChat = ids.some((id) => parseChatId(id))
    const visibleChatId = idsCarryChat ? findChatId(ids) : (elements.length ? name : null)
    if (elements.length && !idsCarryChat && !warnedIds) {
      warnedIds = true
      logEvent(`Message ids carry no chat id. Using the chat name. Sample: ${ids[0]}`)
    }
    if (chatId === null && visibleChatId && visibleChatId !== staleChatId) {
      chatId = visibleChatId
      key = `${STORAGE_PREFIX}${chatId}`
      cache = createChatCache(storage.read(key))
      logEvent(`Bound chat ${chatId}. Cache holds ${cache.size} messages.`)
    }
    if (chatId === null || visibleChatId !== chatId) {
      onChange()
      return
    }

    const datePills = collectDatePills(scroller)
    const views = elements.map((element) => readMessage(element, datePills))
    const { added, changed } = cache.addView(views)
    if (changed) {
      dirty = true
      saveTimer ??= setTimeout(flush, SAVE_DELAY_MS)
      logEvent(`Captured +${added}. Total ${cache.size}. Gaps ${cache.gapCount}.`)
    }
    onChange()
  }

  const observer = new MutationObserver(() => {
    captureTimer ??= setTimeout(capture, CAPTURE_DELAY_MS)
  })
  observer.observe(scroller, { childList: true, subtree: true })
  logEvent(`Attached. Cache holds ${cache.size} messages.`)
  capture()

  return {
    name,
    scroller,
    capture,
    flush,
    clear() {
      cache.clear()
      if (key) {
        storage.remove(key)
      }
      dirty = false
      capture()
    },
    get chatId() {
      return chatId
    },
    get cache() {
      return cache
    },
    get saveFailed() {
      return saveFailed
    },
    stop() {
      stopped = true
      observer.disconnect()
      clearTimeout(captureTimer)
      flush()
      logEvent('Detached.')
    }
  }
}

let session = null
let notice = null
let noticeTimer = null
let stableContext = { name: null, scroller: null, count: 0 }
let lastClosed = { name: null, chatId: null }

function showNotice(message) {
  notice = message
  clearTimeout(noticeTimer)
  noticeTimer = setTimeout(() => {
    notice = null
    render()
  }, NOTICE_MS)
  render()
}

function render() {
  const panel = document.getElementById(PANEL_ID)
  if (!panel) {
    return
  }

  const summary = session ? summarizeCache(session.cache) : null
  panel.querySelector('[data-role="status"]').textContent = describeStatus({
    chatName: session?.name,
    size: session?.cache.size ?? 0,
    exported: summary?.exported.length ?? 0,
    gapCount: session?.cache.gapCount ?? 0,
    complete: summary?.complete ?? false,
    hint: session ? detectHint(session.scroller) : null,
    saveFailed: session?.saveFailed ?? false,
    notice
  })
  panel.querySelector('[data-action="export"]').disabled = !summary?.exported.length
  panel.querySelector('[data-action="clear"]').disabled = !session
}

function exportChat() {
  if (!session) {
    return
  }

  session.capture()
  session.flush()
  const payload = buildPayload(session.name, session.cache)
  downloadJson(payload, session.name)
  logEvent(`Exported ${payload.messages.length} messages. Complete ${payload.complete}.`)
  showNotice(`Exported ${payload.messages.length} messages${payload.complete ? '' : ' (partial)'}.`)
}

function clearCache() {
  if (session && confirm('Delete the cached messages of this chat?')) {
    session.clear()
    showNotice('Cache deleted.')
  }
}

async function copyVisibleDebug() {
  if (!session) {
    return
  }

  const datePills = collectDatePills(session.scroller)
  const records = [...session.scroller.querySelectorAll(MESSAGE_SELECTOR)].slice(0, 10)
    .map((element) => {
      const message = readMessage(element, datePills)
      return { message, excludedReasons: analyzeMessage(message).excludedReasons }
    })
  const copied = await copyText(JSON.stringify(records, null, 2))
  showNotice(copied ? 'Copied 10 visible messages.' : 'Could not copy.')
}

async function copyEventLog() {
  showNotice(await copyText(eventLog.join('\n')) ? 'Event log copied.' : 'Could not copy the log.')
}

function syncSession() {
  ensureUi()
  const { scroller, name } = getChatContext(session)

  if (session && (session.scroller !== scroller || session.name !== name)) {
    if (session.chatId) {
      lastClosed = { name: session.name, chatId: session.chatId }
    }
    session.stop()
    session = null
  }

  if (!session && scroller && name) {
    const isSame = stableContext.name === name && stableContext.scroller === scroller
    stableContext = { name, scroller, count: isSame ? stableContext.count + 1 : 1 }
    if (stableContext.count >= STABLE_SYNCS) {
      const staleChatId = lastClosed.name === name ? null : lastClosed.chatId
      session = createSession({ scroller, name, staleChatId, onChange: render })
    }
  }

  render()
}

function ensureUi() {
  if (document.getElementById(PANEL_ID)) {
    return
  }

  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style')
    style.id = STYLE_ID
    style.textContent = `
      #${PANEL_ID} {
        position: fixed;
        right: 18px;
        bottom: 18px;
        z-index: 10000;
        width: min(330px, calc(100vw - 36px));
        padding: 12px;
        border: 1px solid rgba(255, 255, 255, 0.16);
        border-radius: 8px;
        background: #202c33;
        box-shadow: 0 8px 28px rgba(0, 0, 0, 0.35);
        color: #e9edef;
        font: 13px/1.35 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      #${PANEL_ID}[hidden] { display: none; }
      #${TOGGLE_ID} {
        position: fixed;
        right: 18px;
        bottom: 18px;
        z-index: 10000;
        width: 42px;
        height: 42px;
        border: 0;
        border-radius: 50%;
        background: #00a884;
        color: #071a15;
        font: 22px/1 sans-serif;
        cursor: pointer;
      }
      #${PANEL_ID}:not([hidden]) + #${TOGGLE_ID} { display: none; }
      #${PANEL_ID} .wau-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 8px; }
      #${PANEL_ID} button {
        min-height: 32px;
        padding: 0 12px;
        border: 0;
        border-radius: 6px;
        background: #00a884;
        color: #071a15;
        font: inherit;
        font-weight: 600;
        cursor: pointer;
      }
      #${PANEL_ID} button[data-action="clear"],
      #${PANEL_ID} button[data-action^="copy"] { background: #aebac1; color: #111b21; }
      #${PANEL_ID} button[data-action="close"] {
        margin-left: auto;
        background: transparent;
        color: #aebac1;
        font-size: 20px;
        padding: 0 6px;
      }
      #${PANEL_ID} button:disabled { cursor: default; opacity: 0.5; }
      #${PANEL_ID} [data-role="status"] {
        color: #aebac1;
        overflow-wrap: anywhere;
        white-space: pre-line;
      }
      #${PANEL_ID} [data-role="event-log"] {
        max-height: 140px;
        margin: 8px 0 0;
        overflow: auto;
        color: #aebac1;
        font: 11px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;
        white-space: pre-wrap;
      }
    `
    document.head.append(style)
  }

  const panel = document.createElement('section')
  panel.id = PANEL_ID
  panel.setAttribute('aria-label', 'WhatsApp chat exporter')
  panel.innerHTML = `
    <div class="wau-actions">
      <button type="button" data-action="export">Export</button>
      <button type="button" data-action="clear">Clear cache</button>
      ${
    DEBUG_ENABLED
      ? `<button type="button" data-action="copy-visible">Copy 10 visible</button>
         <button type="button" data-action="copy-log">Copy log</button>`
      : ''
  }
      <button type="button" data-action="close" aria-label="Close exporter">×</button>
    </div>
    <div data-role="status"></div>
    ${DEBUG_ENABLED ? '<pre data-role="event-log"></pre>' : ''}
  `
  const toggle = document.createElement('button')
  toggle.id = TOGGLE_ID
  toggle.type = 'button'
  toggle.setAttribute('aria-label', 'Open WhatsApp chat exporter')
  toggle.textContent = '📤'

  const actions = {
    export: exportChat,
    clear: clearCache,
    'copy-visible': copyVisibleDebug,
    'copy-log': copyEventLog,
    close: () => {
      panel.hidden = true
    }
  }
  for (const [action, handler] of Object.entries(actions)) {
    panel.querySelector(`[data-action="${action}"]`)?.addEventListener('click', handler)
  }
  toggle.addEventListener('click', () => {
    panel.hidden = false
  })
  document.body.append(panel, toggle)
}

function configureDebugMenu() {
  if (typeof GM_registerMenuCommand !== 'function') {
    return
  }

  GM_registerMenuCommand(DEBUG_ENABLED ? 'Disable exporter debug' : 'Enable exporter debug', () => {
    const url = new URL(location.href)
    if (DEBUG_ENABLED) {
      url.searchParams.delete('debug')
    } else {
      url.searchParams.set('debug', 'true')
    }
    location.href = url.href
  })
}

if (typeof document === 'undefined') {
  globalThis.waExporter = {
    analyzeMessage,
    buildPayload,
    createChatCache,
    describeStatus,
    formatFilenameTimestamp,
    isDeletedMessage,
    findChatId,
    isEmojiOnly,
    mergeVisibleOrder,
    normalizeDateLabel,
    normalizeTimeLabel,
    parseChatId,
    parseMetadata,
    stripEmojis
  }
} else {
  configureDebugMenu()
  syncSession()
  setInterval(syncSession, SYNC_INTERVAL_MS)
  addEventListener('pagehide', () => session?.flush())
}
})()
