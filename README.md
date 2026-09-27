# Userscripts

> Collection of userscripts

## Scripts

<!-- SCRIPTS:START -->

### DOM Tools: Slim HTML Copier

> Pick an element and copy a slimmed-down, agent-friendly HTML snapshot to clipboard

```
https://raw.githubusercontent.com/shiftgeist/userscripts/refs/heads/main/_devtools/copy-slim-html-selector.user.js
```

<small>[_devtools/copy-slim-html-selector.user.js](_devtools/copy-slim-html-selector.user.js)</small>

### Dribbble: Sort by Likes

> Sorts Dribbble search results by like count, descending

```
https://raw.githubusercontent.com/shiftgeist/userscripts/refs/heads/main/dribbble.com/sort-by-like-count.user.js
```

<small>[dribbble.com/sort-by-like-count.user.js](dribbble.com/sort-by-like-count.user.js)</small>

### Copy food specs

> Shows button to copy specs of food with tab seperation

```
https://raw.githubusercontent.com/shiftgeist/userscripts/refs/heads/main/fddb.info/copy-food-specs.user.js
```

<small>[fddb.info/copy-food-specs.user.js](fddb.info/copy-food-specs.user.js)</small>

### Geizhals: Sort by reliable rating

> Sort Geizhals result cards by rating confidence and review count.

```
https://raw.githubusercontent.com/shiftgeist/userscripts/refs/heads/main/geizhals.de/sort-by-reliable-combined.user.js
```

<small>[geizhals.de/sort-by-reliable-combined.user.js](geizhals.de/sort-by-reliable-combined.user.js)</small>

### CGN Airport Busiest Flight Window Analyzer

> Analyzes flight data from Cologne Bonn Airport (CGN) to find the busiest time windows for plane spotting, based on user-specified date and time range and maximum window duration.

```
https://raw.githubusercontent.com/shiftgeist/userscripts/refs/heads/main/koeln-bonn-airport.de/arrival-departure-bussy-flight-window.user.js
```

<small>[koeln-bonn-airport.de/arrival-departure-bussy-flight-window.user.js](koeln-bonn-airport.de/arrival-departure-bussy-flight-window.user.js)</small>

### YouTube: Keep Controls Visible on Pause

> ${DESCRIPTION}

```
https://raw.githubusercontent.com/shiftgeist/userscripts/refs/heads/main/youtube.com/controls-visible-on-pause.user.js
```

<small>[youtube.com/controls-visible-on-pause.user.js](youtube.com/controls-visible-on-pause.user.js)</small>

### GitHub: Undiscovered Trending

> Hide starred repos in trending and remove slob

```
https://raw.githubusercontent.com/shiftgeist/userscripts/refs/heads/main/github.com/undiscovered-trending/script.user.js
```

<small>[github.com/undiscovered-trending/script.user.js](github.com/undiscovered-trending/script.user.js)</small>

### Price List (avg, med, min, max)

> Collect prices on supported listing pages, show stats, copy to clipboard

```
https://raw.githubusercontent.com/shiftgeist/userscripts/refs/heads/main/multi/price-list/script.user.js
```

<small>[multi/price-list/script.user.js](multi/price-list/script.user.js)</small>

### Watch later: Better remove watched

> Delete videos that you watch at customizable percent

```
https://raw.githubusercontent.com/shiftgeist/userscripts/refs/heads/main/youtube.com/better-remove-watched/script.user.js
```

<small>[youtube.com/better-remove-watched/script.user.js](youtube.com/better-remove-watched/script.user.js)</small>

<!-- SCRIPTS:END -->

## More

- https://greasyfork.org/en/users/1438639-shiftgeist

## Developers

```
├── _devtools
│   └── copy-slim-html-selector.user.js
├── dribbble.com
│   └── sort-by-like-count.user.js
├── fddb.info
│   └── copy-food-specs.user.js
├── geizhals.de
│   └── sort-by-reliable-combined.user.js
├── github.com
│   └── undiscovered-trending
│       └── script.user.js
├── koeln-bonn-airport.de
│   └── arrival-departure-bussy-flight-window.user.js
├── multi
│   └── price-list
│       └── script.user.js
└── youtube.com
    ├── better-remove-watched
    │   ├── script.user.js
    │   └── slim-html_www.youtube.com_playlist?list=WL
    └── controls-visible-on-pause.user.js
```

```js
const meta = `
// ==UserScript==
// @name        ${NAME}
// @namespace   shiftgeist
// @icon        https://www.google.com/s2/favicons?sz=64&domain=${WEBSITE} or https://fav.farm/${EMOJI}
// @version     0.0.1
// @timestamp   20260926.1400
//
// @match       https://${MATCH_WEBSITE}*
// @grant       none
// @run-at      document-idle
//
// @author      shiftgeist
// @description ${DESCRIPTION}
// @license     GNU GPLv3
//
// @homepage    https://github.com/shiftgeist/userscripts
// @updateURL   https://raw.githubusercontent.com/shiftgeist/userscripts/refs/heads/main/${PATH}.user.js
// @downloadURL https://raw.githubusercontent.com/shiftgeist/userscripts/refs/heads/main/${PATH}.user.js
// @supportURL  https://github.com/shiftgeist/userscripts/issues
// ==/UserScript==
`
```

PATH

- Strip `www.`
- Filename: `${name}.user.js` or `${name}/script.user.js` if more then user.js

Build tree

```sh
tree -P '*.js' -I 'node_modules|dist' --noreport
```

## Tasks

- [ ] Provide `${PATH}.meta.js` for `@updateURL`
