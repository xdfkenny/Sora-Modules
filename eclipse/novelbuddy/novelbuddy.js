// ============================================================
// Eclipse (Soupy-dev/Eclipse, fork of cranci1/Luna) legacy-module
// compatibility shim for novelbuddy.
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

const BASE_URL = "https://novelbuddy.com";
const API_URL = "https://api.novelbuddy.me";

async function searchResults(keyword) {
    try {
        const responseText = await soraFetch(`https://novelbuddy.com/search?q=${encodeURIComponent(keyword)}`);
        const html = await responseText.text();
        const items = extractNextData(html, "ssrItems");
        const results = [];
        if (Array.isArray(items)) {
            for (const item of items) {
                results.push({
                    title: (item.name || "").trim(),
                    href: BASE_URL + (item.url || ""),
                    image: item.cover || ""
                });
            }
        }
        console.log(JSON.stringify(results));
        return JSON.stringify(results);
    } catch (error) {
        console.log('Fetch error in searchResults: ' + error);
        return JSON.stringify([{ title: 'Error', image: '', href: '' }]);
    }
}

async function extractDetails(url) {
    try {
        const response = await soraFetch(url);
        const htmlText = await response.text();

        const manga = extractNextData(htmlText, "initialManga");
        let description = 'No description available';
        if (manga && manga.summary && String(manga.summary).trim()) {
            description = String(manga.summary).replace(/\s+/g, ' ').trim();
        } else {
            const descMatch = htmlText.match(/<p class="content"[^>]*>([\s\S]*?)<\/p>/);
            if (descMatch) description = descMatch[1].replace(/<\/?[^>]+>/g, '').trim();
        }

        let authors = 'Unknown';
        let genres = 'Unknown';
        let status = 'Unknown';
        let chaptersCount = 'Unknown';
        if (manga) {
            if (Array.isArray(manga.authors) && manga.authors.length) {
                authors = manga.authors.map(a => a.name || '').filter(Boolean).join(', ');
            }
            if (Array.isArray(manga.genres) && manga.genres.length) {
                genres = manga.genres.map(g => g.name || '').filter(Boolean).join(', ');
            }
            if (manga.status) status = manga.status;
            if (manga.displayChapters) chaptersCount = manga.displayChapters;
            else if (Array.isArray(manga.chapters)) chaptersCount = String(manga.chapters.length);
        }

        const aliases = `
Author(s): ${authors}
Status: ${status}
Genres: ${genres}
Chapters: ${chaptersCount}
        `.trim();

        const transformedResults = [{
            description,
            aliases,
            airdate: ''
        }];

        console.log(JSON.stringify(transformedResults));
        return JSON.stringify(transformedResults);
    } catch (error) {
        console.log('Details error: ' + error);
        return JSON.stringify([{
            description: 'Error loading description',
            aliases: 'Unknown',
            airdate: ''
        }]);
    }
}

async function extractChapters(url) {
    try {
        const response = await soraFetch(url);
        const htmlText = await response.text();

        const manga = extractNextData(htmlText, "initialManga");
        let mangaId = manga && manga.id ? manga.id : null;
        if (!mangaId) mangaId = extractNextData(htmlText, "mangaHsid");
        if (!mangaId) {
            const idMatch = htmlText.match(/"id":"([A-Za-z0-9]+)"/);
            mangaId = idMatch ? idMatch[1] : null;
        }
        if (!mangaId) {
            console.log('Could not find manga id');
            return JSON.stringify([]);
        }

        const apiResponse = await soraFetch(`${API_URL}/titles/${mangaId}/chapters`);
        const apiText = await apiResponse.text();
        let chapterData = null;
        try {
            chapterData = JSON.parse(apiText);
        } catch (e) {
            console.log('Chapters API returned non-JSON');
            return JSON.stringify([]);
        }
        const chapterList = chapterData && chapterData.data && chapterData.data.chapters
            ? chapterData.data.chapters
            : (chapterData && chapterData.chapters ? chapterData.chapters : []);
        if (!Array.isArray(chapterList) || !chapterList.length) {
            console.log('No chapters found');
            return JSON.stringify([]);
        }

        // Sort oldest -> newest, then renumber from 1
        chapterList.sort((a, b) => {
            const na = parseInt(a.number, 10) || 0;
            const nb = parseInt(b.number, 10) || 0;
            return na - nb;
        });

        const chapters = chapterList.map((ch, i) => ({
            href: BASE_URL + (ch.url || ""),
            title: (ch.name || `Chapter ${i + 1}`).trim(),
            number: i + 1
        }));

        console.log(`Extracted ${chapters.length} chapters`);
        return JSON.stringify(chapters);
    } catch (error) {
        console.log('Fetch error in extractChapters: ' + error);
        return JSON.stringify([]);
    }
}

async function extractText(url) {
    try {
        const response = await soraFetch(url);
        const htmlText = await response.text();

        const chapter = extractNextData(htmlText, "initialChapter");
        if (chapter && chapter.content) {
            return String(chapter.content).trim();
        }

        const startIndex = htmlText.indexOf('<div class="content-inner">');
        if (startIndex === -1) throw new Error("content-inner div not found");

        const subHtml = htmlText.slice(startIndex);

        const pTagRegex = /<p[^>]*>[\s\S]*?<\/p>/g;
        const pMatches = subHtml.match(pTagRegex);

        if (!pMatches || pMatches.length === 0) throw new Error("No <p> tags found");

        const filtered = pMatches.filter(p => {
            if (p.includes('class="mt-4"')) return false;
            const text = p.replace(/<[^>]*>/g, '').trim().toLowerCase();
            if (
                text === '©novelbuddy' ||
                text === 'or login with' ||
                text === 'or login with mangabuddy account'
            ) return false;
            return true;
        });

        const content = filtered.join('\n').trim();
        console.log(content);
        return content;
    } catch (error) {
        console.log("Fetch error in extractText: " + error);
        return '<p>Error extracting text</p>';
    }
}

// Extract a value from the __NEXT_DATA__ JSON embedded in the page
function extractNextData(html, key) {
    const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
    if (!m) return null;
    let data = null;
    try {
        data = JSON.parse(m[1]);
    } catch (e) {
        return null;
    }
    return deepFind(data, key);
}

function deepFind(obj, key) {
    if (obj == null) return null;
    if (typeof obj !== 'object') return null;
    if (obj[key] !== undefined) return obj[key];
    if (Array.isArray(obj)) {
        for (const item of obj) {
            const r = deepFind(item, key);
            if (r !== undefined && r !== null) return r;
        }
        return null;
    }
    for (const k in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, k)) {
            const r = deepFind(obj[k], key);
            if (r !== undefined && r !== null) return r;
        }
    }
    return null;
}

async function soraFetch(url, options = { headers: {}, method: 'GET', body: null }) {
    try {
        return await fetchv2(url, options.headers ?? {}, options.method ?? 'GET', options.body ?? null);
    } catch(e) {
        try {
            return await fetch(url, options);
        } catch(error) {
            return null;
        }
    }
}