/*!
 * p5.toolbar — v0 (shell)
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
  // Labels — centralized so localization is a find-and-swap later, not a rewrite.
  // ---------------------------------------------------------------------------------

  const LABELS = {
    theme: "Toggle theme",
    position: "Reposition toolbar",
    hide: "Hide toolbar",
    hideCursor: { off: "Hide cursor", on: "Show cursor" },
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

  // Both states keep the stroke outline — "on" just adds a fill on top — so the
  // silhouette's outer edge doesn't shift size when toggling.
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

  // Position icon — rounded-rect frame with one edge's middle third filled, matching the
  // current edge. Swapped by updatePositionButton().
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
  // Storage — namespaced localStorage helper (p5toolbar:{sketchName}:{key}). See
  // AGENTS.md: the Web Editor preview iframe shares one origin across sketches, so
  // unnamespaced keys would leak state between unrelated sketches.
  // ---------------------------------------------------------------------------------

  const storage = {
    key: function (sketchName, key) {
      return "p5toolbar:" + (sketchName || "default") + ":" + key;
    },
    get: function (sketchName, key, fallback) {
      try {
        const raw = window.localStorage.getItem(storage.key(sketchName, key));
        return raw === null ? fallback : JSON.parse(raw);
      } catch (e) {
        return fallback;
      }
    },
    set: function (sketchName, key, value) {
      try {
        window.localStorage.setItem(storage.key(sketchName, key), JSON.stringify(value));
      } catch (e) {
        // localStorage unavailable (private mode, quota) — non-critical, degrade silently.
      }
    },
  };

  // ---------------------------------------------------------------------------------
  // Cursor-state resolver — widgets declare intent, this is the only code that writes
  // canvas.style.cursor. Priority: earlier entries win over later ones.
  // ---------------------------------------------------------------------------------

  const CURSOR_PRIORITY = ["none", "crosshair"];
  const cursorIntents = new Map();
  let canvasEl = null;

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

  function setCursorIntent(widgetId, value) {
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
  // Shell
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

  const els = {};

  function injectStylesheet() {
    if (document.getElementById("p5toolbar-styles")) return;
    const href = scriptSrc ? new URL("p5.toolbar.css", scriptSrc).href : "p5.toolbar.css";
    const link = document.createElement("link");
    link.id = "p5toolbar-styles";
    link.rel = "stylesheet";
    link.href = href;
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
    // documentElement instead of body — body may not exist yet on some hosts (e.g. Web Editor).
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  function resolveEffectiveTheme() {
    if (state.themeOverridden) return state.theme;
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }

  function updateThemeButton() {
    els.themeBtn.querySelector("svg").outerHTML =
      state.theme === "dark" ? ICONS.sun : ICONS.moon;
  }

  function applyTheme() {
    state.theme = resolveEffectiveTheme();
    els.root.dataset.theme = state.theme;
    updateThemeButton();
  }

  function toggleTheme() {
    // Session-only, deliberately never persisted — next load always starts from OS preference.
    state.themeOverridden = true;
    state.theme = state.theme === "dark" ? "light" : "dark";
    els.root.dataset.theme = state.theme;
    updateThemeButton();
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
      // Global, not per-sketch — this is a toolbar chrome preference, not sketch data.
      storage.set(null, "position", pos);
    }
  }

  function cyclePosition() {
    const idx = POSITIONS.indexOf(state.position);
    setPosition(POSITIONS[(idx + 1) % POSITIONS.length]);
  }

  function setVisible(visible, persist) {
    state.visible = visible;
    if (visible) {
      els.root.removeAttribute("hidden");
    } else {
      els.root.setAttribute("hidden", "");
    }
    if (persist !== false) {
      storage.set(null, "visible", visible); // global, same reasoning as setPosition above
    }
  }

  function toggleVisibility() {
    setVisible(!state.visible);
  }

  // Shared guard for every keyboard shortcut below — never fire while a student is
  // typing into their own createInput() field or similar.
  function isTypingInField() {
    const active = document.activeElement;
    const tag = active && active.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || (active && active.isContentEditable);
  }

  const HIDE_SHORTCUT = { code: "KeyT", shiftKey: true };

  function bindShortcut() {
    window.addEventListener("keydown", function (e) {
      if (isTypingInField() || !matchesShortcut(e, HIDE_SHORTCUT)) return;
      toggleVisibility();
    });
  }

  // Exact modifier match (not just "shiftKey is down"), so e.g. Shift+C won't also fire
  // on Cmd/Ctrl+Shift+C — which browsers use for devtools inspect-element.
  function matchesShortcut(e, shortcut) {
    if (!shortcut || e.code !== shortcut.code) return false;
    return (
      e.shiftKey === !!shortcut.shiftKey &&
      e.ctrlKey === !!shortcut.ctrlKey &&
      e.altKey === !!shortcut.altKey &&
      e.metaKey === !!shortcut.metaKey
    );
  }

  // Every OS names this key differently — avoid hardcoding "Cmd".
  function metaKeyLabel() {
    const info = ((navigator.platform || "") + " " + (navigator.userAgent || "")).toLowerCase();
    if (info.indexOf("mac") !== -1) return "Cmd";
    if (info.indexOf("win") !== -1) return "Win";
    return "Meta";
  }

  // "KeyC" -> "C" for the compact chip shown in the tooltip and appended to aria-label.
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

  // Tooltip warm-state — the first tooltip in a "session" waits out the full CSS
  // show-delay (see p5.toolbar.css), but moving directly to another button shortly
  // after should feel instant, like most native tooltip groups.
  let tooltipWarm = false;
  let tooltipTimer = null;

  // Reads --p5toolbar-tooltip-delay from the CSS rather than hardcoding a duplicate
  // number here, so the "warm" handoff timing can never drift out of sync with the
  // actual show-delay — change the delay in p5.toolbar.css only.
  function getTooltipDelayMs() {
    const raw = getComputedStyle(els.root).getPropertyValue("--p5toolbar-tooltip-delay");
    const match = /^\s*(-?[\d.]+)(m?s)\s*$/.exec(raw);
    if (!match) return 750; // stylesheet not loaded yet or property missing — safe fallback
    const value = parseFloat(match[1]);
    return match[2] === "ms" ? value : value * 1000;
  }

  // Called whenever the toolbar moves to a new edge (see setPosition) — a warm/cooling
  // state from the old position shouldn't carry over to the new one.
  function resetTooltipWarmState() {
    if (tooltipTimer) {
      clearTimeout(tooltipTimer);
      tooltipTimer = null;
    }
    tooltipWarm = false;
    els.root.removeAttribute("data-tooltip-warm");
  }

  function onTooltipEnter() {
    if (tooltipTimer) {
      clearTimeout(tooltipTimer);
      tooltipTimer = null;
    }
    if (!tooltipWarm) {
      tooltipTimer = setTimeout(function () {
        tooltipWarm = true;
        els.root.setAttribute("data-tooltip-warm", "true");
        tooltipTimer = null;
      }, getTooltipDelayMs());
    }
  }

  function onTooltipLeave() {
    if (tooltipTimer) {
      clearTimeout(tooltipTimer);
      tooltipTimer = null;
    }
    if (tooltipWarm) {
      tooltipTimer = setTimeout(function () {
        tooltipWarm = false;
        els.root.removeAttribute("data-tooltip-warm");
        tooltipTimer = null;
      }, getTooltipDelayMs());
    }
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

  // Widget icon/label may be a plain string (fixed, e.g. for action-type widgets) or an
  // { off, on } pair for toggle widgets that reflect their current state.
  function resolveStateful(value, active) {
    if (value && typeof value === "object") {
      return active ? value.on : value.off;
    }
    return value;
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
          return storage.get(
            state.config.sketchName,
            "widget:" + id + ":" + key,
            fallback
          );
        },
        set: function (key, value) {
          storage.set(state.config.sketchName, "widget:" + id + ":" + key, value);
        },
      },
    };

    let active = false;
    const btn = makeButton({
      icon: resolveStateful(def.icon, active),
      label: resolveStateful(def.label, active),
      shortcut: def.shortcut,
      onClick: function () {
        if (def.type === "toggle") {
          active = !active;
          btn.setAttribute("aria-pressed", String(active));
          btn.querySelector("svg").outerHTML = resolveStateful(def.icon, active);
          const label = resolveStateful(def.label, active);
          btn.setAttribute("aria-label", accessibleLabel(label, def.shortcut));
          btn.querySelector(".p5toolbar__tooltip-label").textContent = label;
          def.onToggle(active, ctx);
        } else {
          def.onActivate(ctx);
        }
      },
    });
    if (def.type === "toggle") {
      btn.setAttribute("aria-pressed", "false");
    }
    if (def.shortcut) {
      window.addEventListener("keydown", function (e) {
        if (isTypingInField() || !matchesShortcut(e, def.shortcut)) return;
        btn.click();
      });
    }
    els.widgets.appendChild(btn);
  }

  function renderWidgets() {
    els.widgets.innerHTML = "";
    (state.config.widgets || []).forEach(function (name) {
      const def = registry[name];
      if (!def) {
        console.warn(
          '[p5.toolbar] Widget "' +
            name +
            '" is not registered — skipping. ' +
            "Register it with P5Toolbar.registerWidget() before calling init(), or remove it from the widgets list."
        );
        return;
      }
      renderWidget(name, def);
    });
  }

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

  registerWidget("hideCursor", {
    icon: ICONS.cursor,
    label: LABELS.hideCursor,
    type: "toggle",
    shortcut: { code: "KeyC", shiftKey: true },
    onToggle: function (active, ctx) {
      if (active) {
        ctx.setCursor("none");
      } else {
        ctx.clearCursor();
      }
    },
  });

  // ---------------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------------

  function init(config) {
    config = config || {};
    state.config = {
      position: config.position || "left",
      widgets: config.widgets || ["grid", "hideCursor", "saveCanvas", "fullscreen"],
      sketchName: config.sketchName || null,
    };

    injectStylesheet();

    waitForCanvas(function (canvas) {
      canvasEl = canvas;
      buildShell();

      const savedPosition = storage.get(null, "position", state.config.position);
      setPosition(
        POSITIONS.indexOf(savedPosition) !== -1 ? savedPosition : state.config.position,
        false
      );

      applyTheme();
      bindThemeMediaQuery();

      const savedVisible = storage.get(null, "visible", true);
      setVisible(savedVisible, false);

      renderWidgets();
      bindShortcut();
    });
  }

  window.P5Toolbar = {
    init: init,
    registerWidget: registerWidget,
  };
})();
