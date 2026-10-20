// ==UserScript==
// @name        Jira Ticket → Markdown
// @namespace   shiftgeist
// @icon        https://www.google.com/s2/favicons?sz=64&domain=atlassian.net
// @version     0.0.1
//
// @match       https://*.atlassian.net/jira/software/projects/*/boards/*
// @match       https://*.atlassian.net/browse/*
// @grant       none
// @run-at      document-idle
//
// @author      shiftgeist
// @description Copies the open Jira ticket as Markdown, its issue key, or a git branch name
// @license     GNU GPLv3
//
// @homepage    https://github.com/shiftgeist/userscripts
// @updateURL   https://raw.githubusercontent.com/shiftgeist/userscripts/refs/heads/main/atlassian.net/jira-ticket.user.js
// @downloadURL https://raw.githubusercontent.com/shiftgeist/userscripts/refs/heads/main/atlassian.net/jira-ticket.user.js
// @supportURL  https://github.com/shiftgeist/userscripts/issues
// ==/UserScript==
;(function() {
'use strict'

const BRANCH_TITLE_MAX_LENGTH = 40

// --- Jira Extraction Functions ---

function getIssueRoot() {
  return (
    document.querySelector('[data-testid="issue.views.issue-details.issue-modal.modal-dialog"]')
      ?? document.querySelector('[data-testid="preview-panels.preview-panel"]')
      ?? document
  )
}

function getIssueKey(root) {
  const breadcrumbLink = root.querySelector(
    '[data-testid="issue.views.issue-base.foundation.breadcrumbs.current-issue.item"]'
  )
  if (breadcrumbLink) return breadcrumbLink.textContent.trim()

  const browseUrlMatch = window.location.pathname.match(/\/browse\/([A-Z][A-Z0-9]*-\d+)/i)
  return browseUrlMatch ? browseUrlMatch[1] : null
}

function getSummary(root) {
  return root.querySelector('[data-testid="issue.views.issue-base.foundation.summary.heading"]')
    ?.textContent.trim() ?? ''
}

function getIssueType(root) {
  const icon = root.querySelector(
    '[data-testid="issue.views.issue-base.foundation.change-issue-type.button"] img'
  )
  return icon?.getAttribute('alt') ?? '—'
}

function getStatus(root) {
  return root.querySelector(
    '[data-testid="issue-field-status.ui.status-view.status-button.status-button--text"]'
  )?.textContent.trim() ?? '—'
}

function getPriority(root) {
  const wrapper = root.querySelector(
    '[data-testid="issue-field-priority-readview-full.ui.priority.wrapper"]'
  )
  return wrapper?.querySelector('span')?.textContent.trim() ?? '—'
}

function getUserFieldName(root, fieldTestId, roleLabel) {
  const container = root.querySelector(`[data-testid="${fieldTestId}"]`)
  if (!container) return null

  const editButton = Array.from(container.querySelectorAll('button')).find((button) =>
    button.getAttribute('aria-label')?.endsWith(`- edit ${roleLabel}`)
  )
  if (!editButton) return null

  return editButton.getAttribute('aria-label').replace(new RegExp(`-\\s*edit ${roleLabel}$`), '')
    .trim()
}

function getReadViewText(root, testId) {
  const container = root.querySelector(`[data-testid="${testId}"]`)
  if (!container) return null
  const text = container.textContent.trim()
  return text && text !== 'None' ? text : null
}

function getLinkedIssues(root) {
  const currentIssueLink = root.querySelector(
    '[data-testid="issue.views.issue-base.foundation.breadcrumbs.current-issue.item"]'
  )
  const parentFieldContainer = root.querySelector(
    '[data-testid="issue-field-parent.ui.read-view-container"]'
  )
  const seenHrefs = new Set()

  const lines = Array.from(root.querySelectorAll('a[href^="/browse/"]'))
    .filter((link) => link !== currentIssueLink && !parentFieldContainer?.contains(link))
    .map((link) => {
      const href = link.getAttribute('href')
      const keyMatch = href.match(/\/browse\/([A-Z][A-Z0-9]*-\d+)/i)
      return keyMatch ? { key: keyMatch[1], href, summary: link.textContent.trim() } : null
    })
    .filter((entry) => entry && !seenHrefs.has(entry.href) && seenHrefs.add(entry.href))
    .map((entry) => `- [${entry.key}] ${entry.summary}`)

  return lines.length ? lines.join('\n') : null
}

function toInitials(displayName) {
  if (!displayName) return null
  const initials = displayName
    .trim()
    .split(/\s+/)
    .map((namePart) => namePart[0]?.toUpperCase())
    .filter(Boolean)
    .join('.')
  return initials ? `${initials}.` : null
}

function collapseBlankLines(text) {
  return text.replace(/\n{3,}/g, '\n\n')
}

function childNodesToMarkdown(element) {
  return Array.from(element.childNodes).map(domNodeToMarkdown).join('')
}

function listToMarkdown(listElement, isOrdered) {
  const itemLines = Array.from(listElement.children)
    .filter((child) => child.tagName.toLowerCase() === 'li')
    .map((listItem, index) => {
      const marker = isOrdered ? `${index + 1}.` : '-'
      return `${marker} ${childNodesToMarkdown(listItem).trim()}`
    })
  return `${itemLines.join('\n')}\n\n`
}

function tableToMarkdown(tableElement) {
  const rows = Array.from(tableElement.querySelectorAll('tr')).map((row) =>
    Array.from(row.children).map((cell) => childNodesToMarkdown(cell).replace(/\n/g, ' ').trim())
  )
  if (rows.length === 0) return ''

  const [headerRow, ...bodyRows] = rows
  const separatorRow = headerRow.map(() => '---')
  const rowToLine = (cells) => `| ${cells.join(' | ')} |`

  return [rowToLine(headerRow), rowToLine(separatorRow), ...bodyRows.map(rowToLine)].join('\n')
    + '\n\n'
}

function isMentionElement(element) {
  return element.matches('[data-mention-id], .ak-mention, [data-testid*="mention"]')
}

function isMediaElement(element) {
  return element.matches(
    '[data-node-type="media"], [data-node-type="mediaSingle"], [data-testid="media-file-card-view"]'
  )
}

function isCodeBlockElement(element) {
  return element.classList.contains('code-block')
}

function codeBlockToMarkdown(element) {
  const codeElement = element.querySelector('code')
  if (!codeElement) return ''
  return `\`\`\`\n${codeElement.textContent.replace(/\n$/, '')}\n\`\`\`\n\n`
}

function domNodeToMarkdown(node) {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent
  if (node.nodeType !== Node.ELEMENT_NODE) return ''

  if (isMediaElement(node)) return ''
  if (isMentionElement(node)) {
    const mentionedName = node.textContent.replace(/^@/, '')
    return `@${toInitials(mentionedName) ?? mentionedName}`
  }
  if (isCodeBlockElement(node)) return codeBlockToMarkdown(node)

  switch (node.tagName.toLowerCase()) {
    case 'p':
      return `${childNodesToMarkdown(node)}\n\n`
    case 'strong':
    case 'b':
      return `**${childNodesToMarkdown(node)}**`
    case 'em':
    case 'i':
      return `_${childNodesToMarkdown(node)}_`
    case 's':
    case 'strike':
    case 'del':
      return `~~${childNodesToMarkdown(node)}~~`
    case 'code':
      return `\`${node.textContent}\``
    case 'a':
      return `[${childNodesToMarkdown(node)}](${node.getAttribute('href')})`
    case 'br':
      return '  \n'
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6':
      return `${'#'.repeat(Number(node.tagName[1]))} ${childNodesToMarkdown(node)}\n\n`
    case 'ul':
      return listToMarkdown(node, false)
    case 'ol':
      return listToMarkdown(node, true)
    case 'blockquote':
      return `> ${childNodesToMarkdown(node).trim()}\n\n`
    case 'hr':
      return '---\n\n'
    case 'table':
      return tableToMarkdown(node)
    default:
      return childNodesToMarkdown(node)
  }
}

function richTextToMarkdown(element) {
  if (!element) return ''
  return collapseBlankLines(childNodesToMarkdown(element).trim())
}

function getDescriptionMarkdown(root) {
  const description = root.querySelector(
    '[data-testid="issue.views.field.rich-text.description"] .ak-renderer-document'
  )
  return richTextToMarkdown(description)
}

function getCommentsMarkdown(root) {
  const commentItems = root.querySelectorAll('[data-testid="issue.activity.comments-list"] ul > li')
  if (commentItems.length === 0) return null

  const blocks = Array.from(commentItems).map((commentItem) => {
    const headerElement = commentItem.querySelector('[data-testid$="-header"]')
    const authorName = headerElement?.querySelector('h3')?.textContent.trim()
    const authorInitials = toInitials(authorName) ?? '—'

    const dateElement = headerElement?.lastElementChild
    const commentDate = dateElement?.textContent.trim() ?? ''

    const bodyElement = commentItem.querySelector('[data-testid$="-body"] .ak-renderer-document')
    const body = richTextToMarkdown(bodyElement)

    return `**${authorInitials}** (${commentDate})\n${body}`
  })

  return blocks.join('\n\n')
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function getScrollableAncestor(element) {
  let node = element.parentElement
  while (node && node !== document.body) {
    if (/(auto|scroll)/.test(window.getComputedStyle(node).overflowY)) return node
    node = node.parentElement
  }
  return document.scrollingElement ?? document.documentElement
}

function getScrollMetrics(container) {
  if (container === document.scrollingElement || container === document.documentElement) {
    return { scrollTop: window.scrollY, clientHeight: window.innerHeight,
      scrollHeight: document.documentElement.scrollHeight }
  }
  return { scrollTop: container.scrollTop, clientHeight: container.clientHeight,
    scrollHeight: container.scrollHeight }
}

function scrollContainerBy(container, delta) {
  if (container === document.scrollingElement || container === document.documentElement) {
    window.scrollBy(0, delta)
  } else {
    container.scrollTop += delta
  }
}

async function ensureAllCommentsLoaded(root, button) {
  const commentsList = root.querySelector('[data-testid="issue.activity.comments-list"]')
  if (!commentsList) return

  const scrollContainer = getScrollableAncestor(commentsList)
  const startedAt = Date.now()
  const maxDurationMs = 15000
  let lastScrollTop = -1

  while (Date.now() - startedAt < maxDurationMs) {
    const metrics = getScrollMetrics(scrollContainer)
    const atBottom = metrics.scrollTop + metrics.clientHeight >= metrics.scrollHeight - 2
    if (atBottom || metrics.scrollTop === lastScrollTop) break

    lastScrollTop = metrics.scrollTop
    if (button) showTemporaryButtonText(button, 'Loading comments…')
    scrollContainerBy(scrollContainer, Math.max(metrics.clientHeight * 0.8, 200))
    await wait(180)
  }

  await wait(300)
}

function buildMarkdown(root) {
  const issueKey = getIssueKey(root)
  if (!issueKey) return null

  const summary = getSummary(root)
  const issueUrl = `${window.location.origin}/browse/${issueKey}`
  const assignee = getUserFieldName(root, 'issue.views.field.user.assignee', 'Assignee')
    ?? 'Unassigned'
  const reporter = getUserFieldName(root, 'issue.views.field.user.reporter', 'Reporter') ?? '—'
  const labels = getReadViewText(root, 'issue.views.issue-base.context.labels') ?? '—'
  const parentSummary = getReadViewText(root, 'issue-field-parent.ui.read-view-container')

  const metaLines = [
    `- **Type:** ${getIssueType(root)}`,
    `- **Status:** ${getStatus(root)}`,
    `- **Priority:** ${getPriority(root)}`,
    `- **Assignee:** ${toInitials(assignee) ?? assignee}`,
    `- **Reporter:** ${toInitials(reporter) ?? reporter}`,
    `- **Labels:** ${labels}`,
    `- **Link:** ${issueUrl}`
  ]
  if (parentSummary) metaLines.splice(1, 0, `- **Parent:** ${parentSummary}`)

  const descriptionMarkdown = getDescriptionMarkdown(root)
  const linkedIssuesMarkdown = getLinkedIssues(root)
  const commentsMarkdown = getCommentsMarkdown(root)

  const sections = [
    `## [${issueKey}] ${summary}`,
    '',
    metaLines.join('\n'),
    '',
    '---',
    '',
    descriptionMarkdown
  ]

  if (linkedIssuesMarkdown) sections.push('', '**Linked issues**', linkedIssuesMarkdown)
  if (commentsMarkdown) sections.push('', '---', '', '### Comments', commentsMarkdown)

  return collapseBlankLines(sections.join('\n').trim())
}

// --- Branch Name ---

function toSlugWords(text) {
  return text
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
}

function keepWholeWordsWithinLength(words, maxLength) {
  const keptWords = []
  let joinedLength = 0

  for (const word of words) {
    const separatorLength = keptWords.length > 0 ? 1 : 0
    if (joinedLength + separatorLength + word.length > maxLength) break

    keptWords.push(word)
    joinedLength += separatorLength + word.length
  }

  return keptWords
}

function buildBranchName(root) {
  const issueKey = getIssueKey(root)
  if (!issueKey) return null

  const isBug = getIssueType(root).toLowerCase() === 'bug'
  const branchType = isBug ? 'bug' : 'feat'

  const assigneeFullName = getUserFieldName(root, 'issue.views.field.user.assignee', 'Assignee')
  const assigneeFirstName = toSlugWords(assigneeFullName ?? '')[0]

  const titleWords = keepWholeWordsWithinLength(
    toSlugWords(getSummary(root)),
    BRANCH_TITLE_MAX_LENGTH
  )

  const nameParts = [assigneeFirstName, issueKey, ...titleWords].filter(Boolean)
  return `${branchType}/${nameParts.join('-')}`
}

// --- UI ---

async function copyToClipboard(text) {
  await navigator.clipboard.writeText(text)
}

function createCopyButton(label, bottomOffset) {
  const button = document.createElement('button')
  button.textContent = label
  Object.assign(button.style, {
    position: 'fixed',
    bottom: bottomOffset,
    left: '8px',
    zIndex: '9999',
    padding: '4px 7px',
    borderRadius: '4px',
    border: '1px solid #091e4224',
    background: '#0c66e4',
    color: '#fff',
    fontSize: '14px',
    cursor: 'pointer',
    boxShadow: '0 1px 4px rgba(9,30,66,0.25)'
  })
  return button
}

function showTemporaryButtonText(button, temporaryText, durationMs) {
  const restingText = button.dataset.restingText ?? button.textContent
  button.dataset.restingText = restingText
  button.textContent = temporaryText
  if (durationMs) {
    setTimeout(() => {
      button.textContent = restingText
    }, durationMs)
  }
}

async function handleCopyMarkdownClick(button) {
  if (button.disabled) return
  button.disabled = true

  try {
    const root = getIssueRoot()
    showTemporaryButtonText(button, 'Loading comments…')
    await ensureAllCommentsLoaded(root, button)

    const markdown = buildMarkdown(root)
    if (!markdown) {
      showTemporaryButtonText(button, 'No issue found', 2000)
      return
    }

    await copyToClipboard(markdown)
    showTemporaryButtonText(button, 'Copied ✓', 1500)
  } catch (error) {
    console.error('[jira-to-markdown]', error)
    showTemporaryButtonText(button, 'Failed — see console', 2000)
  } finally {
    button.disabled = false
  }
}

async function handleCopyIssueKeyClick(button) {
  const issueKey = getIssueKey(getIssueRoot())
  if (!issueKey) {
    showTemporaryButtonText(button, 'No issue found', 2000)
    return
  }

  try {
    await copyToClipboard(issueKey)
    showTemporaryButtonText(button, 'Copied ✓', 1500)
  } catch (error) {
    console.error('[jira-to-markdown]', error)
    showTemporaryButtonText(button, 'Failed — see console', 2000)
  }
}

async function handleCopyBranchNameClick(button) {
  const branchName = buildBranchName(getIssueRoot())
  if (!branchName) {
    showTemporaryButtonText(button, 'No issue found', 2000)
    return
  }

  try {
    await copyToClipboard(branchName)
    showTemporaryButtonText(button, 'Copied ✓', 1500)
  } catch (error) {
    console.error('[jira-to-markdown]', error)
    showTemporaryButtonText(button, 'Failed — see console', 2000)
  }
}

function init() {
  const issueKeyButton = createCopyButton('🪪 ID', '88px')
  issueKeyButton.addEventListener('click', () => handleCopyIssueKeyClick(issueKeyButton))
  document.body.appendChild(issueKeyButton)

  const branchNameButton = createCopyButton('📑 Branch', '52px')
  branchNameButton.addEventListener('click', () => handleCopyBranchNameClick(branchNameButton))
  document.body.appendChild(branchNameButton)

  const markdownButton = createCopyButton('🔀 Full', '16px')
  markdownButton.addEventListener('click', () => handleCopyMarkdownClick(markdownButton))
  document.body.appendChild(markdownButton)
}

init()
})()
