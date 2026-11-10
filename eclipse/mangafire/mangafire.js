// ============================================================
// Eclipse (Soupy-dev/Eclipse, fork of cranci1/Luna) legacy-module
// compatibility shim for mangafire.
//
// Eclipse runs reader modules in a bare JSContext. What it provides:
//   manga env: fetch(url, options) -> Promise<{status, headers, text(), json(), data}>
//   novel env: fetch(url, headers) -> Promise<text>
//              fetchv2(url, hdrs, method, body) -> Promise<{status, headers, body, text(), json()}>
//   shared:    console.log, Promise, setTimeout, btoa/atob (novel env only)
//   missing:   URL constructor, atob/btoa (manga env), console.error/warn/info/debug
//
// This prelude fills those gaps so the module below runs unchanged in
// BOTH the original app and Eclipse. Every shim is guarded — it only
// installs itself when the host has not already provided the global.
// ============================================================
(function () {
    var g = (typeof globalThis !== "undefined") ? globalThis
          : (typeof self !== "undefined") ? self
          : this;

    // atob / btoa — absent from Kanzen's manga JSContext; the novel env
    // provides its own, so the guards leave those untouched.
    var B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    if (typeof g.atob !== "function") {
        g.atob = function (input) {
            var b64 = String(input).replace(/[^A-Za-z0-9+/=]/g, "");
            var out = [];
            for (var i = 0; i < b64.length; i += 4) {
                var n1 = B64.indexOf(b64.charAt(i));
                var n2 = B64.indexOf(b64.charAt(i + 1));
                if (n1 < 0 || n2 < 0) break;
                var c2c = b64.charAt(i + 2);
                var c3c = b64.charAt(i + 3);
                var n3 = (c2c === "=" || c2c === "") ? -1 : B64.indexOf(c2c);
                var n4 = (c3c === "=" || c3c === "") ? -1 : B64.indexOf(c3c);
                out.push(String.fromCharCode((n1 << 2) | (n2 >> 4)));
                if (n3 >= 0) out.push(String.fromCharCode(((n2 & 15) << 4) | (n3 >> 2)));
                if (n4 >= 0) out.push(String.fromCharCode(((n3 & 3) << 6) | n4));
            }
            return out.join("");
        };
    }
    if (typeof g.btoa !== "function") {
        g.btoa = function (s) {
            s = String(s);
            var out = "";
            var i = 0;
            while (i < s.length) {
                var c1 = s.charCodeAt(i++) & 0xFF;
                var c2 = i < s.length ? (s.charCodeAt(i++) & 0xFF) : -1;
                var c3 = i < s.length ? (s.charCodeAt(i++) & 0xFF) : -1;
                out += B64.charAt(c1 >> 2);
                out += B64.charAt(((c1 & 3) << 4) | ((c2 >= 0) ? (c2 >> 4) : 0));
                out += c2 >= 0 ? B64.charAt((((c2 & 15) << 2)) | ((c3 >= 0) ? (c3 >> 6) : 0)) : "=";
                out += c3 >= 0 ? B64.charAt(c3 & 63) : "=";
            }
            return out;
        };
    }

    // URL — JSC has no WHATWG URL constructor. Covers what the modules
    // need: absolute passthrough, protocol-relative, and same-base
    // relative resolution against the second argument.
    if (typeof g.URL !== "function") {
        function makeURL(full) {
            var url = {};
            url.href = full;
            var noHash = full.split("#");
            var main = noHash[0].split("?");
            var pathQ = main[0];
            var pm = pathQ.match(/^([a-z][a-z0-9+.-]*:)?\/\/([^\/?#]*)/i);
            var proto = pm && pm[1] ? pm[1] : "";
            var host = pm ? pm[2].toLowerCase() : "";
            url.origin = host ? (proto || "https:") + "//" + host : "";
            url.protocol = (proto || "about:").toLowerCase();
            url.host = host;
            var hp = host.split(":");
            url.hostname = hp[0];
            url.port = hp.length > 1 ? hp[1] : "";
            var originLen = pm ? pm[0].length : 0;
            url.pathname = host ? pathQ.slice(originLen) || "/" : (pm ? "" : pathQ);
            url.search = main[1] ? "?" + main[1] : "";
            url.hash = noHash[1] ? "#" + noHash[1] : "";
            url.searchParams = {
                get: function (k) {
                    if (!url.search) return null;
                    var pairs = url.search.replace(/^\?/, "").split("&");
                    for (var i = 0; i < pairs.length; i++) {
                        var kv = pairs[i].split("=");
                        if (decodeURIComponent(kv[0]) === k) return decodeURIComponent(kv[1] || "");
                    }
                    return null;
                },
                toString: function () { return url.search.replace(/^\?/, ""); }
            };
            url.toString = function () { return full; };
            url.toJSON = function () { return full; };
            return url;
        }
        g.URL = function (input, base) {
            var src = String(input == null ? "" : input);
            if (src.indexOf("//") === 0) src = "https:" + src;
            if (src.match(/^[a-z][a-z0-9+.-]*:\/\/[^\/?#]*/i)) return makeURL(src);
            if (base) {
                var bm = String(base).match(/^([a-z][a-z0-9+.-]*:)?\/\/([^\/?#]*)(\/[^?#]*)?/i);
                if (bm) {
                    var origin = (bm[1] || "https:") + "//" + bm[2];
                    if (src.charAt(0) === "/") {
                        return makeURL(origin + src);
                    }
                    var pathPart = bm[3] || "/";
                    var dir = pathPart.charAt(pathPart.length - 1) === "/"
                        ? pathPart
                        : pathPart.substring(0, pathPart.lastIndexOf("/") + 1);
                    return makeURL(origin + dir + src);
                }
            }
            return makeURL(src);
        };
    }

    // console.error/warn/info/debug — Eclipse's console exposes only .log
    if (g.console && typeof g.console.log === "function") {
        var c = g.console;
        var forward = function () {
            var a = Array.prototype.slice.call(arguments);
            c.log.apply(c, a.length ? a : [""]);
        };
        if (typeof c.error !== "function") c.error = forward;
        if (typeof c.warn !== "function") c.warn = forward;
        if (typeof c.info !== "function") c.info = forward;
        if (typeof c.debug !== "function") c.debug = forward;
    }
})();

// ---- module body (synced from ../../mangafire/mangafire.js v2.0.0, 2026-11-10) ----

// mangafire module (manga) for kanzen / Luna / Eclipse (mangas)
//
// v2.0 rewrite (2026-11-10): mangafire.to was rebuilt as a React SPA whose
// JSON API (/api/titles) is gated by a rotating per-request `vrf` token
// derived from a per-page-load encrypted window.__config blob; the token
// generator is not present as readable code in the shipped bundles and old
// tokens stop working within seconds, so the old .to flow cannot work from a
// bare fetchv2 runtime. The legacy server-rendered frontend still runs on
// the official mirror **mangafire.cc** — plain HTML, no vrf required:
//
//   search   GET /search?q=<keyword>            -> <div class="manga-item ...">
//   details  GET /manga/<slug>                  -> og:description + rel="tag" genres
//   chapters GET /manga/<slug>/chapters?offset=N  (200 per page, data-has-more attr)
//   images   GET /read/<slug>/en/chapter-<n>    -> t*.brzimg.lol/*.webp inline
//
// All image URLs verified 200 with no Referer header (Sora reader sends none).

const BASE = 'https://mangafire.cc';

async function soraFetch(url) {
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Referer': BASE + '/',
    };
    try {
        return await fetchv2(url, headers, 'GET', null);
    } catch (e) {
        try {
            const res = await fetch(url, { headers });
            return { status: res.status, text: () => res.text(), json: () => res.json() };
        } catch (error) {
            return null;
        }
    }
}

function slugFromUrl(url) {
    const m = String(url || '').match(/\/manga\/([a-z0-9\-]+)/i);
    return m ? m[1] : '';
}

function parseSearchResults(html) {
    const results = [];
    const seen = {};
    const itemRe = /<div class="manga-item[^"]*">[\s\S]*?<a href="(\/manga\/[a-z0-9\-]+)"(?: title="([^"]*)")?>[\s\S]*?<img src="([^"]*)"(?:[^>]*alt="([^"]*)")?/g;
    let m;
    while ((m = itemRe.exec(html)) !== null) {
        const href = m[1];
        if (seen[href]) continue;
        seen[href] = true;
        const title = (m[2] || m[4] || href.replace('/manga/', '')).trim();
        results.push({ title, image: m[3].trim(), href });
        if (results.length >= 40) break;
    }
    return results;
}

async function searchResults(input, page = 0) {
    try {
        const qs = 'q=' + encodeURIComponent(String(input || '').trim());
        const suffix = page > 0 ? '&page=' + (page + 1) : '';
        const response = await soraFetch(BASE + '/search?' + qs + suffix);
        if (!response) return [];
        const html = await response.text();
        return parseSearchResults(html);
    } catch (e) {
        return [];
    }
}

async function extractDetails(url) {
    try {
        const slug = slugFromUrl(url);
        if (!slug) return [{ description: 'N/A', aliases: 'N/A', airdate: 'N/A' }];
        const response = await soraFetch(BASE + '/manga/' + slug);
        if (!response) return [{ description: 'N/A', aliases: 'N/A', airdate: 'N/A' }];
        const html = await response.text();

        let description = '';
        const og = html.match(/<meta property="og:description" content=['"]([^'"]*)['"]/i);
        if (og) description = og[1];
        if (!description) {
            const alt = html.match(/<div[^>]*class="[^"]*description[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
            if (alt) description = alt[1].replace(/<[^>]*>/g, ' ');
        }
        description = description
            .replace(/&quot;/g, '"').replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
            .replace(/&#0?39;|&apos;/g, "'")
            .replace(/\s+/g, ' ').trim();

        const genres = [];
        const tagRe = /href="\/genre\/[^"]*"[^>]*>([^<]+)</g;
        let g;
        while ((g = tagRe.exec(html)) !== null) {
            const name = g[1].trim();
            if (name && genres.indexOf(name) < 0) genres.push(name);
        }

        let airdate = 'N/A';
        const dateM = html.match(/(?:Released|Published|Date)[^<]*<\/[^>]+>\s*<[^>]+>([^<]{4,40})</i);
        if (dateM) airdate = dateM[1].trim();

        return [{ description: description || 'N/A', aliases: 'N/A', airdate }];
    } catch (e) {
        return [{ description: 'Error extracting details', aliases: 'N/A', airdate: 'N/A' }];
    }
}

async function extractChapters(url) {
    try {
        const slug = slugFromUrl(url);
        if (!slug) return [];
        const chapters = [];
        // /manga/<slug>/chapters serves 200 chapters per page; paginate via offset
        for (let offset = 0; offset < 3000; offset += 200) {
            const suffix = offset > 0 ? '?offset=' + offset : '';
            const response = await soraFetch(BASE + '/manga/' + slug + '/chapters' + suffix);
            if (!response) break;
            const html = await response.text();
            const chRe = /<li[^>]*data-number="([0-9.]+)"[^>]*>\s*<a[^>]*href="(\/read\/[a-z0-9\-]+\/[a-z]+\/chapter-[0-9.]+)"[^>]*(?:title="([^"]*)")?[^>]*>([\s\S]*?)<\/a>/g;
            let added = 0, m;
            while ((m = chRe.exec(html)) !== null) {
                const num = parseFloat(m[1]);
                const title = (m[3] || m[4] || '').replace(/<[^>]*>/g, '').trim() || ('Chapter ' + m[1]);
                chapters.push({ href: m[2], number: num, title });
                added++;
            }
            if (added === 0) break;
            if (!/data-has-more="true"/.test(html)) break;
        }
        chapters.sort((a, b) => a.number - b.number);
        return chapters;
    } catch (e) {
        return [];
    }
}

async function extractImages(readPath) {
    try {
        let path = String(readPath || '');
        if (path.indexOf('/read/') < 0) return [];
        const url = path.startsWith('http') ? path : BASE + path;
        const response = await soraFetch(url);
        if (!response) return [];
        const html = await response.text();
        const seen = {};
        const pages = [];
        const imgRe = /https?:\/\/t\d\.brzimg\.lol\/[^"'\s\\]+\.webp/g;
        let m;
        while ((m = imgRe.exec(html)) !== null) {
            if (!seen[m[0]]) { seen[m[0]] = true; pages.push(m[0]); }
        }
        // strip og:image duplicate if it equals the first page
        if (pages.length > 1 && pages[0] === pages[1]) pages.shift();
        return pages;
    } catch (e) {
        return [];
    }
}
