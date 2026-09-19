// ==UserScript==
// @name        DOM Tools: Slim HTML Copier
// @namespace   shiftgeist
// @icon        https://fav.farm/📋
// @version     20260918.2
//
// @match       *://*/*
// @grant       GM_registerMenuCommand
// @grant       GM_setClipboard
// @run-at      document-idle
//
// @author      shiftgeist
// @description Pick an element and copy a slimmed-down, agent-friendly HTML snapshot to clipboard
// @license     GNU GPLv3
//
// @updateURL   https://raw.githubusercontent.com/shiftgeist/userscripts/refs/heads/main/_devtools/copy-slim-html-selector.user.js
// @downloadURL https://raw.githubusercontent.com/shiftgeist/userscripts/refs/heads/main/_devtools/copy-slim-html-selector.user.js
// ==/UserScript==

(function () {
  'use strict';

  // ---------- serialization ----------

  const SKIP_TAGS = new Set(['script', 'style', 'svg', 'noscript', 'link', 'meta']);
  const KEEP_ATTRS = new Set([
    'id', 'class', 'href', 'src', 'type', 'name', 'placeholder',
    'value', 'role', 'alt', 'title', 'for'
  ]);
  const KEEP_DATA_ATTRS = new Set(['data-testid', 'data-qa', 'data-cy', 'data-test']);
  const PLACEHOLDER_TEXT = new Set(['-', '–', '—', 'n/a', 'N/A']);
  const MAX_TEXT_LENGTH = 80;
  const INTERACTIVE_TAGS = new Set(['input', 'button', 'a', 'select', 'textarea', 'img']);

  // Pure styling/framework tags that wrap buttons/links with zero semantic purpose
  const PASS_THROUGH_CONTAINERS = new Set([
    'yt-button-shape', 'yt-smartimation', 'timed-animation-button-renderer',
    'ytw-timed-animation-button-renderer'
  ]);

  // Elements whose text can be safely hoised directly, pruning decorative internal spans/divs
  const INLINE_TEXT_TAGS = new Set([
    'button', 'a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'label',
    'badge-shape', 'yt-formatted-string'
  ]);

  // Framework utility classes that add noise to selectors
  const JUNK_CLASS_REGEX = /^(svelte-[a-z0-9]+|style-scope|ytSpec[A-Za-z]+(Padding|Size[A-Z]|Enable|Elevated)|ytAttributedString[A-Za-z]+|notranslate)$/;

  const MAX_REPEATED_SAMPLE = 2;
  const MIN_REPEAT_TO_COLLAPSE = 3;

  const NON_FOLDING_TAGS = new Set([
    'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'label', 'pre', 'code',
    'td', 'th',
    'input', 'button', 'select', 'textarea'
  ]);

  const SEMANTIC_REPEATING_TAGS = new Set(['li', 'tr', 'dt', 'dd', 'option']);

  function isVisible(el) {
    if (!(el instanceof Element)) return true;
    const style = getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden';
  }

  function cleanClassList(classList) {
    return [...classList].filter(cls => !JUNK_CLASS_REGEX.test(cls));
  }

  function buildSelector(el) {
    if (el.id) return `#${el.id}`;

    const realClasses = cleanClassList(el.classList).slice(0, 2);
    const classPart = realClasses.length ? `.${realClasses.join('.')}` : '';
    const parent = el.parentElement;
    if (!parent) return el.tagName.toLowerCase() + classPart;

    const siblings = [...parent.children].filter(c => c.tagName === el.tagName);
    const needsIndex = siblings.length > 1;
    const index = needsIndex ? `:nth-of-type(${siblings.indexOf(el) + 1})` : '';

    return el.tagName.toLowerCase() + classPart + index;
  }

  function cleanHref(href) {
    try {
      const url = new URL(href, window.location.origin);
      ['pp', 'sqp', 'rs', 'si', 'feature'].forEach(p => url.searchParams.delete(p));
      return url.pathname + (url.search ? url.search : '');
    } catch {
      return href;
    }
  }

  function ownTextOf(el) {
    const text = [...el.childNodes]
      .filter(n => n.nodeType === Node.TEXT_NODE)
      .map(n => n.textContent.trim())
      .filter(Boolean)
      .join(' ');
    if (PLACEHOLDER_TEXT.has(text)) return '';
    return text.length > MAX_TEXT_LENGTH ? text.slice(0, MAX_TEXT_LENGTH) + '…' : text;
  }

  // Returns full text inside an element (normalized)
  function fullTextOf(el) {
    const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
    if (PLACEHOLDER_TEXT.has(text)) return '';
    return text.length > MAX_TEXT_LENGTH ? text.slice(0, MAX_TEXT_LENGTH) + '…' : text;
  }

  // Checks if an element can simply inline its text instead of serializing nested spans/divs
  function canInlineText(el) {
    const tag = el.tagName.toLowerCase();
    if (!INLINE_TEXT_TAGS.has(tag)) return false;
    if (el.children.length === 0) return false;

    // Do not inline if it contains complex nested interactive tags (e.g. <a> with an <img>)
    for (const child of el.children) {
      const cTag = child.tagName.toLowerCase();
      if (INTERACTIVE_TAGS.has(cTag)) return false;
    }

    const text = fullTextOf(el);
    return text.length > 0 && text.length <= MAX_TEXT_LENGTH;
  }

  function attrString(el, effectiveText = '') {
    const parts = [];
    const fullText = effectiveText || fullTextOf(el);

    for (const attr of el.attributes) {
      if (attr.name === 'class') {
        const realClasses = cleanClassList(attr.value.split(/\s+/).filter(Boolean)).slice(0, 3);
        if (realClasses.length) parts.push(`class="${realClasses.join(' ')}"`);
        continue;
      }
      if (attr.name === 'href') {
        parts.push(`href="${cleanHref(attr.value)}"`);
        continue;
      }
      if (attr.name === 'src') {
        const val = attr.value.length > 45 ? '…' : attr.value;
        parts.push(`src="${val}"`);
        continue;
      }
      // Drop redundant labels that merely duplicate inner text
      if ((attr.name === 'aria-label' || attr.name === 'title') && attr.value.trim() === fullText) {
        continue;
      }

      const isDataAttr = attr.name.startsWith('data-');
      const shouldKeep = isDataAttr
        ? KEEP_DATA_ATTRS.has(attr.name)
        : (KEEP_ATTRS.has(attr.name) || attr.name.startsWith('aria-'));
      if (!shouldKeep) continue;
      parts.push(`${attr.name}="${attr.value}"`);
    }
    return parts.length ? ' ' + parts.join(' ') : '';
  }

  function isRedundantHiddenDuplicate(el) {
    const isHidden = el.classList.contains('visually-hidden') || el.classList.contains('sr-only');
    if (!isHidden) return false;
    const text = ownTextOf(el);
    if (!text) return false;
    const visibleSiblings = el.parentElement?.querySelectorAll('[aria-hidden="true"]') ?? [];
    return [...visibleSiblings].some(sib => ownTextOf(sib).includes(text));
  }

  function hasRenderableContent(el) {
    if (!(el instanceof Element)) return false;
    const tag = el.tagName.toLowerCase();
    if (SKIP_TAGS.has(tag)) return false;
    if (!isVisible(el)) return false;
    if (isRedundantHiddenDuplicate(el)) return false;
    if (INTERACTIVE_TAGS.has(tag)) return true;
    if (ownTextOf(el).length > 0) return true;

    for (const child of el.children) {
      if (hasRenderableContent(child)) return true;
    }
    return false;
  }

  // Detects if this element has siblings with the same tag (identifying repeating collections)
  function hasSameTagSiblings(el) {
    const parent = el.parentElement;
    if (!parent) return false;
    for (const sib of parent.children) {
      if (sib !== el && sib.tagName === el.tagName) return true;
    }
    return false;
  }

  function isTransparentWrapper(el) {
    if (!(el instanceof Element)) return false;
    const tag = el.tagName.toLowerCase();
    if (INTERACTIVE_TAGS.has(tag)) return false;
    if (el.id) return false;
    if (el.hasAttribute('role')) return false;
    if (ownTextOf(el).length > 0) return false;

    // Never unwrap items that are part of a sibling list (e.g. comment threads, video cards)
    if (hasSameTagSiblings(el)) return false;

    // Must wrap exactly 1 renderable child
    let renderableCount = 0;
    for (const child of el.children) {
      if (hasRenderableContent(child)) {
        renderableCount++;
        if (renderableCount > 1) return false;
      }
    }
    if (renderableCount !== 1) return false;

    // 1. Pass-through custom container components (e.g. <yt-button-shape>, <yt-smartimation>)
    if (PASS_THROUGH_CONTAINERS.has(tag)) return true;

    // 2. Anonymous div/span styling wrappers without test attributes
    if (tag === 'div' || tag === 'span') {
      const meaningfulAttrs = [...el.attributes].filter(a =>
        a.name !== 'class' && a.name !== 'style'
      );
      return meaningfulAttrs.length === 0;
    }

    return false;
  }

  function getEffectiveChildren(element) {
    const result = [];
    for (const child of element.children) {
      const tag = child.tagName.toLowerCase();
      if (SKIP_TAGS.has(tag)) continue;
      if (!isVisible(child)) continue;
      if (isRedundantHiddenDuplicate(child)) continue;
      if (!hasRenderableContent(child)) continue;

      if (isTransparentWrapper(child)) {
        result.push(...getEffectiveChildren(child));
      } else {
        result.push(child);
      }
    }
    return result;
  }

  function getElementSummary(el) {
    const tag = el.tagName.toLowerCase();
    const realClasses = cleanClassList(el.classList);
    return realClasses.length ? `${tag}.${realClasses.slice(0, 2).join('.')}` : tag;
  }

  // Preserved from original: reliable structural & semantic similarity grouping
  function areSimilarSiblings(a, b) {
    if (!(a instanceof Element) || !(b instanceof Element)) return false;
    if (a.tagName !== b.tagName) return false;

    const tag = a.tagName.toLowerCase();
    if (NON_FOLDING_TAGS.has(tag)) return false;

    const roleA = a.getAttribute('role');
    const roleB = b.getAttribute('role');
    if (roleA && roleB && roleA !== roleB) return false;

    const isSemantic = SEMANTIC_REPEATING_TAGS.has(tag);

    const classesA = cleanClassList(a.classList);
    const classesB = cleanClassList(b.classList);
    const setB = new Set(classesB);

    const common = classesA.filter(c => setB.has(c));
    const union = new Set([...classesA, ...classesB]);
    const jaccard = union.size === 0 ? 1 : common.length / union.size;

    const childrenA = getEffectiveChildren(a);
    const childrenB = getEffectiveChildren(b);

    const maxLen = Math.max(childrenA.length, childrenB.length);
    const minLen = Math.min(childrenA.length, childrenB.length);
    const countDiff = maxLen - minLen;

    const tagsA = childrenA.map(c => c.tagName.toLowerCase());
    const tagsB = childrenB.map(c => c.tagName.toLowerCase());

    const tagCountsB = {};
    for (const t of tagsB) tagCountsB[t] = (tagCountsB[t] || 0) + 1;
    let sharedTagCount = 0;
    for (const t of tagsA) {
      if (tagCountsB[t] > 0) {
        sharedTagCount++;
        tagCountsB[t]--;
      }
    }
    const tagOverlap = maxLen === 0 ? 1 : sharedTagCount / maxLen;

    if (isSemantic) {
      if (classesA.length === 0 && classesB.length === 0) return true;
      if (common.length > 0 || jaccard >= 0.3) return true;
      if (classesA.length === 0 || classesB.length === 0) return true;
      if (countDiff <= 2 && tagOverlap >= 0.5) return true;
    }

    if (common.length >= 1) {
      if (jaccard >= 0.3 || common.length >= 2) {
        if (maxLen === 0 || tagOverlap >= 0.5 || countDiff <= 2) {
          return true;
        }
      }
    }

    if (classesA.length === 0 && classesB.length === 0) {
      if (maxLen > 0 && countDiff <= 2 && tagOverlap >= 0.6) {
        return true;
      }
    }

    if (maxLen >= 2 && countDiff <= 1 && tagOverlap >= 0.75) {
      return true;
    }

    return false;
  }

  function groupSimilarSiblings(children) {
    const groups = [];
    let currentGroup = [];

    for (const child of children) {
      if (currentGroup.length === 0) {
        currentGroup.push(child);
      } else {
        const proto = currentGroup[0];
        const prev = currentGroup[currentGroup.length - 1];
        if (areSimilarSiblings(proto, child) || areSimilarSiblings(prev, child)) {
          currentGroup.push(child);
        } else {
          groups.push(currentGroup);
          currentGroup = [child];
        }
      }
    }
    if (currentGroup.length > 0) groups.push(currentGroup);
    return groups;
  }

  function serialize(el, depth = 0, isRoot = true) {
    const tag = el.tagName.toLowerCase();
    if (SKIP_TAGS.has(tag)) return '';
    if (!isVisible(el)) return '';
    if (isRedundantHiddenDuplicate(el)) return '';
    if (!isRoot && !hasRenderableContent(el)) return '';

    let text = ownTextOf(el);
    let shouldPruneChildren = false;

    // If this element's children are just text formatting wrappers, inline text
    if (!text && canInlineText(el)) {
      text = fullTextOf(el);
      shouldPruneChildren = true;
    }

    const indent = '  '.repeat(depth);
    const selector = buildSelector(el);
    const line = `${indent}<${tag}${attrString(el, text)}> [${selector}]${text ? ` "${text}"` : ''}`;

    if (shouldPruneChildren) {
      return line;
    }

    const effectiveChildren = getEffectiveChildren(el);
    const groups = groupSimilarSiblings(effectiveChildren);
    const childLines = [];

    for (const group of groups) {
      if (group.length >= MIN_REPEAT_TO_COLLAPSE) {
        for (let i = 0; i < MAX_REPEATED_SAMPLE; i++) {
          const childOutput = serialize(group[i], depth + 1, false);
          if (childOutput) childLines.push(childOutput);
        }
        const omittedCount = group.length - MAX_REPEATED_SAMPLE;
        const summary = getElementSummary(group[0]);
        const childIndent = '  '.repeat(depth + 1);
        childLines.push(`${childIndent}… [${omittedCount} more similar <${summary}> omitted]`);
      } else {
        for (const child of group) {
          const childOutput = serialize(child, depth + 1, false);
          if (childOutput) childLines.push(childOutput);
        }
      }
    }

    if (!isRoot && !INTERACTIVE_TAGS.has(tag) && !text && childLines.length === 0) {
      return '';
    }

    return [line, ...childLines].join('\n');
  }

  // ---------- picker & panel UI ----------

  function pickElement() {
    document.body.style.cursor = 'crosshair';

    function onHover(e) { e.target.style.outline = '2px solid red'; }
    function onUnhover(e) { e.target.style.outline = ''; }
    function onClick(e) {
      e.preventDefault();
      e.stopPropagation();
      e.target.style.outline = '';
      document.body.style.cursor = '';
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('mouseover', onHover, true);
      document.removeEventListener('mouseout', onUnhover, true);
      showConfirmPanel(e.target);
    }

    document.addEventListener('click', onClick, true);
    document.addEventListener('mouseover', onHover, true);
    document.addEventListener('mouseout', onUnhover, true);
  }

  function showConfirmPanel(initialTarget) {
    let currentTarget = initialTarget;
    let zoomInCleanup = null;

    const host = document.createElement('div');
    host.style.cssText = 'position:fixed; bottom:16px; right:16px; z-index:2147483647;';
    const shadow = host.attachShadow({ mode: 'open' });

    shadow.innerHTML = `
      <style>
        .panel {
          font: 13px/1.4 system-ui, sans-serif;
          background: #1e1e1e;
          color: #eee;
          border: 1px solid #444;
          border-radius: 8px;
          padding: 10px 12px;
          box-shadow: 0 4px 16px rgba(0,0,0,0.4);
          max-width: 320px;
        }
        .selector { color: #7fd; word-break: break-all; margin-bottom: 8px; }
        .hint { color: #999; margin-bottom: 8px; }
        .row { display: flex; gap: 6px; }
        button {
          flex: 1;
          font: inherit;
          padding: 6px 10px;
          border: 1px solid #555;
          border-radius: 5px;
          background: #2a2a2a;
          color: #eee;
          cursor: pointer;
        }
        button:hover { background: #383838; }
        button:disabled { opacity: 0.4; cursor: default; }
        button.active { border-color: #4df; color: #4df; }
      </style>
      <div class="panel">
        <div class="selector"></div>
        <div class="hint"></div>
        <div class="row">
          <button data-action="zoom-out">↑ Out</button>
          <button data-action="zoom-in">↓ In</button>
          <button data-action="copy">Copy</button>
          <button data-action="cancel">✕</button>
        </div>
      </div>
    `;

    const selectorLabel = shadow.querySelector('.selector');
    const hintLabel = shadow.querySelector('.hint');
    const zoomOutButton = shadow.querySelector('[data-action="zoom-out"]');
    const zoomInButton = shadow.querySelector('[data-action="zoom-in"]');
    const copyButton = shadow.querySelector('[data-action="copy"]');
    const cancelButton = shadow.querySelector('[data-action="cancel"]');

    function clearOutlines() {
      document.querySelectorAll('[data-slim-html-outline]').forEach((el) => {
        el.style.outline = '';
        el.removeAttribute('data-slim-html-outline');
      });
    }

    function refreshOutline() {
      clearOutlines();
      currentTarget.style.outline = '2px solid red';
      currentTarget.setAttribute('data-slim-html-outline', '1');
      selectorLabel.textContent = buildSelector(currentTarget);
      hintLabel.textContent = '';
      zoomOutButton.disabled = !currentTarget.parentElement;
      zoomInButton.disabled = currentTarget.children.length === 0;
      zoomInButton.classList.remove('active');
    }

    function cleanup() {
      if (zoomInCleanup) zoomInCleanup();
      clearOutlines();
      document.removeEventListener('keydown', onEscape);
      host.remove();
    }

    function onEscape(e) {
      if (e.key !== 'Escape') return;
      if (zoomInCleanup) {
        zoomInCleanup();
        refreshOutline();
      } else {
        cleanup();
      }
    }

    function startZoomIn() {
      if (currentTarget.children.length === 0) return;

      document.body.style.cursor = 'crosshair';
      zoomInButton.classList.add('active');
      hintLabel.textContent = 'Click a child element, or Esc to cancel';

      function isDescendant(el) { return el !== currentTarget && currentTarget.contains(el); }
      function isInsidePanel(el) { return el === host || host.contains(el); }

      function onHover(e) {
        if (!isDescendant(e.target)) return;
        e.target.style.outline = '2px solid #4df';
      }
      function onUnhover(e) {
        if (!isDescendant(e.target)) return;
        e.target.style.outline = '';
      }
      function onClick(e) {
        if (isInsidePanel(e.target) || !isDescendant(e.target)) return;
        e.preventDefault();
        e.stopPropagation();
        const chosen = e.target;
        zoomInCleanup();
        currentTarget = chosen;
        refreshOutline();
      }

      document.addEventListener('mouseover', onHover, true);
      document.addEventListener('mouseout', onUnhover, true);
      document.addEventListener('click', onClick, true);

      zoomInCleanup = () => {
        document.body.style.cursor = '';
        document.removeEventListener('mouseover', onHover, true);
        document.removeEventListener('mouseout', onUnhover, true);
        document.removeEventListener('click', onClick, true);
        zoomInCleanup = null;
      };
    }

    zoomOutButton.addEventListener('click', () => {
      if (!currentTarget.parentElement) return;
      currentTarget = currentTarget.parentElement;
      refreshOutline();
    });

    zoomInButton.addEventListener('click', () => {
      if (zoomInCleanup) {
        zoomInCleanup();
        refreshOutline();
      } else {
        startZoomIn();
      }
    });

    copyButton.addEventListener('click', () => {
      const output = serialize(currentTarget, 0, true);
      GM_setClipboard(output);
      console.log(output);
      cleanup();
    });

    cancelButton.addEventListener('click', cleanup);
    document.addEventListener('keydown', onEscape);

    document.body.appendChild(host);
    refreshOutline();
  }

  // ---------- menu commands ----------

  GM_registerMenuCommand('Pick element → copy slim HTML', pickElement);

  GM_registerMenuCommand('Copy slim HTML (whole page)', () => {
    const output = serialize(document.body, 0, true);
    GM_setClipboard(output);
    console.log(output);
  });
})();
