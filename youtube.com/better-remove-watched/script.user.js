// ==UserScript==
// @name        Watch later: Better remove watched
// @namespace   shiftgeist
// @icon        https://www.google.com/s2/favicons?sz=64&domain=youtube.com
// @version     20260922.1
//
// @match       https://*.youtube.com/*
// @grant       none
// @run-at      document-idle
//
// @author      shiftgeist
// @description Delete videos that you watch at customizable percent
// @license     GNU GPLv3
//
// @updateURL   https://raw.githubusercontent.com/shiftgeist/userscripts/refs/heads/main/youtube.com/better-remove-watched/script.user.js
// @downloadURL https://raw.githubusercontent.com/shiftgeist/userscripts/refs/heads/main/youtube.com/better-remove-watched/script.user.js
// ==/UserScript==
;(async () => {
  'use strict'

  const identifier = '{user.js BRW}'
  const debug = window.localStorage.getItem('userscript-debug') === 'true'
  const mobile = window.location.href.includes('m.youtube.com')
  const getThreshold = () =>
    Number(window.localStorage.getItem('better-remove-watched-threshold')) || 90
  const buttonStyle = `
appearance: none;
background: color-mix(in srgb, currentColor 12%, transparent);
border: 1px solid color-mix(in srgb, currentColor 35%, transparent);
border-radius: 18px;
box-sizing: border-box;
color: inherit;
cursor: pointer;
font: 500 14px/20px system-ui, sans-serif;
margin-bottom: 8px;
min-height: 36px;
padding: 0 16px;
white-space: nowrap;
`
  const DEBUG_BUTTON_ENABLED = false

  const attachmentPoint = mobile
    ? '.playlist-immersive-header-content .amsterdam-playlist-header-metadata-wrapper'
    : '.metadata-wrapper.style-scope.ytd-playlist-header-renderer'

  let timeout = null
  let removeButton = null
  let debugRemoveButton = null
  let percentButton = null

  function _logAll(logger, ...params) {
    if (!debug) return
    logger(identifier, logger.name, ...params)
  }

  const l = {
    debug: (...params) => _logAll(console.debug, ...params),
    log: (...params) => _logAll(console.log, ...params),
    info: (...params) => _logAll(console.info, ...params),
    warn: (...params) => _logAll(console.warn, ...params),
    error: (...params) => _logAll(console.error, ...params)
  }

  function baseButton() {
    const button = document.createElement('button')
    button.style.cssText = buttonStyle
    return button
  }

  function createPercentButton(percent = getThreshold() || 90) {
    if (percentButton) {
      l.debug('removing percent button first')
      percentButton.remove()
    }

    percentButton = baseButton()
    percentButton.textContent = `${percent}%`
    percentButton.title =
      `Click -10%; Shift, Option, or Control click +10% (remove at ${percent}% watched)`
    percentButton.dataset.percent = percent
    percentButton.addEventListener('click', changePercentHandler)
    percentButton.addEventListener('auxclick', changePercentHandler)
    document.querySelector(attachmentPoint).appendChild(percentButton)

    window.localStorage.setItem('better-remove-watched-threshold', JSON.stringify(percent))

    l.debug('Remove button created', percentButton)
  }

  function changePercentHandler(event) {
    const percent = Number(percentButton.dataset.percent)
    const increment = event.shiftKey || event.altKey || event.ctrlKey || event.metaKey ? 10 : -10
    const nextPercent = percent + increment

    createPercentButton(nextPercent > 100 ? 10 : nextPercent <= 0 ? 100 : nextPercent)
  }

  function createRemoveButton() {
    if (removeButton) {
      l.debug('removing remove button first')
      removeButton.remove()
    }

    removeButton = baseButton()
    removeButton.textContent = 'Remove watched'
    removeButton.title = 'Visible videos watched'
    if (mobile) {
      removeButton.style.marginTop = '8px'
    }
    removeButton.addEventListener('click', e => removeHandler(e, true))
    removeButton.addEventListener('auxclick', e => removeHandler(e, true))
    document.querySelector(attachmentPoint).appendChild(removeButton)

    l.debug('Remove button created', removeButton)
  }

  function createDebugRemoveButton() {
    if (debugRemoveButton) {
      l.debug('removing debug remove button first')
      debugRemoveButton.remove()
    }

    debugRemoveButton = baseButton()
    debugRemoveButton.textContent = '(debug) Remove watched 1x'
    debugRemoveButton.title = 'Debug: remove three watched videos'
    debugRemoveButton.addEventListener('click', e => removeHandler(e, true, 1))
    debugRemoveButton.addEventListener('auxclick', e => removeHandler(e, true, 1))
    document.querySelector(attachmentPoint).appendChild(debugRemoveButton)

    l.debug('Debug remove button created', debugRemoveButton)
  }

  function isVisibleMenuItem(element) {
    return element.offsetParent !== null
  }

  function evaluateMenuItem(item) {
    const text = (item.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase()
    const icon = item.querySelector('yt-icon')?.getAttribute('icon') || ''
    const dataHost = Reflect.get(item, '__dataHost')
    const endpoint = JSON.stringify(
      Reflect.get(item, 'data') || (dataHost && Reflect.get(dataHost, 'data')) || ''
    )

    const iconMatch = icon.includes('remove')
    const endpointMatch = endpoint.includes('removeFromPlaylistServiceEndpoint')
    const textMatch = /remove.*(watch later|später ansehen)|aus.*später ansehen.*entfernen/.test(
      text
    )

    return {
      endpointMatch,
      icon,
      iconMatch,
      isMatch: iconMatch || endpointMatch || textMatch,
      tagName: item.tagName,
      text,
      textMatch
    }
  }

  function findRemoveAction() {
    const menuItems = Array.from(
      document.querySelectorAll(
        'ytd-menu-service-item-renderer, ytd-menu-navigation-item-renderer, tp-yt-paper-item'
      )
    ).filter(isVisibleMenuItem)
    const removeAction = menuItems.find(item => evaluateMenuItem(item).isMatch)

    if (removeAction instanceof HTMLElement) {
      return { menuItems, removeAction }
    }

    return { menuItems, removeAction: null }
  }

  function watchEditPlaylistResponse(onResponse) {
    const originalFetch = window.fetch
    const originalOpen = XMLHttpRequest.prototype.open
    const originalSend = XMLHttpRequest.prototype.send

    function isEditPlaylistUrl(url) {
      return typeof url === 'string' && url.includes('edit_playlist')
    }

    window.fetch = function(input, init) {
      const url = input instanceof Request ? input.url : input
      const promise = originalFetch.call(this, input, init)
      if (isEditPlaylistUrl(url)) {
        promise.then(response => onResponse(response.status)).catch(() => {})
      }
      return promise
    }

    XMLHttpRequest.prototype.open = function(method, url, ...rest) {
      this.__isEditPlaylistRequest = isEditPlaylistUrl(url)
      return originalOpen.call(this, method, url, ...rest)
    }

    XMLHttpRequest.prototype.send = function(...args) {
      if (this.__isEditPlaylistRequest) {
        this.addEventListener('loadend', () => onResponse(this.status))
      }
      return originalSend.apply(this, args)
    }

    return function restore() {
      window.fetch = originalFetch
      XMLHttpRequest.prototype.open = originalOpen
      XMLHttpRequest.prototype.send = originalSend
    }
  }

  function waitForRemoval(video, details) {
    return new Promise(resolve => {
      const startedAt = Date.now()
      let finished = false
      const timeout = setTimeout(() => finish({ type: 'timeout' }), 10000)
      const observer = new MutationObserver(() => {
        if (!document.body.contains(video)) finish({ type: 'detached' })
      })
      const restoreNetworkWatch = watchEditPlaylistResponse(status => {
        finish({ status, type: 'response' })
      })

      function finish(outcome) {
        if (finished) return
        finished = true
        clearTimeout(timeout)
        observer.disconnect()
        restoreNetworkWatch()

        const success = outcome.type === 'detached'
          || (outcome.type === 'response' && outcome.status >= 200 && outcome.status < 300)

        if (!success) {
          const toast = Array.from(
            document.querySelectorAll(
              'yt-notification-action-renderer, tp-yt-paper-toast, [role="alert"]'
            )
          )
            .map(element => element.textContent?.trim())
            .find(text => text)

          const message = outcome.type === 'response'
            ? `YouTube rejected the removal request (HTTP ${outcome.status})`
              + (outcome.status === 409 ? ' — playlist state is stale, reload the page' : '')
            : 'Timed out while waiting for YouTube to remove the video'

          l.error(
            'removal failed',
            message,
            `toast: ${toast || 'none'}`,
            `elapsedMs: ${Date.now() - startedAt}`,
            `threshold: ${getThreshold()}`,
            `videoAttached: ${document.body.contains(video)}`,
            `videoHidden: ${video.hidden}`,
            Object.entries(details).flat().map((v, i) => i % 2 === 0 ? `${v}:` : v)
          )
        }

        resolve(success)
      }

      observer.observe(document.body, { childList: true, characterData: true, subtree: true })
      if (!document.body.contains(video)) finish({ type: 'detached' })
    })
  }

  function removeFromWatched(video, percent) {
    const title = video.querySelector('#video-title')?.textContent?.trim()
    l.log('Removing watched video', 'title:', title, 'video:', video)

    const menuButton = video.querySelector(mobile ? 'button' : '#button')
    if (!(menuButton instanceof HTMLElement)) {
      l.debug('Cannot remove watched video: menu button not found', video)
      l.error('removal failed', 'message:', 'Video menu button not found', 'percent:', percent,
        'threshold:', getThreshold(), 'title:', title, 'video:', video)
      return Promise.resolve(false)
    }

    let resolveRemoval
    const removal = new Promise(resolve => {
      resolveRemoval = resolve
    })
    const observer = new MutationObserver(clickAction)

    function clickAction() {
      const { menuItems, removeAction } = findRemoveAction()
      if (!(removeAction instanceof HTMLElement)) return false

      clearTimeout(menuTimeout)
      observer.disconnect()
      l.log('Clicking remove action', removeAction)
      const removalWait = waitForRemoval(video, { menuButton, menuItems, percent, title, video })
      removeAction.click()
      resolveRemoval(removalWait)
      return true
    }

    const menuTimeout = setTimeout(() => {
      if (clickAction()) return

      observer.disconnect()
      const { menuItems } = findRemoveAction()
      const availableActions = menuItems.map(evaluateMenuItem)
      l.error(
        'ERROR: removal failed',
        'availableActions:',
        JSON.stringify(availableActions),
        'menuItems:',
        menuItems,
        'message: Remove action not found in video menu',
        `percent: ${percent}`,
        `threshold: ${getThreshold()}`,
        `title: ${title}`,
        'video:',
        video
      )
      resolveRemoval(false)
    }, 1000)

    observer.observe(document.body, { childList: true, subtree: true })
    l.log('Opening watched video menu', menuButton)
    menuButton.click()
    clickAction()
    return removal
  }

  function getWatchedPercent(video) {
    const percent = video.data?.thumbnailOverlays?.find(
      overlay => overlay.thumbnailOverlayResumePlaybackRenderer
    )?.thumbnailOverlayResumePlaybackRenderer?.percentDurationWatched
    if (Number.isFinite(percent)) {
      l.debug('Found watched progress in renderer data', percent)
      return percent
    }

    const progressElements = video.querySelectorAll(
      mobile
        ? '.thumbnail-overlay-resume-playback-progress'
        : 'ytd-thumbnail-overlay-resume-playback-renderer #progress'
    )

    for (const element of progressElements) {
      if (!(element instanceof HTMLElement)) continue

      l.debug('Found playback progress candidate', {
        className: element.className,
        tagName: element.tagName,
        width: element.style.width
      })

      if (!element.style.width.endsWith('%')) continue

      const percent = Number.parseFloat(element.style.width)
      if (Number.isFinite(percent)) {
        l.debug('Found watched progress', percent)
        return percent
      }
    }

    const thumbnailText = video.querySelector('#thumbnail')?.textContent?.trim() || ''
    const watchedMarkers = ['ANGESEHEN', 'WATCHED', 'GESEHEN', 'VISTO', 'REGARDÉ', 'VISUALIZZATO']
    if (watchedMarkers.some(marker => thumbnailText.startsWith(marker))) {
      l.debug('Found watched thumbnail marker', thumbnailText)
      return 100
    }

    l.debug('No watched progress found', video)
    return null
  }

  function getPlaylistVideoCount() {
    const text = Array.from(
      document.querySelectorAll('ytd-playlist-byline-renderer yt-formatted-string.byline-item')
    )
      .map(element => element.textContent?.trim() || '')
      .find(item => /\d/.test(item))
    const count = Number(text?.replace(/\D/g, ''))

    return Number.isSafeInteger(count) && count > 0 ? count : null
  }

  function scrollForMoreVideos(videoCount) {
    return new Promise(resolve => {
      let finished = false
      const selector = mobile ? 'ytm-playlist-video-renderer' : 'ytd-playlist-video-renderer'
      const observer = new MutationObserver(() => {
        if (document.querySelectorAll(selector).length > videoCount) finish(true)
      })
      const timeout = setTimeout(() => finish(false), 5000)

      function finish(loaded) {
        if (finished) return
        finished = true
        clearTimeout(timeout)
        observer.disconnect()
        resolve(loaded)
      }

      observer.observe(document.body, { childList: true, subtree: true })
      l.debug('Scrolling for more playlist videos', { videoCount })
      window.scrollTo(0, document.documentElement.scrollHeight)
    })
  }

  async function removeHandler(event, cursor = false, remaining = Infinity) {
    const batchButton = remaining === Infinity ? removeButton : debugRemoveButton
    l.debug('init removeHandler()', {
      cursor,
      remaining,
      threshold: getThreshold(),
      trigger: event.type
    })

    if (cursor && batchButton?.textContent === 'Stop') {
      location.reload()
      return
    }

    const videos = Array.from(
      document.querySelectorAll(
        mobile ? 'ytm-playlist-video-renderer' : 'ytd-playlist-video-renderer'
      )
    )

    l.debug(`Found "${videos.length}" videos`)

    const videosStarted = videos.filter(v => {
      const title = v.querySelector('#video-title')?.textContent?.trim()
      const percent = getWatchedPercent(v)
      if (percent === null) {
        l.debug('Skipped video without progress', title)
        return false
      }

      const watched = percent >= getThreshold()
      l.debug('Checked video progress', { percent, threshold: getThreshold(), title, watched })

      return watched
    })

    l.log(`Found "${videosStarted.length}" watched videos`)

    if (videosStarted.length > 0) {
      if (batchButton?.textContent !== 'Stop') {
        batchButton.textContent = 'Stop'
      }

      const video = videosStarted[0]
      const percent = getWatchedPercent(video)
      l.debug('Removing first watched video', video)
      const removed = await removeFromWatched(video, percent)
      if (removed && remaining > 1) {
        await new Promise(res => setTimeout(res, 750))
        removeHandler(event, false, remaining - 1)
      } else {
        if (debugRemoveButton) debugRemoveButton.textContent = '(debug) Remove watched 1x'
      }
    } else if (remaining !== Infinity) {
      debugRemoveButton.textContent = '(debug) Remove watched 1x'
    } else {
      const playlistVideoCount = getPlaylistVideoCount()
      if (playlistVideoCount !== null && videos.length < playlistVideoCount) {
        l.log(`Loaded "${videos.length}" of "${playlistVideoCount}" playlist videos`)
        if (await scrollForMoreVideos(videos.length)) return removeHandler(event)
      }

      // finished
      removeButton.parentElement.click()
      removeButton.textContent = 'All videos removed'
      await new Promise(res => setTimeout(res, 400))
      removeButton.textContent += '.'
      await new Promise(res => setTimeout(res, 400))
      removeButton.textContent += '.'
      await new Promise(res => setTimeout(res, 400))
      removeButton.textContent += '.'
      await new Promise(res => setTimeout(res, 400))
      removeButton.textContent = 'Remove watched'
    }
  }

  let checkCount = 0

  function waitForLoad(query, callback) {
    l.debug('init waitForLoad()')

    if (
      !(
        window.location.href.includes('youtube.com/playlist')
        && window.location.search.includes('list=WL')
      )
    ) {
      l.info('Not on watch later playlist')
      return
    }

    if (checkCount > 99) {
      l.warn('Check count > 99')
      return
    }

    if (document.querySelector(query)) {
      checkCount = 0
      callback()
    } else {
      checkCount += 1
      const waitTime = 100 * checkCount * checkCount + 400
      l.debug('time until check is', waitTime)
      timeout = setTimeout(() => waitForLoad(query, callback), waitTime)
    }
  }

  function init() {
    waitForLoad(attachmentPoint, () => {
      createRemoveButton()
      createPercentButton()

      if (debug && DEBUG_BUTTON_ENABLED) createDebugRemoveButton()
    })
  }

  function handlePageChange(event) {
    l.debug('init handlePageChange()', event.type, window.location.href)
    init()

    if (timeout) {
      clearTimeout(timeout)
    }
  }

  window.addEventListener('yt-page-data-updated', handlePageChange)

  init()
})()
