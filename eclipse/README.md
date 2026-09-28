# eclipse/ — Eclipse-ported copies of the manga & novel modules

Eclipse ([Soupy-dev/Eclipse](https://github.com/Soupy-dev/Eclipse), a fork of
cranci1/Luna with the Kanzen legacy-module runtime) reads these modules through
the **legacy reader-module path** — Settings → Kanzen → "Add Module" → paste the
**manifest URL** below. It does **not** read this repo's `modules.json`; the
original manifests are registered there, these copies are installed directly.

| module | manifest URL (paste into Eclipse "Add Module") |
|---|---|
| comix | `https://raw.githubusercontent.com/xdfkenny/xdfkenny-sora-modules/main/eclipse/comix/comix.json` |
| mangadex | `https://raw.githubusercontent.com/xdfkenny/xdfkenny-sora-modules/main/eclipse/mangadex/mangadex.json` |
| mangabuddy | `https://raw.githubusercontent.com/xdfkenny/xdfkenny-sora-modules/main/eclipse/mangabuddy/mangabuddy.json` |
| mangafire | `https://raw.githubusercontent.com/xdfkenny/xdfkenny-sora-modules/main/eclipse/mangafire/mangafire.json` |
| mangafreak | `https://raw.githubusercontent.com/xdfkenny/xdfkenny-sora-modules/main/eclipse/mangafreak/mangafreak.json` |
| mangakatana | `https://raw.githubusercontent.com/xdfkenny/xdfkenny-sora-modules/main/eclipse/mangakatana/mangakatana.json` |
| mangataro | `https://raw.githubusercontent.com/xdfkenny/xdfkenny-sora-modules/main/eclipse/mangataro/mangataro.json` |
| mangaworld | `https://raw.githubusercontent.com/xdfkenny/xdfkenny-sora-modules/main/eclipse/mangaworld/mangaworld.json` |
| kaliscan | `https://raw.githubusercontent.com/xdfkenny/xdfkenny-sora-modules/main/eclipse/kaliscan/kaliscan.json` |
| rumanhua1 | `https://raw.githubusercontent.com/xdfkenny/xdfkenny-sora-modules/main/eclipse/rumanhua1/rumanhua1.json` |
| scan-sama | `https://raw.githubusercontent.com/xdfkenny/xdfkenny-sora-modules/main/eclipse/scan-sama/scan-sama.json` |
| weebcentral | `https://raw.githubusercontent.com/xdfkenny/xdfkenny-sora-modules/main/eclipse/weebcentral/weebcentral.json` |
| allmanga-novels | `https://raw.githubusercontent.com/xdfkenny/xdfkenny-sora-modules/main/eclipse/allmanga-novels/allmanga-novels.json` |
| chireads | `https://raw.githubusercontent.com/xdfkenny/xdfkenny-sora-modules/main/eclipse/chireads/chireads.json` |
| lightnovelworld | `https://raw.githubusercontent.com/xdfkenny/xdfkenny-sora-modules/main/eclipse/lightnovelworld/lightnovelworld.json` |
| lncrawler | `https://raw.githubusercontent.com/xdfkenny/xdfkenny-sora-modules/main/eclipse/lncrawler/lncrawler.json` |
| novelbuddy | `https://raw.githubusercontent.com/xdfkenny/xdfkenny-sora-modules/main/eclipse/novelbuddy/novelbuddy.json` |
| noveldot | `https://raw.githubusercontent.com/xdfkenny/xdfkenny-sora-modules/main/eclipse/noveldot/noveldot.json` |
| novelfire | `https://raw.githubusercontent.com/xdfkenny/xdfkenny-sora-modules/main/eclipse/novelfire/novelfire.json` |
| readnovelfull | `https://raw.githubusercontent.com/xdfkenny/xdfkenny-sora-modules/main/eclipse/readnovelfull/readnovelfull.json` |
| readnovels | `https://raw.githubusercontent.com/xdfkenny/xdfkenny-sora-modules/main/eclipse/readnovels/readnovels.json` |

> **URLs only work after the commit lands on `main`** — GitHub raw lags a few
> minutes after push. The deploy workflow (`deploy.yml`) also publishes the
> site; Eclipse pulls straight from `raw.githubusercontent.com`, so a normal
> push is enough.

## What a ported copy contains

```
eclipse/<module>/<module>.json   # manifest: scriptUrl → this tree, version + -e1,
                                 # novel:true for the 8 novel modules, supportsEclipse
eclipse/<module>/<module>.js     # [shim prelude] + [original script, verbatim]
```

The prelude (top of every `.js`, ~120 lines, fully guarded) fills the gaps in
Eclipse's bare JSContext so the original script runs **unchanged** in both the
original Sora/Luna/Shirox apps *and* Eclipse:

- `atob` / `btoa` — Eclipse's manga JSContext has no base64 globals (the novel
  env ships its own; the guard leaves host-provided ones untouched).
- `URL` — JSC has no WHATWG `URL` constructor (used by `lncrawler`).
- `console.error` / `warn` / `info` / `debug` — Eclipse's console exposes only
  `.log`; the aliases forward to it.
- `fetch` fallback — the original `soraFetch` wrappers already fall back to
  `fetch(url, options)` when `fetchv2` is absent, which is exactly the shape
  of Eclipse's manga-env fetch (sync `.text()`, sync `.json()`). No
  `.json().then(...)` chains exist anywhere in these scripts, so that
  compatibility holds.

Eclipse routes by the `novel` flag (`MangaCatalogManager` /
`TrackerReaderResolver`): manga modules browse/read through the manga env,
`novel:true` modules through the novel env (`fetchv2` + raw-`fetch(url,
headers)→text`), so each copy runs in the correct runtime here.

## Notes & caveats

- **rumanhua1** has no `extractImages` (pre-existing `needs_review` in
  `modules.json`); the manga reader may show blank pages.
- **allmanga-novels** upstream pages were serving `NEED_CAPTCHA` to
  non-interactive clients as of 2026-09-25 (`needs_review`); also, its
  `soraFetch` passes a 5th `{impersonate:"chrome"}` arg to `fetchv2` — under
  Eclipse that lands in the `redirect` slot, which only matters if the API
  ever redirects.
- **lightnovelworld** — upstream site shut down / merged into chikari.moe;
  expected to fail until fixed upstream.
- **chireads** — search works for most queries; some keywords (e.g. "naruto")
  return the module's built-in `{"title":"Error"}` fallback *in the original
  module too* (upstream issue, not a port issue).
- **mangafire / kaliscan / mangakatana** — search returned no results in
  testing; the original modules behave the same way, so this is
  upstream/parser drift, not a port regression.
- **Referer-locked images**: the Sora reader sends no `Referer`; if a module's
  cover/chapter images 403 in-app while curling fine in a browser, that's the
  known app-side limitation, not something the prelude can fix.

## Test status (2026-09-27)

- All 21 manifests decode with an exact replica of Eclipse's `ModuleData`
  `JSONDecoder` (Swift): **21/21 OK**.
- Node smoke test under both Eclipse shim semantics (manga env: `fetch(url,
  options)` with sync `json()`; novel env: `fetchv2(url, headers, method,
  body)`): manga `searchResults`/`extractChapters` and novel
  `searchResults`/`extractChapters`/`extractText` verified on mangadex,
  lncrawler, scan-sama + full sweep of the other 19 modules — pass except the
  upstream-broken cases above.
