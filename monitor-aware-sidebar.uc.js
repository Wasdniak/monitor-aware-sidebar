// Monitor-Aware Sidebar: each window puts Zen's sidebar on the side that matches its monitor.
// Left monitor -> sidebar on the left, right monitor -> sidebar on the right.
//
// Zen reads the global pref zen.tabs.vertical.right-side in every window, so flipping it would
// move every window at once. Instead this shadows the two per-window copies of that answer:
//   gZenVerticalTabsManager._prefsRightSide   (layout, attributes, window buttons)
//   gZenCompactModeManager._sidebarIsOnRight  (compact-mode hover edge and slide animation)
// and asks the vertical tabs manager to re-run its layout when the window changes monitor.
(() => {
  const PREFIX = "sine.monitor-aware-sidebar.";
  const PREF_ENABLED = PREFIX + "enabled";   // bool, default true
  const PREF_MODE = PREFIX + "mode";         // "auto" | "boundary"
  const PREF_BOUNDARY = PREFIX + "boundary"; // number: monitor left edge >= this -> right side
  const PREF_APPLY = PREFIX + "apply";       // "always" | "compact" (only while in compact mode)
  const SETTINGS = [PREF_ENABLED, PREF_MODE, PREF_BOUNDARY, PREF_APPLY];
  const GLOBAL_PREF = "zen.tabs.vertical.right-side";
  const MENU_ITEM_ID = "zen-toolbar-context-tabs-right";
  const POLL_MS = 400; // chrome windows get no "moved" event; reading screen.left is cheap
  const TAG = "[MonitorSide]";

  // gZenVerticalTabsManager.init() defines _prefsRightSide itself, so the override has to go in
  // after it has run, or Zen would overwrite it.
  if (window.gBrowserInit?.delayedStartupFinished) {
    start();
  } else {
    const obs = subject => {
      if (subject !== window) return;
      Services.obs.removeObserver(obs, "browser-delayed-startup-finished");
      start();
    };
    Services.obs.addObserver(obs, "browser-delayed-startup-finished");
  }

  function start() {
    const mgr = window.gZenVerticalTabsManager;
    const compact = window.gZenCompactModeManager;
    if (!mgr || typeof mgr._updateEvent !== "function") {
      console.warn(TAG, "gZenVerticalTabsManager not found; Zen internals may have changed.");
      return;
    }

    // Sine stores "string" prefs as numbers or strings depending on what was typed, so read any type.
    function readPref(name, fallback) {
      const p = Services.prefs;
      switch (p.getPrefType(name)) {
        case p.PREF_BOOL: return p.getBoolPref(name);
        case p.PREF_INT: return p.getIntPref(name);
        case p.PREF_STRING: return p.getStringPref(name);
        default: return fallback;
      }
    }
    const enabled = () => readPref(PREF_ENABLED, true) !== false;
    const globalRight = () => Services.prefs.getBoolPref(GLOBAL_PREF, false);

    // ---- Monitor layout -------------------------------------------------------------------------

    const screenMgr = Cc["@mozilla.org/gfx/screenmanager;1"].getService(Ci.nsIScreenManager);

    function rectOf(s) {
      const l = {}, t = {}, w = {}, h = {};
      s.GetRectDisplayPix(l, t, w, h);
      return { left: l.value, top: t.value, width: w.value, height: h.value };
    }

    // nsIScreenManager has no list of screens, so find them by asking which screen owns points on a
    // coarse grid. Points off every screen return the primary screen, which dedupes away. Only runs
    // when this window lands on a monitor it hasn't seen before.
    function findScreens() {
      const seen = new Map();
      const add = s => {
        const r = rectOf(s);
        seen.set(`${r.left},${r.top},${r.width},${r.height}`, r);
      };
      add(screenMgr.primaryScreen);
      for (let x = -16384; x <= 16384; x += 256) {
        for (let y = -8192; y <= 8192; y += 512) {
          add(screenMgr.screenForRect(x, y, 1, 1));
        }
      }
      return [...seen.values()];
    }

    let screens = null;

    // true = right, false = left, null = no opinion (use Zen's own setting).
    function sideForCurrentScreen() {
      const cur = { left: window.screen.left, width: window.screen.width };

      if (readPref(PREF_MODE, "auto") === "boundary") {
        return cur.left >= Number(readPref(PREF_BOUNDARY, 0));
      }

      const match = list => list.find(r => Math.abs(r.left - cur.left) <= 2 && Math.abs(r.width - cur.width) <= 2);
      let mine = screens && match(screens);
      if (!mine) {
        screens = findScreens();
        mine = match(screens) || cur;
      }
      if (screens.length < 2) return null;

      const minLeft = Math.min(...screens.map(r => r.left));
      const maxRight = Math.max(...screens.map(r => r.left + r.width));
      const middle = (minLeft + maxRight) / 2;
      const center = mine.left + mine.width / 2;
      // A monitor in the middle of three (or one spanning both halves) keeps Zen's setting.
      if (Math.abs(center - middle) < mine.width * 0.1) return null;
      return center > middle;
    }

    // ---- Per-window override --------------------------------------------------------------------

    let perWindow = null; // null until the first check
    // In "compact" mode the monitor only decides while this window is in compact mode. Zen sets
    // the zen-compact-mode attribute and then re-runs the layout (ZenCompactMode:LayoutUpdate)
    // on every toggle, so reading it live here is enough; no toggle listener needed.
    const compactOnly = () => readPref(PREF_APPLY, "always") === "compact";
    const active = () => enabled() && (!compactOnly() || !!compact?.preference);
    const effective = () => (active() && perWindow !== null ? perWindow : globalRight());

    const ownDesc = (obj, key) => (obj ? Object.getOwnPropertyDescriptor(obj, key) : undefined);
    const savedMgrDesc = ownDesc(mgr, "_prefsRightSide");
    const savedCompactDesc = ownDesc(compact, "_sidebarIsOnRight");

    try {
      Object.defineProperty(mgr, "_prefsRightSide", { configurable: true, enumerable: true, get: effective });
    } catch (e) {
      console.error(TAG, "Can't override _prefsRightSide; mod disabled.", e);
      return;
    }
    if (compact) {
      // Compact mode caches the global pref here and refreshes it from a pref observer.
      // Swallow those writes and always answer with this window's side.
      Object.defineProperty(compact, "_sidebarIsOnRight", { configurable: true, get: effective, set() {} });
    }

    // While the mod always decides the side, the "Tabs on the right" toolbar menu item would only
    // change the fallback, which is confusing. Hide it. In compact-only mode it still picks the
    // side outside compact mode, so keep it.
    function syncMenuItem() {
      const item = document.getElementById(MENU_ITEM_ID);
      if (item) item.hidden = enabled() && !compactOnly();
    }

    let lastKey = null;
    function check(force = false) {
      if (!enabled()) return;
      const key = `${window.screen.left},${window.screen.top},${window.screen.width}`;
      if (!force && key === lastKey) return;
      lastKey = key;

      const before = effective();
      perWindow = sideForCurrentScreen();
      const after = effective();
      if (force || after !== before) {
        console.log(TAG, `monitor left edge = ${window.screen.left}, sidebar -> ${after ? "right" : "left"}` +
          (perWindow === null ? " (Zen's setting)" : ""));
        relayout();
      }
    }

    // _updateEvent() ignores calls made while it is already running, and it dispatches a resize
    // partway through, which lands in check() above. In compact mode a window move runs exactly
    // that path: Zen lays out with the old side, our nested call is dropped, and the side lags
    // one move behind. So always re-lay out from a fresh task, once Zen's pass has finished.
    let relayoutTimer = 0;
    function relayout() {
      if (relayoutTimer) return;
      relayoutTimer = setTimeout(function run() {
        if (mgr._isUpdating) {
          relayoutTimer = setTimeout(run, 16);
          return;
        }
        relayoutTimer = 0;
        mgr._updateEvent();
      }, 0);
    }

    const onMoveish = () => check();
    const onSettingsChanged = () => {
      screens = null;
      syncMenuItem();
      if (enabled()) check(true);
      else relayout(); // fall back to Zen's setting right away
    };

    const timer = setInterval(onMoveish, POLL_MS);
    window.addEventListener("resize", onMoveish);
    window.addEventListener("activate", onMoveish);
    for (const p of SETTINGS) Services.prefs.addObserver(p, onSettingsChanged);

    function teardown() {
      clearInterval(timer);
      clearTimeout(relayoutTimer);
      relayoutTimer = 0;
      window.removeEventListener("resize", onMoveish);
      window.removeEventListener("activate", onMoveish);
      for (const p of SETTINGS) Services.prefs.removeObserver(p, onSettingsChanged);
    }

    window.addEventListener("unload", teardown, { once: true });

    // Sine disable: put Zen's own getters back and re-lay out from the global pref.
    window.addUnloadListener?.(() => {
      teardown();
      delete mgr._prefsRightSide;
      if (savedMgrDesc) Object.defineProperty(mgr, "_prefsRightSide", savedMgrDesc);
      else Object.defineProperty(mgr, "_prefsRightSide", { configurable: true, enumerable: true, get: globalRight });
      if (compact) {
        delete compact._sidebarIsOnRight;
        if (savedCompactDesc) Object.defineProperty(compact, "_sidebarIsOnRight", savedCompactDesc);
        compact._sidebarIsOnRight = globalRight();
      }
      const item = document.getElementById(MENU_ITEM_ID);
      if (item) item.hidden = false;
      mgr._updateEvent();
    });

    syncMenuItem();
    check(true);
  }
})();
