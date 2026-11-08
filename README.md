# Monitor-Aware Sidebar

Puts Zen's sidebar on the **left** in windows on your left monitor and on the **right** in windows on your right monitor. Each window decides for itself, so two windows on different monitors can have opposite sides at the same time. Drag a window across and its sidebar follows within half a second.

> **Personal project.** Built for my own setup (Zen + Sine, two monitors side by side). Shared as-is: no support, and it may break when Zen updates. Issues and PRs may not get a response.

This is a JavaScript mod for [Zen Browser](https://zen-browser.app) and needs the [Sine](https://github.com/CosmoCreeper/Sine) mod manager.

## Install

1. Install Sine if you haven't already.
2. In Zen, open **Settings → Sine Mods**, click the gear (**Open settings**) and turn on **Enable installing JS from unofficial sources**. Sine only runs scripts from mods outside its store when this is on.
3. Under the Marketplace, in the **add your own locally from a GitHub repo** box, enter `Wasdniak/monitor-aware-sidebar` and click **Install**.
4. Go to `about:support`, click **Clear startup cache**, and restart Zen.

Sine checks this repo for updates on its own (unless you've turned off auto-updates, or turned off updates for this mod), and you can also check from the Sine Mods page.

## Settings

- **Match the sidebar side to the window's monitor**: turn the mod on or off without uninstalling it. When it's off, Zen's own "Tabs on the right" setting applies again.
- **When to follow the monitor**
  - *Always* (default): every window's sidebar follows its monitor.
  - *Only in compact mode*: a window follows its monitor only while it's in compact mode. Outside compact mode the sidebar uses Zen's own "Tabs on the right" setting, so that menu item stays visible in this mode.
- **How to tell left from right**
  - *Automatic* (default): compares monitor positions. Monitors left of the middle of your desktop get the sidebar on the left, monitors right of it get it on the right. With one monitor, or for the middle monitor of three, Zen's own setting applies.
  - *Manual boundary*: a monitor whose left edge is at or past the number you enter gets the sidebar on the right. The Browser Console (Ctrl+Shift+J) logs `[MonitorSide] monitor left edge = …` whenever a window switches side, which tells you the values to use.

## Notes

- While the mod is on, it hides the toolbar context menu's "Tabs on the right" item, because that item would only change the fallback. The pref (`zen.tabs.vertical.right-side`) still decides the side on a single monitor or the middle one.
- Two small Zen features still read the global pref directly: the download animation and Boosts' panel placement. They may animate toward the wrong side in a window the mod has flipped.

## Releasing an update

Sine only installs an update when `updatedAt` in `theme.json` is newer than the installed copy's. For every release:

1. Bump `version` and set `updatedAt` to the current UTC time (for example `2026-11-08T14:20:05.000Z`) in `theme.json`.
2. Commit and push to `main`.

Sine downloads the whole `main` branch, so anything pushed there goes live on the next update check.

## Changelog

- **1.1.1**: First release from GitHub; no behavior changes.

## License

MIT. See [LICENSE](LICENSE).
