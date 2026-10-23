# CLAUDE.md

## Commit messages

All commits from now on follow the [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) standard:

```
<type>(<optional scope>): <description>

<optional body>

<optional footer(s)>
```

- **Types:** `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.
- **Scope:** the part of the monorepo touched, e.g. `ts`, `cxx`, `app`, `websocket`; omit it for repo-wide changes.
- **Description:** imperative mood, lowercase, no trailing period.
- **Breaking changes:** add `!` after the type/scope and a `BREAKING CHANGE:` footer.
- Reference issues in the footer (e.g. `Refs: #421`).

Earlier history predates this convention; don't rewrite it.

Examples:

```
feat(ts): restore mouse wheel adjustment of slider elements
fix(cxx): keep the triggered scope sweep on screen until the next one is complete
build: set up npm workspaces monorepo
```
