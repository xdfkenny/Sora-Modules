# AGENTS.md — xdfkenny-sora-modules

## Project

Curated Sora/Luna/Shirox scraper modules (anime/movies/manga/novels/torrents). No build step, no npm, no bundler. Each module = one `*.json` manifest + one self-contained `*.js` scraper. Registry: `modules.json:1`. Docs: `SORA_MODULES_GUIDE.md:1`, `documentation/`.

## Repo layout

```
<module>/           # e.g. henaojara/, anidb/, hydrahd/, comix/, torrentio/, yfsp/, allmanga-novels/
  <module>.json     # manifest — metadata + scriptUrl
  <module>.js       # scraper — single file, no imports
modules.json        # global index consumed by modules.js + server.js (per-entry `updated` = last-modified date)
refresh-updated.js  # helper: regenerates every `updated` field in modules.json from git history
server.js           # status/test harness (Node)
index.html + script.js     # home page — topbar/hero landing ('/')
modules/index.html + modules.js  # full module library ('/modules')
styles.css                  # shared design system (both pages)
cufiy-bridge.json           # cufiy modules we verified working → bridge buttons (see "Cufiy bridge")
cufiy-test/               # gitignored scratch harness that produces cufiy-bridge.json
documentation/      # Howtotest.md, NovelModules.md, SUBTITLES.md, etc.
test/               # harness snapshots: hydrahd-copy/, stremio-subs-test/
*.patch             # Luna/Kanzen reader fixes (reference only)
```

Multi-manifest module: `hydrahd/` has `hydrahd.json` + `hydrahd-shirox.json` sharing resolvers.

## Runtime constraints (will crash in-app if violated)

Host runs bare **JavaScriptCore/QuickJS** — `SORA_MODULES_GUIDE.md:13`. Hard rules:

- No `document`, `window`, `DOMParser`, `XMLHttpRequest`, `localStorage`, `require`/`import`.
- No `setTimeout`/`setInterval` — `ReferenceError` in-app. Guard or polyfill (`documentation/HowtotestNovels.md:119`). `hydrahd/hydrahd.js:20` shows `Promise.allSettled` polyfill pattern.
- All entry points `async function` in global scope, not IIFE: `SORA_MODULES_GUIDE.md:17`.
- Network **must** use `fetchv2(url, headers, method, body)` — browser `fetch` fails (CORS). Wrap per `SORA_MODULES_GUIDE.md:81` (`soraFetch` pattern). `server.js:99` shows how `fetchv2` is shimmed in tests (cookie jar + header filtering).
- Wrap every exported function in `try/catch`, return fallback matching expected type — never throw.
- HTML parsing = regex/`indexOf`/`substring` only (`SORA_MODULES_GUIDE.md:231`).

## Module contracts

**Anime/Movies** (`type: anime`): 4 functions, all `async`, all return `JSON.stringify(...)` (`SORA_MODULES_GUIDE.md:103`):

- `searchResults(keyword)` → `[{title, image, href}]`
- `extractDetails(url)` → `[{description, aliases, airdate}]` (single-element array)
- `extractEpisodes(url)` → `[{href, number}]`
- `extractStreamUrl(url)` → `{streams:[{title, streamUrl, headers?}], subtitles?}` (legacy `[{quality,url}]` also accepted — `server.js:229`)

**Novels** (`type: novels`, `novel:true`, `streamType: novels`, `quality: N/A`): replace episode pair — `documentation/NovelModules.md:1`, `documentation/HowtotestNovels.md:1`:

- `searchResults`, `extractDetails` same shapes as above
- `extractChapters(url)` → `[{title, href, number}]` (`number` integer from 1; fractional like `25.5` stays in `title`)
- `extractText(url)` → **raw HTML string** (not JSON), e.g. `"<p>...</p>"` or `<img>` tags

**Manga** (`type: mangas`): returns raw objects/arrays (NOT stringified), different shapes — see `SORA_MODULES_GUIDE.md:150`.

## Manifest requirements

Fields per `henaojara/henaojara.json:1` and `SORA_MODULES_GUIDE.md:24`. Required: `sourceName`, `author.{name,icon}`, `version`, `language`, `baseUrl`, `searchBaseUrl` (with `%s`), `scriptUrl` (raw `https://raw.githubusercontent.com/.../main/<module>/<module>.js`), `type`, `streamType`, `asyncJS:true`. Register in `modules.json:4` (`id`, `name`, `iconUrl`, `category`, `manifestUrl`, `sampleQuery`). Bump `version` on change.

## Verify modules — `server.js`

Primary test harness — handles both video and novel contracts automatically (`server.js:278`):

```bash
node server.js                          # http://localhost:8765 — click module card → enter keyword → media test
curl -s -X POST http://localhost:8765/api/test \
  -H "Content-Type: application/json" \
  -d '{"id":"henaojara","keyword":"one piece"}'   # video module
curl -s -X POST http://localhost:8765/api/test \
  -H "Content-Type: application/json" \
  -d '{"id":"allmanga-novels","keyword":"angel next door"}'  # novel module
```

- Loads `scriptUrl` from manifest (GitHub raw) — CDN lags minutes after push; check build-marker log line (e.g. `[HydraHD] module script loaded v2.2.1`) before debugging (`documentation/HowtotestNovels.md:48`).
- Uses system `curl` first (passes Cloudflare TLS where Node `fetch` fails), falls back to `fetch` (`server.js:141`). Per-module cookie jar (`server.js:99`).
- Timeouts: 25s per step, 120s total (`server.js:285`). Novel `text.ok` false if fallback HTML (`<p>Error…`) or empty (`server.js:342`).
- Also serves static site + `GET /api/health`.

Quick Node one-liner for novels without server (needs `fetchv2` shim — `documentation/HowtotestNovels.md:57`):

```js
global.fetchv2 = (u,h,m,b) => fetch(u,{method:m, headers:h, body:b});
const src = require('fs').readFileSync('allmanga-novels/allmanga-novels.js','utf8')
  + '\nmodule.exports={searchResults,extractDetails,extractChapters,extractText};';
// require and call JSON.parse(await mod.searchResults(...))
```

`verify.ps1:1` — PowerShell check that `main` serves current `yfsp` script (checks `signStreamUrl` + `YFSP_BUILD` marker).

## Gotchas

- **Referer-locked images**: Sora novel reader uses `loadHTMLString(html, baseURL:nil)` — WebView sends no `Referer`, so CDNs like `aln.youtube-anime.com` return 403 even though browser/curl works. No JS workaround; fix is app-side (`documentation/HowtotestNovels.md:99`, `Sora-ReaderView-baseURL.patch`). Always verify: `curl -s -o /dev/null -w "%{http_code}" <img-url>` with no Referer must be 200.
- **Shirox `fetchv2` sync `.json()`**: some builds return plain object synchronously → `.json().catch` throws. Re-wrap so `.text()`/`.json()` are real promises (`hydrahd/hydrahd.js:37`).
- **OS v3 subtitle path**: series must use `tt{id}:{s}:{e}.json` colon path, not `?season=&episode=` query params (silently ignored, wrong subs) — `documentation/SUBTITLES.md:34`.
- **Episode trust filter**: `test/stremio-subs-test/README.md:2` — polluted s:e mapping requires parsing `SubFileName` and class-ranking verified > unknown > blocked before size.
- **Persisted-query cache**: GraphQL `PersistedQueryNotFound` → re-send query text once (`documentation/HowtotestNovels.md:131`).
- **GitHub raw lag**: after push, wait before testing live URL; edit cached file in `~/Library/Containers/me.cranci.sulfur/Data/Documents/` for fast iteration (`documentation/Howtotest.md:28`).

## Cufiy bridge (verified external modules as cards)

The original Sora library at `library.cufiy.net` is larger than our curated
`modules.json`. We surface its verified-working modules **inside the main
library grid** (`#/library`, rendered by `script.js` `loadCufiyBridge()` /
`renderCufiyCards()`): each becomes a regular `.card` (same format as ours,
with a mint **"Cufiy" origin badge** top-right, an "original library" branch
line, and an **"Open in Cufify" action** that links to
`https://library.cufiy.net/library/?q=<sourceName>` (space as `+`)).
They are **links only** — NOT in `modules.json`, not part of the Sora install,
and they obey the same search / category / sort filters + result count as
our own cards.

- **Existing link (already shipped):** the `lib.sub-note` i18n key (EN/ES in
  `script.js`) already says "You can also browse the original library at
  cufiy.net/library". The cufiy cards are that same reference, made clickable
  per module.
- **Data file:** `cufiy-bridge.json` (committed) = `{modules:[{name,type,language,
  quality,iconUrl,version,author,authorIcon,authorUrl,redirect,tested{...}}]}`.
  Only modules **verified working** by the harness are included; broken/dead
  ones are discarded. NOTE: cufiy's index HTML-escapes some string fields
  (`&amp;`), so `make-bridge.js` unescapes them once before writing — the UI's
  `esc()` must not double-escape.
- **How it's produced:** the gitignored `cufiy-test/` harness downloads every
  module from cufiy's `/api/modules.json`, runs the full Sora contract pipeline
  (search → details → episodes → stream / chapters → text / chapters → images),
  and `cufiy-test/make-bridge.js` merges the passes into `cufiy-bridge.json` +
  `cufiy-test/bridge-report.txt` (included + discarded with reasons).
- **Retest after cufiy changes:** re-run the passes in `cufiy-test/`, then
  `node cufiy-test/make-bridge.js` to regenerate the data file. Re-verify with
  `node server.js` (bridge JSON served at `/cufiy-bridge.json`).
- `AllManga Manga` is included via a curated override (search + 1222 chapters
  verified live; only the image step is gated by the documented aaReq keygen
  limitation, not upstream death) — see `cufiy-test/make-bridge.js` `OVERRIDES`.

## Known dead ends (don't re-investigate)

- `anime-nexus`: streaming is **not fixable in-module** — HLS requires a
  stateful WebSocket token service (`prd-socket.anime.nexus`, namespace
  `/video`) with Turnstile/altcha attestation + AES-GCM wire secret, plus
  **per-segment** tokens; impossible in a fetchv2-only, no-WebSocket runtime
  and unfulfillable by the consumer player. Only self-hosted token proxy works.
  Full evidence: `documentation/anime-nexus-stream-protection.md:1`. Stream
  *metadata* endpoint works with `X-Client-Fingerprint`/`X-Fingerprint` +
  session cookie, but that alone cannot produce a playable m3u8.

## Adding / editing a module

1. Copy `henaojara/henaojara.json` as manifest template or `novel-examples/` for novels.
2. Script: implement contract functions with `soraFetch` wrapper. Check `anidb/anidb.js:13` (simple anime) or `henaojara/henaojara.js:1` (multi-server) as references.
3. Add entry to `modules.json`.
4. After touching a module's files (or its entry in `modules.json`), run `node refresh-updated.js` so the entry's `updated` field matches today — the library page's "Recently Updated" sort and per-card "Updated …" chip read it. Modules whose manifest lives in another repo get `updated: null` and sort last.
5. Test: `node server.js` with ≥2 keywords, verify `stream`/`text` returns real URLs/HTML and images `200` without Referer. Grep for unguarded `setTimeout`/`setInterval` before shipping.
6. Do not edit `test/hydrahd-copy/` (frozen v2.2.1 baseline per `test/README.md:1`) or `*.patch` files.

## Deploy

Push to `main` → FTP deploy via `.github/workflows/deploy.yml:1` to `htdocs/` + `xdfkecraft.qzz.io/htdocs/`. Frontend fetches `modules.json` locally or falls back to `RAW_REPO/main/modules.json` (`script.js:394`).
