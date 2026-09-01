# AGENTS.md

Conventions for anyone (human or LLM) contributing to p5.toolbar. Read this before
opening a PR — it captures decisions already made during the project's design, so they
don't get reinvented or reversed by accident.

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
- **No build step, single student-facing include.** `dist/p5.toolbar.js` is hand-authored,
  organized into clearly commented sections (icons, shell, cursor-resolver, storage, then
  each widget). There is no compile step between the repo and what jsDelivr serves, so
  what's in `dist/` is exactly what ships. Styles live in the sibling `dist/p5.toolbar.css`
  for readability, but students never link it themselves — the JS captures
  `document.currentScript.src` at parse time and auto-injects a `<link>` to the co-located
  CSS. This only works if the script is included as a plain synchronous
  `<script src="...">` tag — not dynamically injected, and not `async`/`defer`/
  `type="module"` — since `document.currentScript` is only reliable during a script's
  initial synchronous execution.
- **CSS is scoped under `.p5toolbar`/`.p5toolbar-*`, with one deliberate exception: the
  shared custom-property scale** (colors, spacing, sizes — see the top of
  `p5.toolbar.css`) **lives on `:root`, not `.p5toolbar`.** That's not an oversight —
  `.p5toolbar-grid-readout` (and any future widget that needs its own floating element)
  is a `document.body` child, not a descendant of `.p5toolbar`, so it can't inherit
  anything scoped there. `:root` is the only place both can genuinely share via real CSS
  inheritance instead of hand-copied local redeclarations. The `--p5toolbar-` prefix
  keeps the collision risk with a host page's own custom properties effectively nil.
  `document.documentElement.dataset.theme` (not `.p5toolbar`'s own) is what the dark-mode
  override actually keys off — see `applyTheme()`.
- **Widgets register themselves.** Built-in widgets use the same
  `P5Toolbar.registerWidget(name, definition)` call a third-party widget would use —
  nothing is special-cased internally. Third-party widgets can live entirely outside this
  repo; they only need `P5Toolbar` on `window` before calling `registerWidget()`.
- **Cursor state goes through the shell's resolver, and cursor-setting widgets are
  mutually exclusive.** Widgets declare intent to the shell; the shell alone writes
  `canvas.style.cursor`. Turning one cursor-setting widget on (e.g. `grid`) automatically
  turns any other one off first (e.g. `hideCursor`) — via a real `.click()` on the other
  widget's own button, not a shortcut around it, so that widget's own `onToggle` cleanup
  (rAF loops, DOM teardown, etc.) still runs correctly. A priority list
  (`CURSOR_PRIORITY`) still resolves the final `canvas.style.cursor` value from whatever
  ends up registered, as a fallback — in practice that's normally at most one entry.
  Never set `canvas.style.cursor` directly from a widget.
- **Config lives in `index.html`, never in `sketch.js`** — via the `P5Toolbar.init({...})`
  call, so the file students actually edit stays uncluttered.
- **`localStorage` namespacing depends on what's being stored.** Widget-authored storage
  (`ctx.storage`) uses `p5toolbar:{sketchName}:widget:{id}:{key}`, falling back to a
  global bucket if no `sketchName` is configured — the Web Editor's preview iframe shares
  one origin across all sketches, so unnamespaced *widget* keys would leak state between
  unrelated sketches. Shell state (toolbar position, visibility) is the opposite: always
  global (`storage.get/set(null, ...)`), deliberately *not* namespaced per sketch, since
  it's a personal preference about the toolbar chrome itself — a student's "I keep it on
  the right, hidden by default" habit should follow them across every sketch, not reset
  per project.

## Widget contract

Every widget — built-in or third-party — is a plain object passed to
`P5Toolbar.registerWidget(id, definition)`:

```js
{
  icon: '<svg>...</svg>',              // or { off: '<svg>...</svg>', on: '<svg>...</svg>' }
  label: 'Hide cursor',                // or { off: '...', on: '...' } — aria-label + tooltip text
  type: 'toggle' | 'action',           // toggle = stays pressed, action = fires once
  persist: true,                       // optional, toggle only — remember on/off per sketch
  onToggle(active, ctx) {},            // required for type: 'toggle'
  onActivate(ctx) {},                  // required for type: 'action'
  shortcut: { code: 'KeyC', shiftKey: true }, // optional; any of shiftKey/ctrlKey/altKey/metaKey
}
```

- `icon`/`label` as a plain string never change; as an `{ off, on }` pair, the shell
  swaps between them on every toggle (see `resolveStateful()`), so `on` should read as
  "what will happen if you click again," not just a status label.
- `persist: true` (toggle widgets only) makes the shell store the on/off state under
  `ctx.storage` and, on the next load, render the button pressed and replay `onToggle`
  as if the student had clicked it. Any other state the widget wants remembered (the
  grid's contrast toggle, say) is on the widget to save/restore through `ctx.storage`
  itself. Per-sketch, so it follows `sketchName` — without one, all Web Editor sketches
  share a bucket (see the `localStorage` note above).
- `ctx` passed to both hooks: `{ canvas, sketchName, setCursor(value), clearCursor(),
  storage: { get(key, fallback), set(key, value) } }` — `storage` is pre-namespaced to
  the widget's own key space, no need to build the key yourself.
- `shortcut` is matched on an **exact** modifier combination (`matchesShortcut()`), not
  just "is shiftKey down" — so a `Shift+C` shortcut won't also fire on `Cmd/Ctrl+Shift+C`.
  It only fires for widgets actually included in the active `widgets` config array (bound
  per-instance in `renderWidget()`, not scanned across the whole registry), and it's
  wired generically — no shell code is specific to any one widget's shortcut.
- `shortcut` is opt-in per widget, not automatic — they're global and can collide with a
  student's own `keyPressed()` bindings. Reach for one when a widget is either hard to
  toggle by other means (`hideCursor`: with the cursor hidden, clicking a small button to
  turn it back on is itself hard to aim) or expected to be toggled often enough during a
  session that reaching for the mouse each time is real friction (`grid`: `Shift+G`).

## Repo layout

- `dist/p5.toolbar.js`, `dist/p5.toolbar.css` — the shipped library (source == shipped
  files, no build). Students only ever add a `<script>` tag for the `.js` file; the CSS
  loads itself.
- `test/` — a local sandbox shaped like a fresh p5.js Web Editor export, used to preview
  the toolbar during development before tagging a release. Not shipped.
- No `src/`, no CI config, no test framework — see below.

## Process

- **No CI.** PRs are reviewed and tested manually. Don't add pipeline config unless
  contributor volume makes manual review genuinely painful.
- **No automated tests.** Verify changes manually — `test/` locally during development,
  the real Web Editor before release. Don't introduce a test framework speculatively.
- **Versioning is manual, via `scripts/release.sh <version>`.** It bumps the version
  header in `dist/p5.toolbar.js`, commits, and tags in one step — run it rather than
  editing the header and tagging separately, so the two can't drift apart. It also
  refuses a version that isn't newer than the latest tag. jsDelivr serves from the
  GitHub tag; the script doesn't push (that stays deliberate), but the tag is annotated
  and it enables `push.followTags`, so the next plain `git push` carries the tag — no
  separate `git push --tags`. No CI, no other release automation.
- Keep the tooling minimal generally — this is solo-maintained vanilla JS and isn't
  expected to grow large. Don't add a bundler, TypeScript, or a package manager dependency
  without a real, current reason.
