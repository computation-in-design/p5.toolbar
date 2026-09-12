# p5.toolbar

A lightweight floating toolbar for p5.js sketches, designed for teaching — especially in
the p5.js Web Editor — with a simple plugin API for adding your own tools. CDN-only, no
setup required.

Built-in tools: grid overlay, hide cursor, save canvas, fullscreen.

## Usage

Add one `<script>` tag to your sketch's `index.html`, after p5.js and before
`sketch.js`. The toolbar loads its own stylesheet — you never link the CSS yourself.

```html
<script src="https://cdn.jsdelivr.net/gh/computation-in-design/p5.toolbar@latest/dist/p5.toolbar.js"></script>
<script>
  P5Toolbar.init();
</script>
```

`@latest` tracks the most recent tagged release. The toolbar is under active
development — sketches pick up new versions as they ship. To lock a sketch to one
version, replace `@latest` with a tag, e.g. `@0.3.1`.

### Options

`P5Toolbar.init()` takes an optional config object:

```js
P5Toolbar.init({
  position: "left", // "left" | "top" | "right" | "bottom"
  widgets: ["grid", "hideCursor", "fullscreen", "saveCanvas"], // which tools to show, in order
  sketchName: "week5-perlin-noise", // optional — see below
  friendly: true, // default; set false to log setup problems for debugging
});
```

The toolbar keeps the console quiet by default — it only speaks up when something is
actually broken (p5.js not loaded, an unknown widget name). `friendly: false` also logs
the quieter failures it otherwise swallows, like `localStorage` being blocked or the
stylesheet failing to load — useful when a sketch isn't behaving and you want to know
why.

**`sketchName`** namespaces this sketch's saved state (e.g. whether the grid is on and
its contrast setting) so it doesn't mix with other sketches. The Web Editor runs every
sketch's preview on one shared domain, so without a name, all sketches read and write
the same stored settings.

Leaving it unset is fine for most use — the toolbar just carries your preferences across
every sketch in that browser, which is usually what a student working through a series
of exercises wants. Pass a `sketchName` when a sketch should keep its state on its own,
typically a lecturer setting up starter sketches:

```js
P5Toolbar.init({ sketchName: "week5-perlin-noise" });
```

Use a stable, unique string per sketch — the same name next session restores that
sketch's state. There's no reliable way to derive one automatically (the preview URL
changes the moment someone duplicates the sketch), so it's a manual choice.

## Built-in tools

- **`grid`** — a coordinate grid over the canvas with a live mouse-position readout.
  Toggle with `Shift+G`. Remembers its on/off and contrast state per sketch.
- **`hideCursor`** — hides the mouse cursor over the canvas. Toggle with `Shift+C`.
- **`fullscreen`** — makes the page fullscreen. Toggle with `Shift+F`. If your sketch
  doesn't already resize itself (no `windowResized()`), the canvas is scaled up to fit
  the screen with its proportions preserved, a margin kept around it, and the page
  background turned black. That applies even to a sketch created with
  `createCanvas(windowWidth, windowHeight)` — only an actual `windowResized()` hands
  sizing back to your own code; being sized from the window once at load isn't enough to
  opt out. Not available inside an embed that blocks fullscreen (some sandboxed
  previews) — the button logs a friendly notice instead of doing nothing silently.
- **`saveCanvas`** — downloads the canvas as a JPG named
  `{sketchName}_{YYYY-MM-DD_HH-MM-SS}.jpg` (or `sketch_…` with no `sketchName`). JPG has
  no transparency — a transparent canvas exports with a black background; call p5's
  `saveCanvas()` yourself if you need a PNG.

## Adding your own tools

See [AGENTS.md](AGENTS.md) for the widget API.
