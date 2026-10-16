import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { CORE_FILE, DEFAULT_GUIDES, GUIDES, LOCK_NAME, OPTIONAL_GUIDES, buildCore, check, compareVersions, sync } from '../lib/sync.mjs'

const packageDir = fileURLToPath(new URL('..', import.meta.url))
const fresh = () => mkdtempSync(join(tmpdir(), 'agent-rules-'))
const rulesOf = (target) => join(target, '.agent', 'rules')
const run = (target, extra = {}) => sync({ packageDir, target, version: 'v1.0.0', ...extra })
const DEFAULT_FILES = [CORE_FILE, ...DEFAULT_GUIDES]
const lockOf = (target) => JSON.parse(readFileSync(join(rulesOf(target), LOCK_NAME), 'utf8'))
const stem = (name) => name.replace(/\.md$/, '')

test('the rules folder holds exactly the declared files', () => {
  const shipped = readdirSync(join(packageDir, 'rules')).sort()
  assert.deepEqual(shipped, [CORE_FILE, ...GUIDES].sort())
})

test('every shipped rule has frontmatter and the shared banner', () => {
  for (const name of [CORE_FILE, ...GUIDES]) {
    const text = readFileSync(join(packageDir, 'rules', name), 'utf8')
    assert.match(text, /^---\r?\ntrigger: /, `${name} frontmatter`)
    assert.match(text, /Shared rule from \[agent-rules\]/, `${name} banner`)
  }
})

test('a first sync installs the default files and a lock file', () => {
  const target = fresh()
  const report = run(target)
  assert.equal(report.firstRun, true)
  assert.deepEqual(report.added.sort(), [...DEFAULT_FILES].sort())
  for (const name of DEFAULT_FILES) assert.ok(existsSync(join(rulesOf(target), name)), name)

  const lock = lockOf(target)
  assert.equal(lock.version, 'v1.0.0')
  assert.deepEqual(Object.keys(lock.files).sort(), [...DEFAULT_FILES].sort())
  assert.deepEqual(check({ target }).problems, [])
})

test('a second sync changes nothing', () => {
  const target = fresh()
  run(target)
  const report = run(target)
  assert.equal(report.firstRun, false)
  assert.deepEqual(report.added, [])
  assert.deepEqual(report.updated, [])
  assert.equal(report.unchanged.length, DEFAULT_FILES.length)
})

test('--with adds an optional file and keeps it on later syncs', () => {
  const target = fresh()
  run(target, { extra: ['web-design-guide'] })
  assert.ok(existsSync(join(rulesOf(target), 'web-design-guide.md')))
  const report = run(target)
  assert.ok(report.unchanged.includes('web-design-guide.md'))
})

test('an unknown file is refused', () => {
  assert.throws(() => run(fresh(), { extra: ['nonsense'] }), /Unknown rule file/)
  assert.throws(() => run(fresh(), { only: ['nonsense'] }), /Unknown rule file/)
  assert.throws(() => run(fresh(), { without: ['nonsense'] }), /Unknown rule file/)
})

test('a dry run writes nothing', () => {
  const target = fresh()
  const report = run(target, { dryRun: true })
  assert.equal(report.added.length, DEFAULT_FILES.length)
  assert.equal(existsSync(rulesOf(target)), false)
})

test('check finds a locally edited file, and sync replaces it and says so', () => {
  const target = fresh()
  run(target)
  const edited = join(rulesOf(target), 'commit-style-guide.md')
  writeFileSync(edited, `${readFileSync(edited, 'utf8')}\nA local change.\n`)

  const { problems } = check({ target })
  assert.equal(problems.length, 1)
  assert.match(problems[0], /commit-style-guide\.md was edited/)

  const report = run(target)
  assert.deepEqual(report.replacedLocalEdits, ['commit-style-guide.md'])
  assert.deepEqual(check({ target }).problems, [])
})

test('a first sync reports a hand-copied file it replaces', () => {
  const target = fresh()
  mkdirSync(rulesOf(target), { recursive: true })
  writeFileSync(join(rulesOf(target), 'commit-style-guide.md'), 'an older hand-copied version\n')

  const report = run(target)
  assert.equal(report.firstRun, true)
  assert.deepEqual(report.replacedLocalEdits, ['commit-style-guide.md'])
  assert.deepEqual(check({ target }).problems, [])
})

test('files that are not in the lock file are never touched', () => {
  const target = fresh()
  run(target)
  const own = join(rulesOf(target), 'project-commit-notes.md')
  writeFileSync(own, 'repository-specific rules\n')
  run(target)
  assert.equal(readFileSync(own, 'utf8'), 'repository-specific rules\n')
})

test('CRLF line endings do not count as an edit', () => {
  const target = fresh()
  run(target)
  const file = join(rulesOf(target), 'core.md')
  writeFileSync(file, readFileSync(file, 'utf8').replace(/\n/g, '\r\n'))
  assert.deepEqual(check({ target }).problems, [])
})

test('check reports a missing lock file and a missing rule file', () => {
  const target = fresh()
  assert.match(check({ target }).problems[0], /Run sync first/)

  run(target)
  rmSync(join(rulesOf(target), 'core.md'))
  const { problems } = check({ target })
  assert.equal(problems.length, 1)
  assert.match(problems[0], /core\.md is missing/)
})

test('check reports an out-of-date version when the newest tag is passed', () => {
  const target = fresh()
  run(target)
  assert.match(check({ target, latest: 'v1.2.0' }).problems[0], /v1\.2\.0 is available/)
  assert.deepEqual(check({ target, latest: 'v1.0.0' }).problems, [])
})

test('versions compare numerically', () => {
  assert.ok(compareVersions('v1.10.0', 'v1.9.0') > 0)
  assert.ok(compareVersions('v2.0.0', 'v10.0.0') < 0)
  assert.equal(compareVersions('v1.2.3', 'v1.2.3'), 0)
})

// Choosing guides

test('--only installs just the named guides and core.md', () => {
  const target = fresh()
  const only = ['attribution-guide', 'writing-style-guide', 'ai-patterns-guide']
  const report = run(target, { only })
  assert.deepEqual(report.added.sort(), ['ai-patterns-guide.md', 'attribution-guide.md', 'core.md', 'writing-style-guide.md'])
  assert.equal(existsSync(join(rulesOf(target), 'commit-style-guide.md')), false)
  assert.deepEqual(Object.keys(lockOf(target).files), ['ai-patterns-guide.md', 'attribution-guide.md', 'core.md', 'writing-style-guide.md'])
  assert.deepEqual(check({ target }).problems, [])
})

test('the chosen set survives later syncs', () => {
  const target = fresh()
  run(target, { only: ['attribution-guide'] })
  const report = run(target)
  assert.deepEqual(report.added, [])
  assert.deepEqual(report.unchanged.sort(), ['attribution-guide.md', 'core.md'])
})

test('--only is refused after the first sync', () => {
  const target = fresh()
  run(target)
  assert.throws(() => run(target, { only: ['attribution-guide'] }), /--only is for the first sync/)
})

test('--only needs at least one guide', () => {
  assert.throws(() => run(fresh(), { only: [] }), /Choose at least one guide/)
})

test('core.md is not a choice', () => {
  assert.throws(() => run(fresh(), { only: ['core'] }), /always installed/)
  assert.throws(() => run(fresh(), { extra: ['core.md'] }), /always installed/)
})

test('--with and --without cannot name the same guide', () => {
  assert.throws(() => run(fresh(), { extra: ['web-design-guide'], without: ['web-design-guide'] }), /both --with and --without/)
})

test('--without on a first run narrows the defaults', () => {
  const target = fresh()
  const report = run(target, { without: ['changelog-guide', 'commit-style-guide.md'] })
  assert.deepEqual(report.added.sort(), ['ai-patterns-guide.md', 'attribution-guide.md', 'core.md', 'writing-style-guide.md'])
  assert.deepEqual(report.removed, [])
})

test('--without removes an unedited file, and core.md follows', () => {
  const target = fresh()
  run(target)
  assert.match(readFileSync(join(rulesOf(target), 'core.md'), 'utf8'), /commit-style-guide\.md/)

  const report = run(target, { without: ['commit-style-guide'] })
  assert.deepEqual(report.removed, ['commit-style-guide.md'])
  assert.deepEqual(report.updated, ['core.md'])
  assert.equal(existsSync(join(rulesOf(target), 'commit-style-guide.md')), false)
  assert.doesNotMatch(readFileSync(join(rulesOf(target), 'core.md'), 'utf8'), /commit-style-guide/)
  assert.equal('commit-style-guide.md' in lockOf(target).files, false)
  assert.deepEqual(check({ target }).problems, [])

  const again = run(target, { without: ['commit-style-guide'] })
  assert.deepEqual(again.removed, [])
  assert.deepEqual(again.added, [])
})

test('--without leaves an edited file in place and stops managing it', () => {
  const target = fresh()
  run(target)
  const file = join(rulesOf(target), 'commit-style-guide.md')
  writeFileSync(file, 'my own commit rules\n')

  const report = run(target, { without: ['commit-style-guide'] })
  assert.deepEqual(report.keptEdited, ['commit-style-guide.md'])
  assert.deepEqual(report.removed, [])
  assert.equal(readFileSync(file, 'utf8'), 'my own commit rules\n')
  assert.equal('commit-style-guide.md' in lockOf(target).files, false)
  assert.deepEqual(check({ target }).problems, [])
})

test('a dry run of --without reports the removal and changes nothing', () => {
  const target = fresh()
  run(target)
  const before = readFileSync(join(rulesOf(target), LOCK_NAME), 'utf8')

  const report = run(target, { without: ['commit-style-guide'], dryRun: true })
  assert.deepEqual(report.removed, ['commit-style-guide.md'])
  assert.ok(existsSync(join(rulesOf(target), 'commit-style-guide.md')))
  assert.equal(readFileSync(join(rulesOf(target), LOCK_NAME), 'utf8'), before)
})

test('removing every guide is refused', () => {
  const target = fresh()
  run(target, { only: ['attribution-guide'] })
  assert.throws(() => run(target, { without: ['attribution-guide'] }), /Choose at least one guide/)
})

// core.md is built from whole sections

const sections = (names) => names.map((name) => `<!-- guide: ${name} -->\n## ${stem(name)}\n\nSee [${name}](${name}).\n<!-- /guide -->\n`)

test('buildCore keeps the chosen sections with exact spacing', () => {
  const template = `# Core\n\nIntro.\n\n${sections(['attribution-guide.md', 'commit-style-guide.md', 'writing-style-guide.md']).join('\n')}`
  assert.equal(
    buildCore(template, ['attribution-guide.md', 'writing-style-guide.md']),
    '# Core\n\nIntro.\n\n## attribution-guide\n\nSee [attribution-guide.md](attribution-guide.md).\n\n## writing-style-guide\n\nSee [writing-style-guide.md](writing-style-guide.md).\n',
  )
  assert.equal(buildCore(template, ['commit-style-guide.md']), '# Core\n\nIntro.\n\n## commit-style-guide\n\nSee [commit-style-guide.md](commit-style-guide.md).\n')
})

test('buildCore refuses a template it cannot trust', () => {
  const ok = sections(['attribution-guide.md'])[0]
  assert.throws(() => buildCore(ok, ['commit-style-guide.md']), /no section for commit-style-guide\.md/)
  assert.throws(() => buildCore('<!-- guide: nonsense.md -->\ntext\n<!-- /guide -->\n', []), /unknown guide/)
  assert.throws(() => buildCore('<!-- guide: attribution-guide.md -->\ntext\n', []), /never closed/)
  assert.throws(() => buildCore('text\n<!-- /guide -->\n', []), /not open/)
  assert.throws(() => buildCore(`${ok}\n${ok}`, []), /repeats the section/)
  assert.throws(() => buildCore('<!-- guide: attribution-guide.md -->\n<!-- guide: commit-style-guide.md -->\n', []), /inside attribution-guide\.md/)
  assert.throws(() => buildCore('<!--guide: attribution-guide.md-->\ntext\n', []), /malformed/)
  assert.throws(() => buildCore('<!-- guide:attribution-guide.md -->\ntext\n', []), /malformed/)
})

test('the core.md template has one section for every guide', () => {
  const template = readFileSync(join(packageDir, 'rules', CORE_FILE), 'utf8')
  for (const name of GUIDES) {
    const text = buildCore(template, [name])
    assert.ok(text.includes(`(${name})`), `${name} has a section that links to it`)
  }
})

// The 63 ways to choose guides

const subsets = Array.from({ length: 2 ** GUIDES.length - 1 }, (_, i) => GUIDES.filter((_, bit) => (i + 1) & (1 << bit)))

test('every selection of guides installs files that stand alone', () => {
  assert.equal(subsets.length, 63)
  for (const guides of subsets) {
    const label = guides.map(stem).join(' + ')
    const target = fresh()
    try {
      const installed = [CORE_FILE, ...guides].sort()
      run(target, { only: guides })
      const rules = rulesOf(target)
      assert.deepEqual(readdirSync(rules).filter((name) => name !== LOCK_NAME).sort(), installed, label)

      for (const name of installed) {
        const text = readFileSync(join(rules, name), 'utf8')

        // Every relative link resolves to an installed file.
        for (const [, link] of text.matchAll(/\]\((?!https?:)([^)\s#]+)\)/g)) {
          assert.ok(installed.includes(link), `${label}: ${name} links to ${link}, which is not installed`)
        }
        // No other guide is named, with or without a link.
        for (const other of GUIDES.filter((guide) => !guides.includes(guide))) {
          assert.ok(!text.includes(stem(other)), `${label}: ${name} mentions ${stem(other)}, which is not installed`)
        }
      }

      // core.md links to exactly the chosen guides and carries no markers or gaps.
      const core = readFileSync(join(rules, CORE_FILE), 'utf8')
      const linked = [...core.matchAll(/\]\(([^)\s#]+-guide\.md)\)/g)].map(([, link]) => link)
      assert.deepEqual([...new Set(linked)].sort(), [...guides].sort(), `${label}: core.md links`)
      assert.ok(!core.includes('<!--'), `${label}: core.md has a marker left`)
      assert.ok(!/\n{3,}/.test(core) && core.endsWith('\n') && !core.endsWith('\n\n'), `${label}: core.md spacing`)

      assert.deepEqual(check({ target }).problems, [], label)
      const again = run(target)
      assert.deepEqual([...again.added, ...again.updated], [], `${label}: second sync`)
    } finally {
      rmSync(target, { recursive: true, force: true })
    }
  }
})

test('the optional guides are still left out by default', () => {
  for (const name of OPTIONAL_GUIDES) assert.ok(!DEFAULT_GUIDES.includes(name), name)
})
