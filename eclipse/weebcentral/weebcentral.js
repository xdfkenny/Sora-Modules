// ============================================================
// Eclipse (Soupy-dev/Eclipse, fork of cranci1/Luna) legacy-module
// compatibility shim for weebcentral.
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

async function soraFetch(url, options = {}) {
    const headers = options.headers || {};
    if (!headers["User-Agent"]) {
        headers["User-Agent"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";
    }
    try {
        if (typeof fetchv2 === 'function') {
            return await fetchv2(url, headers, options.method || 'GET', options.body || null);
        }
        return await fetch(url, options);
    } catch (e) {
        return await fetch(url, options);
    }
}

async function searchResults(keyword, page=0) {
    const results = [];
    try {
        const headers = {
            "Content-Type": "application/x-www-form-urlencoded"
        };
        const postData = `text=${encodeURIComponent(keyword)}`;

        const response = await soraFetch("https://weebcentral.com/search/simple?location=main", {
            method: "POST",
            headers: headers,
            body: postData
        });

        const html = await response.text();
        const regex = /<a href="([^"]+)"[^>]*>[\s\S]*?<source srcset="([^"]+)"[^>]*>[\s\S]*?<div class="flex-1[^"]*">([^<]+)<\/div>/g;

        let match;
        while ((match = regex.exec(html)) !== null) {
            const href = match[1].trim();
            results.push({
                id: href.startsWith('http') ? href : 'https://weebcentral.com' + href,
                imageURL: match[2].trim(),
                title: match[3].trim().replace(/&#39;/g, "'")
            });
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
        
        const descMatch = html.match(/<strong>Description<\/strong>\s*<p class="whitespace-pre-wrap break-words">([\s\S]*?)<\/p>/);
        const description = descMatch ? descMatch[1].trim().replace(/&#39;/g, "'") : "";
        
        const tagsMatch = html.match(/<strong>Associated Name\(s\)<\/strong>\s*<ul class="list-disc list-inside">([\s\S]*?)<\/ul>/);
        let tags = [];
        if (tagsMatch) {
            const ulContent = tagsMatch[1];
            const liRegex = /<li>([^<]+)<\/li>/g;
            let liMatch;
            while ((liMatch = liRegex.exec(ulContent)) !== null) {
                tags.push(liMatch[1].trim().replace(/&#39;/g, "'"));
            }
        }
        
        return {
            description,
            tags
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
        const cleanUrl = url.split('?')[0].replace(/\/+$/, '');
        const fullUrl = cleanUrl.replace(/\/[^/]+$/, "/full-chapter-list");
        const response = await soraFetch(fullUrl);
        const html = await response.text();
        
        const regex = /<a[^>]+href=["']((?:https:\/\/weebcentral\.com)?\/chapters\/[a-zA-Z0-9]+)["'][^>]*>([\s\S]*?)<\/a>/g;
        let match;
        let index = 1;
        
        while ((match = regex.exec(html)) !== null) {
            const rawHref = match[1].trim();
            const chapterUrl = rawHref.startsWith('http') ? rawHref : 'https://weebcentral.com' + rawHref;
            const innerText = match[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
            
            const numMatch = innerText.match(/Chapter\s+(\d+(?:\.\d+)?)/i) || innerText.match(/(\d+(?:\.\d+)?)/);
            const chapterNum = numMatch ? parseFloat(numMatch[1]) : index;
            
            results.push([
                String(chapterNum),
                [{
                    id: chapterUrl,
                    title: innerText || `Chapter ${chapterNum}`,
                    chapter: chapterNum,
                    scanlation_group: ""
                }]
            ]);
            index++;
        }

        return { en: results };
    } catch (err) {
        return { en: [] };
    }
}

async function extractImages(url) {
    const results = [];
    try {
        const cleanUrl = url.split('?')[0].replace(/\/+$/, '');
        const targetUrl = cleanUrl.startsWith('http') ? cleanUrl : 'https://weebcentral.com' + cleanUrl;
        const fullUrl = targetUrl + "/images?is_prev=False&current_page=1&reading_style=long_strip";
        const response = await soraFetch(fullUrl);
        const html = await response.text();
        
        const regex = /<img[^>]+src="([^"]+)"/g;
        let match;
        while ((match = regex.exec(html)) !== null) {
            const imgSrc = match[1].trim();
            if (imgSrc.startsWith('http')) {
                results.push(imgSrc);
            }
        }

        return results;
    } catch (err) {
        return [];
    }
}