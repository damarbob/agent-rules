import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const SOURCE = 'damarbob/agent-rules'
export const LOCK_NAME = '.agent-rules.json'

// Always installed. It is built from rules/core.md and lists only the chosen guides.
export const CORE_FILE = 'core.md'

// Installed on the first sync unless --only says otherwise.
export const DEFAULT_GUIDES = [
  'attribution-guide.md',
  'commit-style-guide.md',
  'writing-style-guide.md',
  'ai-patterns-guide.md',
  'changelog-guide.md',
]

// Installed only when asked for with --with or --only.
export const OPTIONAL_GUIDES = ['web-design-guide.md']

export const GUIDES = [...DEFAULT_GUIDES, ...OPTIONAL_GUIDES]

// Line endings are normalised before hashing, so a checkout with CRLF endings
// still matches the lock file.
const normalise = (text) => text.replace(/\r\n/g, '\n')
export const sha256 = (text) => createHash('sha256').update(normalise(text)).digest('hex')

const rulesDirOf = (target) => join(target, '.agent', 'rules')
const withExtension = (name) => (name.endsWith('.md') ? name : `${name}.md`)

function readLock(rulesDir) {
  const path = join(rulesDir, LOCK_NAME)
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    throw new Error(`${path} is not valid JSON. Delete it and run sync again.`, { cause: error })
  }
}

const MARKER = /^<!-- (?:guide: (\S+)|(\/guide)) -->$/

/**
 * Builds core.md from the template in rules/core.md, keeping only the sections of the chosen guides.
 * A section runs from `<!-- guide: name.md -->` to `<!-- /guide -->`. A chosen guide without a
 * section, an unknown name or a broken marker throws, so a section is never dropped silently.
 */
export function buildCore(template, chosen) {
  const seen = new Set()
  const out = []
  let open = null

  normalise(template)
    .split('\n')
    .forEach((line, index) => {
      const at = `${CORE_FILE} line ${index + 1}`
      const marker = MARKER.exec(line.trim())
      if (marker === null) {
        if (/<!--\s*\/?guide/.test(line)) throw new Error(`${at} has a malformed guide marker.`)
        if (open === null || chosen.includes(open)) out.push(line)
      } else if (marker[2]) {
        if (open === null) throw new Error(`${at} closes a section that is not open.`)
        open = null
      } else {
        const name = marker[1]
        if (open !== null) throw new Error(`${at} opens ${name} inside ${open}.`)
        if (!GUIDES.includes(name)) throw new Error(`${at} names an unknown guide, ${name}.`)
        if (seen.has(name)) throw new Error(`${at} repeats the section for ${name}.`)
        seen.add(name)
        open = name
      }
    })

  if (open !== null) throw new Error(`The section for ${open} in ${CORE_FILE} is never closed.`)
  for (const name of chosen) {
    if (!seen.has(name)) throw new Error(`${CORE_FILE} has no section for ${name}.`)
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\n*$/, '\n')
}

function guideNames(list, flag) {
  return list.map(withExtension).map((name) => {
    if (name === CORE_FILE) throw new Error(`${CORE_FILE} is always installed, so ${flag} does not take it.`)
    if (!GUIDES.includes(name)) throw new Error(`Unknown rule file ${name}. Choose from: ${GUIDES.join(', ')}.`)
    return name
  })
}

/**
 * Copies the chosen rules into <target>/.agent/rules and records them in the lock file.
 * Only files named in the lock file (or the chosen set on a first run) are touched.
 *
 * On a first run the guides are `only` (when given) or the defaults. Later runs keep the set in the
 * lock file. `extra` adds guides and `without` removes them. A removed file is deleted only when it
 * still matches the lock file, so a file someone edited is left in place.
 */
export function sync({ packageDir, target, version, extra = [], only = null, without = [], dryRun = false }) {
  const rulesDir = rulesDirOf(target)
  const lock = readLock(rulesDir)

  const add = guideNames(extra, '--with')
  const drop = guideNames(without, '--without')
  const clash = add.filter((name) => drop.includes(name))
  if (clash.length > 0) throw new Error(`${clash.join(', ')} is in both --with and --without.`)
  if (only !== null && lock !== null) {
    throw new Error('--only is for the first sync. Use --with to add a guide and --without to remove one.')
  }

  let base = DEFAULT_GUIDES
  if (lock) base = Object.keys(lock.files).filter((name) => name !== CORE_FILE)
  else if (only !== null) base = guideNames(only, '--only')
  const selected = new Set(base)
  for (const name of add) selected.add(name)
  for (const name of drop) selected.delete(name)

  const report = {
    firstRun: lock === null,
    added: [],
    updated: [],
    unchanged: [],
    replacedLocalEdits: [],
    droppedUpstream: [],
    removed: [],
    keptEdited: [],
  }

  const chosen = []
  for (const name of [...selected].sort()) {
    if (GUIDES.includes(name) && existsSync(join(packageDir, 'rules', name))) chosen.push(name)
    else report.droppedUpstream.push(name)
  }
  if (chosen.length === 0) throw new Error(`Choose at least one guide from: ${GUIDES.join(', ')}.`)

  const read = (name) => readFileSync(join(packageDir, 'rules', name), 'utf8')
  const entries = [
    { name: CORE_FILE, text: buildCore(read(CORE_FILE), chosen) },
    ...chosen.map((name) => ({ name, text: normalise(read(name)) })),
  ].sort((a, b) => (a.name < b.name ? -1 : 1))

  const files = {}
  if (!dryRun) mkdirSync(rulesDir, { recursive: true })

  for (const { name, text } of entries) {
    const hash = sha256(text)
    files[name] = hash

    const path = join(rulesDir, name)
    if (!existsSync(path)) {
      report.added.push(name)
    } else {
      const current = sha256(readFileSync(path, 'utf8'))
      if (current === hash) {
        report.unchanged.push(name)
        continue
      }
      report.updated.push(name)
      if (current !== lock?.files?.[name]) report.replacedLocalEdits.push(name)
    }
    if (!dryRun) writeFileSync(path, text)
  }

  for (const name of drop.filter((guide) => lock && Object.hasOwn(lock.files, guide))) {
    const path = join(rulesDir, name)
    if (!existsSync(path)) continue
    if (sha256(readFileSync(path, 'utf8')) === lock.files[name]) {
      report.removed.push(name)
      if (!dryRun) rmSync(path)
    } else {
      report.keptEdited.push(name)
    }
  }

  if (!dryRun) {
    const body = JSON.stringify({ source: SOURCE, version, files }, null, 2)
    writeFileSync(join(rulesDir, LOCK_NAME), `${body}\n`)
  }
  return report
}

/**
 * Compares every file in the lock file with its recorded hash.
 * Pass the newest published tag as `latest` to also report an out-of-date copy.
 */
export function check({ target, latest = null }) {
  const rulesDir = rulesDirOf(target)
  const lock = readLock(rulesDir)
  if (lock === null) return { problems: [`There is no ${LOCK_NAME} in ${rulesDir}. Run sync first.`] }

  const problems = []
  for (const [name, hash] of Object.entries(lock.files)) {
    const path = join(rulesDir, name)
    if (!existsSync(path)) {
      problems.push(`${name} is missing. Run sync to restore it.`)
    } else if (sha256(readFileSync(path, 'utf8')) !== hash) {
      problems.push(`${name} was edited in this repository. Change it in ${SOURCE} and run sync, or move the edit to a file of your own.`)
    }
  }
  if (latest !== null && compareVersions(latest, lock.version) > 0) {
    problems.push(`The rules are at ${lock.version} and ${latest} is available. Run sync with the newer tag.`)
  }
  return { problems }
}

const parseTag = (tag) => tag.replace(/^v/, '').split('.').map(Number)

export function compareVersions(a, b) {
  const [x, y] = [parseTag(a), parseTag(b)]
  for (let i = 0; i < 3; i++) {
    if (x[i] !== y[i]) return x[i] - y[i]
  }
  return 0
}

/** The newest vMAJOR.MINOR.PATCH tag on GitHub, or null when there is none. */
export function latestTag() {
  // git's own error text is dropped and it is told never to ask for a password, so an unreachable
  // repository fails fast and the caller words the message.
  const out = execFileSync('git', ['ls-remote', '--tags', '--refs', `https://github.com/${SOURCE}.git`], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  })
  const tags = out
    .split('\n')
    .map((line) => line.split('refs/tags/')[1])
    .filter((tag) => tag && /^v\d+\.\d+\.\d+$/.test(tag))
  return tags.sort(compareVersions).at(-1) ?? null
}
