import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { compareVersions } from '../lib/sync.mjs'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const { version } = JSON.parse(read('package.json'))
const current = `v${version}`

test('the changelog has an entry for the current version', () => {
  const heading = new RegExp(`^## \\[${version.replaceAll('.', '\\.')}\\] - \\d{4}-\\d{2}-\\d{2}$`, 'm')
  assert.match(read('CHANGELOG.md'), heading)
})

test('the README pins the current version, and its update example names a newer one', () => {
  const pin = /(?:agent-rules#|"version": ")(v\d+\.\d+\.\d+)/g
  let pinned = 0
  let newer = 0

  for (const section of read('README.md').split(/^## /m)) {
    const isUpdateExample = section.startsWith('Keep it current')
    for (const [, tag] of section.matchAll(pin)) {
      if (isUpdateExample) {
        newer++
        assert.ok(compareVersions(tag, current) > 0, `${tag} in the update example is not newer than ${current}`)
      } else {
        pinned++
        assert.equal(tag, current, 'a README pin is out of date')
      }
    }
  }

  assert.ok(pinned > 0, 'no pinned install command found in the README')
  assert.ok(newer > 0, 'no update example found in the README')
})
