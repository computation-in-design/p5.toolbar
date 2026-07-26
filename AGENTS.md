# AGENTS.md

Conventions for anyone (human or LLM) contributing to p5.toolbar. Read this before
opening a PR — it captures decisions already made in the project spec so they don't get
reinvented or reversed by accident.

## What this project is

A floating UI addon for p5.js sketches (`p5.sound`, `p5.play` → `p5.toolbar`), aimed at
students writing global-mode sketches directly in the p5.js Web Editor. CDN-only via
jsDelivr, no npm package, no bundler.

## Hard constraints

- **Global mode only.** Never assume a `p5` instance. Read p5 globals directly off
  `window` (`window.mouseX`, `window.mouseY`, etc.) and grab the canvas via
  `document.querySelector('canvas')`. Never require a student's `sketch.js` to pass
  anything into the toolbar.
- **No `p5.dom`.** Nothing in the toolbar may depend on it — use raw DOM APIs.
- **Single shipped file, no build step.** The whole library is
  `dist/p5.toolbar.js`, hand-authored, organized into clearly commented sections (shell,
  cursor-resolver, storage, then each widget). There is no compile step between the repo
  and what jsDelivr serves, so what's in `dist/` is exactly what ships.
- **Widgets register themselves.** Built-in widgets use the same
  `P5Toolbar.registerWidget(name, definition)` call a third-party widget would use —
  nothing is special-cased internally. Third-party widgets can live entirely outside this
  repo; they only need `P5Toolbar` on `window` before calling `registerWidget()`.
- **Cursor state goes through the shell's resolver.** Multiple widgets may want
  `canvas.style.cursor`. Widgets declare intent to the shell; the shell alone writes
  `canvas.style.cursor`, applying one fixed priority (hide-cursor wins over crosshair).
  Never set `canvas.style.cursor` directly from a widget.
- **Config lives in `index.html`, never in `sketch.js`** — via the `P5Toolbar.init({...})`
  call, so the file students actually edit stays uncluttered.
- **`localStorage` keys are namespaced** `p5toolbar:{sketchName}:{key}`, falling back to
  a global default if no `sketchName` is configured. The Web Editor's preview iframe
  shares one origin across all sketches, so unnamespaced keys would leak state between
  unrelated sketches.

## Repo layout

- `dist/p5.toolbar.js` — the shipped library (source == shipped file, no build).
- `test/` — a local sandbox shaped like a fresh p5.js Web Editor export, used to preview
  the toolbar during development before tagging a release. Not shipped.
- No `src/`, no CI config, no test framework — see below.

## Process

- **No CI.** PRs are reviewed and tested manually. Don't add pipeline config unless
  contributor volume makes manual review genuinely painful.
- **No automated tests.** Verify changes manually — `test/` locally during development,
  the real Web Editor before release. Don't introduce a test framework speculatively.
- **Versioning is manual.** Tag a commit when a release is ready; jsDelivr serves from
  the GitHub tag. No release automation.
- Keep the tooling minimal generally — this is solo-maintained vanilla JS and isn't
  expected to grow large. Don't add a bundler, TypeScript, or a package manager dependency
  without a real, current reason.
