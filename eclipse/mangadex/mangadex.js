// ============================================================
// Eclipse (Soupy-dev/Eclipse, fork of cranci1/Luna) legacy-module
// compatibility shim for mangadex.
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
        const offset = (page || 0) * 100;
        const url = `https://api.mangadex.org/manga?title=${encodeURIComponent(keyword)}&limit=100&offset=${offset}&contentRating[]=safe&contentRating[]=suggestive&contentRating[]=erotica&includes[]=cover_art&order[followedCount]=desc&order[relevance]=desc`;
        const response = await soraFetch(url);
        if (!response) return [];
        const data = await response.json();

        if (data && data.result === 'ok' && Array.isArray(data.data)) {
            for (const manga of data.data) {
                const id = manga.id;
                const attributes = manga.attributes || {};

                let title = attributes.title?.en || attributes.title?.['en'];
                if (!title) {
                    const altTitles = attributes.altTitles || [];
                    for (const alt of altTitles) {
                        if (alt.en) {
                            title = alt.en;
                            break;
                        }
                    }
                }
                if (!title) {
                    title = Object.values(attributes.title || {})[0] || 'Unknown Title';
                }

                let imageURL = '';
                const relationships = manga.relationships || [];
                const coverArt = relationships.find(rel => rel.type === 'cover_art');
                if (coverArt && coverArt.attributes && coverArt.attributes.fileName) {
                    imageURL = `https://uploads.mangadex.org/covers/${id}/${coverArt.attributes.fileName}.512.jpg`;
                }

                results.push({
                    id: id,
                    href: id,
                    imageURL: imageURL,
                    image: imageURL,
                    title: title
                });
            }
        }

        return results;
    } catch (err) {
        return [];
    }
}

async function extractDetails(urlOrId) {
    try {
        const idMatch = String(urlOrId).match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
        const mangaId = idMatch ? idMatch[0] : urlOrId;
        const url = `https://api.mangadex.org/manga/${mangaId}?includes[]=artist&includes[]=author&includes[]=cover_art`;
        const response = await soraFetch(url);
        if (!response) return { description: "", tags: [] };
        const data = await response.json();

        if (data && data.result === 'ok' && data.data) {
            const attributes = data.data.attributes || {};
            const description = attributes.description?.en || attributes.description?.['en'] || Object.values(attributes.description || {})[0] || '';
            const tags = (attributes.tags || [])
                .map(tag => tag.attributes?.name?.en || Object.values(tag.attributes?.name || {})[0])
                .filter(Boolean);

            return {
                description: description || "",
                tags: tags
            };
        }

        return { description: "", tags: [] };
    } catch (err) {
        return { description: "", tags: [] };
    }
}

async function extractChapters(urlOrId) {
    try {
        const idMatch = String(urlOrId).match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
        const mangaId = idMatch ? idMatch[0] : urlOrId;

        const langMap = {};
        const limit = 500;
        let offset = 0;
        let total = 1;

        while (offset < total) {
            const apiUrl = `https://api.mangadex.org/manga/${mangaId}/feed?limit=${limit}&offset=${offset}&includes[]=scanlation_group&contentRating[]=safe&contentRating[]=suggestive&contentRating[]=erotica&contentRating[]=pornographic&order[chapter]=asc`;
            const response = await soraFetch(apiUrl);
            if (!response) break;
            const data = await response.json();

            if (!data || data.result !== 'ok' || !Array.isArray(data.data)) {
                break;
            }

            total = typeof data.total === 'number' ? data.total : data.data.length;

            for (const ch of data.data) {
                const lang = ch.attributes?.translatedLanguage || 'en';
                if (!langMap[lang]) {
                    langMap[lang] = new Map();
                }

                const chapterStr = (ch.attributes?.chapter != null && ch.attributes.chapter !== '')
                    ? String(ch.attributes.chapter)
                    : (ch.attributes?.title || '0');
                const chapterNum = parseFloat(chapterStr) || 0;
                const chapterId = ch.id;

                let title = ch.attributes?.title;
                if (!title) {
                    title = ch.attributes?.chapter ? `Chapter ${ch.attributes.chapter}` : 'Oneshot';
                }

                const groupRel = (ch.relationships || []).find(rel => rel.type === 'scanlation_group');
                const scanlationGroup = groupRel?.attributes?.name || '';

                const chapterItem = {
                    id: chapterId,
                    title: title,
                    chapter: chapterNum,
                    scanlation_group: scanlationGroup
                };

                if (!langMap[lang].has(chapterStr)) {
                    langMap[lang].set(chapterStr, [chapterItem]);
                } else {
                    langMap[lang].get(chapterStr).push(chapterItem);
                }
            }

            offset += limit;
            if (offset >= 3000) break;
        }

        const results = {};
        for (const [lang, map] of Object.entries(langMap)) {
            results[lang] = Array.from(map.entries());
        }

        if (Object.keys(results).length === 0) {
            return { en: [] };
        }

        return results;
    } catch (err) {
        return { en: [] };
    }
}

async function extractImages(chapterUrlOrId) {
    try {
        const idMatch = String(chapterUrlOrId).match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
        const chapterId = idMatch ? idMatch[0] : chapterUrlOrId;

        const apiEndpoint = `https://api.mangadex.org/at-home/server/${chapterId}`;
        const apiResponse = await soraFetch(apiEndpoint);
        if (!apiResponse) return [];
        const serverData = await apiResponse.json();

        if (!serverData || serverData.result !== 'ok' || !serverData.chapter) {
            return [];
        }

        const imageBaseUrl = serverData.baseUrl;
        const chapterHash = serverData.chapter.hash;

        const hasDataSaver = Array.isArray(serverData.chapter.dataSaver) && serverData.chapter.dataSaver.length > 0;
        const imageFiles = hasDataSaver ? serverData.chapter.dataSaver : (serverData.chapter.data || []);
        const qualityPath = hasDataSaver ? 'data-saver' : 'data';
        console.log(imageFiles.map(fileName => `${imageBaseUrl}/${qualityPath}/${chapterHash}/${fileName}`));
        return imageFiles.map(fileName => `${imageBaseUrl}/${qualityPath}/${chapterHash}/${fileName}`);
    } catch (error) {
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
