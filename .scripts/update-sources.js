// collects and verifies sources

import { readFileSync, writeFileSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const urlStart = 'https://raw.githubusercontent.com/shiftgeist/userscripts/refs/heads/main/'
const rootPath = resolve(import.meta.filename, '../..')
const detailRegex = /@(?:name|description)\s+(.+)/g
const urlRegex = /@(?:update|download)URL\s+(\S+)/g

const files = await readdir(rootPath, { recursive: true, withFileTypes: true })

const sources = files.filter(v =>
  v.isFile() && v.name.includes('.user.js') && !v.parentPath.includes('/node_modules/')
  && !v.parentPath.includes('/.git/')
).map(v => {
  const path = join(v.parentPath, v.name)
  const pathShort = path.replace(rootPath, '').slice(1)
  const script = urlStart + pathShort

  const content = readFileSync(path, { encoding: 'utf-8' })
  const details = [...content.matchAll(detailRegex)].map(m => m[1])
  const urls = [...content.matchAll(urlRegex)].map(m => m[1])

  return {
    details,
    pathShort,
    path,
    script,
    url1: urls[0],
    url2: urls[1],
    urlsOk: urls.map(u => u === script).reduce((acc, val) => acc && val)
  }
})

const scriptDocs = '\n' + sources.map(s => {
  return `### ${s.details[0]}

> ${s.details[1]}

\`\`\`
${s.url1}
\`\`\`

<small>[${s.pathShort}](${s.pathShort})</small>
`
}).join('\n')

// console.log()
// console.log(scriptDocs)

const invalid = sources.filter(s => !s.urlsOk)
if (invalid.length) {
  console.log()
  console.log()
  console.log('Invalid URLs ⚠️')
  console.log('============')
  console.log()
  console.table(invalid, ['name', 'pathShort', 'url1', 'url2'])
} else {
  console.log('All scripts valid ✅')
}

function updateSection(filePath, startMarker, endMarker, newContent) {
  const text = readFileSync(filePath, 'utf8')

  const startIdx = text.indexOf(startMarker)
  const endIdx = text.indexOf(endMarker)

  if (startIdx === -1 || endIdx === -1) {
    throw new Error('Markers not found')
  }

  const before = text.slice(0, startIdx + startMarker.length)
  const after = text.slice(endIdx)

  const updated = `${before}\n${newContent}\n${after}`

  writeFileSync(filePath, updated)

  console.log(`File ${filePath} updated ✅`)
}

updateSection(
  'README.md',
  '<!-- SCRIPTS:START -->',
  '<!-- SCRIPTS:END -->',
  scriptDocs
)
