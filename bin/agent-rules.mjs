#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { findViolations } from '../lib/attribution.mjs'
import { check, latestTag, sync } from '../lib/sync.mjs'

const packageDir = fileURLToPath(new URL('..', import.meta.url))
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

const HELP = `agent-rules ${pkg.version}

Usage
  agent-rules sync [--target <dir>] [--only <guides>] [--with <guides>] [--without <guides>] [--dry-run]
  agent-rules check [--target <dir>] [--latest]
  agent-rules check-attribution --range <base>..<head> [--target <dir>]

sync               Copy the shared rules into <dir>/.agent/rules and record them in a lock file.
                   Every guide except web-design-guide is chosen by default. --only picks the
                   guides on a first run, and later runs use --with to add one and --without to
                   remove one. Guides are comma separated, such as --only attribution-guide,writing-style-guide.
                   core.md is always written and lists only the chosen guides.
check              Fail when a shared rule was edited locally, or, with --latest, is out of date.
check-attribution  Fail when a commit message or the pull request text (PR_TITLE and PR_BODY)
                   credits a tool.
`

function fail(message) {
  console.error(message)
  process.exit(2)
}

function valueAfter(args, index, flag) {
  if (args[index] === undefined) fail(`${flag} needs a value.`)
  return args[index]
}

const splitList = (value) => value.split(',').map((part) => part.trim()).filter(Boolean)

function parse(argv) {
  const [command, ...rest] = argv
  const opts = { only: null, with: [], without: [], dryRun: false, latest: false, target: process.cwd(), range: null }
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]
    if (arg === '--dry-run') opts.dryRun = true
    else if (arg === '--latest') opts.latest = true
    else if (arg === '--only') opts.only = [...(opts.only ?? []), ...splitList(valueAfter(rest, ++i, arg))]
    else if (arg === '--with') opts.with.push(...splitList(valueAfter(rest, ++i, arg)))
    else if (arg === '--without') opts.without.push(...splitList(valueAfter(rest, ++i, arg)))
    else if (arg === '--target') opts.target = resolve(valueAfter(rest, ++i, arg))
    else if (arg === '--range') opts.range = valueAfter(rest, ++i, arg)
    else fail(`Unknown option ${arg}.`)
  }
  return { command, opts }
}

function list(label, names) {
  if (names.length > 0) console.log(`${label} ${names.join(', ')}`)
}

function runSync(opts) {
  let report
  try {
    report = sync({
      packageDir,
      target: opts.target,
      version: `v${pkg.version}`,
      extra: opts.with,
      only: opts.only,
      without: opts.without,
      dryRun: opts.dryRun,
    })
  } catch (error) {
    fail(error.message)
  }
  const prefix = opts.dryRun ? 'Would add' : 'Added'
  list(prefix, report.added)
  list(opts.dryRun ? 'Would update' : 'Updated', report.updated)
  list('Already current', report.unchanged)
  list('Replaced a locally edited copy of', report.replacedLocalEdits)
  list(opts.dryRun ? 'Would remove' : 'Removed', report.removed)
  list('Left in place because it was edited, and no longer managed', report.keptEdited)
  list('No longer in the rules and skipped', report.droppedUpstream)
  if (opts.dryRun) console.log('Dry run, nothing was written.')
  else if (report.firstRun) console.log('Next, add this line to CLAUDE.md or AGENTS.md so agents read the core rules\n\n  @.agent/rules/core.md')
}

function runCheck(opts) {
  let latest = null
  if (opts.latest) {
    try {
      latest = latestTag()
    } catch {
      console.error('Could not reach GitHub to look for a newer version, so only the hashes were checked.')
    }
  }
  const { problems } = check({ target: opts.target, latest })
  if (problems.length === 0) {
    console.log('The shared rules match the lock file.')
    return
  }
  for (const problem of problems) console.error(problem)
  process.exitCode = 1
}

function runAttribution(opts) {
  if (opts.range === null) fail('check-attribution needs --range <base>..<head>.')

  const log = execFileSync('git', ['log', '--no-merges', '--format=%H%x1f%B%x1e', opts.range], {
    cwd: opts.target,
    encoding: 'utf8',
  })
  const texts = log
    .split('\x1e')
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record) => {
      const [sha, ...message] = record.split('\x1f')
      return { label: `commit ${sha.slice(0, 7)}`, text: message.join('\x1f') }
    })
  if (process.env.PR_TITLE) texts.push({ label: 'PR title', text: process.env.PR_TITLE })
  if (process.env.PR_BODY) texts.push({ label: 'PR description', text: process.env.PR_BODY })

  let count = 0
  for (const { label, text } of texts) {
    for (const hit of findViolations(text)) {
      count++
      console.error(`${label}, line ${hit.line}, ${hit.reason}\n  ${hit.text}`)
    }
  }
  if (count === 0) {
    console.log(`No attribution lines in ${texts.length} message${texts.length === 1 ? '' : 's'}.`)
    return
  }
  console.error('\nRemove these lines. Co-author lines are added by hand by a person, and only for a person. See rules/attribution-guide.md.')
  process.exitCode = 1
}

const { command, opts } = parse(process.argv.slice(2))
switch (command) {
  case 'sync':
    runSync(opts)
    break
  case 'check':
    runCheck(opts)
    break
  case 'check-attribution':
    runAttribution(opts)
    break
  case '--version':
    console.log(pkg.version)
    break
  case undefined:
  case '--help':
  case 'help':
    console.log(HELP)
    break
  default:
    fail(`Unknown command ${command}.\n\n${HELP}`)
}
