# Userscripts

> Collection of userscripts

## Scripts

```
.
├── _devtools
│   └── copy-slim-html-selector.user.js
├── dribbble.com
│   └── sort-by-like-count.user.js
├── fddb.info
│   └── copy-food-specs.user.js
├── geizhals.de
│   └── sort-by-reliable-combined.user.js
├── github.com
│   └── undiscovered-trending
│       └── userscript.js
├── koeln-bonn-airport.de
│   └── arrival-departure-bussy-flight-window.user.js
├── multi
│   └── price-list
│       └── userscript.js
└── youtube.com
    ├── controls-visible-on-pause.user.js
    └── watch-later-better-remove-watched.user.js
```

## More

- https://greasyfork.org/en/users/1438639-shiftgeist

## Developers

```js
const meta = `
// ==UserScript==
// @name        ${NAME}
// @namespace   shiftgeist
// @icon        https://www.google.com/s2/favicons?sz=64&domain=${WEBSITE} or https://fav.farm/${EMOJI}
// @version     YYYYMMDD.0-999 or YYYYMMDD.HHMM
//
// @match       https://${MATCH_WEBSITE}*
// @grant       none
// @run-at      document-idle
//
// @author      shiftgeist
// @description ${DESCRIPTION}
// @license     GNU GPLv3
//
// @updateURL   https://raw.githubusercontent.com/shiftgeist/userscripts/refs/heads/main/${PATH}.user.js
// @downloadURL https://raw.githubusercontent.com/shiftgeist/userscripts/refs/heads/main/${PATH}.user.js
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
