// ============================================================
// Eclipse (Soupy-dev/Eclipse, fork of cranci1/Luna) legacy-module
// compatibility shim for mangaworld.
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

async function searchResults(keyword, page = 1) {
    const results = [];
    try {
        const searchUrl = `https://www.mangaworld.mx/archive?keyword=${encodeURIComponent(keyword)}&page=${page || 1}`;
        const response = await soraFetch(searchUrl);
        if (!response) return [];

        const html = await response.text();
        const parsed = parseMCData(html);
        if (parsed && parsed.o && parsed.o.w) {
            for (const item of parsed.o.w) {
                const data = item[2];
                if (data && data.mangas) {
                    for (const manga of data.mangas) {
                        results.push({
                            id: `https://www.mangaworld.mx/manga/${manga.linkId}/${manga.slug}`,
                            title: manga.title || "",
                            imageURL: manga.image ? (manga.image.startsWith('http') ? manga.image : `https://cdn.mangaworld.mx${manga.image}`) : ""
                        });
                    }
                }
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
        if (!response) return { description: "", tags: [] };

        const html = await response.text();
        const parsed = parseMCData(html);
        let description = "";
        let tags = [];

        if (parsed && parsed.o && parsed.o.w) {
            for (const item of parsed.o.w) {
                const data = item[2];
                if (data && data.manga) {
                    description = data.manga.trama || "";
                    if (data.manga.genres) {
                        tags = data.manga.genres.map(g => g.name || g);
                    }
                    break;
                }
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
        const response = await soraFetch(url);
        if (!response) return { it: [] };

        const html = await response.text();
        const parsed = parseMCData(html);
        if (parsed && parsed.o && parsed.o.w) {
            let mangaSlug = "sousou-no-frieren";
            let mangaLinkId = "1699";

            for (const item of parsed.o.w) {
                const data = item[2];
                if (data && data.manga) {
                    if (data.manga.slug) mangaSlug = data.manga.slug;
                    if (data.manga.linkId) mangaLinkId = String(data.manga.linkId);
                    break;
                }
            }

            for (const item of parsed.o.w) {
                const data = item[2];
                if (data && data.pages) {
                    if (data.pages.volumes) {
                        for (const vol of data.pages.volumes) {
                            if (vol.chapters) {
                                for (const chap of vol.chapters) {
                                    const matchNum = /(?:capitolo|cap\b|\bch\b)\s*(\d+(?:\.\d+)?)/i.exec(chap.name) || /(\d+(?:\.\d+)?)/.exec(chap.name);
                                    const chapterNum = matchNum ? matchNum[1] : "0";
                                    results.push([
                                        String(chapterNum),
                                        [{
                                            id: `https://www.mangaworld.mx/manga/${mangaLinkId}/${mangaSlug}/read/${chap._id}`,
                                            title: chap.name || `Capitolo ${chapterNum}`,
                                            chapter: parseFloat(chapterNum) || 0
                                        }]
                                    ]);
                                }
                            }
                        }
                    }
                    if (data.pages.singleChapters) {
                        for (const chap of data.pages.singleChapters) {
                            const matchNum = /(?:capitolo|cap\b|\bch\b)\s*(\d+(?:\.\d+)?)/i.exec(chap.name) || /(\d+(?:\.\d+)?)/.exec(chap.name);
                            const chapterNum = matchNum ? matchNum[1] : "0";
                            results.push([
                                String(chapterNum),
                                [{
                                    id: `https://www.mangaworld.mx/manga/${mangaLinkId}/${mangaSlug}/read/${chap._id}`,
                                    title: chap.name || `Capitolo ${chapterNum}`,
                                    chapter: parseFloat(chapterNum) || 0
                                }]
                            ]);
                        }
                    }
                }
            }
        }

        results.sort((a, b) => parseFloat(a[0]) - parseFloat(b[0]));

        return { it: results };
    } catch (err) {
        return { it: [] };
    }
}

async function extractImages(chapterUrl) {
    const results = [];
    try {
        let cleanUrl = chapterUrl;
        if (/\/read\/[a-f0-9]+(?:\/\d+)?$/i.test(chapterUrl)) {
            cleanUrl = chapterUrl.replace(/\/(\d+)$/, '');
        }

        const response = await soraFetch(cleanUrl);
        if (!response) return [];

        const html = await response.text();
        const parsed = parseMCData(html);
        if (parsed && parsed.o && parsed.o.w) {
            for (const item of parsed.o.w) {
                const data = item[2];
                if (data && data.chapter) {
                    const chapter = data.chapter;
                    const mangaSlug = chapter.manga.slugFolder;
                    const mangaId = chapter.manga._id;
                    const volumePart = chapter.volume ? `${chapter.volume.slugFolder}-${chapter.volume._id}/` : "";
                    const chapterSlug = chapter.slugFolder;
                    const chapterId = chapter._id;

                    if (chapter.pages) {
                        for (const p of chapter.pages) {
                            results.push(`https://cdn.mangaworld.mx/chapters/${mangaSlug}-${mangaId}/${volumePart}${chapterSlug}-${chapterId}/${p}`);
                        }
                    }
                    break;
                }
            }
        }
        return results;
    } catch (err) {
        return [];
    }
}

async function soraFetch(url, options = { headers: {}, method: 'GET', body: null }) {
    const headers = options.headers || {};
    if (!headers["User-Agent"]) {
        headers["User-Agent"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
    }
    try {
        return await fetchv2(url, headers, options.method || 'GET', options.body || null);
    } catch (e) {
        try {
            return await fetch(url, options);
        } catch (error) {
            return null;
        }
    }
}

function getMCScriptTag(html) {
    const regex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
    let match;
    while ((match = regex.exec(html)) !== null) {
        const body = match[1];
        if (body.includes('$MC') && body.includes('.concat(')) {
            return body;
        }
    }
    return null;
}

function parseMCData(html) {
    const scriptBody = getMCScriptTag(html);
    if (!scriptBody) return null;

    const concatIdx = scriptBody.indexOf('.concat(');
    if (concatIdx === -1) return null;

    const startIdx = concatIdx + 8;
    const rawData = scriptBody.substring(startIdx, scriptBody.lastIndexOf(')'));
    try {
        return eval(`(${rawData})`);
    } catch (err) {
        return null;
    }
}