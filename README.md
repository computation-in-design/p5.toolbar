# p5.toolbar

A lightweight floating toolbar for p5.js sketches, designed for teaching — especially in
the p5.js Web Editor — with a simple plugin API for adding your own tools. CDN-only, no
setup required.

Built-in tools: grid overlay, hide cursor.

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
  widgets: ["grid", "hideCursor"], // which tools to show, in order
  sketchName: "week5-perlin-noise", // optional — see below
});
```

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
changes the moment a student duplicates the sketch), so it's a manual choice.

## Adding your own tools

See [AGENTS.md](AGENTS.md) for the widget API.
