async function searchResults(keyword) {
    try {
        const url = `https://otakutsu.cc/api/feed/search?query=${encodeURIComponent(keyword)}`;
        const headers = {
            "Referer": "https://otakutsu.cc/browse",
            "Accept": "application/json"
        };
        const response = await soraFetch(url, { headers });
        if (!response) return JSON.stringify([]);

        const text = typeof response.text === 'function' ? await response.text() : response;
        const data = JSON.parse(text);
        const results = [];
        if (data && data.results) {
            for (const item of data.results) {
                if (item.id) {
                    const title = (item.title && (item.title.english || item.title.romaji || item.title.native)) || "Unknown";
                    const image = (item.cover_image && item.cover_image.large) || "";
                    const href = `https://otakutsu.cc/anime/${item.id}`;
                    results.push({ title, image, href });
                }
            }
        }
        return JSON.stringify(results);
    } catch (err) {
        console.log("Error in searchResults: " + err);
        return JSON.stringify([]);
    }
}

async function extractDetails(url) {
    try {
        const response = await soraFetch(url);
        if (!response) return JSON.stringify([]);
        const html = await response.text();

        // Extract description
        const descriptionRegex = /\\"className\\":\\"text-\[var\(--text-muted\)\\][^\\"]*\\",\\"style\\":\{[^}]+\},\\"children\\":\\"([^\\"]+)\\"/i;
        const descMatch = html.match(descriptionRegex);
        let description = descMatch ? descMatch[1] : '';
        description = description.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
        
        // Extract aliases
        const aliasesRegex = /\\"className\\":\\"text-sm text-\[var\(--text-faint\)\\][^\\"]*\\",\\"children\\":\\"([^\\"]+)\\"/i;
        const aliasesMatch = html.match(aliasesRegex);
        let aliases = aliasesMatch ? aliasesMatch[1] : 'N/A';
        aliases = aliases.replace(/\\"/g, '"').replace(/\\\\/g, '\\');

        let airdate = 'N/A';
        const epStart = html.indexOf('\\"episodes\\":[');
        if (epStart !== -1) {
            let bracketCount = 1;
            let i = epStart + '\\"episodes\\":['.length;
            while (bracketCount > 0 && i < html.length) {
                if (html[i] === '[') bracketCount++;
                else if (html[i] === ']') bracketCount--;
                i++;
            }
            const epsJsonRaw = html.substring(epStart + '\\"episodes\\":'.length, i);
            const unescaped = epsJsonRaw.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
            try {
                const eps = JSON.parse(unescaped);
                if (eps && eps.length > 0 && eps[0].aired) {
                    airdate = eps[0].aired.split('-')[0];
                }
            } catch (e) { }
        }

        const details = [{
            description: description || 'No description available.',
            aliases: aliases,
            airdate: airdate
        }];
        return JSON.stringify(details);
    } catch (err) {
        console.log("Error in extractDetails: " + err);
        return JSON.stringify([]);
    }
}

async function extractEpisodes(url) {
    try {
        const response = await soraFetch(url);
        if (!response) return JSON.stringify([]);
        const html = await response.text();

        // IDs are anilist-mapped slugs ("al-21"), not mongo hex ids
        const idMatch = url.match(/\/anime\/([^\/?#]+)/);
        const animeId = idMatch ? decodeURIComponent(idMatch[1]) : '';
        if (!animeId) return JSON.stringify([]);

        const episodes = [];
        const epStart = html.indexOf('\\"episodes\\":[');
        if (epStart !== -1) {
            let bracketCount = 1;
            let i = epStart + '\\"episodes\\":['.length;
            while (bracketCount > 0 && i < html.length) {
                if (html[i] === '[') bracketCount++;
                else if (html[i] === ']') bracketCount--;
                i++;
            }
            const epsJsonRaw = html.substring(epStart + '\\"episodes\\":'.length, i);
            const unescaped = epsJsonRaw.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
            try {
                const eps = JSON.parse(unescaped);
                if (eps && Array.isArray(eps)) {
                    for (const ep of eps) {
                        if (ep.ep_num !== undefined) {
                            episodes.push({
                                href: `https://otakutsu.cc/watch/${animeId}?ep=${ep.ep_num}`,
                                number: ep.ep_num
                            });
                        }
                    }
                }
            } catch (e) {
                console.log("Error parsing episodes: " + e);
            }
        }
        return JSON.stringify(episodes);
    } catch (err) {
        console.log("Error in extractEpisodes: " + err);
        return JSON.stringify([]);
    }
}

// Module-level cookie jar: the media API gates every step on cookies
// (_otakutsu_site from the watch page, __Host-otakutsu_media from /api/media/session).
const otakutsuCookies = {};
function otakutsuStoreCookies(response) {
    try {
        if (!response || !response.headers) return;
        let raw = [];
        if (typeof response.headers.getSetCookie === 'function') raw = response.headers.getSetCookie();
        else {
            const single = response.headers.get && response.headers.get('set-cookie');
            if (single) raw = [single];
        }
        for (const c of raw) {
            const kv = c.split(';')[0];
            const i = kv.indexOf('=');
            if (i > 0) otakutsuCookies[kv.substring(0, i)] = kv.substring(i + 1);
        }
    } catch (e) { }
}
function otakutsuCookieHeader() {
    const keys = Object.keys(otakutsuCookies);
    if (keys.length === 0) return "";
    return keys.map(k => k + "=" + otakutsuCookies[k]).join("; ");
}

async function extractStreamUrl(url) {
    try {
        const epMatch = url.match(/ep=(\d+)/);
        const epNum = epMatch ? parseInt(epMatch[1], 10) : 1;
        // IDs are anilist-mapped slugs ("al-21"), not mongo hex ids
        const idMatch = url.match(/\/watch\/([^\/?#]+)/);
        const animeId = idMatch ? decodeURIComponent(idMatch[1]) : '';
        if (!animeId) return JSON.stringify({ streams: [], subtitles: "" });

        const OT_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36";
        const watchUrl = `https://otakutsu.cc/watch/${animeId}?ep=${epNum}`;

        // 1) Warm up: fetch the watch page to collect the site cookie.
        const warm = await soraFetch(watchUrl, { headers: { "User-Agent": OT_UA, "Referer": "https://otakutsu.cc/" } });
        if (warm) otakutsuStoreCookies(warm);
        if (warm && typeof warm.text === 'function') { try { await warm.text(); } catch (e) { } }

        const jarCookie = otakutsuCookieHeader();
        // The media API 404s unless the request looks like an in-browser same-origin call.
        const apiHeaders = {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Referer": watchUrl,
            "Origin": "https://otakutsu.cc",
            "Sec-Fetch-Site": "same-origin",
            "Sec-Fetch-Mode": "cors",
            "Sec-Fetch-Dest": "empty",
            "User-Agent": OT_UA
        };
        if (jarCookie) apiHeaders["Cookie"] = jarCookie;

        // 2) Bootstrap: get a signed streamToken (JWT) for this anime/episode.
        let token = '';
        const bootResponse = await soraFetch("https://otakutsu.cc/api/media/bootstrap", {
            method: 'POST', headers: apiHeaders,
            body: JSON.stringify({ animeId: animeId, ep: epNum })
        });
        if (bootResponse) {
            otakutsuStoreCookies(bootResponse);
            const bootText = typeof bootResponse.text === 'function' ? await bootResponse.text() : String(bootResponse);
            try {
                const boot = JSON.parse(bootText);
                if (boot && boot.streamToken) token = boot.streamToken;
            } catch (e) { }
        }
        if (!token) return JSON.stringify({ streams: [], subtitles: "" });

        // 3) Open a playback session — sets the __Host-otakutsu_media cookie the
        //    server action requires ("Playback session required" without it).
        const sessionHeaders = {};
        for (const k in apiHeaders) sessionHeaders[k] = apiHeaders[k];
        const jarCookie2 = otakutsuCookieHeader();
        if (jarCookie2) sessionHeaders["Cookie"] = jarCookie2;
        const sessionResponse = await soraFetch("https://otakutsu.cc/api/media/session", {
            method: 'POST', headers: sessionHeaders,
            body: JSON.stringify({ streamToken: token })
        });
        if (sessionResponse) otakutsuStoreCookies(sessionResponse);
        if (sessionResponse && typeof sessionResponse.text === 'function') { try { await sessionResponse.text(); } catch (e) { } }

        // 4) Server action loadStreamSourcesAction -> flight payload with sources.
        const body = JSON.stringify([animeId, epNum, token, {}]);
        const headers = {
            "Content-Type": "text/plain;charset=UTF-8",
            "Next-Action": "78c18f62af3a5c99d524289cc5d7cf28165c92559c",
            "Referer": watchUrl,
            "Origin": "https://otakutsu.cc",
            "Sec-Fetch-Site": "same-origin",
            "Sec-Fetch-Mode": "cors",
            "Sec-Fetch-Dest": "empty",
            "User-Agent": OT_UA
        };
        const jarCookie3 = otakutsuCookieHeader();
        if (jarCookie3) headers["Cookie"] = jarCookie3;

        const postResponse = await soraFetch(watchUrl, {
            method: 'POST',
            headers,
            body
        });
        if (!postResponse) return JSON.stringify({ streams: [], subtitles: "" });

        const text = typeof postResponse.text === 'function' ? await postResponse.text() : postResponse;
        let data = null;
        const lines = text.split('\n');
        for (const line of lines) {
            const match = line.match(/^\d+:(.*)/);
            if (match) {
                try {
                    const obj = JSON.parse(match[1]);
                    if (obj && (obj.sources || obj.streams)) {
                        data = obj;
                        break;
                    }
                } catch (e) { }
            }
        }

        const streamObjects = [];
        let subtitleUrl = "";
        if (data && data.sources) {
            for (const source of data.sources) {
                if (source.url) {
                    const streamHeaders = {
                        "Referer": "https://otakutsu.cc/",
                        "User-Agent": OT_UA
                    };
                    // otakutsu-hosted playlists come back site-relative and are gated
                    // on the __Host-otakutsu_media playback-session cookie
                    if (source.url.charAt(0) === '/') {
                        source.url = 'https://otakutsu.cc' + source.url;
                        const mediaCookie = otakutsuCookieHeader();
                        if (mediaCookie) streamHeaders["Cookie"] = mediaCookie;
                    }
                    const subTypeLabel = source.subType === 'sub' ? 'Sub' : 'Dub';
                    const title = source.label || `${source.quality || 'auto'} • ${subTypeLabel} (${source.server || 'kiwi'})`;
                    streamObjects.push({
                        title: title,
                        streamUrl: source.url,
                        headers: streamHeaders
                    });
                }
                if (source.tracks && !subtitleUrl) {
                    const engTrack = source.tracks.find(t => t.lang === 'en' || (t.label && t.label.toLowerCase() === 'english'));
                    if (engTrack && engTrack.url) {
                        subtitleUrl = engTrack.url;
                    }
                }
            }
        }

        // subtitle track can also come back site-relative
        if (subtitleUrl && subtitleUrl.charAt(0) === '/') subtitleUrl = 'https://otakutsu.cc' + subtitleUrl;

        // No fake fallback: if we could not resolve real sources, return empty.
        return JSON.stringify({
            streams: streamObjects,
            subtitles: subtitleUrl
        });
    } catch (err) {
        console.log("Error in extractStreamUrl: " + err);
        return JSON.stringify({ streams: [], subtitles: "" });
    }
}

async function soraFetch(url, options = { headers: {}, method: 'GET', body: null }) {
    const headers = options.headers || {};
    if (!headers["User-Agent"]) {
        headers["User-Agent"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36";
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
