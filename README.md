# agent-rules

Shared rules for AI coding agents, kept in one repository so that every project gets the same ones. They cover commit messages, attribution lines, writing style, the habits AI output repeats, changelogs and web design. A small command copies the ones you choose into a project and reports when a copy has drifted.

The files are written for agents first and people second. They are short and imperative, and each rule carries an example, because an agent follows an example better than an abstract statement.

## What's inside

Each guide stands alone, so you can adopt all of them or only one. A guide never links to another guide.

| File | What it covers |
| :-- | :-- |
| `attribution-guide.md` | No credit lines for tools, and co-author lines for humans only. |
| `commit-style-guide.md` | Subject and body format, length and issue references. |
| `writing-style-guide.md` | Dashes, titles, colons, stacked claims and voice. |
| `ai-patterns-guide.md` | The habits that make text, structure and code read as generated. |
| `changelog-guide.md` | The Keep a Changelog layout and item format. |
| `web-design-guide.md` | Optional. Keeps pages from looking templated. |
| `core.md` | Always installed. The short list of rules that always apply, with one entry for each guide you chose and none for the others. Import this one from `CLAUDE.md` or `AGENTS.md`. |

## Install

Run this from the root of the project. It needs Node 18 or later and git.

```bash
npx --yes github:damarbob/agent-rules#v1.0.0 sync
```

`npx` runs a package without installing it, and here the package is this repository at the `v1.0.0` tag. The command copies the default guides into `.agent/rules/`, builds `core.md` for them, and writes a lock file there, `.agent-rules.json`. The lock records the version and a hash (a fingerprint of the contents) for each file.

```json
{
  "source": "damarbob/agent-rules",
  "version": "v1.0.0",
  "files": {
    "attribution-guide.md": "9f2c…",
    "commit-style-guide.md": "51ab…",
    "core.md": "c07e…"
  }
}
```

Next, make agents read the core rules. In Claude Code, add this line to `CLAUDE.md`, which loads the file into every session. Without it, an agent reads a rule only when it decides to open the file.

```text
@.agent/rules/core.md
```

The files carry Windsurf's rule frontmatter (`trigger: always_on`), so tools that read `.agent/rules/` pick them up on their own. For anything else, link the folder from `AGENTS.md`.

| Option | Effect |
| :-- | :-- |
| `--only <guides>` | Installs just these guides, on a first run. |
| `--with <guides>` | Also installs these guides, such as the optional `web-design-guide`. |
| `--without <guides>` | Removes these guides, or leaves them out of the defaults on a first run. |
| `--dry-run` | Shows what would change and writes nothing. |
| `--target <dir>` | Works on another folder than the current one. |

Guides are comma separated and the `.md` is optional.

## Choose your rules

The default is every guide except `web-design-guide`. To adopt only some, name them on the first run.

```bash
npx --yes github:damarbob/agent-rules#v1.0.0 sync --only attribution-guide,writing-style-guide,ai-patterns-guide
```

`core.md` is then built with a section for each of those three and nothing about commits. Later runs keep the choice recorded in the lock file. Add a guide with `--with` and drop one with `--without`.

```bash
npx --yes github:damarbob/agent-rules#v1.0.0 sync --with commit-style-guide --without ai-patterns-guide
```

A guide you remove is deleted only if it still matches the lock file. If someone edited it, the command leaves it in place, stops managing it, and says so. `--only` is for the first run, because on a later run it would be unclear whether to add to the set or replace it. At least one guide must stay.

The command only writes plain files, so a machine without Node can copy single files from `rules/` by hand. Leave `core.md` out in that case, since the copy in this repository lists every guide, and point `CLAUDE.md` or `AGENTS.md` at the guides you copied.

## Keep it current

Point the command at a newer tag and run it again. Then read `git diff` and commit the result. A file with local edits is replaced, and the command lists those so nothing disappears unnoticed.

```bash
npx --yes github:damarbob/agent-rules#v1.1.0 sync
```

`check` compares every file with its recorded hash, which finds copies that someone edited by hand. Add `--latest` to ask GitHub whether a newer tag exists.

```bash
npx --yes github:damarbob/agent-rules#v1.1.0 check --latest
```

## Add rules of your own

Only the files in the lock file are managed. Anything else in `.agent/rules/` is yours and is never touched. Name project files after what they cover, such as `project-commit-notes.md`, and start them with `trigger: always_on` frontmatter. They add to the shared rules and win on a conflict.

Edit a shared file in this repository, never in the copy. The next sync replaces the copy, and `check` fails in the meantime.

## Check pull requests in CI

`check-attribution` reads the commit messages in a range and the pull request title and description, and it fails when one of them credits a tool. This workflow runs it together with `check`.

```yaml
name: Agent rules
on: pull_request
jobs:
  rules:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v7
        with:
          node-version: 22
      - name: Shared rules are unedited
        run: npx --yes github:damarbob/agent-rules#v1.0.0 check
      - name: No attribution lines
        env:
          PR_TITLE: ${{ github.event.pull_request.title }}
          PR_BODY: ${{ github.event.pull_request.body }}
        run: npx --yes github:damarbob/agent-rules#v1.0.0 check-attribution --range "${{ github.event.pull_request.base.sha }}..${{ github.event.pull_request.head.sha }}"
```

The check knows common wordings and the names of common tools. It cannot judge a new wording, and it cannot prove that a name belongs to a person, so the written rules remain the main protection.

## Tool settings

Some tools add credit lines on their own, and the cleanest fix is to turn that off at the source. In Claude Code, set both values in `settings.json` to empty strings.

```json
{
  "attribution": { "commit": "", "pr": "" }
}
```

This is documented to remove the co-author trailer and the pull request footer. Some versions have been reported to leave a trailer or a session link anyway, so check the output of a throwaway commit and keep the rules and the CI check in place.

## Versions

Releases are tags in the form `v1.4.0`. A wording fix is a patch, a new rule or file is a minor release, and a change that removes or reverses a rule is a major one. The version in `package.json` must equal the tag, because the lock file records it. A workflow checks this when a tag is pushed, and it publishes the matching entry from `CHANGELOG.md` as the release notes.

## Development

```bash
npm test
npx --yes markdownlint-cli2@0.23.2 "*.md" "rules/*.md"
```

## License

[0BSD](LICENSE), a license that lets you use, copy, change and share the rules and the command with no conditions. That suits files that `sync` copies into other repositories, because no notice has to travel with them.
