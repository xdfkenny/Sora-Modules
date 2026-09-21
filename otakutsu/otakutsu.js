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

        const idMatch = url.match(/\/anime\/([a-f0-9]{24})/);
        const animeId = idMatch ? idMatch[1] : '';
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

async function extractStreamUrl(url) {
    try {
        const epMatch = url.match(/ep=(\d+)/);
        const epNum = epMatch ? parseInt(epMatch[1], 10) : 1;
        const idMatch = url.match(/\/watch\/([a-f0-9]{24})/);
        const animeId = idMatch ? idMatch[1] : '';
        if (!animeId) return JSON.stringify({ streams: [], subtitles: "" });

        const response = await soraFetch(url);
        if (!response) return JSON.stringify({ streams: [], subtitles: "" });
        const html = await response.text();

        const tokenMatch = html.match(/streamToken[\\]*":[\\]*"(eyJ[a-zA-Z0-9_\-]+\.eyJ[a-zA-Z0-9_\-]+\.[a-zA-Z0-9_\-]+)[\\]*"/);
        const token = tokenMatch ? tokenMatch[1] : '';
        if (!token) return JSON.stringify({ streams: [], subtitles: "" });

        const body = JSON.stringify([animeId, epNum, token, "$undefined"]);
        const headers = {
            "Content-Type": "text/plain;charset=UTF-8",
            "Next-Action": "788a4052bfc475e3604643a8c4ab5dbe28b1cc7926",
            "Referer": url,
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        };

        const postResponse = await soraFetch(`https://otakutsu.cc/watch/${animeId}?ep=${epNum}`, {
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
                    const subTypeLabel = source.subType === 'sub' ? 'Sub' : 'Dub';
                    const title = `${source.quality || 'auto'} • ${subTypeLabel} (${source.server || 'kiwi'})`;
                    streamObjects.push({
                        title: title,
                        streamUrl: source.url,
                        headers: {
                            "Referer": "https://otakutsu.cc/",
                            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                        }
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

        if (streamObjects.length === 0) {
            streamObjects.push({
                title: "Otakutsu Stream",
                streamUrl: url,
                headers: { "Referer": "https://otakutsu.cc/" }
            });
        }

        return JSON.stringify({
            streams: streamObjects,
            subtitles: subtitleUrl
        });
    } catch (err) {
        console.log("Error in extractStreamUrl: " + err);
        return JSON.stringify({
            streams: [{ title: "Otakutsu Stream", streamUrl: url, headers: { Referer: "https://otakutsu.cc/" } }],
            subtitles: ""
        });
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
