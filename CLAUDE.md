# agent-rules

Shared rules for AI coding agents, plus the small command that copies them into other repositories. `README.md` explains both.

@rules/core.md

## This repository

- `rules/` is the source. The banner at the top of each guide says not to edit a copy, and that does not apply here. Edit the guides in `rules/`.
- `rules/core.md` is a template. Each guide has one section between `<!-- guide: name.md -->` and `<!-- /guide -->`, and `sync` keeps only the sections of the chosen guides. A new guide needs a section there and an entry in `DEFAULT_GUIDES` or `OPTIONAL_GUIDES` in `lib/sync.mjs`.
- A guide never links to another guide, so a user can install any one of them alone.
- `npm test` runs the tests. Lint the markdown with `npx --yes markdownlint-cli2@0.23.2 "*.md" "rules/*.md"`.
- The command supports Node 18 or later and has no dependencies. Keep it that way.

## Releasing

1. Bump `version` in `package.json`.
2. Add a `## [x.y.z] - YYYY-MM-DD` entry to `CHANGELOG.md`, following `rules/changelog-guide.md`.
3. Update the `agent-rules#vX.Y.Z` pins in `README.md`. The example under "Keep it current" must name a newer tag than the one being released. `npm test` fails until steps 2 and 3 agree with step 1.
4. Commit, push, and wait for CI to pass on `main`.
5. Tag `vX.Y.Z` on that commit and push the tag. The Release workflow checks the tag against `package.json`, runs the tests and creates the GitHub Release from the changelog entry.
6. In an empty folder, run the install command from the README with the new tag.
