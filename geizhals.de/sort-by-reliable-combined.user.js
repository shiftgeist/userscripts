// ==UserScript==
// @name        Geizhals: Sort by reliable rating
// @namespace   shiftgeist
// @icon        https://www.google.com/s2/favicons?sz=64&domain=geizhals.de
// @version     20260924.1241
//
// @match       https://*.geizhals.de/?cat=*
// @match       https://*.geizhals.at/?cat=*
// @match       https://*.geizhals.eu/?cat=*
// @grant       GM_registerMenuCommand
// @run-at      document-idle
//
// @author      shiftgeist
// @description Sort Geizhals result cards by rating confidence and review count.
// @license     GNU GPLv3
//
// @updateURL   https://raw.githubusercontent.com/shiftgeist/userscripts/refs/heads/main/geizhals.de/sort-by-reliable-combined.user.js
// @downloadURL https://raw.githubusercontent.com/shiftgeist/userscripts/refs/heads/main/geizhals.de/sort-by-reliable-combined.user.js
// ==/UserScript==
;(() => {
  'use strict'

  const CONFIDENCE_Z = 1.96

  const RATING_WEIGHT = 0.6
  const TEST_WEIGHT = 0.2
  const DEFAULT_WEIGHT = 0.2

  const INDICATOR_ID = 'geizhals-reliable-rating-indicator'
  const originalPositions = new WeakMap()
  let isSortEnabled = true

  function isVisible(element) {
    const styles = window.getComputedStyle(element)

    return (
      styles.display !== 'none'
      && styles.visibility !== 'hidden'
      && element.getClientRects().length > 0
    )
  }

  function getGalleryCards(gallery) {
    return [...gallery.children].filter((child) => child.matches('.galleryview__item.card'))
  }

  function getTableRows(tableBody) {
    return [...tableBody.children].filter((child) => child.matches('.datatable__row'))
  }

  function getResultLists() {
    const galleries = [...document.querySelectorAll('.galleryview')]
      .map((container) => ({
        container,
        items: getGalleryCards(container),
        type: 'Galerie'
      }))
      .filter(({ items }) => items.length > 1)

    const tables = [...document.querySelectorAll(
      '#productlist .datatable__body'
    )]
      .map((container) => ({
        container,
        items: getTableRows(container),
        type: 'Liste'
      }))
      .filter(({ items }) => items.length > 1)

    return [...galleries, ...tables]
  }

  function getActiveResults() {
    const results = getResultLists()
      .filter(({ container }) => isVisible(container))
      .sort((left, right) => right.items.length - left.items.length)

    return results[0] ?? null
  }

  function parseRating(value) {
    const match = value.match(/\d+(?:[.,]\d+)?/)

    if (!match) {
      return Number.NaN
    }

    return Number.parseFloat(match[0].replace(',', '.'))
  }

  function parseReviewCount(value) {
    const digits = value.replace(/[^\d]/g, '')

    return Number.parseInt(digits, 10)
  }

  function getRatingData(item) {
    const ratingLabel = item.querySelector('.stars-rating-label')?.textContent?.trim() ?? ''
    const ratingDescription = item.querySelector('.stars-rating-wrapper .visually-hidden')
      ?.textContent?.trim() ?? ''
    const reviewLabel = item.querySelector('.stars-rating-label-bottom')?.textContent?.trim()
      ?? ''

    const rating = parseRating(ratingDescription || ratingLabel)

    const tableReviewMatch = ratingLabel.match(/\(([^)]+)\)/)
    const reviewCount = parseReviewCount(
      tableReviewMatch?.[1] ?? reviewLabel
    )

    if (
      !Number.isFinite(rating)
      || rating < 0
      || rating > 5
      || !Number.isFinite(reviewCount)
      || reviewCount < 1
    ) {
      return null
    }

    return { rating, reviewCount }
  }

  function getTestData(item) {
    const label = item.querySelector('.metascore')?.getAttribute('aria-label') ?? ''
    const scoreMatch = label.match(/(\d+(?:[.,]\d+)?)\s*\/\s*100/)
    const countMatch = label.match(/(\d+)\s*(?:x\s*)?tests?\b/i)

    if (!scoreMatch || !countMatch) {
      return null
    }

    const score = Number.parseFloat(scoreMatch[1].replace(',', '.'))
    const testCount = Number.parseInt(countMatch[1], 10)

    if (
      !Number.isFinite(score)
      || score < 0
      || score > 100
      || !Number.isFinite(testCount)
      || testCount < 1
    ) {
      return null
    }

    return { score: score / 20, testCount }
  }

  // This score penalizes high ratings with very few reviews.
  function getReliableRatingScore(rating, reviewCount) {
    const proportion = rating / 5
    const zSquared = CONFIDENCE_Z ** 2
    const denominator = 1 + zSquared / reviewCount
    const centre = proportion + zSquared / (2 * reviewCount)
    const margin = CONFIDENCE_Z
      * Math.sqrt(
        (proportion * (1 - proportion) + zSquared / (4 * reviewCount))
          / reviewCount
      )

    return Math.max(0, (centre - margin) / denominator) * 5
  }

  function getPopularityScore(originalPosition, productCount) {
    if (productCount <= 1) {
      return 5
    }

    // The original Geizhals result order starts with the most popular product.
    return 5 * (1 - originalPosition / (productCount - 1))
  }

  function getOriginalPosition(item, currentPosition) {
    if (!originalPositions.has(item)) {
      originalPositions.set(item, currentPosition)
    }

    return originalPositions.get(item)
  }

  function updateIndicator(productCount, ratedProductCount, testedProductCount) {
    const controls = document.querySelector(
      '.listcontrols-filter-and-pagination .listcontrols-pagination'
    ) ?? document.querySelector('.listcontrols-filter-and-pagination')

    if (!controls) {
      return
    }

    let indicator = document.getElementById(INDICATOR_ID)

    if (!indicator) {
      indicator = document.createElement('button')
      indicator.id = INDICATOR_ID
      indicator.setAttribute('type', 'button')
      indicator.addEventListener('click', toggleSort)
      controls.prepend(indicator)
    }

    const ratingPercent = Math.round(RATING_WEIGHT * 100)
    const testPercent = Math.round(TEST_WEIGHT * 100)
    const defaultPercent = Math.round(DEFAULT_WEIGHT * 100)
    const text = isSortEnabled
      ? `★ Sortiert ${ratingPercent}:${testPercent}:${defaultPercent}`
      : 'Sortierung aus'

    if (indicator.textContent !== text) {
      indicator.textContent = text
    }

    indicator.setAttribute(
      'style',
      `background:${isSortEnabled ? '#e8f5e9' : '#fdeaea'};`
        + `border:1px solid ${isSortEnabled ? '#66a96b' : '#d66a6a'};`
        + 'border-radius:999px;cursor:pointer;display:inline-flex;'
        + `color:${isSortEnabled ? '#1f6227' : '#a52a2a'};`
        + 'font-size:.75rem;font-weight:600;line-height:1.25;padding:.2rem .45rem;'
        + 'visibility:visible;white-space:nowrap'
    )
    indicator.setAttribute('aria-pressed', String(isSortEnabled))
    indicator.title = isSortEnabled
      ? `${ratedProductCount} von ${productCount} mit Bewertung. `
        + `${testedProductCount} von ${productCount} mit Test-Score. `
        + `${ratingPercent}% Bewertungs-Score, ${testPercent}% Test-Score und `
        + `${defaultPercent}% ursprüngliche Sortierung. `
        + 'Klicken um Sortierung zu deaktivieren.'
      : 'Sortierung ist deaktiviert. Klicken um Sortierung zu aktivieren.'
  }

  function restoreResults() {
    const results = getActiveResults()

    if (!results) {
      return
    }

    const restoredItems = [...results.items].sort(
      (left, right) => getOriginalPosition(left, 0) - getOriginalPosition(right, 0)
    )

    const alreadyRestored = restoredItems.every(
      (item, index) => item === results.items[index]
    )

    if (alreadyRestored) {
      return
    }

    const fragment = document.createDocumentFragment()

    restoredItems.forEach((item) => {
      fragment.append(item)
    })

    results.container.append(fragment)
  }

  function toggleSort() {
    isSortEnabled = !isSortEnabled

    if (isSortEnabled) {
      scheduleSort()
      return
    }

    window.clearTimeout(sortTimer)
    restoreResults()
    updateIndicator(0, 0, 0)
  }

  function sortResults() {
    if (!isSortEnabled) {
      return
    }

    const results = getActiveResults()

    if (!results) {
      return
    }

    const productCount = results.items.length

    const rankedItems = results.items.map((item, currentPosition) => {
      const ratingData = getRatingData(item)
      const testData = getTestData(item)
      const originalPosition = getOriginalPosition(item, currentPosition)
      const popularityScore = getPopularityScore(
        originalPosition,
        productCount
      )
      const ratingScore = ratingData
        ? getReliableRatingScore(ratingData.rating, ratingData.reviewCount)
        : null
      const testScore = testData
        ? getReliableRatingScore(testData.score, testData.testCount)
        : null

      const components = [
        ratingScore === null ? null : { score: ratingScore, weight: RATING_WEIGHT },
        testScore === null ? null : { score: testScore, weight: TEST_WEIGHT },
        { score: popularityScore, weight: DEFAULT_WEIGHT }
      ].filter(Boolean)
      const scoreWeight = components.reduce(
        (total, { weight }) => total + weight,
        0
      )

      return {
        item,
        originalPosition,
        popularityScore,
        ratingScore,
        testScore,
        score: scoreWeight === DEFAULT_WEIGHT
          ? null
          : components.reduce((total, { score, weight }) => total + score * weight, 0)
            / scoreWeight
      }
    })

    updateIndicator(
      productCount,
      rankedItems.filter(({ ratingScore }) => ratingScore !== null).length,
      rankedItems.filter(({ testScore }) => testScore !== null).length
    )

    const sortedItems = [...rankedItems].sort((left, right) => {
      // Products with ratings always rank before products without ratings.
      if (left.score === null && right.score !== null) {
        return 1
      }

      if (left.score !== null && right.score === null) {
        return -1
      }

      // Preserve Geizhals popularity among products with no rating.
      if (left.score === null && right.score === null) {
        return left.originalPosition - right.originalPosition
      }

      if (right.score !== left.score) {
        return right.score - left.score
      }

      if (right.ratingScore !== left.ratingScore) {
        return (right.ratingScore ?? 0) - (left.ratingScore ?? 0)
      }

      if (right.testScore !== left.testScore) {
        return (right.testScore ?? 0) - (left.testScore ?? 0)
      }

      return left.originalPosition - right.originalPosition
    })

    const alreadySorted = sortedItems.every(
      ({ item }, index) => item === results.items[index]
    )

    if (alreadySorted) {
      return
    }

    const marker = document.createComment('geizhals-reliable-rating-sort')
    results.container.insertBefore(marker, results.items[0])

    const fragment = document.createDocumentFragment()

    sortedItems.forEach(({ item }) => {
      fragment.append(item)
    })

    results.container.insertBefore(fragment, marker)
    marker.remove()

    console.info(
      `[Geizhals reliable rating sort] Sorted ${productCount} ${results.type.toLowerCase()} products.`
    )
  }

  let sortTimer

  function scheduleSort() {
    if (!isSortEnabled) {
      updateIndicator(0, 0, 0)
      return
    }

    window.clearTimeout(sortTimer)

    sortTimer = window.setTimeout(() => {
      sortResults()
    }, 150)
  }
  if (typeof GM_registerMenuCommand === 'function') {
    GM_registerMenuCommand(
      'Geizhals: Nach Bewertung und Beliebtheit sortieren',
      scheduleSort
    )
  }

  const observer = new MutationObserver(scheduleSort)

  observer.observe(document.body, {
    childList: true,
    subtree: true
  })

  scheduleSort()
})()
