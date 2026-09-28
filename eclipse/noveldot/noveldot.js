// ============================================================
// Eclipse (Soupy-dev/Eclipse, fork of cranci1/Luna) legacy-module
// compatibility shim for noveldot.
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
        // Prime session cookie first (required for the search POST)
        await soraFetch("https://www.noveldot.com/search");

        const url = "https://www.noveldot.com/novel/lnsearchlive/index.php";

        const headers = {
            "Origin": "https://www.noveldot.com",
            "Referer": "https://www.noveldot.com/",
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:138.0) Gecko/20100101 Firefox/138.0",
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "X-Requested-With": "XMLHttpRequest",
        };

        const response = await soraFetch(url, { method: "POST", headers, body: `inputContent=${encodeURIComponent(keyword).replace(/%20/g, '+')}` });
        const data = await response.json();

        if (!data.success) throw new Error("Search failed");

        const html = data.resultview;
        const results = [];

        const regex = /<a\s+title="([^"]+)"\s+href="([^"]+)">[\s\S]*?<img\s+src="([^"]+)"[^>]*>[\s\S]*?<h4 class="novel-title[^>]*">[^<]+<\/h4>/g;

        let match;
        while ((match = regex.exec(html)) !== null) {
            let href = match[2].trim();
            // Encode literal parens so URL parsers/curl handle the path (else curl globbing hangs)
            href = href.replace(/\(/g, '%28').replace(/\)/g, '%29');
            results.push({
                title: match[1].trim(),
                href: href,
                image: match[3].trim()
            });
        }

        console.log(results);
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

        // Extract description
        const descriptionMatch = htmlText.match(/<p class="description">([\s\S]*?)<\/p>/);
        const description = descriptionMatch ? descriptionMatch[1].trim() : 'No description available';

        // Author(s)
        const authorMatch = htmlText.match(/<div class="author">[\s\S]*?<span>Author:<\/span>([\s\S]*?)<\/div>/);
        let authors = 'Unknown';
        if (authorMatch) {
            const authorRegex = /<span itemprop="author">([^<]+)<\/span>/g;
            const authorList = [];
            let aMatch;
            while ((aMatch = authorRegex.exec(authorMatch[1])) !== null) {
                authorList.push(aMatch[1].trim());
            }
            authors = authorList.join(', ');
        }

        // Rank
        const rankMatch = htmlText.match(/<strong>RANK (\d+)<\/strong>/);
        const rank = rankMatch ? rankMatch[1] : 'Unknown';

        // Rating (from <strong> or meta content)
        const ratingMatch = htmlText.match(/<meta itemprop="ratingValue" content="([\d.]+)"/);
        const rating = ratingMatch ? ratingMatch[1] : 'Unknown';

        // Chapters
        const chaptersMatch = htmlText.match(/<i class="icon-book-open"><\/i>\s*([\d,]+)<\/strong>\s*<small>Chapters<\/small>/);
        const chapters = chaptersMatch ? chaptersMatch[1] : 'Unknown';

        // Views
        const viewsMatch = htmlText.match(/<i class="icon-eye"><\/i>\s*([\d,]+)<\/strong>\s*<small>Views<\/small>/);
        const views = viewsMatch ? viewsMatch[1] : 'Unknown';

        // Status
        const statusMatch = htmlText.match(/<strong[^>]*>(Ongoing|Completed)<\/strong>\s*<small>Status<\/small>/);
        const status = statusMatch ? statusMatch[1] : 'Unknown';

        // Genres
        const genresMatch = htmlText.match(/<div class="categories">[\s\S]*?<ul>([\s\S]*?)<\/ul>/);
        let genres = 'Unknown';
        if (genresMatch) {
            const genreRegex = /<a[^>]+title="([^"]+)"[^>]*>/g;
            const genreList = [];
            let gMatch;
            while ((gMatch = genreRegex.exec(genresMatch[1])) !== null) {
                genreList.push(gMatch[1].trim());
            }
            genres = genreList.join(', ');
        }

        const aliases = `
Author(s): ${authors}
Rank: ${rank}
Rating: ${rating}
Chapters: ${chapters}
Views: ${views}
Status: ${status}
Genres: ${genres}
        `.trim();

        const transformedResults = [{
            description,
            aliases,
            airdate: ''
        }];

        console.log(transformedResults);
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
        const response = await soraFetch(url + "/chapters");
        const htmlText = await response.text();

        // Get number of chapter pages
        const chaptersMatch = htmlText.match(/<li class="PagedList-skipToLast"><a href="\?page=(\d+)&chorder=desc">&gt;&gt;<\/a><\/li>/);
        const chaptersNumber = chaptersMatch ? parseInt(chaptersMatch[1]) : 1;

        const chapters = [];

        // Parallel page fetches: novels with many chapters have dozens of
        // paginated /chapters pages; sequential fetches bust the 25s step
        // timeout. A failing page must not kill the whole list.
        const pageBatches = await Promise.all(
            Array.from({ length: chaptersNumber }, async (_, idx) => {
                const i = idx + 1;
                try {
                    const response2 = await soraFetch(`${url}/chapters?page=${i}&chorder=asc`);
                    const htmlText2 = await response2.text();

                    // Regex to extract data-chapterno and href from each <li> block
                    const regex = /<li[^>]+data-chapterno="(\d+)"[^>]*>[\s\S]*?<a href="([^"]+)"[^>]*>/g;

                    let match;
                    while ((match = regex.exec(htmlText2)) !== null) {
                        chapters.push({
                            href: match[2],
                            number: parseInt(match[1]),
                            title: `Chapter ${match[1]}`
                        });
                    }
                    return 0;
                } catch (e) {
                    return -1;
                }
            })
        );
        const failedPages = pageBatches.filter(v => v === -1).length;
        if (failedPages > 0) {
            console.log('extractChapters: ' + failedPages + ' page(s) failed, listing what succeeded');
        }

        // Pages were fetched in parallel, so re-sort by chapter number.
        chapters.sort((a, b) => a.number - b.number);

        console.log(chapters);
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

        // Extract chapter title from <span class="chapter-title">
        const titleMatch = htmlText.match(/<span class="chapter-title">([\s\S]*?)<\/span>/);
        const chapterTitle = titleMatch ? `<p>${titleMatch[1].trim()}</p>\n` : '';

        // Extract all <p> content inside #chapter-container
        const contentMatch = htmlText.match(/<div id="chapter-container"[^>]*>([\s\S]*?)<\/div>/);
        if (!contentMatch) {
            throw new Error("Chapter container not found");
        }

        let content = contentMatch[1];

        // Remove unwanted notification boxes if they appear (optional line)
        content = content.replace(/<p class="box-notification fs-17">[\s\S]*?<\/p>\s*/g, '');

        // Extract only <p> tags
        const pTags = content.match(/<p>[\s\S]*?<\/p>/g);
        const cleanedParagraphs = pTags ? pTags.join('\n') : '';

        const finalContent = (chapterTitle + cleanedParagraphs).trim();

        console.log(decodeHTMLEntities(finalContent));
        return decodeHTMLEntities(finalContent);
    } catch (error) {
        console.log("Fetch error in extractText: " + error);
        return JSON.stringify({ text: 'Error extracting text' });
    }
}

// searchResults("classroom of the elite");
// extractDetails("https://www.noveldot.com/book-16808/Classroom-of-the-Elite-(LN)");
// extractChapters("https://www.noveldot.com/book-16808/Classroom-of-the-Elite-(LN)");
// extractText("https://www.noveldot.com/novel-16808-227546/Classroom-of-the-Elite-(LN)/chapter-1");

async function soraFetch(url, options = { headers: {}, method: 'GET', body: null }) {
    const headers = Object.assign({ "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36" }, options.headers ?? {});
    try {
        return await fetchv2(url, headers, options.method ?? 'GET', options.body ?? null);
    } catch(e) {
        try {
            return await fetch(url, Object.assign({}, options, { headers }));
        } catch(error) {
            return null;
        }
    }
}

function decodeHTMLEntities(str) {
    const entities = {
        '&amp;': '&',
        '&lt;': '<',
        '&gt;': '>',
        '&quot;': '"',
        '&apos;': "'",
        '&nbsp;': ' ',
        '&rsquo;': '’',
        '&lsquo;': '‘',
        '&rdquo;': '”',
        '&ldquo;': '“',
        '&hellip;': '…',
        '&mdash;': '—',
        '&ndash;': '–',
        '&eacute;': 'é',
        '&oacute;': 'ó',
        '&aacute;': 'á',
        '&iacute;': 'í',
        '&uacute;': 'ú',
        '&ntilde;': 'ñ',
        '&copy;': '©',
        '&reg;': '®',
        '&euro;': '€',
        '&yen;': '¥',
        '&pound;': '£'
        // Add more if needed
    };

    return str.replace(/&[a-zA-Z]+?;/g, match => entities[match] || match);
}
