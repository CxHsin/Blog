# AGENTS.md

This file is the default source of collaboration guidance for this repository.

## Scope

Use this file to define how changes should be prepared before they are submitted
to GitHub. Keep it focused on rules that affect collaboration quality,
reviewability, and repository hygiene for this Astro-based blog repository.

## Commit Messages

Use Conventional Commits:

`<type>(<scope>): <subject>`

If the change is broad or does not target a clear subsystem, scope may be
omitted:

`<type>: <subject>`

Allowed types:

- `feat`
- `fix`
- `refactor`
- `perf`
- `docs`
- `test`
- `build`
- `ci`
- `chore`
- `style`
- `revert`

Scope guidance:

- Prefer short, stable subsystem names
- Use module, package, feature, or directory names when they help review
- Omit scope for cross-cutting changes

Common scopes in this repository include:

- `home`
- `header`
- `projects`
- `links`
- `content`
- `posts`
- `docs`
- `styles`
- `config`
- `astro`
- `seo`

Subject guidance:

- Describe the actual change, not the process around it
- Write direct commit subjects in English; PR titles are covered separately below
- Prefer imperative present tense
- Keep it short and specific
- Do not add a trailing period
- Avoid vague subjects such as `misc updates`, `cleanup`, or `various fixes`

Good examples:

- `feat(home): add loading overlay for first visit`
- `fix(header): keep nav interactions responsive on mobile`
- `docs: update local development notes`

Bad examples:

- `fix: review comments`
- `chore: cleanup`
- `fix: various improvements`

## Commit Body

Add a commit body only when the reason is not obvious from the diff.

A good body explains:

- why the change is needed
- what changed at a high level
- whether there is any compatibility risk, migration note, or follow-up work

Keep body paragraphs as normal continuous prose. Do not add unnecessary
structure for trivial commits.

## Pull Requests

Commit changes directly to `main` for this blog repository. Use a different
branch only when the user explicitly asks for one.

Do not use AI agent names as branch-name prefixes, such as `codex/`,
`claude/`, or `gemini/`. When a prefix is useful, use one that describes the
change, such as `feat/`, `fix/`, `docs/`, or `chore/`.

PR titles should follow the same Conventional Commit format as commit messages
above because they become the squash-merge commit subject. Write the title
subject in English, keep it short and specific, and use a scope when the change
targets a clear subsystem.

PR descriptions should be written in Chinese and include:

- a short summary of the behavior change
- how the change was verified
- any notable risk, limitation, or rollout concern
- related issues when applicable, for example `Closes #123`

For UI changes, include screenshots or short recordings when useful.
For content-only changes, call out the affected pages, posts, or data files.

## Commit Boundaries

- Do not mix unrelated changes into the same commit
- Separate refactors, formatting-only changes, and behavior changes when
  practical
- Prefer small commits that can be reviewed independently
- Keep mechanical renames or bulk formatting isolated from functional edits

## Dependency And Tooling Changes

Do not introduce new dependencies, build tools, or workflow tooling casually.

If a change adds or replaces a dependency or changes the developer workflow,
explain the reason clearly in the PR description and note any impact on
maintenance, bundle size, build time, or operational complexity.

## Pre-Submission Checklist

Before submitting to GitHub, confirm that:

- the change has been self-tested
- `bun run check` has been run for changes touching `.astro`, `.ts`, or `.tsx`
- relevant lint, build, and formatting steps have been run when available
- no temporary logs, debug code, or unrelated files are included
- related docs or config changes are updated together

## Merge Guidance

Prefer squash merge unless there is a clear reason to preserve individual
commits. The final squash commit title must still follow the format in this
file.

## Trailers

Do not add AI attribution trailers such as `Co-Authored-By` for agent
assistance.

Keep genuine human authorship trailers when they are actually needed for
collaboration history.
