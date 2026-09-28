// ============================================================
// Eclipse (Soupy-dev/Eclipse, fork of cranci1/Luna) legacy-module
// compatibility shim for chireads.
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

async function searchResults(keyword) {
    const results = [];
    try {
        const encodedKeyword = encodeURIComponent(keyword);
        const url = `https://chireads.com/?s=${encodedKeyword}`;
        const response = await soraFetch(url);
        const html = await response.text();

        const regex = /<a[^>]+href="(https:\/\/chireads\.com\/category\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
        let match;
        const seen = new Set();

        while ((match = regex.exec(html)) !== null) {
            const href = match[1].trim();
            const rawTitle = match[2].replace(/<[^>]+>/g, '').trim();
            if (rawTitle && !seen.has(href) && !href.endsWith('/category/translatedtales/') && !href.endsWith('/category/original/')) {
                seen.add(href);
                results.push({
                    title: rawTitle,
                    href: href,
                    image: ""
                });
            }
        }

        if (results.length === 0) {
            const altRegex = /<h\d[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
            while ((match = altRegex.exec(html)) !== null) {
                const href = match[1].trim();
                const rawTitle = match[2].replace(/<[^>]+>/g, '').trim();
                if (rawTitle && !seen.has(href)) {
                    seen.add(href);
                    results.push({ title: rawTitle, href: href, image: "" });
                }
            }
        }

        return JSON.stringify(results);
    } catch (error) {
        return JSON.stringify([{ title: "Error", href: "", image: "" }]);
    }
}

async function extractDetails(url) {
    try {
        const response = await soraFetch(url);
        const htmlText = await response.text();

        const descMatch = htmlText.match(/<div[^>]*class="[^"]*entry-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i) ||
            htmlText.match(/<meta name="description" content="([^"]+)"/i);

        let description = descMatch
            ? descMatch[1].replace(/<[^>]+>/g, '').trim()
            : "No description available";

        return JSON.stringify([{
            description,
            aliases: 'N/A',
            airdate: 'N/A'
        }]);
    } catch (error) {
        return JSON.stringify([{
            description: 'Error loading description',
            aliases: 'N/A',
            airdate: 'N/A'
        }]);
    }
}

async function extractChapters(url) {
    const chapters = [];
    try {
        const response = await soraFetch(url);
        const htmlText = await response.text();
        
        const linkRegex = /<a\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
        let match;
        const seen = new Set();
        let index = 1;
        
        while ((match = linkRegex.exec(htmlText)) !== null) {
            const href = match[1].trim();
            const text = match[2].replace(/<[^>]+>/g, '').trim();
            
            if (href.includes("chapitre") || text.toLowerCase().includes("chapitre")) {
                if (!seen.has(href)) {
                    seen.add(href);
                    const numMatch = text.match(/chapitre\s*(\d+)/i) || href.match(/chapitre-(\d+)/i);
                    const num = numMatch ? parseInt(numMatch[1], 10) : index;
                    chapters.push({
                        title: text || `Chapitre ${num}`,
                        href: href,
                        number: num
                    });
                    index++;
                }
            }
        }
        
        return JSON.stringify(chapters);
    } catch (error) {
        return JSON.stringify([{
            href: url,
            title: "Error fetching chapters",
            number: 1
        }]);
    }
}

async function extractText(url) {
    try {
        const response = await soraFetch(url);
        let htmlText = await response.text();

        const paragraphs = [];
        const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
        let match;
        while ((match = pRegex.exec(htmlText)) !== null) {
            const pText = match[1].replace(/<[^>]+>/g, '').trim();
            if (pText.length > 5) {
                paragraphs.push(pText);
            }
        }

        if (paragraphs.length > 0) {
            return paragraphs.join('\n\n');
        }

        return '<p>No content found</p>';
    } catch (error) {
        return '<p>Error extracting text</p>';
    }
}

async function soraFetch(url, options = { headers: {}, method: 'GET', body: null }) {
    try {
        return await fetchv2(url, options.headers || {}, options.method || 'GET', options.body || null);
    } catch (e) {
        try {
            return await fetch(url, options);
        } catch (error) {
            return null;
        }
    }
}
