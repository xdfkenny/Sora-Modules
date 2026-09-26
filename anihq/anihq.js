// AniHQ (anihq.cc) — kiranime-based site.
// Search moved from the admin-ajax.php "advanced_search" action (Cloudflare now
// 403s it for non-browser clients, which made Shirox show "Error" cards) to the
// public REST endpoint the theme itself uses: wp-json/kiranime/v1/anime/search.
console.log('[AniHQ] module script loaded v1.1.0 (REST search + hardening)');

// The app's JavaScriptCore may predate ES2020: polyfill Promise.allSettled so
// a single rejected fetch can never abort stream extraction.
if (typeof Promise.allSettled !== 'function') {
    Promise.allSettled = function(promises) {
        return Promise.all(promises.map(function(p) {
            return Promise.resolve(p).then(
                function(value) { return { status: 'fulfilled', value: value }; },
                function(reason) { return { status: 'rejected', reason: reason }; }
            );
        }));
    };
}

// Normalize whatever fetchv2 returned into a Response-like object. Some app
// builds (Shirox) resolve .json() with a plain object SYNCHRONOUSLY, so
// re-wrap so text()/json() are always real promises in every app.
function toResponseLike(value) {
    if (value && typeof value.text === 'function') {
        return {
            status: typeof value.status === 'number' ? value.status : 200,
            ok: value.ok !== false,
            text: async function() {
                return String((await Promise.resolve(value.text())) || '');
            },
            json: async function() {
                if (typeof value.json === 'function') {
                    try {
                        var parsed = await Promise.resolve(value.json());
                        if (parsed != null) return parsed;
                    } catch (e) { /* fall back to parsing the body text */ }
                }
                return JSON.parse(String((await Promise.resolve(value.text())) || ''));
            }
        };
    }
    // Plain string / object body — already parsed.
    return {
        status: 200,
        ok: true,
        text: async function() { return typeof value === 'string' ? value : JSON.stringify(value || ''); },
        json: async function() {
            if (value && typeof value === 'object') return value;
            return JSON.parse(String(value || ''));
        }
    };
}

async function soraFetch(url, options) {
    options = options || {};
    var headers = options.headers || {};
    headers['User-Agent'] = headers['User-Agent'] ||
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
    var method = options.method || 'GET';
    try {
        var raw = await fetchv2(url, headers, method, options.body || null);
        return toResponseLike(raw);
    } catch (e) {
        return null;
    }
}

function stripTags(html) {
    return String(html || '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#0?39;/g, "'")
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

async function searchResults(keyword) {
    var results = [];
    try {
        var query = encodeURIComponent(String(keyword || ''));
        var response = await soraFetch('https://anihq.cc/wp-json/kiranime/v1/anime/search?query=' + query);
        if (!response) throw new Error('fetchv2 unavailable');
        var data = await response.json();
        // The REST endpoint returns the search dropdown HTML inside {"result": "<a…>…"}
        var html = (data && data.result) ? String(data.result) : '';
        if (!html) return JSON.stringify(results);

        // Each entry is an <a …href="…/anime-show/…" …> containing an <img>
        // and an <h3> with language-spanned titles. The "en" title span is the
        // last direct title text before the </h3> close.
        var itemPattern = /<a\s+href=(["'])(https?:\/\/[^"']*?\/anime-show\/[^"']+?)\1[^>]*>([\s\S]*?)<\/a>/g;
        var itemMatch;
        while ((itemMatch = itemPattern.exec(html)) !== null) {
            var block = itemMatch[3];
            var imgMatch = block.match(/<img[^>]+src=(["'])([^"']+)\1/);
            var titleMatch = block.match(/<h3[^>]*>([\s\S]*?)<\/h3>/);
            if (!imgMatch || !titleMatch) continue;

            // Prefer the last <span> title inside the h3 (English name);
            // fall back to the raw h3 text with tags removed.
            var spans = [];
            var spanRe = /<span[^>]*>([^<]*)<\/span>/g;
            var sm;
            while ((sm = spanRe.exec(titleMatch[1])) !== null) spans.push(sm[1]);
            var title = spans.length > 0
                ? spans[spans.length - 1].trim()
                : stripTags(titleMatch[1]);

            if (!title) continue;
            results.push({
                title: title,
                image: imgMatch[2].trim(),
                href: itemMatch[2].trim()
            });
        }

        return JSON.stringify(results);
    } catch (err) {
        console.log('AniHQ search error:', err && err.message || err);
        return JSON.stringify([{
            title: 'Error',
            image: 'Error',
            href: 'Error'
        }]);
    }
}

async function extractDetails(url) {
    try {
        var headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            'Referer': 'https://anihq.cc/'
        };
        var response = await soraFetch(url, { headers: headers });
        if (!response) throw new Error('fetchv2 unavailable');
        var html = await response.text();

        var description = 'N/A';

        // The kiranime theme exposes the synopsis inside an "Anime Overview"
        // section; older layouts used a .anime-synopsis div — try both.
        var sectionMatch = html.match(/<section[^>]+aria-label=["']Anime Overview["'][\s\S]*?>([\s\S]*?)<\/section>/i);
        var divMatch = html.match(/<div\s+class=["']anime-synopsis["'][\s\S]*?>([\s\S]*?)<\/div>/i);
        var source = sectionMatch ? sectionMatch[1] : (divMatch ? divMatch[1] : null);
        if (source) {
            var text = stripTags(source);
            if (text) description = text;
        }

        // Release year, if the page carries a stat block.
        var year = 'N/A';
        var yearMatch = html.match(/(?:Release\s+Date|Aired\s+Start|<dt>\s*Year\s*<\/dt>)[\s\S]{0,200}?(\d{4})/i);
        if (yearMatch) year = yearMatch[1];

        return JSON.stringify([{
            description: description,
            aliases: 'N/A',
            airdate: year
        }]);
    } catch (err) {
        return JSON.stringify([{
            description: 'Error: ' + (err && err.message || err),
            aliases: 'Error',
            airdate: 'Error'
        }]);
    }
}

function collectEpisodeLinks(html) {
    var links = {};
    // Only real watch pages (no query strings) — social share buttons embed
    // "/watch/…" inside sharer.php?u=… URLs and must not leak in.
    var watchRe = /<a\s+href=["'](?:https?:\/\/anihq\.cc)?(\/watch\/[a-zA-Z0-9\-_]+\/?)["']/g;
    var m;
    while ((m = watchRe.exec(html)) !== null) {
        links['https://anihq.cc' + m[1]] = true;
    }
    return Object.keys(links);
}

function episodeNumberFor(href) {
    var m = href.match(/episode-(\d+)/i);
    if (m) return parseInt(m[1], 10);
    m = href.match(/(?:^|\/)(\d{1,4})(?:\.html|\/|$)/i);
    if (m) return parseInt(m[1], 10);
    return 1;
}

async function extractEpisodes(url) {
    var results = [];
    try {
        var headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            'Referer': 'https://anihq.cc/'
        };
        var response = await soraFetch(url, { headers: headers });
        if (!response) throw new Error('fetchv2 unavailable');
        var html = await response.text();

        var watchLinks = collectEpisodeLinks(html);

        // If the show page only shows "Watch now" (movies / single-episode
        // entries), fall back to any full watch link on the page.
        var watchUrl = null;
        var watchUrlMatch = html.match(/<a\s+[^>]*href=["']((?:https?:\/\/anihq\.cc)?\/watch\/[a-zA-Z0-9\-_]+(?:\/|\.html)?)["']/i);
        if (watchUrlMatch) watchUrl = watchUrlMatch[1].replace(/^\/watch/, 'https://anihq.cc/watch');

        if (watchUrl) {
            var watchResponse = await soraFetch(watchUrl, { headers: headers });
            if (watchResponse) {
                var watchHtml = await watchResponse.text();
                var listRe = /<a href="([^"]+)"[^>]*class="[^"]*episode-list-item[^"]*"[^>]*data-episode-search-query="(\d+)"[\s\S]*?<span class="episode-list-item-number">\s*(\d+)\s*<\/span>/g;
                var lm;
                while ((lm = listRe.exec(watchHtml)) !== null) {
                    results.push({
                        href: lm[1].trim(),
                        number: parseInt(lm[3], 10)
                    });
                }
                // The numbered list may only be part of the catalog — merge
                // in any plain watch links the page also carries.
                collectEpisodeLinks(watchHtml).forEach(function(h) {
                    if (!results.some(function(x) { return x.href === h; })) {
                        results.push({ href: h, number: episodeNumberFor(h) });
                    }
                });
            }
        }

        // Merge show-page watch links not already present.
        collectEpisodeLinks(html).forEach(function(h) {
            if (!results.some(function(x) { return x.href === h; })) {
                results.push({ href: h, number: episodeNumberFor(h) });
            }
        });

        if (results.length === 0) {
            return JSON.stringify([{
                href: watchUrl || url,
                number: 1
            }]);
        }

        results.sort(function(a, b) { return a.number - b.number; });

        return JSON.stringify(results);
    } catch (err) {
        return JSON.stringify([{
            href: 'Error: ' + (err && err.message || err),
            number: 'Error'
        }]);
    }
}

async function extractStreamUrl(url) {
    try {
        var headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            'Referer': 'https://anihq.cc/'
        };
        var response = await soraFetch(url, { headers: headers });
        if (!response) throw new Error('fetchv2 unavailable');
        var html = await response.text();

        var iframeMatch = html.match(/<iframe[^>]+src=(["'])([^"']+)\1/i);
        if (!iframeMatch) {
            console.log('AniHQ: no iframe found on page');
            return null;
        }

        var currentUrl = iframeMatch[2];
        var currentHtml = '';
        var lastOrigin = 'https://bryantenunder.com';
        var originMatch = currentUrl.match(/^(https?:\/\/[^\/]+)/);
        if (originMatch) lastOrigin = originMatch[1];

        // Follow iframe → JS-redirect chains (VOE bounces through its CDN
        // edge domains; each hop carries a window.location.href = '…').
        for (var hop = 0; hop < 4; hop++) {
            var resp = await soraFetch(currentUrl, { headers: headers });
            if (!resp) break;
            currentHtml = await resp.text();
            if (!currentHtml) break;

            var m = currentUrl.match(/^(https?:\/\/[^\/]+)/);
            if (m) lastOrigin = m[1];

            var redirectMatch = currentHtml.match(/window\.location\.href\s*=\s*['"]([^'"]+)['"]/);
            if (redirectMatch) {
                currentUrl = redirectMatch[1];
                console.log('AniHQ: following redirect → ' + currentUrl);
                continue;
            }
            break;
        }

        var streamData = null;
        try {
            streamData = voeExtractor(currentHtml);
        } catch (error) {
            console.log('AniHQ VOE extraction error:', error.message || error);
            return null;
        }

        var streamUrlResult = typeof streamData === 'string' ? streamData : getStreamUrl(streamData);
        if (!streamUrlResult) {
            console.log('AniHQ: no stream URL found');
            return null;
        }

        console.log('AniHQ stream URL secured:', streamUrlResult);
        return JSON.stringify({
            streams: [
                {
                    title: 'Server 1',
                    streamUrl: streamUrlResult,
                    headers: {
                        'Origin': lastOrigin,
                        'Referer': lastOrigin + '/'
                    }
                }
            ]
        });
    } catch (error) {
        console.log('AniHQ fetch error:', error.message || error);
        return null;
    }
}

/* SCHEME START */

/**
 * @name voeExtractor
 * @author Cufiy
 */

function voeExtractor(html, url = null) {
    const regex = /<script[^>]+type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let match;
    let obfuscatedString = null;
    while ((match = regex.exec(html)) !== null) {
        try {
            const data = JSON.parse(match[1].trim());
            if (Array.isArray(data) && typeof data[0] === "string") {
                obfuscatedString = data[0];
                break;
            }
        } catch (e) {
            // Ignore syntax/parse errors for other script tags
        }
    }

    if (!obfuscatedString) {
        console.log("No valid VOE application/json script tag found");
        return null;
    }

    // Step 1: ROT13
    let step1 = voeRot13(obfuscatedString);

    // Step 2: Remove patterns
    let step2 = voeRemovePatterns(step1);

    // Step 3: Base64 decode
    let step3 = voeBase64Decode(step2);

    // Step 4: Subtract 3 from each char code
    let step4 = voeShiftChars(step3, 3);

    // Step 5: Reverse string
    let step5 = step4.split("").reverse().join("");

    // Step 6: Base64 decode again
    let step6 = voeBase64Decode(step5);

    // Step 7: Parse as JSON
    let result;
    try {
        result = JSON.parse(step6);
    } catch (e) {
        throw new Error("Final JSON parse error: " + e.message);
    }

    // check if direct_access_url is set, not null and starts with http
    const streamUrl = getStreamUrl(result);
    if (streamUrl) {
        console.log("Voe Stream URL: " + streamUrl);
        return streamUrl;
    } else {
        console.log("No stream URL found in the decoded JSON");
    }
    return result;
}

function voeRot13(str) {
    return str.replace(/[a-zA-Z]/g, function (c) {
        return String.fromCharCode(
            (c <= "Z" ? 90 : 122) >= (c = c.charCodeAt(0) + 13)
                ? c
                : c - 26
        );
    });
}

function voeRemovePatterns(str) {
    const patterns = ["@$", "^^", "~@", "%?", "*~", "!!", "#&"];
    let result = str;
    for (const pat of patterns) {
        result = result.split(pat).join("");
    }
    return result;
}

function voeBase64Decode(str) {
    if (typeof atob === "function") {
        try {
            return atob(str);
        } catch (e) {
            // fallback if atob fails
        }
    }

    // Pure Javascript Base64 decoding fallback to avoid reliance on Buffer or atob
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let cleaned = str.replace(/=+$/, '').replace(/[^A-Za-z0-9+/]/g, '');
    let output = '';
    let buffer = 0;
    let bits = 0;

    for (let i = 0; i < cleaned.length; i++) {
        const char = cleaned[i];
        const idx = chars.indexOf(char);
        if (idx === -1) continue;

        buffer = (buffer << 6) | idx;
        bits += 6;

        if (bits >= 8) {
            bits -= 8;
            const byte = (buffer >> bits) & 0xFF;
            output += String.fromCharCode(byte);
        }
    }

    try {
        return decodeURIComponent(escape(output));
    } catch (e) {
        return output;
    }
}

function voeShiftChars(str, shift) {
    return str
        .split("")
        .map((c) => String.fromCharCode(c.charCodeAt(0) - shift))
        .join("");
}

function getStreamUrl(result) {
    if (!result) return null;
    if (typeof result === "string" && result.startsWith("http")) {
        return result;
    }
    if (typeof result === "object") {
        if (typeof result.source === "string" && result.source.startsWith("http")) {
            return result.source;
        }
        if (typeof result.direct_access_url === "string" && result.direct_access_url.startsWith("http")) {
            return result.direct_access_url;
        }
        if (Array.isArray(result.source)) {
            const url = result.source
                .map((source) => typeof source === "string" ? source : (source.direct_access_url || source.file || source.url))
                .find((url) => url && url.startsWith("http"));
            if (url) return url;
        }
    }
    return null;
}
/* SCHEME END */
