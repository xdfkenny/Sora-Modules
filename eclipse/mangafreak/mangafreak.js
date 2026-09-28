// ============================================================
// Eclipse (Soupy-dev/Eclipse, fork of cranci1/Luna) legacy-module
// compatibility shim for mangafreak.
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

async function searchResults(keyword, page = 0) {
    const results = [];
    try {
        const url = "https://ww2.mangafreak.me/Find/" + encodeURIComponent(keyword);
        const response = await soraFetch(url);
        if (!response) return [];
        const html = await response.text();
        const regex = /<div class="manga_search_item">[\s\S]*?<a href="([^"]+)"><img src="([^"]+)"[^>]*><\/a>[\s\S]*?<h3>\s*<a href="[^"]+">([^<]+)<\/a>\s*<\/h3>/g;
        
        let match;
        const seen = new Set();
        while ((match = regex.exec(html)) !== null) {
            const rawHref = match[1].trim();
            const href = rawHref.startsWith("http") ? rawHref : "https://ww2.mangafreak.me" + rawHref;
            if (!seen.has(href)) {
                seen.add(href);
                const image = match[2].trim();
                const title = match[3].replace(/<[^>]+>/g, '').trim();
                results.push({
                    id: href,
                    href: href,
                    imageURL: image,
                    image: image,
                    title: title
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
        const targetUrl = url.startsWith("http") ? url : "https://ww2.mangafreak.me" + url;
        const response = await soraFetch(targetUrl);
        if (!response) return { description: "", tags: [] };
        const html = await response.text();

        const descRegex = /<div class="manga_series_description">[\s\S]*?<p>([\s\S]*?)<\/p>/;
        const match = descRegex.exec(html);
        const description = match ? match[1].replace(/<[^>]+>/g, '').trim() : "";

        const genreRegex = /<a[^>]+href="[^"]*\/Genre\/[^"]*"[^>]*>([^<]+)<\/a>/gi;
        let genreMatch;
        const tags = [];
        const seenTags = new Set();
        while ((genreMatch = genreRegex.exec(html)) !== null) {
            const tag = genreMatch[1].trim();
            if (tag && !seenTags.has(tag)) {
                seenTags.add(tag);
                tags.push(tag);
            }
        }
        
        return {
            description: description,
            tags: tags
        };
    } catch (err) {
        return {
            description: "Error",
            tags: []
        };
    }
}

async function extractChapters(url) {
    const results = [];
    try {
        const targetUrl = url.startsWith("http") ? url : "https://ww2.mangafreak.me" + url;
        const response = await soraFetch(targetUrl);
        if (!response) return { en: [] };
        const html = await response.text();

        const regex = /<a[^>]+href="([^"]*\/Read1_[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
        let match;
        let index = 1;
        const seen = new Set();
        
        while ((match = regex.exec(html)) !== null) {
            const rawHref = match[1].trim();
            const href = rawHref.startsWith("http") ? rawHref : "https://ww2.mangafreak.me" + rawHref;
            if (!seen.has(href)) {
                seen.add(href);
                const titleText = match[2].replace(/<[^>]+>/g, '').trim();
                const numMatch = titleText.match(/Chapter\s+([\d.]+)/i) || rawHref.match(/Read1_[^_]+_([\d.]+)/i) || titleText.match(/([\d.]+)/);
                const number = numMatch ? parseFloat(numMatch[1]) : index;
                const chapterStr = String(number);

                results.push([
                    chapterStr,
                    [{
                        id: href,
                        title: titleText || `Chapter ${chapterStr}`,
                        chapter: number,
                        scanlation_group: ""
                    }]
                ]);
                index++;
            }
        }

        results.reverse();

        return { en: results };
    } catch (err) {
        return { en: [] };
    }
}

async function extractImages(url) {
    const results = [];
    try {
        const targetUrl = url.startsWith("http") ? url : "https://ww2.mangafreak.me" + url;
        const response = await soraFetch(targetUrl);
        if (!response) return [];
        const html = await response.text();

        const regex = /<img[^>]+src="([^"]+\.(?:jpg|png|jpeg|webp))"/gi;
        let match;
        const seen = new Set();
        while ((match = regex.exec(html)) !== null) {
            const imgSrc = match[1].trim();
            if (imgSrc.includes('/mangas/') && !seen.has(imgSrc)) {
                seen.add(imgSrc);
                results.push(imgSrc);
            }
        }

        return results;
    } catch (err) {
        return [];
    }
}

async function soraFetch(url, options = {}) {
    const headers = options.headers || {};
    if (!headers["User-Agent"]) {
        headers["User-Agent"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
    }
    try {
        if (typeof fetchv2 === 'function') {
            return await fetchv2(url, headers, options.method || 'GET', options.body || null);
        }
        return await fetch(url, options);
    } catch (e) {
        try {
            return await fetch(url, options);
        } catch (error) {
            return null;
        }
    }
}