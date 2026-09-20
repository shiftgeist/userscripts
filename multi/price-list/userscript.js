// ==UserScript==
// @name        Price List (avg, med, min, max)
// @namespace   shiftgeist
// @icon        https://fav.farm/💲
// @version     1.1.0
//
// @match       https://www.ebay.com/sch/*
// @match       https://www.ebay.de/sch/*
// @match       https://www.ebay.co.uk/sch/*
// @match       https://www.ebay.fr/sch/*
// @match       https://www.ebay.it/sch/*
// @match       https://www.ebay.es/sch/*
// @match       https://www.ebay.at/sch/*
// @match       https://www.ebay.ch/sch/*
// @match       https://www.1000ps.de/gebrauchte-motorraeder/marke/*/modell/*
// @match       https://www.1000ps.at/gebrauchte-motorraeder/marke/*/modell/*
// @match       https://suchen.mobile.de/*/*
// @match       https://www.kleinanzeigen.de/s-*
// @match       https://www.autoscout24.de/lst-moto*
// @match       https://www.motorrad-boerse.de/*
// @grant       GM_addStyle
// @grant       GM_setClipboard
// @run-at      document-idle
//
// @author      shiftgeist
// @description Collect prices on supported listing pages, show stats, copy to clipboard
// @license     GNU GPLv3
//
// @updateURL   https://raw.githubusercontent.com/shiftgeist/userscripts/refs/heads/main/${PATH}
// @downloadURL https://raw.githubusercontent.com/shiftgeist/userscripts/refs/heads/main/${PATH}
// ==/UserScript==
;(() => {
  'use strict'

  // ─── Site registry ──────────────────────────────────────────────
  // Add a new site by appending an entry.
  // Required: hostPattern, priceSelector
  // Optional: locale (default 'eu'), filter, onCollected
  //
  // Selectors marked "// unverified" are best guesses — open DevTools
  // on a results page and inspect the price element to confirm.

  const SITES = [
    {
      name: 'eBay',
      hostPattern: /\.ebay\.(com|de|co\.uk|fr|it|es|at|ch)$/,
      priceSelector: '.s-card__price',
      locale: () => /\.(de|fr|it|es|at|ch)$/.test(location.hostname) ? 'eu' : 'us',
      // Exclude aria-hidden wrappers (eBay's clipped "Shop on eBay" placeholders)
      // and anything not actually rendered on screen.
      filter: el => el.checkVisibility() && !el.closest('[aria-hidden="true"]')
    },
    {
      name: '1000ps',
      hostPattern: /\.1000ps\.(de|at)$/,
      priceSelector: '.pricesize',
      locale: 'eu'
    },
    {
      name: 'mobile.de',
      hostPattern: /^suchen\.mobile\.de$/,
      priceSelector: '[data-testid^="result-listing-"] [data-testid="price-label"]',
      locale: 'eu',
      onCollected: ({ button }) => {
        const pagination = document.querySelector('[data-testid="srp-pagination"]')
        if (!pagination) return
        button.textContent += ' + More'
        pagination.scrollIntoView()
      }
    },
    {
      name: 'Kleinanzeigen',
      hostPattern: /^www\.kleinanzeigen\.de$/,
      // p.font-strong inside article[data-adid] is the asking price.
      // The site uses Tailwind utility classes — no stable BEM hook exists.
      // "VB" suffix (Verhandlungsbasis) is stripped by the parser.
      priceSelector: 'article[data-adid] p.font-strong',
      locale: 'eu'
    },
    {
      name: 'AutoScout24',
      hostPattern: /^www\.autoscout24\.de$/,
      priceSelector: '[data-testid="regular-price"]', // unverified
      locale: 'eu'
    },
    {
      name: 'Motorrad-Boerse',
      hostPattern: /^www\.motorrad-boerse\.de$/,
      priceSelector: '.price', // unverified
      locale: 'eu'
    }
  ]

  // ─── Visible-text extraction ────────────────────────────────────
  // Walks the DOM to recover what the user actually sees. Skips
  // display:none / visibility:hidden nodes, includes ::before/::after
  // pseudo-element content. Defeats common anti-scraping tricks where
  // digits are injected via CSS or decoy spans are hidden.

  function pseudoContent(el, pseudo) {
    const raw = getComputedStyle(el, pseudo).content
    if (!raw || raw === 'none' || raw === 'normal') return ''
    const quoted = raw.match(/^"(.*)"$/)
    return quoted ? quoted[1] : ''
  }

  function extractVisibleText(element) {
    const parts = []
    function walk(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        parts.push(node.textContent)
        return
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return
      const style = getComputedStyle(node)
      if (style.display === 'none' || style.visibility === 'hidden') return
      parts.push(pseudoContent(node, '::before'))
      for (const child of node.childNodes) walk(child)
      parts.push(pseudoContent(node, '::after'))
    }
    walk(element)
    return parts.join('')
  }

  // ─── Price parsing ──────────────────────────────────────────────
  // locale 'eu': 1.234,56 → 1234.56
  // locale 'us': 1,234.56 → 1234.56
  // Ranges (e.g. "€ 100 – € 200") return the midpoint.

  function parsePrice(text, locale) {
    const cleaned = text.replace(/[A-Z]{3}|[€$£¥]/g, '').trim()
    const tokens = cleaned.match(/[\d.,]+/g)
    if (!tokens) return null

    const numbers = tokens
      .map(token => {
        const normalized = locale === 'eu'
          ? token.replace(/\./g, '').replace(',', '.')
          : token.replace(/,/g, '')
        return Number.parseFloat(normalized)
      })
      .filter(n => !Number.isNaN(n) && n > 0)

    if (numbers.length === 0) return null
    return numbers.reduce((a, b) => a + b, 0) / numbers.length
  }

  function computeStats(prices) {
    const sorted = [...prices].sort((a, b) => a - b)
    const sum = prices.reduce((a, b) => a + b, 0)
    return {
      count: prices.length,
      average: sum / prices.length,
      median: sorted[Math.floor(sorted.length / 2)],
      min: sorted[0],
      max: sorted[sorted.length - 1]
    }
  }

  function formatSummary(stats) {
    return [
      `Count:   ${stats.count}`,
      `Average: ${stats.average.toFixed(2)}`,
      `Median:  ${stats.median.toFixed(2)}`,
      `Min:     ${stats.min.toFixed(2)}`,
      `Max:     ${stats.max.toFixed(2)}`
    ].join('\n')
  }

  // ─── Main ───────────────────────────────────────────────────────

  const site = SITES.find(s => s.hostPattern.test(location.hostname))
  if (!site) return

  const locale = typeof site.locale === 'function' ? site.locale() : (site.locale ?? 'eu')
  const filter = site.filter ?? (() => true)

  GM_addStyle(`
        #priceCollectorBtn {
            position: fixed;
            bottom: 1rem;
            left: 1rem;
            z-index: 9999;
            padding: 8px 12px;
            background: #333;
            color: #fff;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-family: sans-serif;
            font-size: 13px;
        }
        #priceCollectorBtn:active {
            background: #2563eb;
        }
        #priceCollectorPanel {
            position: fixed;
            bottom: 4rem;
            left: 1rem;
            z-index: 9999;
            padding: 12px 16px;
            border-radius: 4px;
            font-family: monospace;
            font-size: 12px;
            max-width: 320px;
            max-height: 70vh;
            overflow: auto;
            white-space: pre;
            display: none;
            cursor: pointer;

            background: #fff;
            color: #111;
            border: 1px solid #ccc;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
        }
        @media (prefers-color-scheme: dark) {
            #priceCollectorPanel {
                background: #1e1e1e;
                color: #e0e0e0;
                border-color: #444;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
            }
        }
    `)

  const btn = document.createElement('button')
  btn.id = 'priceCollectorBtn'
  btn.textContent = 'PRICE LIST'
  document.body.appendChild(btn)

  const panel = document.createElement('div')
  panel.id = 'priceCollectorPanel'
  panel.title = 'Click to dismiss'
  panel.addEventListener('click', () => {
    panel.style.display = 'none'
  })
  document.body.appendChild(panel)

  btn.addEventListener('click', () => {
    const elements = document.querySelectorAll(site.priceSelector)
    const prices = Array.from(elements)
      .filter(filter)
      .map(el => parsePrice(extractVisibleText(el), locale))
      .filter(p => p !== null)

    if (prices.length === 0) {
      panel.textContent = 'No prices found'
      panel.style.display = 'block'
      return
    }

    const stats = computeStats(prices)
    const summary = formatSummary(stats)
    const clipboard = prices.map(p => p.toFixed(2)).join(',')

    GM_setClipboard(clipboard)
    panel.textContent = `${summary}\n\n(Prices copied — click to dismiss)`
    panel.style.display = 'block'

    console.log(`=== Price List (${site.name}) ===`)
    console.log(summary)
    console.log('Prices:', clipboard)
    console.log('✅ Copied to clipboard')

    if (site.onCollected) site.onCollected({ prices, stats, button: btn, panel })
  })
})()
