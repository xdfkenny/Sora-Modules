/* restore-smoke.js — local smoke test for restored modules.
 *
 * Mirrors server.js mechanics (curl-first http, per-module cookie jar,
 * new Function sandbox with fetch/fetchv2 shim) but loads manifest+script
 * from the LOCAL repo instead of GitHub raw, so restored modules can be
 * validated before pushing.
 *
 * Contract coverage:
 *   anime/movies : search → details → episodes → stream
 *   novels       : search → details → chapters → text
 *   mangas       : search → details → chapters (+ images on first chapter)
 *
 * Usage: node test/restore-smoke.js [moduleName ...]
 * (no args = all modules listed in this file's DEFAULT list)
 */

'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

const ROOT = __dirname + '/..';

/* ---------------- network (copied from server.js) ---------------- */
const FORBIDDEN_HEADERS = new Set([
  'host', 'connection', 'content-length', 'accept-encoding', 'transfer-encoding', 'upgrade'
]);

function parseHeaderDump(dump) {
  const map = new Map();
  if (!dump) return map;
  const lines = String(dump).split(/\r?\n/);
  for (const line of lines) {
    const colon = line.indexOf(':');
    if (colon <= 0) continue;
    const name = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (name === 'set-cookie') map.set(name, (map.get(name) || '') + (map.has(name) ? '\n' : '') + value);
    else map.set(name, value);
  }
  return map;
}

function makeFetcher() {
  const jar = new Map();
  return async function soraFetch(url, headers, method, body) {
    const cleanHeaders = {};
    let hasCookie = false;
    for (const k in (headers || {})) {
      if (FORBIDDEN_HEADERS.has(String(k).toLowerCase())) continue;
      if (String(k).toLowerCase() === 'cookie') hasCookie = true;
      cleanHeaders[k] = headers[k];
    }
    if (jar.size && !hasCookie) {
      const parts = [];
      for (const [name, value] of jar) parts.push(name + '=' + value);
      cleanHeaders['Cookie'] = parts.join('; ');
    }
    const resp = await httpRequest(url, { method: method || 'GET', headers: cleanHeaders, body });
    if (resp.headers) {
      const setCookies = resp.headers.get ? resp.headers.get('set-cookie') : null;
      if (setCookies) {
        for (const part of String(setCookies).split('\n')) {
          const kv = part.split(';')[0];
          const eq = kv.indexOf('=');
          if (eq > 0) jar.set(kv.slice(0, eq).trim(), kv.slice(eq + 1).trim());
        }
      }
    }
    const text = resp.text;
    return {
      ok: resp.status >= 200 && resp.status < 300,
      status: resp.status,
      statusText: '',
      url: resp.finalUrl || url,
      headers: resp.headers || new Map(),
      text: async () => text,
      json: async () => JSON.parse(text),
    };
  };
}

function parseHeaderDumpFn() { return parseHeaderDump; }

let curlPath = null;
function resolveCurl(cb) {
  if (curlPath !== null) return cb(curlPath);
  execFile('curl', ['--version'], { timeout: 5000 }, (err) => {
    curlPath = err ? '' : 'curl';
    if (err) execFile('curl.exe', ['--version'], { timeout: 5000 }, (err2) => {
      curlPath = err2 ? '' : 'curl.exe';
      cb(curlPath);
    });
    else cb(curlPath);
  });
}

function curlRequest(url, opts) {
  return new Promise((resolve, reject) => {
    resolveCurl((bin) => {
      if (!bin) return reject(new Error('curl no disponible'));
      const method = opts.method || 'GET';
      const tmp = path.join(os.tmpdir(), 'xdf_smoke_' + process.pid + '_' + Date.now() + '.txt');
      const args = ['-sS', '--max-time', '30'];
      if (method === 'HEAD') args.push('-I');
      else args.push('-L', '--compressed', '-X', method);
      for (const k in (opts.headers || {})) args.push('-H', k + ': ' + opts.headers[k]);
      if (opts.body != null) args.push('--data-binary', opts.body);
      args.push('-D', tmp, '-w', '\n__XDF_STATUS__%{http_code}');
      args.push(url);
      execFile(bin, args, { maxBuffer: 64 * 1024 * 1024, encoding: 'utf8' }, (err, stdout) => {
        let headers = null;
        try { headers = parseHeaderDump(fs.readFileSync(tmp, 'utf8')); } catch (e) { /* ignore */ }
        try { fs.unlinkSync(tmp); } catch (e) { /* ignore */ }
        if (err) return reject(new Error('curl: ' + (err.message || err)));
        const mark = '\n__XDF_STATUS__';
        const idx = stdout.lastIndexOf(mark);
        const status = idx >= 0 ? parseInt(stdout.slice(idx + mark.length).trim(), 10) : 0;
        const text = idx >= 0 ? stdout.slice(0, idx) : stdout;
        resolve({ ok: status >= 200 && status < 300, status, text, headers });
      });
    });
  });
}

async function httpRequest(url, opts) {
  if (curlPath !== '') {
    try { return await curlRequest(url, opts); } catch (e) { /* fall through */ }
  }
  const fetchOpts = { method: opts.method || 'GET', headers: {}, redirect: 'follow' };
  for (const k in (opts.headers || {})) fetchOpts.headers[k] = opts.headers[k];
  if (opts.body != null) fetchOpts.body = opts.body;
  const resp = await fetch(url, fetchOpts);
  return { ok: resp.ok, status: resp.status, text: await resp.text(), finalUrl: resp.url, headers: resp.headers };
}

/* ---------------- sandbox (copied from server.js) ---------------- */
function loadModule(src) {
  const fetcher = makeFetcher();
  const sandboxConsole = { log: () => {}, error: () => {}, warn: () => {} };
  const factory = new Function(
    'fetch', 'fetchv2', 'window', 'console', 'location',
    src + '\n;return {' +
      'searchResults, extractDetails,' +
      'extractEpisodes: typeof extractEpisodes !== "undefined" ? extractEpisodes : null,' +
      'extractStreamUrl: typeof extractStreamUrl !== "undefined" ? extractStreamUrl : null,' +
      'extractChapters: typeof extractChapters !== "undefined" ? extractChapters : null,' +
      'extractText: typeof extractText !== "undefined" ? extractText : null,' +
      'extractImages: typeof extractImages !== "undefined" ? extractImages : null' +
    '};'
  );
  return factory(fetcher, fetcher, { fetch: fetcher, fetchv2: fetcher }, sandboxConsole, undefined);
}

function normalizeArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch (e) { return []; }
  }
  if (value && typeof value === 'object') return [value];
  return [];
}

function normalizeStreams(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try { return normalizeStreams(JSON.parse(value)); } catch (e) { return []; }
  }
  if (value && typeof value === 'object') {
    if (Array.isArray(value.streams)) return value.streams;
    return [value];
  }
  return [];
}

function withTimeout(promise, ms, label, moduleName) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(label + ' timeout')), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); }
    );
  });
}

/* ---------------- run one module ---------------- */
async function runModule(name, query, verbose) {
  const mdir = path.join(ROOT, name);
  const mp = path.join(mdir, name + '.json');
  const sp = path.join(mdir, name + '.js');
  if (!fs.existsSync(mp) || !fs.existsSync(sp)) {
    return { name, error: 'missing files' };
  }
  const manifest = JSON.parse(fs.readFileSync(mp, 'utf8'));
  const src = fs.readFileSync(sp, 'utf8');
  let mod = null;
  try {
    mod = loadModule(src);
  } catch (e) {
    return { name, error: 'loadModule: ' + e.message };
  }
  const isNovel = manifest.novel === true || String(manifest.type || '').includes('novels');
  const isManga = String(manifest.type || '').includes('manga');

  const out = { name, type: manifest.type || '', baseUrl: manifest.baseUrl || '' };
  out.stepErrors = [];
  const clog = (label, ok, extra) => {
    if (!ok && extra) out.stepErrors.push(label + ': ' + extra);
    if (verbose) console.log(`    ${label}: ${ok ? 'ok' : 'FAIL'}${extra ? ' — ' + extra : ''}`);
  };

  let results = [];
  try {
    const raw = await withTimeout(mod.searchResults(query), 25000, 'search');
    results = normalizeArray(raw);
    clog('search', results.length > 0, `count=${results.length}`);
  } catch (e) { clog('search', false, e.message); }
  out.search = results.length;

  const first = results[0];
  if (!first || !first.href) {
    out.details = false; out.episodes = false; out.stream = false; out.chapters = false; out.text = false; out.images = false;
    return out;
  }

  try {
    const d = await withTimeout(mod.extractDetails(first.href), 25000, 'details');
    const parsed = normalizeArray(d)[0] || {};
    out.details = !!(parsed.description || parsed.aliases || parsed.airdate);
    clog('details', out.details, `desc="${String(parsed.description || '').slice(0, 40)}"`);
  } catch (e) { out.details = false; clog('details', false, e.message); }

  if (isManga) {
    let chapters = [];
    try {
      const rawCh = await withTimeout(mod.extractChapters(first.href), 25000, 'chapters');
      chapters = normalizeArray(rawCh);
      out.chapters = chapters.length > 0;
      clog('chapters', out.chapters, `count=${chapters.length}`);
    } catch (e) { out.chapters = false; clog('chapters', false, e.message); }
    if (chapters[0] && chapters[0].href) {
      try {
        const imgs = await withTimeout(mod.extractImages(chapters[0].href), 30000, 'images');
        const arr = normalizeArray(imgs);
        out.images = arr.length > 0;
        clog('images', out.images, `count=${arr.length}`);
      } catch (e) { out.images = false; clog('images', false, e.message); }
    }
    return out;
  }

  if (isNovel) {
    let chapters = [];
    try {
      const rawCh = await withTimeout(mod.extractChapters(first.href), 25000, 'chapters');
      chapters = normalizeArray(rawCh);
      out.chapters = chapters.length > 0;
      clog('chapters', out.chapters, `count=${chapters.length}`);
    } catch (e) { out.chapters = false; clog('chapters', false, e.message); }
    const chUrl = (chapters[0] && chapters[0].href) || first.href;
    try {
      const raw = await withTimeout(mod.extractText(chUrl), 40000, 'text');
      const html = typeof raw === 'string' ? raw : String(raw || '');
      out.text = html.length > 0 && !/^(<p>Error|<p>Nessun|no content|error)/i.test(html);
      clog('text', out.text, `len=${html.length} imgs=${(html.match(/<img/g) || []).length}`);
    } catch (e) { out.text = false; clog('text', false, e.message); }
    return out;
  }

  let episodes = [];
  try {
    const rawEps = await withTimeout(mod.extractEpisodes(first.href), 25000, 'episodes');
    episodes = normalizeArray(rawEps);
    out.episodes = episodes.length > 0;
    clog('episodes', out.episodes, `count=${episodes.length}`);
  } catch (e) { out.episodes = false; clog('episodes', false, e.message); }

  const epUrl = (episodes[0] && episodes[0].href) || first.href;
  try {
    const raw = await withTimeout(mod.extractStreamUrl(epUrl), 30000, 'stream');
    const streams = normalizeStreams(raw);
    out.stream = streams.length > 0 && streams.some(s => (s.streamUrl || s.url || '').length > 5);
    clog('stream', out.stream, `count=${streams.length} url=${(streams[0] && (streams[0].streamUrl || streams[0].url) || '').slice(0, 60)}`);
  } catch (e) { out.stream = false; clog('stream', false, e.message); }

  return out;
}

/* ---------------- main ---------------- */
const DEFAULT = [
  // anime
  'animeheaven','animeweek','animexin','anoboye','anihq','animesdigital','animesrbija',
  'donghuastream','luciferdonghua','otakutsu','dessin-anime','miruro','kuudere','anizone',
  'ristoanime','sameband','shizaproject','spacepowerfans','anime-base','animeportal','anify',
  'anikoto','latanime','1tamilcrow',
  // shows/movies
  '111movies','filmo','filmpalast','catflix','hdrezka','moflix','movix','Nakastream','rgshows',
  'asia2tv','turkish123','vidapi','vidlink','vidrock','xiaoxintv','arabictoons','topcinema',
  'uaserial','purstream','doramaland',
  // novels
  'lightnovelworld','novelbuddy','noveldot','novelfire','readnovelfull',
  // mangas
  'mangafire','mangakatana','mangataro','kaliscan','rumanhua1',
  // recuts
  'narucannon','onepace','onePieceFilmRedAmaLeeScore','onePieceTreasureEdition',
  'rebuildOfNaruto','yuYuHakushoPace'
];

const args = process.argv.slice(2);
const verbose = args.includes('--verbose');
const names = args.filter(a => !a.startsWith('--'));

const list = names.length ? names : DEFAULT;
const queries = {};
const ALT_QUERIES = {
  'donghuastream': 'perfect world',
  'luciferdonghua': 'perfect world',
  'animesrbija': 'naruto',
  'narucannon': 'naruto',
  'rebuildOfNaruto': 'naruto',
  'onePieceFilmRedAmaLeeScore': 'one piece film red',
  'onePieceTreasureEdition': 'one piece treasure',
  'yuYuHakushoPace': 'yu yu hakusho',
  'onepace': 'one piece',
  'turkish123': 'one piece',
  '1tamilcrow': 'one piece',
  'latanime': 'one piece',
  'arabictoons': 'spongebob',
  'dessin-anime': 'one piece',
  'shizaproject': 'jujutsu kaisen'
};
for (const n of list) {
  let mp = path.join(ROOT, n, n + '.json');
  let q = 'one piece';
  if (fs.existsSync(mp)) {
    const man = JSON.parse(fs.readFileSync(mp, 'utf8'));
    const t = String(man.type || '');
    if (t.includes('novel')) q = 'solo leveling';
  }
  queries[n] = ALT_QUERIES[n] || q;
}

(async () => {
  let ok = 0, fail = 0;
  for (const name of list) {
    const t0 = Date.now();
    if (verbose) console.log(`\n[${name}]  query="${queries[name]}"`);
    let out;
    try {
      out = await runModule(name, queries[name], verbose);
    } catch (e) {
      out = { name, error: 'runModule crashed: ' + e.message };
      if (verbose) console.log('    CRASH:', e.stack || e.message);
    }
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    const verdict = (() => {
      if (out.error) return 'ERR';
      const t = String(out.type || '');
      if (t.includes('novel')) return out.search > 0 && out.chapters && out.text ? 'PASS' : 'FAIL';
      if (t.includes('manga')) return out.search > 0 && out.chapters && out.images ? 'PASS' : 'FAIL';
      return out.search > 0 && out.episodes && out.stream ? 'PASS' : 'FAIL';
    })();
    if (verdict === 'PASS') ok++; else fail++;
    const stepErr = (out.stepErrors || []).length ? ' [' + out.stepErrors.slice(0, 3).join(' | ') + ']' : '';
    console.log(`${verdict === 'PASS' ? 'PASS' : 'FAIL'}\t${name}\t${secs}s\tsearch=${out.search}\tdetails=${out.details}\teps=${out.episodes}\tstream=${out.stream}\tchapters=${out.chapters}\ttext=${out.text}\timages=${out.images}\t${out.error || ''}${stepErr}`);
  }
  console.log(`\nRESULT: ${ok} PASS / ${fail} FAIL  (${list.length} total)`);
})().catch(e => { console.error(e); process.exit(1); });