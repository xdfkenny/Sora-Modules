// ============================================================
// Eclipse (Soupy-dev/Eclipse, fork of cranci1/Luna) legacy-module
// compatibility shim for kaliscan.
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

// KaliScan (Eclipse) — rebuilt on kaliscan.org (Madara/wp-manga WordPress
// site), mirroring kaliscan/kaliscan.js v2.0.0. The original kaliscan.io is
// DNS-dead (NXDOMAIN, re-verified 2026-11-12); kaliscan.app is an unrelated
// gambling site. Build marker: [KaliScan-Eclipse] module script loaded v1.4-e2 (kaliscan.org)
console.log("[KaliScan-Eclipse] module script loaded v1.4-e2 (kaliscan.org)");

var KALISCAN_BASE = "https://kaliscan.org";

// fetchv2 wrapper with browser-like defaults (Eclipse novel env passes
// headers/method/body; manga env may not have fetchv2 — fall back to fetch).
function soraFetch(url, headers, method, body) {
    if (!headers) headers = {};
    if (!headers["User-Agent"]) headers["User-Agent"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
    if (!headers["Referer"]) headers["Referer"] = KALISCAN_BASE + "/";
    var response;
    if (typeof fetchv2 === "function") {
        response = fetchv2(url, headers, method || "GET", body);
    } else {
        response = fetch(url, { method: method || "GET", headers: headers, body: body });
    }
    return Promise.resolve(response).then(function (r) {
        return {
            text: function () { return Promise.resolve(r.text()).then(function (t) { return String(t); }); },
            status: r.status
        };
    });
}

async function searchResults(keyword) {
    const results = [];
    try {
        const response = await soraFetch(KALISCAN_BASE + "/?s=" + encodeURIComponent(keyword) + "&post_type=wp-manga");
        const html = await response.text();

        // Madara search results: tab-thumb <a title="..." href="..."><img data-src="..."></a>
        const thumbRegex = /<a href="([^"]+\/manga\/[^"]+\/)"[^>]*title="([^"]*)"[^>]*>\s*<img[^>]*data-src="([^"]+)"[^>]*>/gi;

        let match;
        const seen = new Set();
        while ((match = thumbRegex.exec(html)) !== null) {
            const href = match[1].trim();
            if (!href || seen.has(href)) continue;
            seen.add(href);
            const title = match[2].trim();
            const image = match[3].trim();
            if (!title) continue;
            // Manga contract: id is what extractChapters/extractImages consume.
            results.push({
                id: href,
                href: href,
                image: image,
                imageURL: image,
                title: title
            });
        }

        // Fallback: layouts without tab-thumb images — use post-title h3 anchors
        if (results.length === 0) {
            const looseRegex = /post-title">\s*<h3[^>]*><a href="([^"]+)">([\s\S]*?)<\/a>/gi;
            let lMatch;
            while ((lMatch = looseRegex.exec(html)) !== null) {
                const href = lMatch[1].trim();
                if (!href || seen.has(href)) continue;
                seen.add(href);
                results.push({
                    id: href,
                    href: href,
                    image: "",
                    imageURL: "",
                    title: lMatch[2].replace(/<[^>]+>/g, '').trim()
                });
            }
        }

        return results;
    } catch (err) {
        return [];
    }
}

async function extractDetails(url) {
    try {
        const response = await soraFetch(url);
        const html = await response.text();

        const descRegex = /<meta name="description" content="([^"]+)"/i;
        const descMatch = descRegex.exec(html);
        const description = descMatch ? descMatch[1].trim() : "N/A";

        // Madara "Alternative" field, when present
        let aliases = "N/A";
        const altRegex = /mg_alternative[\s\S]*?summary-content">([\s\S]*?)<\/div>/i;
        const altMatch = altRegex.exec(html);
        if (altMatch) {
            const alt = altMatch[1].replace(/<[^>]+>/g, '').trim();
            if (alt && alt.length > 0 && alt.length < 500) aliases = alt;
        }

        return [{
            description: description,
            aliases: aliases,
            airdate: "N/A"
        }];
    } catch (err) {
        return [{
            description: "Error",
            aliases: "Error",
            airdate: "Error"
        }];
    }
}

async function extractChapters(url) {
    const results = { en: [] };
    try {
        const cleanUrl = String(url).trim();
        const chapUrl = cleanUrl.endsWith("/") ? cleanUrl + "ajax/chapters/" : cleanUrl + "/ajax/chapters/";
        const response = await soraFetch(chapUrl, {}, "POST");
        const html = await response.text();

        const regex = /<a href="([^"]*)"[^>]*>\s*Chapter\s*([\d.]+[^<]*)<\/a>/gi;
        let match;
        const seen = new Set();

        while ((match = regex.exec(html)) !== null) {
            const chapterUrl = match[1].startsWith("http") ? match[1].trim() : KALISCAN_BASE + match[1].trim();
            if (seen.has(chapterUrl)) continue;
            seen.add(chapterUrl);
            const chapterStr = match[2].trim();
            const chapterNum = parseFloat(chapterStr, 10) || 0;
            // Language map entry: [chapterStr, [{id,title,chapter}]]
            results.en.push([chapterStr, [{
                id: chapterUrl,
                title: "Chapter " + chapterStr,
                chapter: chapterNum
            }]]);
        }

        return results;
    } catch (err) {
        return results;
    }
}

async function extractImages(url) {
    const results = [];
    try {
        const response = await soraFetch(url);
        const html = await response.text();

        // Lazy-loaded chapter pages: <img class="wp-manga-chapter-img ..." data-src="...">
        // data-src values carry stray whitespace/newlines — strip before use.
        const regex = /<img[^>]*class="wp-manga-chapter-img[^"]*"[^>]*data-src="([^"]*)"[^>]*>|<img[^>]*data-src="([^"]*)"[^>]*class="wp-manga-chapter-img[^"]*"/gi;
        let match;
        while ((match = regex.exec(html)) !== null) {
            const img = (match[1] || match[2]).replace(/[\r\n\t]/g, '').trim();
            if (img) results.push(img);
        }

        return results;
    } catch (err) {
        return [];
    }
}