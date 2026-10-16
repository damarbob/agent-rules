# Changelog

All notable changes to this project are listed here, following [Keep a Changelog](https://keepachangelog.com/en/1.0.0/). The versioning scheme is described under Versions in the README.

## [1.1.0] - 2026-10-16

### Added

- **Commit dates**:
  - Added a rule that a commit is never dated before the one it follows.
  - Dated a commit after one that is ahead of the clock, by a random gap sized to the change.
  - Barred agents from picking a future date themselves.
  - Added the rule to `commit-style-guide.md` and to the Commits list in `core.md`.

## [1.0.0] - 2026-10-16

### Added

- **Rule guides**: Added guides for attribution lines, commit messages, writing style, the habits AI output repeats, changelogs and web design, plus a `core.md` that lists the rules that always apply.
- **`sync` command**:
  - Copied the chosen guides into `.agent/rules/` and built a `core.md` that mentions only those guides.
  - Recorded the version and a hash of each file in `.agent-rules.json`.
  - Added `--only`, `--with`, `--without`, `--dry-run` and `--target`.
  - Left a locally edited file in place when removing it, and listed every edited file it replaced.
- **`check` command**: Failed when a copied rule was edited or missing, and with `--latest` when a newer tag exists.
- **`check-attribution` command**: Failed when a commit message or pull request text credits a tool, including co-author lines that name a tool or a bot.
- **Workflows**: Added CI on Node 18 to 24 for Linux and Windows, a markdown lint, and a release workflow that checks the tag against `package.json` and publishes the changelog entry as the release notes.
- **License**: Released under 0BSD.
