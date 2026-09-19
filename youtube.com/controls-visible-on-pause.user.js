// ==UserScript==
// @name        YouTube: Keep Controls Visible on Pause
// @namespace   shiftgeist
// @icon        https://www.google.com/s2/favicons?sz=64&domain=youtube.com
// @version     20260819.1
//
// @match       https://www.youtube.com/*
// @grant       none
// @run-at      document-idle
//
// @author      shiftgeist
// @description ${DESCRIPTION}
// @license     GNU GPLv3
//
// @updateURL   https://raw.githubusercontent.com/shiftgeist/userscripts/refs/heads/main/youtube.com/controls-visible-on-pause.user.js
// @downloadURL https://raw.githubusercontent.com/shiftgeist/userscripts/refs/heads/main/youtube.com/controls-visible-on-pause.user.js
// ==/UserScript==

(function () {
  'use strict';

  const observer = new MutationObserver(() => {
    const player = document.querySelector('#movie_player');

    /** @type {HTMLVideoElement} */
    const video = document.querySelector('video.html5-main-video');

    if (!player || !video) return;

    if (video.paused && player.classList.contains('ytp-autohide')) {
      player.classList.remove('ytp-autohide');
    }
  });

  observer.observe(document.body, {
    attributes: true,
    attributeFilter: ['class'],
    subtree: true,
  });
})();
