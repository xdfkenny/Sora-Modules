/* verify-recut-streams.js — for the 4 kept recut modules, resolve the
 * first search result -> first episode -> stream URL, then HEAD the stream
 * URL to prove liveness (smoke only checks URL length > 5). */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = __dirname + '/..';

function loadModule(src) {
  const fetcher = (url, headers, method, body) => {
    const opt = { method: method || 'GET', headers: headers || {} };
    if (body != null) opt.body = body;
    return fetch(url, opt).then(r => r.text().then(t => ({
      ok: r.ok, status: r.status, url: r.url,
      headers: r.headers,
      text: async () => t, json: async () => JSON.parse(t)
    })));
  };
  const sandboxConsole = { log: () => {}, error: () => {}, warn: () => {} };
  const factory = new Function('fetch', 'fetchv2', 'window', 'console', 'location',
    src + '\n;return {searchResults, extractDetails, extractEpisodes, extractStreamUrl};');
  return factory(fetcher, fetcher, { fetch: fetcher, fetchv2: fetcher }, sandboxConsole, undefined);
}

async function run(name, query) {
  const sp = path.join(ROOT, name, name + '.js');
  const src = fs.readFileSync(sp, 'utf8');
  const mod = loadModule(src);
  const res = JSON.parse(await mod.searchResults(query));
  const first = res[0];
  const eps = JSON.parse(await mod.extractEpisodes(first.href));
  const ep0 = eps[0];
  const streamRaw = await mod.extractStreamUrl(ep0.href);
  let parsed;
  try { parsed = JSON.parse(streamRaw); } catch (e) { parsed = streamRaw; }
  const streams = Array.isArray(parsed) ? parsed : (parsed.streams || []);
  return { firstHref: first.href, epCount: eps.length, ep0Href: ep0.href, streamUrl: streams[0] && (streams[0].streamUrl || streams[0].url) };
}

(async () => {
  const QUERIES = { narucannon: 'naruto', onepace: 'one piece', rebuildOfNaruto: 'naruto', yuYuHakushoPace: 'yu yu hakusho' };
  for (const name of Object.keys(QUERIES)) {
    let info;
    try { info = await run(name, QUERIES[name]); } catch (e) { console.log(`ERR\t${name}\t${e.message}`); continue; }
    const u = info.streamUrl;
    if (!u) { console.log(`NOURL\t${name}\t${JSON.stringify(info)}`); continue; }
    let status = '?', ct = '?';
    try {
      let r = await fetch(u, { method: 'HEAD' });
      if (!r.ok) r = await fetch(u);
      status = r.status; ct = (r.headers.get('content-type') || '').slice(0, 30);
    } catch (e) { status = 'FETCH-ERR: ' + e.message.slice(0, 60); }
    console.log(`${status === 200 ? 'LIVE' : 'DEAD'}\t${name}\tstatus=${status}\tct=${ct}\turl=${u}`);
  }
})();