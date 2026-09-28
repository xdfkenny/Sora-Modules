// ============================================================
// Eclipse (Soupy-dev/Eclipse, fork of cranci1/Luna) legacy-module
// compatibility shim for lightnovelworld.
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
    try {
        const encodedKeyword = encodeURIComponent(keyword);
        const url = `https://lightnovelworld.org/api/search/?q=${encodedKeyword}&search_type=title`;
        const response = await soraFetch(url);
        if (!response) {
            throw new Error("No response received from search API");
        }
        const json = await response.json();

        const results = [];
        if (json && json.novels) {
            for (const novel of json.novels) {
                let image = novel.cover_path || "";
                if (image && !image.startsWith("http")) {
                    image = "https://lightnovelworld.org" + image;
                }

                results.push({
                    title: decodeHtmlEntities(novel.title || ""),
                    href: `https://lightnovelworld.org/novel/${novel.slug}/`,
                    image: image
                });
            }
        }

        console.log(JSON.stringify(results));
        return JSON.stringify(results);
    } catch (error) {
        console.error("Error fetching or parsing search: " + error);
        return JSON.stringify([{
            title: "Error",
            href: "",
            image: ""
        }]);
    }
}

async function extractDetails(url) {
    try {
        const response = await soraFetch(url);
        if (!response) {
            throw new Error("No response received from details page");
        }
        const htmlText = await response.text();

        let description = "";
        const jsonLdRegex = /<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
        let match;
        while ((match = jsonLdRegex.exec(htmlText)) !== null) {
            try {
                const data = JSON.parse(match[1]);
                if (data && data["@type"] === "Book" && data.description) {
                    description = data.description;
                    break;
                } else if (Array.isArray(data)) {
                    const book = data.find(item => item && item["@type"] === "Book");
                    if (book && book.description) {
                        description = book.description;
                        break;
                    }
                }
            } catch (e) {
            }
        }

        if (!description || description.trim() === "") {
            const descMatch = htmlText.match(/class="description-text"[^>]*>([\s\S]*?)<\/p>/i)
                || htmlText.match(/class="novel-description"[^>]*>([\s\S]*?)<\/div>/i);
            if (descMatch) {
                description = descMatch[1].replace(/<[^>]+>/g, '').trim();
            } else {
                description = "No description available";
            }
        }

        const aliases = 'N/A';
        const airdate = 'N/A';

        const transformedResults = [{
            description: decodeHtmlEntities(description).replace(/\s+/g, ' ').trim(),
            aliases,
            airdate
        }];

        console.log(JSON.stringify(transformedResults));
        return JSON.stringify(transformedResults);
    } catch (error) {
        console.error('Details error: ' + error);
        return JSON.stringify([{
            description: 'Error loading description',
            aliases: 'N/A',
            airdate: 'N/A'
        }]);
    }
}

async function extractChapters(url) {
    try {
        let chaptersUrl = url;
        const urlObj = url.split('?');
        let basePath = urlObj[0];
        const queryParams = urlObj[1] ? '?' + urlObj[1] : '';
        if (!basePath.endsWith('/chapters') && !basePath.endsWith('/chapters/')) {
            basePath = basePath.replace(/\/$/, '') + '/chapters/';
        }
        chaptersUrl = basePath + queryParams;

        const response = await soraFetch(chaptersUrl);
        if (!response) {
            throw new Error("No response received from chapters page");
        }
        const htmlText = await response.text();

        const allChapters = parseChaptersFromHtml(htmlText);

        let totalPages = 1;
        const selectMatch = htmlText.match(/<select[^>]*id="pageSelect"[^>]*>([\s\S]*?)<\/select>/i);
        if (selectMatch) {
            const optRegex = /value="(\d+)"/gi;
            let optMatch;
            while ((optMatch = optRegex.exec(selectMatch[1])) !== null) {
                const pNum = parseInt(optMatch[1], 10);
                if (pNum > totalPages) {
                    totalPages = pNum;
                }
            }
        } else {
            const fallbackMatch = htmlText.match(/<span>\s*of\s*(\d+)\s*<\/span>/i);
            if (fallbackMatch) {
                totalPages = parseInt(fallbackMatch[1], 10);
            }
        }

        if (totalPages > 1) {
            const baseUrlClean = chaptersUrl.split('?')[0].replace(/\/$/, '');
            const promises = [];

            for (let i = 2; i <= totalPages; i++) {
                const pageUrl = `${baseUrlClean}/?page=${i}`;
                promises.push((async (pUrl) => {
                    try {
                        const pResp = await soraFetch(pUrl);
                        if (pResp) {
                            const pHtml = await pResp.text();
                            return parseChaptersFromHtml(pHtml);
                        }
                    } catch (err) {
                        console.error(`Error fetching chapters page ${pUrl}:`, err);
                    }
                    return [];
                })(pageUrl));
            }

            const nestedResults = await Promise.all(promises);
            for (const pageCaps of nestedResults) {
                allChapters.push(...pageCaps);
            }
        }

        allChapters.sort((a, b) => {
            const getNum = (item) => {
                const urlMatch = item.href.match(/chapter[-/](\d+)/i);
                if (urlMatch) return parseFloat(urlMatch[1]);
                const titleMatch = item.title.match(/(?:Chapter|Ch\.)\s*(\d+(\.\d+)?)/i);
                if (titleMatch) return parseFloat(titleMatch[1]);
                return 0;
            };
            return getNum(a) - getNum(b);
        });

        allChapters.forEach((chapter, index) => {
            chapter.number = index + 1;
        });

        console.log(JSON.stringify(allChapters));
        return JSON.stringify(allChapters);
    } catch (error) {
        console.error('Fetch error in extractChapters: ', error);
        return JSON.stringify([{
            href: url,
            title: "Error fetching chapters",
            number: 0
        }]);
    }
}

async function extractText(url) {
    try {
        const response = await soraFetch(url);
        if (!response) {
            throw new Error("No response received from chapter text page");
        }
        const htmlText = await response.text();

        const startIdx = htmlText.indexOf('id="chapterText"');
        if (startIdx === -1) {
            throw new Error("Chapter content container (id='chapterText') not found");
        }

        const targets = ['data-ad-position="2"', 'class="chapter-nav"', 'chapterSelectBottom', 'id="commentContent"'];
        let endIdx = -1;
        for (const target of targets) {
            const idx = htmlText.indexOf(target, startIdx);
            if (idx !== -1 && (endIdx === -1 || idx < endIdx)) {
                endIdx = idx;
            }
        }

        if (endIdx === -1) {
            endIdx = htmlText.length;
        }

        const chunk = htmlText.substring(startIdx, endIdx);

        const paragraphs = [];
        const pRegex = /<p\b[^>]*>([\s\S]*?)<\/p>/gi;
        let match;
        while ((match = pRegex.exec(chunk)) !== null) {
            paragraphs.push(match[1].trim());
        }

        if (paragraphs.length === 0) {
            throw new Error("No paragraph tags found inside the content area");
        }

        const content = paragraphs.map(p => `<p>${decodeHtmlEntities(p)}</p>`).join('\n');

        console.log(content);
        return content;
    } catch (error) {
        console.error("Fetch error in extractText: " + error);
        return '<p>Error extracting text</p>';
    }
}

function parseChaptersFromHtml(htmlPage) {
    const pageChapters = [];
    const regex = /<div\s+class="chapter-card"[^>]*onclick="location\.href='([^']+)'"[^>]*>[\s\S]*?<h3\s+class="chapter-title"[^>]*>\s*([\s\S]*?)\s*<\/h3>/gi;
    let match;
    while ((match = regex.exec(htmlPage)) !== null) {
        let href = match[1].trim();
        if (!href.startsWith('http')) {
            href = "https://lightnovelworld.org" + href;
        }
        let title = match[2].replace(/\s+/g, ' ').trim();
        pageChapters.push({
            title: decodeHtmlEntities(title),
            href: href
        });
    }
    return pageChapters;
}

async function soraFetch(url, options = {
    headers: {},
    method: 'GET',
    body: null
}) {
    const headers = options.headers ?? {};
    if (!headers["User-Agent"] && !headers["user-agent"]) {
        headers["User-Agent"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
    }
    try {
        return await fetchv2(url, headers, options.method ?? 'GET', options.body ?? null);
    } catch (e) {
        try {
            return await fetch(url, options);
        } catch (error) {
            return null;
        }
    }
}

function decodeHtmlEntities(text) {
    const entities = {
        '&#x2014;': '—',
        '&#x2013;': '–',
        '&amp;': '&',
        '&lt;': '<',
        '&gt;': '>',
        '&quot;': '"',
        '&#x27;': "'",
        '&#x2F;': '/',
        '&#x60;': '`',
        '&#x3D;': '=',
        '&nbsp;': ' '
    };

    return text.replace(/&#x[\dA-Fa-f]+;|&\w+;/g, (match) => {
        return entities[match] || match;
    });
}
