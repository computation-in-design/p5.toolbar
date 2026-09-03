/*!
 * p5.toolbar — v0.3.4
 * A floating toolbar addon for p5.js global-mode sketches. See AGENTS.md for the
 * conventions this file follows (global-mode access, single-file, cursor-resolver, etc).
 */
(function () {
  "use strict";

  // Must be read synchronously at parse time — document.currentScript is only valid
  // during a script's initial synchronous run (see AGENTS.md).
  const scriptEl = document.currentScript;
  const scriptSrc = scriptEl ? scriptEl.src : null;

  // ---------------------------------------------------------------------------------
  // Console — the library stays quiet in normal use. It speaks only for a real
  // problem: error() when the toolbar can't run at all, warn() when something the
  // caller passed is being ignored. info() is for deliberate, friendly notices.
  // localStorage and stylesheet failures degrade silently by default; init({ friendly:
  // false }) routes them to debug() for anyone tracking down a setup problem.
  // ---------------------------------------------------------------------------------

  const log = {
    info: function (msg) {
      console.info("[p5.toolbar] " + msg);
    },
    warn: function (msg) {
      console.warn("[p5.toolbar] " + msg);
    },
    error: function (msg) {
      console.error("[p5.toolbar] " + msg);
    },
    debug: function (msg) {
      // Silent unless the caller opted out of friendly mode.
      if (state.config && !state.config.friendly) {
        console.info("[p5.toolbar] " + msg);
      }
    },
  };

  // ---------------------------------------------------------------------------------
  // Labels — centralized so localization is a single-file change.
  // ---------------------------------------------------------------------------------

  const LABELS = {
    theme: "Toggle theme",
    position: "Reposition toolbar",
    hide: "Hide toolbar",
    hideCursor: { off: "Hide cursor", on: "Show cursor" },
    grid: { off: "Show grid", on: "Hide grid" },
  };

  // ---------------------------------------------------------------------------------
  // Icons — inline SVG strings (not sprite/<img>) so stroke: currentColor tracks theme
  // with no JS-side icon-swap logic.
  // ---------------------------------------------------------------------------------

  const ICON_ATTRS =
    'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';

  const ICONS = {
    sun:
      "<svg " +
      ICON_ATTRS +
      ">" +
      '<circle cx="12" cy="12" r="4"></circle>' +
      '<path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"></path>' +
      "</svg>",
    moon:
      "<svg " +
      ICON_ATTRS +
      ">" +
      '<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z"></path>' +
      "</svg>",
    eye:
      "<svg " +
      ICON_ATTRS +
      ">" +
      '<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"></path>' +
      '<circle cx="12" cy="12" r="3"></circle>' +
      "</svg>",
  };

  // Both states keep the stroke outline; "on" adds a fill on top, so the silhouette's
  // outer edge doesn't shift size when toggling.
  const CURSOR_ARROW_PATH = "M4.3 4L11 20L13 12.3L19.7 10.2Z";
  ICONS.cursor = {
    off: "<svg " + ICON_ATTRS + '><path d="' + CURSOR_ARROW_PATH + '"></path></svg>',
    on:
      "<svg " +
      ICON_ATTRS +
      '><path d="' +
      CURSOR_ARROW_PATH +
      '" fill="currentColor"></path></svg>',
  };

  // "On" adds a currentColor fill to the frame (stroke stays, so the edge doesn't
  // resize) and recolors the plus to var(--p5toolbar-bg), reading as a cutout.
  const GRID_FRAME_PATH = '<rect x="3" y="3" width="18" height="18" rx="3"';
  ICONS.grid = {
    off:
      "<svg " +
      ICON_ATTRS +
      ">" +
      GRID_FRAME_PATH +
      "></rect>" +
      '<path d="M12 3V21M3 12H21"></path>' +
      "</svg>",
    on:
      "<svg " +
      ICON_ATTRS +
      ">" +
      GRID_FRAME_PATH +
      ' fill="currentColor"></rect>' +
      '<path d="M12 3V21M3 12H21" stroke="var(--p5toolbar-bg)" stroke-width="2.5" stroke-linecap="square"></path>' +
      "</svg>",
  };

  // Outlined circle, left half filled — one arc closed by the vertical diameter.
  ICONS.invert =
    "<svg " +
    ICON_ATTRS +
    ">" +
    '<circle cx="12" cy="12" r="9"></circle>' +
    '<path d="M12 3A9 9 0 0 0 12 21Z" fill="currentColor" stroke="none"></path>' +
    "</svg>";

  // Rounded-rect frame with one edge's middle third filled, matching the current edge.
  // Swapped by updatePositionButton().
  ICONS.positions = {
    left:
      "<svg " +
      ICON_ATTRS +
      ">" +
      '<rect x="3" y="3" width="18" height="18" rx="4"></rect>' +
      '<rect x="6" y="7.5" width="2.5" height="9" rx="1.25" fill="currentColor" stroke="none"></rect>' +
      "</svg>",
    top:
      "<svg " +
      ICON_ATTRS +
      ">" +
      '<rect x="3" y="3" width="18" height="18" rx="4"></rect>' +
      '<rect x="7.5" y="6" width="9" height="2.5" rx="1.25" fill="currentColor" stroke="none"></rect>' +
      "</svg>",
    right:
      "<svg " +
      ICON_ATTRS +
      ">" +
      '<rect x="3" y="3" width="18" height="18" rx="4"></rect>' +
      '<rect x="15.5" y="7.5" width="2.5" height="9" rx="1.25" fill="currentColor" stroke="none"></rect>' +
      "</svg>",
    bottom:
      "<svg " +
      ICON_ATTRS +
      ">" +
      '<rect x="3" y="3" width="18" height="18" rx="4"></rect>' +
      '<rect x="7.5" y="15.5" width="9" height="2.5" rx="1.25" fill="currentColor" stroke="none"></rect>' +
      "</svg>",
  };

  // ---------------------------------------------------------------------------------
  // Storage — namespaced localStorage helper (p5toolbar:{sketchName}:{key}). The Web
  // Editor preview iframe shares one origin across sketches, so unnamespaced keys would
  // leak state between unrelated sketches (see AGENTS.md).
  // ---------------------------------------------------------------------------------

  const storage = {
    // Flips false the first time a call throws (private mode, quota, storage disabled).
    // startToolbar checks it once to emit a friendly-mode note.
    ok: true,
    key: function (sketchName, key) {
      return "p5toolbar:" + (sketchName || "default") + ":" + key;
    },
    get: function (sketchName, key, fallback) {
      try {
        const raw = window.localStorage.getItem(storage.key(sketchName, key));
        return raw === null ? fallback : JSON.parse(raw);
      } catch (e) {
        storage.ok = false;
        return fallback;
      }
    },
    set: function (sketchName, key, value) {
      try {
        window.localStorage.setItem(storage.key(sketchName, key), JSON.stringify(value));
      } catch (e) {
        storage.ok = false;
      }
    },
    remove: function (sketchName, key) {
      try {
        window.localStorage.removeItem(storage.key(sketchName, key));
      } catch (e) {
        storage.ok = false;
      }
    },
  };

  // ---------------------------------------------------------------------------------
  // Utilities
  // ---------------------------------------------------------------------------------

  // Clear a pending timeout and return null, for the `timer = clearTimer(timer)` idiom.
  function clearTimer(id) {
    if (id) clearTimeout(id);
    return null;
  }

  // ---------------------------------------------------------------------------------
  // Core state
  // ---------------------------------------------------------------------------------

  const POSITIONS = ["left", "top", "right", "bottom"];
  const ORIENTATION = {
    left: "vertical",
    right: "vertical",
    top: "horizontal",
    bottom: "horizontal",
  };

  const state = {
    config: null,
    position: "left",
    visible: true,
    theme: "light",
    themeOverridden: false,
  };

  const els = {}; // shell elements, populated by buildShell
  let canvasEl = null; // the sketch's <canvas>, set by startToolbar

  // ---------------------------------------------------------------------------------
  // Cursor-state resolver — widgets declare intent; this is the only code that writes
  // canvas.style.cursor. CURSOR_PRIORITY resolves the final value if more than one
  // intent is ever registered at once; setCursorIntent normally prevents that.
  // ---------------------------------------------------------------------------------

  const CURSOR_PRIORITY = ["none", "crosshair"];
  const cursorIntents = new Map();
  const widgetButtons = {}; // id -> button element, populated by renderWidget

  function applyCursor() {
    if (!canvasEl) return;
    const active = new Set(cursorIntents.values());
    for (let i = 0; i < CURSOR_PRIORITY.length; i++) {
      if (active.has(CURSOR_PRIORITY[i])) {
        canvasEl.style.cursor = CURSOR_PRIORITY[i];
        return;
      }
    }
    canvasEl.style.cursor = "";
  }

  // Cursor-setting widgets are mutually exclusive — turning one on turns any other off
  // first via a real button click (not a shortcut around it), so the other widget's own
  // onToggle cleanup (rAF loops, DOM teardown) still runs.
  function setCursorIntent(widgetId, value) {
    cursorIntents.forEach(function (_, otherId) {
      if (otherId !== widgetId && widgetButtons[otherId]) {
        widgetButtons[otherId].click();
      }
    });
    cursorIntents.set(widgetId, value);
    applyCursor();
  }

  function clearCursorIntent(widgetId) {
    cursorIntents.delete(widgetId);
    applyCursor();
  }

  // ---------------------------------------------------------------------------------
  // Widget registry
  // ---------------------------------------------------------------------------------

  const registry = {};

  function registerWidget(id, definition) {
    registry[id] = definition;
  }

  // ---------------------------------------------------------------------------------
  // Stylesheet & canvas — the CSS injects itself next to the script; init waits for the
  // sketch's canvas to exist before building anything.
  // ---------------------------------------------------------------------------------

  function injectStylesheet() {
    if (document.getElementById("p5toolbar-styles")) return;
    const href = scriptSrc ? new URL("p5.toolbar.css", scriptSrc).href : "p5.toolbar.css";
    const link = document.createElement("link");
    link.id = "p5toolbar-styles";
    link.rel = "stylesheet";
    link.href = href;
    link.onerror = function () {
      log.debug(
        "Stylesheet failed to load from " + href + " — the toolbar will look unstyled."
      );
    };
    document.head.appendChild(link);
  }

  function waitForCanvas(callback) {
    const existing = document.querySelector("canvas");
    if (existing) {
      callback(existing);
      return;
    }
    const observer = new MutationObserver(function () {
      const found = document.querySelector("canvas");
      if (found) {
        observer.disconnect();
        callback(found);
      }
    });
    // documentElement, not body — body may not exist yet on some hosts (e.g. Web Editor).
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  // ---------------------------------------------------------------------------------
  // Theme — follows prefers-color-scheme until the user toggles it. A toggle stores
  // the choice and it wins over the OS; toggling back to the OS's current theme clears
  // the override and resumes following (the only route back to auto).
  // ---------------------------------------------------------------------------------

  function systemTheme() {
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }

  function resolveEffectiveTheme() {
    return state.themeOverridden ? state.theme : systemTheme();
  }

  function updateThemeButton() {
    els.themeBtn.querySelector("svg").outerHTML =
      state.theme === "dark" ? ICONS.sun : ICONS.moon;
  }

  function applyTheme() {
    state.theme = resolveEffectiveTheme();
    // On <html>, not .p5toolbar — the theme custom properties live on :root (see
    // p5.toolbar.css), so every themed element, including .p5toolbar-grid-readout
    // (not a descendant of .p5toolbar), picks it up through normal inheritance.
    document.documentElement.dataset.theme = state.theme;
    updateThemeButton();
  }

  function toggleTheme() {
    state.theme = state.theme === "dark" ? "light" : "dark";

    if (state.theme === systemTheme()) {
      // Back to what the OS wants — drop the override and resume following it, future OS
      // changes included (see bindThemeMediaQuery).
      state.themeOverridden = false;
      storage.remove(null, "theme");
    } else {
      state.themeOverridden = true;
      storage.set(null, "theme", state.theme);
    }

    applyTheme();
  }

  function bindThemeMediaQuery() {
    if (!window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = function () {
      if (state.themeOverridden) return;
      applyTheme();
    };
    if (mq.addEventListener) mq.addEventListener("change", handler);
    else if (mq.addListener) mq.addListener(handler);
  }

  // ---------------------------------------------------------------------------------
  // Position — which edge the toolbar sits on. Global preference, cycled by its button.
  // ---------------------------------------------------------------------------------

  function updatePositionButton() {
    els.positionBtn.querySelector("svg").outerHTML = ICONS.positions[state.position];
  }

  function setPosition(pos, persist) {
    state.position = pos;
    els.root.dataset.position = pos;
    els.root.dataset.orientation = ORIENTATION[pos];
    updatePositionButton();
    resetTooltipWarmState();
    if (persist !== false) {
      storage.set(null, "position", pos); // global — a chrome preference, not sketch data
    }
  }

  function cyclePosition() {
    const idx = POSITIONS.indexOf(state.position);
    setPosition(POSITIONS[(idx + 1) % POSITIONS.length]);
  }

  // ---------------------------------------------------------------------------------
  // Visibility — hide/show the whole toolbar (Shift+T). Global preference.
  // ---------------------------------------------------------------------------------

  function setVisible(visible, persist) {
    state.visible = visible;
    if (visible) {
      els.root.removeAttribute("hidden");
      dismissHiddenToast(); // the toolbar is on screen — the "it's hidden" notice is moot
    } else {
      els.root.setAttribute("hidden", "");
    }
    if (persist !== false) {
      storage.set(null, "visible", visible);
    }
  }

  function toggleVisibility() {
    setVisible(!state.visible);
  }

  // ---------------------------------------------------------------------------------
  // Canvas event isolation — pointer/click/scroll events that land on the toolbar's own
  // UI shouldn't also reach the sketch. p5 registers its input listeners on `window` in
  // the bubble phase (pointer events in 2.x, mouse/touch in 1.x), so stopping
  // propagation on our elements keeps a click on a toolbar over the canvas from firing
  // the sketch's mousePressed(), mouseWheel(), touchStarted(), etc.
  //
  // A release passes through when its press started off our UI (i.e. on the canvas): the
  // capture-phase listeners clear the flag before any target handler runs, and
  // containSketchEvents sets it again only for a press that hit our UI — so a drag begun
  // on the canvas and finished over the toolbar still delivers its release to p5.
  // ---------------------------------------------------------------------------------

  const PRESS_EVENTS = ["pointerdown", "mousedown", "touchstart"];
  const RELEASE_EVENTS = ["pointerup", "mouseup", "touchend"];
  let pressStartedInUI = false;
  let uiPressTrackingInstalled = false;

  function containSketchEvents(el) {
    if (!uiPressTrackingInstalled) {
      uiPressTrackingInstalled = true;
      PRESS_EVENTS.forEach(function (type) {
        document.addEventListener(
          type,
          function () {
            pressStartedInUI = false;
          },
          true
        );
      });
    }

    PRESS_EVENTS.forEach(function (type) {
      el.addEventListener(type, function (e) {
        pressStartedInUI = true;
        e.stopPropagation();
      });
    });
    RELEASE_EVENTS.forEach(function (type) {
      el.addEventListener(type, function (e) {
        if (pressStartedInUI) e.stopPropagation();
      });
    });
    ["click", "dblclick", "wheel"].forEach(function (type) {
      el.addEventListener(type, function (e) {
        e.stopPropagation();
      });
    });
  }

  // ---------------------------------------------------------------------------------
  // Keyboard shortcuts — opt-in per widget, matched on an exact modifier combination.
  // ---------------------------------------------------------------------------------

  const HIDE_SHORTCUT = { code: "KeyT", shiftKey: true };

  // Never fire a shortcut while the user is typing into a createInput() field or similar.
  function isTypingInField() {
    const active = document.activeElement;
    const tag = active && active.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || (active && active.isContentEditable);
  }

  // Exact match, not just "shiftKey is down" — so Shift+C won't also fire on
  // Cmd/Ctrl+Shift+C (the browser devtools inspect-element chord).
  function matchesShortcut(e, shortcut) {
    if (!shortcut || e.code !== shortcut.code) return false;
    return (
      e.shiftKey === !!shortcut.shiftKey &&
      e.ctrlKey === !!shortcut.ctrlKey &&
      e.altKey === !!shortcut.altKey &&
      e.metaKey === !!shortcut.metaKey
    );
  }

  // Every OS names the meta key differently — avoid hardcoding "Cmd".
  function metaKeyLabel() {
    const info = (
      (navigator.platform || "") +
      " " +
      (navigator.userAgent || "")
    ).toLowerCase();
    if (info.indexOf("mac") !== -1) return "Cmd";
    if (info.indexOf("win") !== -1) return "Win";
    return "Meta";
  }

  // { code: "KeyC", shiftKey: true } -> "Shift+C" for the tooltip chip and aria-label.
  function formatShortcut(shortcut) {
    const parts = [];
    if (shortcut.metaKey) parts.push(metaKeyLabel());
    if (shortcut.ctrlKey) parts.push("Ctrl");
    if (shortcut.altKey) parts.push("Alt");
    if (shortcut.shiftKey) parts.push("Shift");
    const code = shortcut.code || "";
    parts.push(code.indexOf("Key") === 0 ? code.slice(3) : code);
    return parts.join("+");
  }

  function accessibleLabel(label, shortcut) {
    if (!shortcut) return label;
    return label + " (" + formatShortcut(shortcut) + ")";
  }

  function bindShortcut() {
    window.addEventListener("keydown", function (e) {
      if (isTypingInField() || !matchesShortcut(e, HIDE_SHORTCUT)) return;
      toggleVisibility();
    });
  }

  // ---------------------------------------------------------------------------------
  // Tooltips — the first tooltip in a session waits out the full CSS show-delay; moving
  // straight to another button shortly after should feel instant, like native tooltip
  // groups. A [data-tooltip-warm] flag on the root drives that from the CSS.
  // ---------------------------------------------------------------------------------

  let tooltipWarm = false;
  let tooltipTimer = null;

  // Reads --p5toolbar-tooltip-delay from the CSS so this can't drift from the actual
  // show-delay — change the delay in p5.toolbar.css only.
  function getTooltipDelayMs() {
    const raw = getComputedStyle(els.root).getPropertyValue("--p5toolbar-tooltip-delay");
    const match = /^\s*(-?[\d.]+)(m?s)\s*$/.exec(raw);
    if (!match) return 750; // stylesheet not loaded yet or property missing
    const value = parseFloat(match[1]);
    return match[2] === "ms" ? value : value * 1000;
  }

  // Schedule the warm<->cool flip after the show-delay. A hover/leave in the other
  // direction before it fires cancels it (clearTimer), and an already-matching state is
  // a no-op.
  function scheduleTooltipWarm(warm) {
    tooltipTimer = clearTimer(tooltipTimer);
    if (tooltipWarm === warm) return;
    tooltipTimer = setTimeout(function () {
      tooltipWarm = warm;
      if (warm) els.root.setAttribute("data-tooltip-warm", "true");
      else els.root.removeAttribute("data-tooltip-warm");
      tooltipTimer = null;
    }, getTooltipDelayMs());
  }

  function onTooltipEnter() {
    scheduleTooltipWarm(true);
  }

  function onTooltipLeave() {
    scheduleTooltipWarm(false);
  }

  // On a move to a new edge (see setPosition) the old position's warm state shouldn't
  // carry over.
  function resetTooltipWarmState() {
    tooltipTimer = clearTimer(tooltipTimer);
    tooltipWarm = false;
    els.root.removeAttribute("data-tooltip-warm");
  }

  // Shortcut gets its own span (not folded into the label) so it can carry separate
  // opacity/monospace styling — see .p5toolbar__tooltip-shortcut in the CSS.
  function buildTooltip(label, shortcut) {
    const tooltip = document.createElement("span");
    tooltip.className = "p5toolbar__tooltip";

    const labelEl = document.createElement("span");
    labelEl.className = "p5toolbar__tooltip-label";
    labelEl.textContent = label;
    tooltip.appendChild(labelEl);

    if (shortcut) {
      const shortcutEl = document.createElement("span");
      shortcutEl.className = "p5toolbar__tooltip-shortcut";
      shortcutEl.textContent = formatShortcut(shortcut);
      tooltip.appendChild(shortcutEl);
    }

    return tooltip;
  }

  // ---------------------------------------------------------------------------------
  // Buttons & widgets
  // ---------------------------------------------------------------------------------

  function makeButton(opts) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "p5toolbar__btn";
    btn.setAttribute("aria-label", accessibleLabel(opts.label, opts.shortcut));
    btn.innerHTML = opts.icon;
    btn.appendChild(buildTooltip(opts.label, opts.shortcut));
    btn.addEventListener("click", opts.onClick);
    btn.addEventListener("mouseenter", onTooltipEnter);
    btn.addEventListener("mouseleave", onTooltipLeave);
    btn.addEventListener("focus", onTooltipEnter);
    btn.addEventListener("blur", onTooltipLeave);
    return btn;
  }

  // Widget icon/label is either a fixed string or an { off, on } pair; a toggle widget
  // shows the pair member for its current state.
  function resolveStateful(value, active) {
    if (value && typeof value === "object") {
      return active ? value.on : value.off;
    }
    return value;
  }

  // Reflect a toggle widget's on/off state on its button — icon, label, ARIA, tooltip.
  function renderToggle(btn, def, active) {
    btn.setAttribute("aria-pressed", String(active));
    btn.querySelector("svg").outerHTML = resolveStateful(def.icon, active);
    const label = resolveStateful(def.label, active);
    btn.setAttribute("aria-label", accessibleLabel(label, def.shortcut));
    btn.querySelector(".p5toolbar__tooltip-label").textContent = label;
  }

  function renderWidget(id, def) {
    const ctx = {
      canvas: canvasEl,
      sketchName: state.config.sketchName,
      setCursor: function (value) {
        setCursorIntent(id, value);
      },
      clearCursor: function () {
        clearCursorIntent(id);
      },
      storage: {
        get: function (key, fallback) {
          return storage.get(state.config.sketchName, "widget:" + id + ":" + key, fallback);
        },
        set: function (key, value) {
          storage.set(state.config.sketchName, "widget:" + id + ":" + key, value);
        },
      },
    };

    const isToggle = def.type === "toggle";
    // With persist:true, a toggle widget remembers its on/off state per sketch. A
    // restored "on" state is replayed below, after the button is in the DOM.
    const persist = isToggle && def.persist === true;
    let active = persist && !!ctx.storage.get("active", false);

    const btn = makeButton({
      icon: resolveStateful(def.icon, active),
      label: resolveStateful(def.label, active),
      shortcut: def.shortcut,
      onClick: function () {
        if (isToggle) {
          active = !active;
          renderToggle(btn, def, active);
          if (persist) ctx.storage.set("active", active);
          def.onToggle(active, ctx);
        } else {
          def.onActivate(ctx);
        }
      },
    });
    if (isToggle) renderToggle(btn, def, active);

    if (def.shortcut) {
      window.addEventListener("keydown", function (e) {
        if (isTypingInField() || !matchesShortcut(e, def.shortcut)) return;
        btn.click();
      });
    }

    widgetButtons[id] = btn;
    els.widgets.appendChild(btn);

    // Replay a persisted "on" state. Safe inline: widgets render in config order, so any
    // earlier widget this one's setCursor would click off already exists, and later ones
    // haven't registered a cursor intent yet.
    if (active) {
      def.onToggle(true, ctx);
    }
  }

  function renderWidgets() {
    els.widgets.innerHTML = "";
    (state.config.widgets || []).forEach(function (name) {
      const def = registry[name];
      if (!def) {
        log.warn(
          'Widget "' +
            name +
            '" is not registered — skipping. ' +
            "Register it with P5Toolbar.registerWidget() before calling init(), or remove it from the widgets list."
        );
        return;
      }
      renderWidget(name, def);
    });
  }

  // ---------------------------------------------------------------------------------
  // Shell assembly
  // ---------------------------------------------------------------------------------

  function buildShell() {
    const root = document.createElement("div");
    root.className = "p5toolbar";

    const widgets = document.createElement("div");
    widgets.className = "p5toolbar__widgets";

    const divider = document.createElement("div");
    divider.className = "p5toolbar__divider";

    const shellControls = document.createElement("div");
    shellControls.className = "p5toolbar__shell-controls";

    const themeBtn = makeButton({
      icon: ICONS.moon,
      label: LABELS.theme,
      onClick: toggleTheme,
    });
    const positionBtn = makeButton({
      icon: ICONS.positions[state.position],
      label: LABELS.position,
      onClick: cyclePosition,
    });
    const hideBtn = makeButton({
      icon: ICONS.eye,
      label: LABELS.hide,
      shortcut: HIDE_SHORTCUT,
      onClick: toggleVisibility,
    });

    shellControls.appendChild(themeBtn);
    shellControls.appendChild(positionBtn);
    shellControls.appendChild(hideBtn);

    root.appendChild(widgets);
    root.appendChild(divider);
    root.appendChild(shellControls);

    document.body.appendChild(root);
    containSketchEvents(root);

    els.root = root;
    els.widgets = widgets;
    els.shellControls = shellControls;
    els.themeBtn = themeBtn;
    els.positionBtn = positionBtn;
    els.hideBtn = hideBtn;
  }

  // ---------------------------------------------------------------------------------
  // Built-in widget: hide cursor — registered the same way a third-party widget would be.
  // ---------------------------------------------------------------------------------

  const CURSOR_SHORTCUT = { code: "KeyC", shiftKey: true };

  registerWidget("hideCursor", {
    icon: ICONS.cursor,
    label: LABELS.hideCursor,
    type: "toggle",
    shortcut: CURSOR_SHORTCUT,
    onToggle: function (active, ctx) {
      if (active) {
        ctx.setCursor("none");
        // The cursor vanishing over the canvas is disorienting if it wasn't deliberate,
        // and the button is hard to re-aim at once it's gone — point at the shortcut.
        log.info(
          "The cursor is hidden. Press " +
            formatShortcut(CURSOR_SHORTCUT) +
            " to show it."
        );
      } else {
        ctx.clearCursor();
      }
    },
  });

  // ---------------------------------------------------------------------------------
  // Built-in widget: grid overlay.
  //
  // .p5toolbar-grid and .p5toolbar-grid-readout are document.body children, not
  // descendants of .p5toolbar — .p5toolbar's own transform would become the containing
  // block for their position:fixed at any depth, breaking the canvas-relative math.
  // .p5toolbar's z-index still renders it above both regardless of DOM order.
  // ---------------------------------------------------------------------------------

  const GRID_SIZE_PX = 50; // not configurable

  let gridOverlayEl = null;
  let gridReadoutEl = null;
  let gridCoordsEl = null;
  let gridRafId = null;
  let gridInverted = false;
  let gridCtx = null; // set while the grid is on, so toggleGridInvert can persist
  let gridResizeObserver = null;
  let gridResizeHandler = null;

  function syncGridRect() {
    if (!gridOverlayEl || !gridReadoutEl || !canvasEl) return;
    const rect = canvasEl.getBoundingClientRect();
    gridOverlayEl.style.left = rect.left + "px";
    gridOverlayEl.style.top = rect.top + "px";
    gridOverlayEl.style.width = rect.width + "px";
    gridOverlayEl.style.height = rect.height + "px";
    gridReadoutEl.style.left = rect.left + rect.width / 2 + "px";
    gridReadoutEl.style.top = rect.top + rect.height / 2 + "px";
  }

  function gridFrameLoop() {
    if (!gridCoordsEl) return;
    gridCoordsEl.textContent =
      Math.round(window.mouseX) + ", " + Math.round(window.mouseY);
    gridRafId = requestAnimationFrame(gridFrameLoop);
  }

  // Escape hatch for mix-blend-mode:difference's contrast blind spot near mid-gray
  // backgrounds — see the color choice in p5.toolbar.css for the math.
  function toggleGridInvert() {
    gridInverted = !gridInverted;
    gridOverlayEl.dataset.inverted = String(gridInverted);
    if (gridCtx) gridCtx.storage.set("inverted", gridInverted);
    const btn = gridReadoutEl.querySelector(".p5toolbar-grid-readout__invert");
    btn.setAttribute("aria-pressed", String(gridInverted));
    // Half-turn the icon so its filled half swaps sides, matching the toggle state.
    btn.querySelector("svg").style.transform = gridInverted ? "rotate(180deg)" : "";
  }

  function buildGrid(ctx) {
    ctx.setCursor("crosshair");
    gridCtx = ctx;
    gridInverted = !!ctx.storage.get("inverted", false);

    gridOverlayEl = document.createElement("div");
    gridOverlayEl.className = "p5toolbar-grid";
    gridOverlayEl.dataset.inverted = String(gridInverted);
    gridOverlayEl.style.setProperty("--p5toolbar-grid-size", GRID_SIZE_PX + "px");

    gridReadoutEl = document.createElement("div");
    gridReadoutEl.className = "p5toolbar-grid-readout";

    gridCoordsEl = document.createElement("span");
    gridCoordsEl.className = "p5toolbar-grid-readout__coords";
    gridReadoutEl.appendChild(gridCoordsEl);

    const invertBtn = document.createElement("button");
    invertBtn.type = "button";
    invertBtn.className = "p5toolbar-grid-readout__invert";
    invertBtn.setAttribute("aria-pressed", String(gridInverted));
    invertBtn.setAttribute("aria-label", "Invert grid line color");
    invertBtn.innerHTML = ICONS.invert;
    if (gridInverted) {
      invertBtn.querySelector("svg").style.transform = "rotate(180deg)";
    }
    invertBtn.addEventListener("click", toggleGridInvert);
    gridReadoutEl.appendChild(invertBtn);

    document.body.appendChild(gridOverlayEl);
    document.body.appendChild(gridReadoutEl);
    // The overlay is pointer-events:none, so only the readout can take a click that
    // would otherwise fall through to the sketch.
    containSketchEvents(gridReadoutEl);

    syncGridRect();
    gridResizeHandler = syncGridRect;
    window.addEventListener("resize", gridResizeHandler);
    window.addEventListener("scroll", gridResizeHandler, { passive: true });
    gridResizeObserver = new ResizeObserver(syncGridRect);
    gridResizeObserver.observe(canvasEl);

    gridRafId = requestAnimationFrame(gridFrameLoop);
  }

  function teardownGrid(ctx) {
    ctx.clearCursor();

    if (gridRafId) cancelAnimationFrame(gridRafId);
    if (gridResizeObserver) gridResizeObserver.disconnect();
    if (gridResizeHandler) {
      window.removeEventListener("resize", gridResizeHandler);
      window.removeEventListener("scroll", gridResizeHandler);
    }
    if (gridOverlayEl) gridOverlayEl.remove();
    if (gridReadoutEl) gridReadoutEl.remove();

    gridRafId = null;
    gridResizeObserver = null;
    gridResizeHandler = null;
    gridOverlayEl = null;
    gridReadoutEl = null;
    gridCoordsEl = null;
    gridCtx = null;
  }

  registerWidget("grid", {
    icon: ICONS.grid,
    label: LABELS.grid,
    type: "toggle",
    persist: true,
    shortcut: { code: "KeyG", shiftKey: true },
    onToggle: function (active, ctx) {
      if (active) buildGrid(ctx);
      else teardownGrid(ctx);
    },
  });

  // ---------------------------------------------------------------------------------
  // Hidden-toolbar toast — a visual counterpart to the log.info in startToolbar, for
  // when the dev console isn't open. Shown only if the toolbar loads hidden AND no
  // toolbar has initialised in the last TOAST_MIN_GAP_MS, so a quick run / re-run cycle
  // (where the user plainly knows it's off) stays quiet. Styling and its fixed
  // top-centre placement come from .p5toolbar-toast in p5.toolbar.css.
  // ---------------------------------------------------------------------------------

  const TOAST_MIN_GAP_MS = 15 * 60 * 1000;
  const TOAST_VISIBLE_MS = 7500;
  const TOAST_FADE_MS = 200; // keep in sync with the opacity transition in the CSS

  let toastEl = null;
  let toastHideTimer = null;

  function showHiddenToast() {
    dismissHiddenToast();

    const el = document.createElement("div");
    el.className = "p5toolbar-toast";
    el.setAttribute("role", "status");

    const title = document.createElement("strong");
    title.className = "p5toolbar-toast__title";
    title.textContent = "p5.toolbar is hidden";

    const shortcut = document.createElement("span");
    shortcut.className = "p5toolbar-toast__shortcut";
    shortcut.textContent = formatShortcut(HIDE_SHORTCUT);

    el.append(title, "Press ", shortcut, " to show it");
    document.body.appendChild(el);
    toastEl = el;

    void el.offsetWidth; // commit the opacity:0 start state so the next line transitions
    el.dataset.shown = "true";

    toastHideTimer = setTimeout(dismissHiddenToast, TOAST_VISIBLE_MS);
  }

  function dismissHiddenToast() {
    toastHideTimer = clearTimer(toastHideTimer);
    if (!toastEl) return;
    const el = toastEl;
    toastEl = null;
    el.dataset.shown = "false";
    setTimeout(function () {
      el.remove();
    }, TOAST_FADE_MS);
  }

  // ---------------------------------------------------------------------------------
  // Startup — runs once the canvas exists (see init below). Builds the shell, restores
  // persisted chrome state, renders the widgets, and binds the global shortcut.
  // ---------------------------------------------------------------------------------

  function startToolbar(canvas) {
    canvasEl = canvas;
    buildShell();

    const savedPosition = storage.get(null, "position", state.config.position);
    setPosition(
      POSITIONS.indexOf(savedPosition) !== -1 ? savedPosition : state.config.position,
      false
    );

    const savedTheme = storage.get(null, "theme", null);
    if (savedTheme === "light" || savedTheme === "dark") {
      state.themeOverridden = true;
      state.theme = savedTheme;
    }
    applyTheme();
    bindThemeMediaQuery();

    const savedVisible = storage.get(null, "visible", true);
    setVisible(savedVisible, false);

    // "lastInit" is global (every sketch, every run) and only gates the toast below.
    const now = Date.now();
    const lastInit = storage.get(null, "lastInit", 0);
    storage.set(null, "lastInit", now);

    if (!savedVisible) {
      // Logged on every run so a user who forgot the toolbar is toggled off (visibility
      // persists globally) isn't left wondering why it never appeared.
      log.info(
        "The toolbar is hidden. Press " +
          formatShortcut(HIDE_SHORTCUT) +
          " to show it."
      );
      if (now - lastInit >= TOAST_MIN_GAP_MS) {
        showHiddenToast();
      }
    }

    renderWidgets();
    bindShortcut();

    // By now every restore above has touched storage, so storage.ok is settled.
    if (!storage.ok) {
      log.debug(
        "localStorage isn't available — the toolbar won't remember its position, " +
          "theme, or per-sketch widget state. (Private browsing, or site data disabled?)"
      );
    }
  }

  // ---------------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------------

  function init(config) {
    // p5 defines this the moment it loads. If it's missing, either the p5.js <script>
    // tag isn't on the page or it's placed after this one — nothing the toolbar does
    // will work, so stop here rather than sit on a canvas that never arrives.
    if (typeof window.p5 === "undefined") {
      log.error(
        "p5.js isn't loaded. Add its <script> tag before p5.toolbar's, then reload."
      );
      return;
    }

    config = config || {};
    state.config = {
      position: config.position || "left",
      widgets: config.widgets || ["grid", "hideCursor"],
      sketchName: config.sketchName || null,
      // Friendly by default: stay quiet about failures a student can't fix. Set false to
      // also log those (localStorage blocked, stylesheet missing) via log.debug().
      friendly: config.friendly !== false,
    };

    injectStylesheet();
    waitForCanvas(startToolbar);
  }

  window.P5Toolbar = {
    init: init,
    registerWidget: registerWidget,
  };
})();
