// ==UserScript==
// @name        Geizhals: Sort by reliable rating
// @namespace   shiftgeist
// @icon        https://www.google.com/s2/favicons?sz=64&domain=geizhals.de
// @version     20260918.0
//
// @match       https://www.geizhals.de/?cat=*
// @match       https://www.geizhals.at/?cat=*
// @match       https://www.geizhals.eu/?cat=*
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

(() => {
  'use strict';

  const CONFIDENCE_Z = 1.96;

  // The final score combines:
  // - 80% reliable customer rating
  // - 20% original Geizhals popularity order
  const RATING_WEIGHT = 0.8;

  const INDICATOR_ID = 'geizhals-reliable-rating-indicator';
  const STYLE_ID = 'geizhals-reliable-rating-style';
  const originalPositions = new WeakMap();

  function installStyles() {
    if (document.getElementById(STYLE_ID)) {
      return;
    }

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${INDICATOR_ID} {
        align-items: center;
        background: #e8f5e9;
        border: 1px solid #66a96b;
        border-radius: 999px;
        color: #1f6227;
        display: inline-flex;
        font-size: 0.8125rem;
        font-weight: 600;
        line-height: 1.25;
        padding: 0.35rem 0.65rem;
        white-space: nowrap;
      }

      #${INDICATOR_ID}::before {
        content: "★";
        font-size: 1rem;
        line-height: 1;
        margin-right: 0.35rem;
      }
    `;

    document.head.append(style);
  }

  function isVisible(element) {
    const styles = window.getComputedStyle(element);

    return (
      styles.display !== 'none' &&
      styles.visibility !== 'hidden' &&
      element.getClientRects().length > 0
    );
  }

  function getGalleryCards(gallery) {
    return [...gallery.children].filter((child) =>
      child.matches('.galleryview__item.card'),
    );
  }

  function getTableRows(tableBody) {
    return [...tableBody.children].filter((child) =>
      child.matches('.datatable__row'),
    );
  }

  function getResultLists() {
    const galleries = [...document.querySelectorAll('.galleryview')]
      .map((container) => ({
        container,
        items: getGalleryCards(container),
        type: 'Galerie',
      }))
      .filter(({ items }) => items.length > 1);

    const tables = [...document.querySelectorAll(
      '#productlist .datatable__body',
    )]
      .map((container) => ({
        container,
        items: getTableRows(container),
        type: 'Liste',
      }))
      .filter(({ items }) => items.length > 1);

    return [...galleries, ...tables];
  }

  function getActiveResults() {
    const results = getResultLists()
      .filter(({ container }) => isVisible(container))
      .sort((left, right) => right.items.length - left.items.length);

    return results[0] ?? null;
  }

  function parseRating(value) {
    const match = value.match(/\d+(?:[.,]\d+)?/);

    if (!match) {
      return Number.NaN;
    }

    return Number.parseFloat(match[0].replace(',', '.'));
  }

  function parseReviewCount(value) {
    const digits = value.replace(/[^\d]/g, '');

    return Number.parseInt(digits, 10);
  }

  function getRatingData(item) {
    const ratingLabel =
      item.querySelector('.stars-rating-label')?.textContent?.trim() ?? '';
    const ratingDescription =
      item.querySelector('.stars-rating-wrapper .visually-hidden')
        ?.textContent?.trim() ?? '';
    const reviewLabel =
      item.querySelector('.stars-rating-label-bottom')?.textContent?.trim() ??
      '';

    const rating = parseRating(ratingDescription || ratingLabel);

    const tableReviewMatch = ratingLabel.match(/\(([^)]+)\)/);
    const reviewCount = parseReviewCount(
      tableReviewMatch?.[1] ?? reviewLabel,
    );

    if (
      !Number.isFinite(rating) ||
      rating < 0 ||
      rating > 5 ||
      !Number.isFinite(reviewCount) ||
      reviewCount < 1
    ) {
      return null;
    }

    return { rating, reviewCount };
  }

  // This score penalizes high ratings with very few reviews.
  function getReliableRatingScore(rating, reviewCount) {
    const proportion = rating / 5;
    const zSquared = CONFIDENCE_Z ** 2;
    const denominator = 1 + zSquared / reviewCount;
    const centre = proportion + zSquared / (2 * reviewCount);
    const margin =
      CONFIDENCE_Z *
      Math.sqrt(
        (proportion * (1 - proportion) + zSquared / (4 * reviewCount)) /
          reviewCount,
      );

    return Math.max(0, (centre - margin) / denominator) * 5;
  }

  function getPopularityScore(originalPosition, productCount) {
    if (productCount <= 1) {
      return 5;
    }

    // The original Geizhals result order starts with the most popular product.
    return 5 * (1 - originalPosition / (productCount - 1));
  }

  function getOriginalPosition(item, currentPosition) {
    if (!originalPositions.has(item)) {
      originalPositions.set(item, currentPosition);
    }

    return originalPositions.get(item);
  }

  function updateIndicator(resultType, productCount, ratedProductCount) {
    const controls =
      document.querySelector(
        '.listcontrols-filter-and-pagination .listcontrols-pagination',
      ) ?? document.querySelector('.listcontrols-filter-and-pagination');

    if (!controls) {
      return;
    }

    let indicator = document.getElementById(INDICATOR_ID);

    if (!indicator) {
      indicator = document.createElement('span');
      indicator.id = INDICATOR_ID;
      indicator.setAttribute('role', 'status');
      controls.prepend(indicator);
    }

    const ratingPercent = Math.round(RATING_WEIGHT * 100);
    const popularityPercent = 100 - ratingPercent;
    const text =
      `${resultType}: Bewertung + Beliebtheit ` +
      `(${ratedProductCount}/${productCount})`;

    if (indicator.textContent !== text) {
      indicator.textContent = text;
    }

    indicator.title =
      `${ratingPercent}% Bewertungs-Score und ` +
      `${popularityPercent}% ursprüngliche Geizhals-Beliebtheit. ` +
      'Der Bewertungs-Score nutzt eine 95%-Vertrauensgrenze. ' +
      'Produkte ohne Kundenbewertung stehen am Ende.';
  }

  function sortResults() {
    const results = getActiveResults();

    if (!results) {
      return;
    }

    const productCount = results.items.length;

    const rankedItems = results.items.map((item, currentPosition) => {
      const ratingData = getRatingData(item);
      const originalPosition = getOriginalPosition(item, currentPosition);
      const popularityScore = getPopularityScore(
        originalPosition,
        productCount,
      );
      const ratingScore = ratingData
        ? getReliableRatingScore(ratingData.rating, ratingData.reviewCount)
        : null;

      return {
        item,
        originalPosition,
        popularityScore,
        ratingScore,
        score:
          ratingScore === null
            ? null
            : ratingScore * RATING_WEIGHT +
              popularityScore * (1 - RATING_WEIGHT),
      };
    });

    updateIndicator(
      results.type,
      productCount,
      rankedItems.filter(({ ratingScore }) => ratingScore !== null).length,
    );

    const sortedItems = [...rankedItems].sort((left, right) => {
      // Products with ratings always rank before products without ratings.
      if (left.score === null && right.score !== null) {
        return 1;
      }

      if (left.score !== null && right.score === null) {
        return -1;
      }

      // Preserve Geizhals popularity among products with no rating.
      if (left.score === null && right.score === null) {
        return left.originalPosition - right.originalPosition;
      }

      if (right.score !== left.score) {
        return right.score - left.score;
      }

      if (right.ratingScore !== left.ratingScore) {
        return right.ratingScore - left.ratingScore;
      }

      return left.originalPosition - right.originalPosition;
    });

    const alreadySorted = sortedItems.every(
      ({ item }, index) => item === results.items[index],
    );

    if (alreadySorted) {
      return;
    }

    const marker = document.createComment('geizhals-reliable-rating-sort');
    results.container.insertBefore(marker, results.items[0]);

    const fragment = document.createDocumentFragment();

    sortedItems.forEach(({ item }) => {
      fragment.append(item);
    });

    results.container.insertBefore(fragment, marker);
    marker.remove();

    console.info(
      `[Geizhals reliable rating sort] Sorted ${productCount} ${results.type.toLowerCase()} products.`,
    );
  }

  let sortTimer;

  function scheduleSort() {
    window.clearTimeout(sortTimer);

    sortTimer = window.setTimeout(() => {
      sortResults();
    }, 150);
  }

  installStyles();

  if (typeof GM_registerMenuCommand === 'function') {
    GM_registerMenuCommand(
      'Geizhals: Nach Bewertung und Beliebtheit sortieren',
      scheduleSort,
    );
  }

  const observer = new MutationObserver(scheduleSort);

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  scheduleSort();
})();
