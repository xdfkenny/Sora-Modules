# AnimesFHD checks

Run the dependency-free contract tests from the repository root:

```sh
node test/animesfhd/module.test.js
```

The provider runs in a fresh Node VM with only a `fetchv2` bridge; browser
globals, `fetch`, timers, `URL`, and imports are not available in that VM.
The bridge supplies both saved JSON responses and explicit edge cases.
Fixtures are public API responses supplied by the site owner on 2026-11-11
(search, popular titles, a series, a movie, and their episodes). The fixture
reader accepts their UTF-8 BOM. No third-party scraper code is included.

Coverage includes separate season/audio search results, large IDs, encoded
queries, popular fallback, paginated episodes, deduplication, fractional and
zero episode numbers, single-episode movies, native source filtering, player
headers, subtitle selection, malformed URLs, and network/HTTP/JSON failures.

For live integration checks:

```sh
node server.js
```

Use the AnimesFHD card, or POST to `http://localhost:8765/api/test` with
`{"id":"animesfhd","keyword":"frieren"}` and
`{"id":"animesfhd","keyword":"Fate/stay night"}`. This checkout's server
maps this repository's raw URLs to local files, so no push is needed.
Successful extraction does not prove playback in a native Sora/Luna player.

## Provider behavior

- Search returns the first 24 works, expanding the API's explicit `versions`
  into separate season/audio results with at most four concurrent detail
  requests. A failed version lookup keeps the original search result.
- Episodes paginate the selected series only, 200 per page, with a ceiling
  of 100 pages. Failed or repeating pagination returns an empty list rather
  than an apparently complete partial list.
- Only `native_video: true` sources whose `kind` is not `embed` are returned.
  Stable public media URLs and their query strings are preserved; the player
  follows their redirects. Both HLS and MP4 are supported by those URLs.
- Episode-wide subtitles are used when present. Source-specific subtitles
  are promoted to Sora's single subtitle field only when every returned stream
  shares the same track. HLS-embedded subtitles remain in the playlist.

## Validation in this checkout (2026-11-11)

- Contract tests and JavaScript syntax checks passed.
- `server.js` live pipelines: `frieren` returned 2 variants, 38 episodes,
  and an HLS source; `Fate/stay night` returned 12 variants, 24 episodes for
  the first result, and an s5 media resolver.
- Frieren cover and provider icon returned HTTP 200 without Referer.
- Dubbed Frieren, subtitled Shiotaiou, and the supplied Fate movie returned
  HTTP 200 HLS playlists beginning with `#EXTM3U`.
- The Fate s5 resolver returned HTTP 307; a bounded range request followed
  it to HTTP 206 `video/mp4` with an `ftyp` signature. A Shiotaiou HLS segment
  returned HTTP 206 `video/MP2T` for a bounded range request.
- System curl could not reach its configured proxy; the server's Node fetch
  fallback completed the live checks. Native app playback remains untested.
- No npm, lint, or build pipeline is configured in this repository.
