/* verify-first-stream.js — resolve first search result -> first episode ->
 * first stream URL for a module, then HEAD it. Usage:
 *   node test/verify-first-stream.js <module> [query]
 * Also handles legacy stream format [{quality,url}]. */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = __dirname + '/..';

function loadModule(src) {
  const fetcher = (url, headers, method, body) => {
    const opt = { method: method || 'GET', headers: headers || {}, redirect: 'follow' };
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

function normStreams(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') { try { return normStreams(JSON.parse(v)); } catch (e) { return []; } }
  if (v && typeof v === 'object') {
    if (Array.isArray(v.streams)) return v.streams;
    return [v];
  }
  return [];
}

(async () => {
  const name = process.argv[2];
  if (!name) { console.error('usage: verify-first-stream.js <module> [query]'); process.exit(1); }
  const query = process.argv[3] || 'one piece';
  const sp = path.join(ROOT, name, name + '.js');
  if (!fs.existsSync(sp)) { console.log(`NOFILE\t${name}`); process.exit(0); }
  const src = fs.readFileSync(sp, 'utf8');
  let mod;
  try { mod = loadModule(src); } catch (e) { console.log(`LOADERR\t${name}\t${e.message}`); process.exit(0); }
  let res;
  try { res = JSON.parse(await mod.searchResults(query)); } catch (e) { console.log(`SEARCHERR\t${name}\t${e.message}`); process.exit(0); }
  if (!res.length) { console.log(`NOSEARCH\t${name}`); process.exit(0); }
  const first = res[0];
  if (!first.href) { console.log(`NOHREF\t${name}\t${first.title}`); process.exit(0); }
  let eps = [];
  try { eps = JSON.parse(await mod.extractEpisodes(first.href)); } catch (e) { console.log(`EPSERR\t${name}\t${e.message}`); process.exit(0); }
  if (!eps.length) { console.log(`NOEPS\t${name}\tfirst=${first.href}`); process.exit(0); }
  const ep0 = eps[0];
  const raw = await mod.extractStreamUrl(ep0.href);
  const streams = normStreams(raw);
  if (!streams.length) { console.log(`NOSTREAM\t${name}\tfirst=${first.href}\tep=${ep0.href}\traw=${String(raw).slice(0,120)}`); process.exit(0); }
  const s0 = streams[0];
  const u = s0.streamUrl || s0.url || '';
  if (!u) { console.log(`NOURL\t${name}\ttitle="${s0.title || ''}"`); process.exit(0); }
  let status = '?', ct = '?';
  try {
    let r = await fetch(u, { method: 'HEAD', headers: s0.headers || {} });
    if (!r.ok) r = await fetch(u, { headers: s0.headers || {} });
    status = r.status; ct = (r.headers.get('content-type') || '').slice(0, 30);
  } catch (e) { status = 'FETCH-ERR: ' + e.message.slice(0, 60); }
  console.log(`${status === 200 ? 'LIVE' : 'DEAD'}\t${name}\tstatus=${status}\tct=${ct}\turl=${u}`);
})();