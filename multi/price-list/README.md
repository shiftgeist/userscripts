# 💲 Price List

A userscript that collects all prices on a listing page, computes stats, and copies them to your clipboard — ready to paste into a spreadsheet.

## Supported sites

| Site                                                     | Category           |
| -------------------------------------------------------- | ------------------ |
| eBay (.com / .de / .co.uk / .fr / .it / .es / .at / .ch) | General            |
| Kleinanzeigen.de                                         | General            |
| mobile.de                                                | Cars & motorcycles |
| AutoScout24.de                                           | Cars & motorcycles |
| 1000ps.de / 1000ps.at                                    | Motorcycles        |
| Motorrad-Boerse.de                                       | Motorcycles        |

## What it does

Click the **PRICE LIST** button in the bottom-left corner of any supported page.

```
Count:   42
Average: 412.38
Median:  399.00
Min:     121.00
Max:     699.99

(Prices copied — click to dismiss)
```

The full price list is also copied to your clipboard as comma-separated values:

```
370.00,375.00,380.00,399.00,400.00,...
```

Paste directly into Google Sheets, Excel, or Numbers — no cleanup needed.

## Details

**Locale-aware parsing** — handles both European (`1.234,56`) and US/UK (`1,234.56`) number formats automatically per domain.

**Anti-scraping resilient** — eBay injects price digits via CSS `content` pseudo-elements and hides decoy price spans in the DOM. The script walks the DOM directly rather than reading `innerText`, and checks `aria-hidden` ancestry to skip hidden placeholder cards.

**Dark mode** — the panel respects `prefers-color-scheme`.

## Adding a new site

The script is driven by a registry at the top of the file. Adding a site is appending one object:

```
{
    name: 'Example',
    hostPattern: /^www\.example\.de$/,
    priceSelector: '.listing-price',  // CSS selector for price elements
    locale: 'eu',                     // 'eu' or 'us'
},
```

Optional fields:

Field

Type

Description

`locale`

\`'eu' \\

'us' \\

`filter`

`(el) => boolean`

Per-element filter applied before parsing.

`onCollected`

`({ prices, stats, button, panel }) => void`

Hook called after collection, e.g. to scroll to pagination.
