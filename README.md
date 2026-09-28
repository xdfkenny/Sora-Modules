<p align="center"><img src="image_2026-05-20_190629896.png" width="45%" /></p>

<h1 align="center">xdfkenny modules</h1>

<p align="center"><b>Streaming modules for anime, movies, manga and novels.</b></p>

<p align="center">
  <a href="#library">Library</a> •
  <a href="#hosts">Host Apps</a> •
  <a href="#how-it-works">How It Works</a> •
  <a href="#developing">Developing</a> •
  <a href="#documentation">Documentation</a>
</p>

---

## Library

A curated, growing collection of JavaScript scraper modules for Sora, Luna and Shirox — one manifest (`*.json`) plus one self-contained scraper (`*.js`) per module, no build step, no dependencies. The full registry lives in [`modules.json`](modules.json); the web library ([`index.html`](index.html)) hydrates cards live from each manifest so versions, languages and "Recently Updated" chips always reflect reality.

**Current catalog (September 2026):**

| | |
| :--- | :--- |
| **148** registered modules | **108** anime, **40** movies & shows, **18** manga, **8** novels, **3** live, **1** torrent |
| **26** source languages (Chinese, Spanish LAT/SUB, multi SUB/DUB, Tamil, Arabic, …) | **18** discontinued entries kept for history |

Browse and install one-tap from the library site — search by name, category, language or supported app:

- Web library: [xdfkenny.dpdns.org](https://xdfkenny.dpdns.org/xdfkenny-sora-modules/modules/?embed=true) (also deployed to `xdfkecraft.qzz.io/htdocs/`)
- GitHub: [xdfkenny/xdfkenny-sora-modules](https://github.com/xdfkenny/xdfkenny-sora-modules)
- Sora deep link: `sora://default_page?url=<library URL>` — one tap installs the whole set

Highlights:

| Module | What it does | Source |
| :--- | :--- | :--- |
| [HydraHD](hydrahd/hydrahd.json) | Movies & TV in 1080p (EN sub/dub) — embed servers + vidfast.vc HLS/MP4 pipeline | [HydraHD](https://hydrahd.ws/) |
| [AniDB](anidb/anidb.json) | Anime (sub/dub) on the anidb.app backend, with AniLibria HLS fallback so the whole catalog stays playable | [AniDB](https://anidb.app/) |
| [FlixLatam](flixlatam/flixlatam.json) | Movies, series & anime (LAT/SUB) up to 1080p — pure-JS SHA-256 PoW + AES-256-CBC, HLS unpacked from VidHide | [FlixLatam](https://flixlatam.com/) |
| [YFSP](yfsp/yfsp.json) | Movies, series, variety & anime in Chinese via the signed iYifan API (rotating vv+pub MD5 keys) | [YFSP](https://www.yfsp.tv/) |
| [Comix](comix/comix.json) | Comics & manga in English — pure-JS reimplementation of the X-Scramble anti-scraping client | [Comix](https://comix.to/) |
| [AllManga / AllManga Novels](allmanga-novels/allmanga-novels.json) | Manga + novels in English, classic no-impersonation builds; Shirox variants ([`allmanga-shirox`](allmanga-shirox/allmanga-shirox.json), [`allmanga-novels-shirox`](allmanga-novels-shirox/allmanga-novels-shirox.json)) add impersonated fetch with plain-`fetchv2` retry on 4xx | AllManga |
| [AnimeJara](henaojara/henaojara.json) | Feature-rich anime scraper with Spanish LAT localization and multi-server resolution | [AnimeJara](https://animejara.com/) |

> Tip: the library's "Recently Updated" sort (backed by the per-entry `updated` fields in `modules.json`) is the fastest way to see what moved last.

## Host Apps

Modules target the Sora family of hosts. `modules.json` carries per-entry support flags:

- **Sora**, **Luna**, **Shirox** — primary targets
- **Eclipse**, **Hiyoku**, **Mojuru**, **Tsumi**, **Anymex**, **Dartotsu** — where the manifest says so

The library UI filters by app, and Shirox variants get their own entries (e.g. [`hydrahd-shirox`](hydrahd/hydrahd-shirox.json)) when the host's runtime needs a different build.

## How It Works

The host engine runs bare JavaScriptCore/QuickJS, so each module is a single global-scope script with `async` entry points — no DOM, no `setTimeout`, no `require`.

```text
    +-------------------+         +-----------------------+         +-----------------------+
    |   Sora Player     |  JSON   |   xdfkenny Module     |  HTTP   |   Provider Data       |
    |   (Host Engine)   | <-----> |   (Regex + Scraper)   | <-----> |   (Streaming Sites)   |
    +-------------------+         +-----------------------+         +-----------------------+
              |                               |                             |
              +-------------------------------+ ---------------------------+
                     all network calls go through the fetchv2 bridge
```

- **Network**: only `fetchv2(url, headers, method, body)` — the browser `fetch` fails (CORS), so scrapers wrap it in a `soraFetch` helper with cookie/session handling.
- **Parsing**: regex / `indexOf` / `substring` — no DOMParser in the runtime.
- **Contracts** (all async, all stringified JSON for video modules):
  - `searchResults(keyword)` → `[{title, image, href}]`
  - `extractDetails(url)` → `[{description, aliases, airdate}]`
  - `extractEpisodes(url)` → `[{href, number}]`
  - `extractStreamUrl(url)` → `{streams: [{title, streamUrl, headers?}], subtitles?}`

  Novels swap the last two for `extractChapters(url)` and `extractText(url)` (raw HTML); manga modules return plain objects, not strings.

## Developing

- `AGENTS.md` — repo conventions, runtime constraints and module contracts (read this first)
- `server.js` — local test harness: `node server.js` → `http://localhost:8765`, click a module card and run a media test; or `curl` the `/api/test` endpoint directly
- `refresh-updated.js` — regenerates every `updated` field in `modules.json` from git history; run it after touching a module
- Deploy: push to `main` → FTP deploy via `.github/workflows/deploy.yml`

## Documentation

- [SORA_MODULES_GUIDE.md](SORA_MODULES_GUIDE.md) — the full spec: manifest fields, scraper contracts, the `soraFetch` pattern
- [`documentation/`](documentation/) — how-to-test guides (video, novels, subtitles), client compatibility notes, and post-mortems
- [`novel-examples/`](novel-examples/) — ready-to-fork novel manga-reader templates
- [`test/`](test/) — harness snapshots and frozen baselines

> **Caveats**: scrapers depend on fixed HTML/API patterns — provider updates can break them and need regex follow-ups. They run inside the host engine, not directly in Node (use the `server.js` shim to test). Use responsibly — these modules are for educational and interoperability purposes only.

---

<p align="center"><sub>Built and maintained by xdfkenny</sub></p>
