import { deepStrictEqual as assertEquals } from 'node:assert/strict'
import { test } from 'node:test'
import './script.user.js'

const {
  analyzeMessage,
  buildPayload,
  createChatCache,
  describeStatus,
  findChatId,
  normalizeDateLabel,
  normalizeTimeLabel,
  parseChatId,
  parseMetadata,
  stripEmojis
} = globalThis.waExporter

const message = (id, overrides = {}) => ({
  id,
  kind: 'message',
  sender: '+49 1',
  dateLabel: '2026-09-01',
  time: '10:00',
  text: `text ${id}`,
  poll: false,
  unavailable: false,
  ...overrides
})
const view = (...ids) => ids.map((id) => message(id))
const ids = (cache) => cache.getMessages().map((entry) => entry.id)

test('stripEmojis removes emojis, modifiers and joiners only', () => {
  assertEquals(stripEmojis('Sample text 🏍️'), 'Sample text')
  assertEquals(stripEmojis('One 🙋🏼‍♂️ two ✌️ three'), 'One two three')
  assertEquals(stripEmojis('Line 😂\n😂 two'), 'Line\ntwo')
  assertEquals(stripEmojis('👍 🤘'), '')
})

test('normalizeDateLabel reads locale dates and relative words', () => {
  const now = new Date(2026, 8, 30)
  assertEquals(normalizeDateLabel('9/7/2026', 'en-US'), '2026-09-07')
  assertEquals(normalizeDateLabel('7.9.2026', 'de-DE'), '2026-09-07')
  assertEquals(normalizeDateLabel('Yesterday', 'en-US', now), '2026-09-29')
  assertEquals(normalizeDateLabel('2/30/2026', 'en-US'), null)
  assertEquals(normalizeDateLabel('hello', 'en-US'), null)
})

test('normalizeTimeLabel reads 12 and 24 hour clocks', () => {
  assertEquals(normalizeTimeLabel('16:01'), '16:01')
  assertEquals(normalizeTimeLabel('4:01 PM'), '16:01')
  assertEquals(normalizeTimeLabel('12:05 AM'), '00:05')
  assertEquals(normalizeTimeLabel('25:00'), null)
})

test('parseMetadata reads the pre-plain-text attribute', () => {
  assertEquals(parseMetadata('[10:42, 6/17/2026] Jane Doe: '), {
    timeLabel: '10:42',
    dateLabel: '6/17/2026',
    sender: 'Jane Doe'
  })
  assertEquals(parseMetadata('nothing'), null)
})

test('analyzeMessage applies the export filters', () => {
  const reasons = (overrides) => analyzeMessage(message('a', overrides)).excludedReasons
  assertEquals(reasons({}), [])
  assertEquals(reasons({ text: '👍' }), ['emoji-only'])
  assertEquals(reasons({ text: 'This message was deleted by admin Jane' }), ['deleted'])
  assertEquals(reasons({ text: '' }), ['no-text'])
  assertEquals(reasons({ poll: true }), ['poll'])
  assertEquals(reasons({ dateLabel: null }), ['missing-date'])
  assertEquals(analyzeMessage({ id: 'n', kind: 'notice' }).excludedReasons, ['kind:notice'])
})

test('the cache keeps messages in chat order across views', () => {
  const cache = createChatCache(null)
  cache.addView(view('c', 'd', 'e'))
  cache.addView(view('a', 'b', 'c'))
  assertEquals(ids(cache), ['a', 'b', 'c', 'd', 'e'])
  assertEquals(cache.gapCount, 0)
})

test('a view that overlaps nothing creates a gap and a later view closes it', () => {
  const cache = createChatCache(null)
  cache.addView([message('a', { dateLabel: '2026-08-01' }),
    message('b', { dateLabel: '2026-08-01' })])
  cache.addView([message('y'), message('z')])
  assertEquals(cache.gapCount, 1)
  assertEquals(ids(cache), ['a', 'b', 'y', 'z'])

  cache.addView([
    message('b', { dateLabel: '2026-08-01' }),
    message('m'),
    message('y')
  ])
  assertEquals(cache.gapCount, 0)
  assertEquals(ids(cache), ['a', 'b', 'm', 'y', 'z'])
})

test('the cache survives a serialize and load round trip', () => {
  const cache = createChatCache(null)
  cache.addView(view('a', 'b'))
  const restored = createChatCache(JSON.parse(JSON.stringify(cache.serialize())))
  assertEquals(ids(restored), ['a', 'b'])
  assertEquals(createChatCache({ version: 99 }).size, 0)
})

test('a later view fills a missing date and keeps the longer text', () => {
  const cache = createChatCache(null)
  cache.addView([message('a', { dateLabel: null, text: 'Hello wor' })])
  const { changed } = cache.addView([message('a', { text: 'Hello world' })])
  assertEquals(changed, true)
  assertEquals(cache.getMessages()[0].dateLabel, '2026-09-01')
  assertEquals(cache.getMessages()[0].text, 'Hello world')
  assertEquals(cache.addView([message('a', { text: 'Hello world' })]).changed, false)
})

test('a history start notice with no gap makes the export complete', () => {
  const cache = createChatCache(null)
  cache.addView([{ id: 's', kind: 'notice', historyStart: true }, message('a'), message('b')])
  const payload = buildPayload('Chat', cache, new Date('2026-09-30T12:00:00Z'))
  assertEquals(payload.complete, true)
  assertEquals(payload.messages.length, 2)
  assertEquals(payload.messages[0], { sender: '+49 1', timestamp: '2026-09-01T10:00',
    text: 'text a' })
  assertEquals(payload.stats.excluded, { 'kind:notice': 1 })
})

test('the export does not combine messages from the same sender', () => {
  const cache = createChatCache(null)
  cache.addView(view('a', 'b', 'c'))
  assertEquals(buildPayload('Chat', cache).messages.length, 3)
})

test('describeStatus guides the user by cache state', () => {
  const base = { chatName: 'Chat', size: 5, exported: 4, gapCount: 0, complete: false }
  assertEquals(describeStatus({ chatName: null }), 'Open a chat to start the capture.')
  assertEquals(describeStatus({ ...base, complete: true }).split('\n')[1], 'Complete. Export now.')
  assertEquals(
    describeStatus({ ...base, gapCount: 2 }).split('\n').slice(0, 2),
    ['5 captured · 4 exportable · 2 gaps',
      'Scroll up until the loaded messages reach the cached ones.']
  )
})

test('parseChatId reads the chat from a message id', () => {
  assertEquals(parseChatId('false_120363@g.us_3EB0AB_491@c.us'), '120363@g.us')
  assertEquals(parseChatId('true_491@c.us_3EB0AB'), '491@c.us')
  assertEquals(parseChatId('invalid'), null)
})

test('findChatId returns null when the view mixes chats', () => {
  assertEquals(findChatId(['true_1@g.us_A', 'false_1@g.us_B_9@c.us']), '1@g.us')
  assertEquals(findChatId(['true_1@g.us_A', 'true_2@g.us_B']), null)
  assertEquals(findChatId([]), null)
})
