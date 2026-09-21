class Anikoto {
    // ---------- Search ----------
    static async search(keyword) {
        const base = "https://animepahetv.to/search?q=" + encodeURIComponent(keyword).replace(/%20/g, "+");
        const headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
            "Referer": "https://animepahetv.to/"
        };
    
        console.log("[Anikoto] Searching HTML pages, page 1: " + base);
    
        const resp1 = await soraFetch(base, { headers });
        if (!resp1 || resp1.status !== 200) {
            console.error("[Anikoto] Failed to fetch page 1");
            return [];
        }
        const html1 = await resp1.text();
    
        let totalPages = 1;
        const lastLinkMatch = html1.match(/<a\s+title="Last"\s+class="page-link"\s+href="[^"]*&?page=(\d+)"/i);
        if (lastLinkMatch) {
            totalPages = parseInt(lastLinkMatch[1], 10);
            console.log("[Anikoto] Total pages: " + totalPages);
        } else {
            const pageMatches = [...html1.matchAll(/<a[^>]*href="[^"]*&?page=(\d+)"[^>]*>/ig)];
            if (pageMatches.length > 0) {
                const nums = pageMatches.map(m => parseInt(m[1], 10)).filter(n => !isNaN(n));
                if (nums.length > 0) totalPages = Math.max(...nums);
                console.log("[Anikoto] Detected total pages: " + totalPages);
            }
        }
    
        const parsePage = (html) => {
            const items = [];
            const blocks = html.split('<div class="anime-item">');
            for (let i = 1; i < blocks.length; i++) {
                const block = blocks[i];
                const posterLinkMatch = block.match(/<a\s+[^>]*href="https:\/\/animepahetv\.to\/anime\/([^"]+)"[^>]*class="anime-poster"/);
                if (!posterLinkMatch) continue;
                const session = posterLinkMatch[1];
                const titleMatch = block.match(/<div\s+class="anime-name">\s*<a[^>]*>([^<]+)<\/a>/);
                const title = titleMatch ? titleMatch[1].trim() : "Untitled";
                const imgMatch = block.match(/<img\s+[^>]*src="([^"]+)"[^>]*class="lazyload"/);
                const poster = imgMatch ? imgMatch[1] : "";
                items.push({ title, poster, session });
            }
            return items;
        };
    
        let allItems = parsePage(html1);
    
        if (totalPages > 1) {
            const pagePromises = [];
            for (let p = 2; p <= totalPages; p++) {
                const url = base + "&page=" + p;
                console.log("[Anikoto] Fetching page " + p + ": " + url);
                pagePromises.push(soraFetch(url, { headers }).then(resp => {
                    if (!resp || resp.status !== 200) return "";
                    return resp.text();
                }));
            }
            const pageHTMLs = await Promise.allSettled(pagePromises);
            for (const result of pageHTMLs) {
                if (result.status === "fulfilled" && result.value) {
                    const items = parsePage(result.value);
                    allItems = allItems.concat(items);
                }
            }
        }
    
        console.log("[Anikoto] Search returned " + allItems.length + " items total");
        return allItems;
    }

    // ---------- Get episode list ----------
    static async getEpisodes(session) {
        const baseUrl = "https://animepahetv.to/viewApi?m=release&id=" + session + "&sort=episode_desc";
        const headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
            "Accept": "application/json, text/javascript, */*; q=0.01"
        };
    
        // Helper: fetch a page and return parsed JSON object
        const fetchPage = async (url) => {
            const resp = await soraFetch(url, { headers });
            if (!resp || resp.status !== 200) {
                console.error("[Anikoto] Page fetch failed, status: " + (resp ? resp.status : "null"));
                return null;
            }
            // Try standard .json() first, then fallback to text + JSON.parse
            if (typeof resp.json === "function") {
                try {
                    return await resp.json();
                } catch (e) {
                    console.error("[Anikoto] .json() failed:", e);
                }
            }
            // Fallback: parse JSON from text
            try {
                const text = await resp.text();
                return JSON.parse(text);
            } catch (e) {
                console.error("[Anikoto] JSON parse from text failed:", e);
                return null;
            }
        };
    
        // Fetch page 1
        const url1 = baseUrl + "&page=1";
        console.log("[Anikoto] Fetching episodes page 1: " + url1);
        const json1 = await fetchPage(url1);
        if (!json1 || !json1.data) {
            console.error("[Anikoto] Failed to get page 1 data");
            return [];
        }
    
        const allEpisodes = json1.data || [];
        const totalPages = json1.last_page || 1;
        console.log("[Anikoto] Episodes total pages: " + totalPages + " | first batch: " + allEpisodes.length);
    
        // Fetch remaining pages in parallel
        if (totalPages > 1) {
            const pagePromises = [];
            for (let p = 2; p <= totalPages; p++) {
                const url = baseUrl + "&page=" + p;
                console.log("[Anikoto] Scheduling fetch for page " + p + ": " + url);
                pagePromises.push(
                    fetchPage(url).then(json => {
                        if (json && json.data) {
                            console.log("[Anikoto] Page " + p + " data count: " + json.data.length);
                            allEpisodes.push(...json.data);
                        } else {
                            console.warn("[Anikoto] Page " + p + " returned no data");
                        }
                    }).catch(e => {
                        console.error("[Anikoto] Error fetching page " + p + ":", e);
                    })
                );
            }
            // Wait for all secondary pages to finish
            await Promise.allSettled(pagePromises);
        }
    
        // Sort ascending by episode number
        allEpisodes.sort((a, b) => a.episode - b.episode);
        console.log("[Anikoto] Total episodes fetched: " + allEpisodes.length);
        return allEpisodes;
    }

    // ---------- Get anime details (scrape HTML) ----------
    static async getDetails(session) {
        const url = "https://animepahetv.to/anime/" + session;
        console.log("[Anikoto] Fetching details: " + url);

        const resp = await soraFetch(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
            }
        });
        if (!resp || resp.status !== 200) return null;
        const html = await resp.text();

        const between = (str, a, b) => {
            const p = str.indexOf(a);
            if (p === -1) return "";
            const start = p + a.length;
            const end = str.indexOf(b, start);
            return end === -1 ? str.slice(start) : str.slice(start, end);
        };

        const title = between(html, '<h1 class="user-select-none"><span style="user-select:text">', '</span>').trim();
        const japanese = between(html, '<h2 class="japanese" style="font-weight:600">', '</h2>').trim();
        const synopsis = between(html, '<div class="anime-synopsis">', '</div>')
            .replace(/<br\s*\/?>/g, '\n')
            .replace(/<\/?[^>]+(>|$)/g, '')
            .trim();

        const infoBlock = between(html, '<div class="col-sm-4 anime-info">', '</div>');
        const getInfo = (label) => {
            const regex = new RegExp("<strong>" + label + "[\\s\\S]*?<\\/p>", "i");
            const match = infoBlock.match(regex);
            if (!match) return "";
            return match[0].replace(/<[^>]+>/g, "").replace(label, "").trim();
        };

        const type = getInfo("Type:");
        const episodes = getInfo("Episode:");
        const status = getInfo("Status:");
        const duration = getInfo("Duration:");
        const aired = getInfo("Aired:");
        const season = getInfo("Season:");
        const studio = getInfo("Studio:");
        const genres = [...infoBlock.matchAll(/<a\s+href="[^"]*\/genre\/[^"]*"[^>]*>([^<]+)<\/a>/g)]
            .map(m => m[1].trim());

        const posterMatch = html.match(/<img\s+[^>]*data-src="([^"]+)"[^>]*class="lazyload"/);
        const poster = posterMatch ? posterMatch[1] : "";

        // Capture MAL ID for Kwik streaming
        const malMatch = html.match(/\/\/myanimelist\.net\/anime\/(\d+)/);
        const malId = malMatch ? parseInt(malMatch[1], 10) : null;

        return { title, japanese, synopsis, type, episodes, status, duration, aired, season, studio, genres, poster, malId };
    }

    // ---------- Get stream servers for an episode ----------
    static async getServers(episodeSession) {
        const url = "https://animepahetv.to/anime/get-servers/" + episodeSession;
        console.log("[Anikoto] Fetching servers: " + url);

        const resp = await soraFetch(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
            }
        });
        if (!resp || resp.status !== 200 || typeof resp.json !== "function") return null;
        let json;
        try { json = await resp.json(); } catch (e) { return null; }
        return json?.servers || [];
    }

    // ---------- Extract Megaplay stream from server URL ----------
    static async extractMegaplayStream(serverUrl) {
        console.log("[Anikoto] Fetching Megaplay embed: " + serverUrl);
        const resp = await soraFetch(serverUrl, {
            headers: {
                "Referer": "https://megaplay.buzz/",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
            }
        });
        if (!resp || resp.status !== 200) return null;
        const html = await resp.text();
    
        const dataIdMatch = html.match(/data-id="(\d+)"/);
        if (!dataIdMatch) return null;
        const dataId = dataIdMatch[1];
    
        const sourcesUrl = "https://megaplay.buzz/stream/getSources?id=" + dataId + "&id=" + dataId;
        console.log("[Anikoto] Fetching sources: " + sourcesUrl);
        const srcResp = await soraFetch(sourcesUrl, {
            headers: {
                "Referer": "https://megaplay.buzz/",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
            }
        });
        if (!srcResp || srcResp.status !== 200 || typeof srcResp.json !== "function") return null;
        let data;
        try { data = await srcResp.json(); } catch (e) { return null; }
        if (!data?.sources?.file) return null;
    
        // Subtitle extraction
        const tracks = data.tracks || [];
        console.log("[Anikoto] Source tracks: " + JSON.stringify(tracks));
    
        let englishSub = "";
        const engTrack = tracks.find(t =>
            t.kind === "captions" &&
            t.label &&
            t.label.toLowerCase().includes("english")
        );
        if (engTrack && engTrack.file) englishSub = engTrack.file;
        else {
            const firstCaption = tracks.find(t => t.kind === "captions" && t.file);
            if (firstCaption) englishSub = firstCaption.file;
        }
    
        // All subtitle tracks with required headers
        const allSubtitles = tracks
            .filter(t => t.file)
            .map(t => ({
                url: t.file,
                label: t.label || t.kind,
                kind: t.kind,
                headers: { Referer: "https://megaplay.buzz/" }
            }));
    
        return {
            streamUrl: data.sources.file,
            subtitles: englishSub,
            subtitlesHeaders: { Referer: "https://megaplay.buzz/" },
            allSubtitles: allSubtitles,
            headers: { Referer: "https://megaplay.buzz/" }
        };
    }

    static async extractVidplayStream(serverUrl) {
        console.log("[Anikoto] Fetching Vidplay embed: " + serverUrl);
        const resp = await soraFetch(serverUrl, {
            headers: {
                "Referer": "https://vidwish.live/",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
            }
        });
        if (!resp || resp.status !== 200) return null;
        const html = await resp.text();
    
        const dataIdMatch = html.match(/data-id="(\d+)"/);
        if (!dataIdMatch) return null;
        const dataId = dataIdMatch[1];
    
        const sourcesUrl = "https://vidwish.live/stream/getSources?id=" + dataId + "&id=" + dataId;
        console.log("[Anikoto] Fetching Vidplay sources: " + sourcesUrl);
        const srcResp = await soraFetch(sourcesUrl, {
            headers: {
                "Referer": "https://vidwish.live/",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
            }
        });
        if (!srcResp || srcResp.status !== 200 || typeof srcResp.json !== "function") return null;
        let data;
        try { data = await srcResp.json(); } catch (e) { return null; }
        if (!data?.sources?.file) return null;
    
        const tracks = data.tracks || [];
        console.log("[Anikoto] Vidplay tracks: " + JSON.stringify(tracks));
    
        let englishSub = "";
        const engTrack = tracks.find(t =>
            t.kind === "captions" &&
            t.label &&
            t.label.toLowerCase().includes("english")
        );
        if (engTrack && engTrack.file) englishSub = engTrack.file;
        else {
            const firstCaption = tracks.find(t => t.kind === "captions" && t.file);
            if (firstCaption) englishSub = firstCaption.file;
        }
    
        const allSubtitles = tracks
            .filter(t => t.file)
            .map(t => ({
                url: t.file,
                label: t.label || t.kind,
                kind: t.kind,
                headers: { Referer: "https://vidwish.live/" }
            }));
    
        return {
            streamUrl: data.sources.file,
            subtitles: englishSub,
            subtitlesHeaders: { Referer: "https://vidwish.live/" },
            allSubtitles: allSubtitles,
            headers: { Referer: "https://vidwish.live/" }
        };
    }

    // ─── NEW: Kwik‑based Hardsub streaming ───
    static async extractKwikStream(url) {
        try {
            const match = url.match(/anime\/([^\/]+)\/([^?]+)\?num=(\d+)/);
            if (!match) return null;
            const [, animeSession, episodeSession, epNum] = match;
    
            console.log("[extractStreamUrl-Kwik] Anime: " + animeSession + ", Episode: " + epNum);
    
            // 1. Fetch play page for malId & chapterUpdatedAt
            const playUrl = "https://animepahetv.to/play/" + animeSession + "/" + episodeSession;
            const playResp = await soraFetch(playUrl, {
                headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
            });
            if (!playResp || playResp.status !== 200) return null;
            const playHtml = await playResp.text();
            const malMatch = playHtml.match(/malId":"(\d+)"/);
            const tsMatch = playHtml.match(/chapterUpdatedAt":(\d+)/);
            if (!malMatch || !tsMatch) return null;
            const malId = malMatch[1];
            const chapterUpdatedAt = tsMatch[1];
    
            // 2. Mapper
            const mapperUrl = `https://mapper.mewcdn.online/api/mal/${malId}/${epNum}/${chapterUpdatedAt}`;
            console.log("[extractStreamUrl-Kwik] Mapper: " + mapperUrl);
            const mapperResp = await soraFetch(mapperUrl, {
                headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
            });
            if (!mapperResp || mapperResp.status !== 200) return null;
            let mapperJson;
            if (typeof mapperResp.json === "function") {
                try { mapperJson = await mapperResp.json(); } catch (e) {}
            } else {
                try { mapperJson = JSON.parse(await mapperResp.text()); } catch (e) {}
            }
            if (!mapperJson) return null;
    
            // 3. Collect ALL qualities that have a sub URL
            const qualityOrder = ["Kiwi-Stream-360p", "Kiwi-Stream-720p", "Kiwi-Stream-800p", "Kiwi-Stream-1080p"];
            const streams = [];
    
            for (const quality of qualityOrder) {
                if (mapperJson[quality]?.sub?.url) {
                    const encoded = mapperJson[quality].sub.url;
    
                    // 4. Decode – AJAX header required
                    const ajaxUrl = "https://anikototv.to/ajax/server?get=" + encoded;
                    console.log("[extractStreamUrl-Kwik] Decoding " + quality + ": " + ajaxUrl);
                    const ajaxResp = await soraFetch(ajaxUrl, {
                        headers: {
                            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                            "X-Requested-With": "XMLHttpRequest"
                        }
                    });
                    if (!ajaxResp || ajaxResp.status !== 200) continue;
                    let ajaxJson;
                    if (typeof ajaxResp.json === "function") {
                        try { ajaxJson = await ajaxResp.json(); } catch (e) {}
                    } else {
                        try { ajaxJson = JSON.parse(await ajaxResp.text()); } catch (e) {}
                    }
                    if (!ajaxJson?.result?.url) continue;
                    const kwikUrl = ajaxJson.result.url;
                    console.log("[extractStreamUrl-Kwik] Kwik URL: " + kwikUrl);
    
                    // 5. Fetch Kwik page (bypass DDoS‑Guard)
                    const interceptor = new DdosGuardInterceptor();
                    const kwikResp = await interceptor.fetchWithBypass(kwikUrl);
                    if (!kwikResp || typeof kwikResp.text !== "function") {
                        console.error("[extractStreamUrl-Kwik] Kwik page fetch failed for " + quality);
                        continue;
                    }
                    const html = await kwikResp.text();
    
                    // 6. Extract packed script
                    let scriptContent = null;
                    const scriptMatch = html.match(/<script>(.*?)<\/script>/s);
                    if (scriptMatch) scriptContent = scriptMatch[1];
                    else {
                        const evalMatch = html.match(/eval\s*\(function\(p,a,c,k,e,d\)[\s\S]*?\)\)/);
                        if (evalMatch) scriptContent = evalMatch[0];
                    }
                    if (!scriptContent) {
                        console.error("[extractStreamUrl-Kwik] No script found for " + quality);
                        continue;
                    }
    
                    // 7. Unpack and extract HLS
                    let unpacked = scriptContent;
                    try { unpacked = unpack(scriptContent); } catch (e) {}
                    const hlsMatch = unpacked.match(/(?:const\s+source\s*=\s*['"]([^'"]+)['"])|(https?:\/\/[^\s'"<>]+\.m3u8[^\s'"<>]*)/i);
                    if (!hlsMatch) {
                        console.error("[extractStreamUrl-Kwik] HLS URL not found for " + quality);
                        continue;
                    }
                    let hlsUrl = hlsMatch[1] || hlsMatch[0];
                    hlsUrl = hlsUrl.replace("/stream/", "/hls/").replace("uwu.m3u8", "owo.m3u8").replace(/\\+$/, '');
    
                    const resolution = quality.replace("Kiwi-Stream-", "").replace("p", "p");
                    streams.push({
                        title: "Kiwi Hardsub (" + resolution + ")",
                        streamUrl: hlsUrl,
                        headers: { Referer: "https://kwik.cx/", Origin: "https://kwik.cx" }
                    });
                }
            }
    
            if (streams.length === 0) {
                console.error("[extractStreamUrl-Kwik] No valid qualities found");
                return null;
            }
    
            return streams;
        } catch (e) {
            console.error("[extractStreamUrl-Kwik] Error: " + e);
            return null;
        }
    }
}

async function extractStreamUrl(url) {
    try {
        const match = url.match(/anime\/([^\/]+)\/([^?]+)\?num=(\d+)/);
        if (!match) throw new Error("Invalid URL format");
        const [, animeSession, episodeSession, epNum] = match;

        console.log("[extractStreamUrl] Anime: " + animeSession + ", Episode: " + epNum + ", Session: " + episodeSession);

        const servers = await Anikoto.getServers(episodeSession);
        if (!servers || servers.length === 0) {
            console.warn("[extractStreamUrl] No servers found");
            return JSON.stringify({ streams: [], subtitles: "", subtitlesHeaders: {}, allSubtitles: [] });
        }

        // Separate servers by type
        const megaSub = servers.find(s => s.name === "Sub-Megaplay");
        const megaDub = servers.find(s => s.name === "Dub-Megaplay");
        const vidplaySub = servers.find(s => s.name.includes("Vidplay") && s.name.includes("Sub"));
        const vidplayDub = servers.find(s => s.name.includes("Vidplay") && s.name.includes("Dub"));

        // Helper functions (return allSubtitles too)
        async function fetchMegaplayStream(server) {
            if (!server) return null;
            const streamData = await Anikoto.extractMegaplayStream(server.url);
            if (!streamData) return null;
            return {
                title: server.name.replace("Sub-Megaplay", "Megaplay SUB")
                           .replace("Dub-Megaplay", "Megaplay DUB"),
                streamUrl: streamData.streamUrl,
                headers: streamData.headers,
                subtitles: streamData.subtitles,
                subtitlesHeaders: streamData.subtitlesHeaders,
                allSubtitles: streamData.allSubtitles
            };
        }

        async function fetchVidplayStream(server) {
            if (!server) return null;
            const streamData = await Anikoto.extractVidplayStream(server.url);
            if (!streamData) return null;
            return {
                title: server.name.replace("Sub-Vidplay", "Vidplay SUB")
                           .replace("Dub-Vidplay", "Vidplay DUB"),
                streamUrl: streamData.streamUrl,
                headers: streamData.headers,
                subtitles: streamData.subtitles,
                subtitlesHeaders: streamData.subtitlesHeaders,
                allSubtitles: streamData.allSubtitles
            };
        }

        // Fetch all streams in parallel
        const [
            megaSubStream, megaDubStream,
            vidSubStream,  vidDubStream,
            kiwiStreams
        ] = await Promise.allSettled([
            fetchMegaplayStream(megaSub),
            fetchMegaplayStream(megaDub),
            fetchVidplayStream(vidplaySub),
            fetchVidplayStream(vidplayDub),
            Anikoto.extractKwikStream(url)
        ]);

        const streams = [];
        let subtitles = "";
        let subtitlesHeaders = {};
        let allSubtitles = [];

        // Process Megaplay
        if (megaSubStream.status === "fulfilled" && megaSubStream.value) {
            const s = megaSubStream.value;
            streams.push({ title: s.title, streamUrl: s.streamUrl, headers: s.headers });
            if (!subtitles && s.subtitles) {
                subtitles = s.subtitles;
                subtitlesHeaders = s.subtitlesHeaders;
            }
            if (s.allSubtitles?.length) {
                allSubtitles.push(...s.allSubtitles);
            }
        }
        if (megaDubStream.status === "fulfilled" && megaDubStream.value) {
            const s = megaDubStream.value;
            streams.push({ title: s.title, streamUrl: s.streamUrl, headers: s.headers });
            if (!subtitles && s.subtitles) {
                subtitles = s.subtitles;
                subtitlesHeaders = s.subtitlesHeaders;
            }
            if (s.allSubtitles?.length) {
                allSubtitles.push(...s.allSubtitles);
            }
        }

        // Process Vidplay
        if (vidSubStream.status === "fulfilled" && vidSubStream.value) {
            const s = vidSubStream.value;
            streams.push({ title: s.title, streamUrl: s.streamUrl, headers: s.headers });
            if (!subtitles && s.subtitles) {
                subtitles = s.subtitles;
                subtitlesHeaders = s.subtitlesHeaders;
            }
            if (s.allSubtitles?.length) {
                allSubtitles.push(...s.allSubtitles);
            }
        }
        if (vidDubStream.status === "fulfilled" && vidDubStream.value) {
            const s = vidDubStream.value;
            streams.push({ title: s.title, streamUrl: s.streamUrl, headers: s.headers });
            if (!subtitles && s.subtitles) {
                subtitles = s.subtitles;
                subtitlesHeaders = s.subtitlesHeaders;
            }
            if (s.allSubtitles?.length) {
                allSubtitles.push(...s.allSubtitles);
            }
        }

        // Process Kwik streams
        if (kiwiStreams.status === "fulfilled" && kiwiStreams.value) {
            streams.push(...kiwiStreams.value);
            console.log("[extractStreamUrl] Added " + kiwiStreams.value.length + " Kiwi Hardsub streams");
        } else if (kiwiStreams.status === "rejected") {
            console.warn("[extractStreamUrl] Kiwi extraction failed:", kiwiStreams.reason);
        }

        const result = JSON.stringify({ streams, subtitles, subtitlesHeaders, allSubtitles });
        console.log("[extractStreamUrl] Result: " + result.substring(0, 300));
        return result;

    } catch (error) {
        console.log("[extractStreamUrl] Fetch error: " + error);
        return JSON.stringify({ streams: [], subtitles: "", subtitlesHeaders: {}, allSubtitles: [] });
    }
}

// ─── Search Results (unchanged) ───
async function searchResults(keyword) {
    try {
        console.log("[searchResults] Keyword: " + keyword);
        const items = await Anikoto.search(keyword);
        if (!items) return JSON.stringify([{ title: "Error", image: "", href: "" }]);

        const transformed = items.map(item => ({
            title: item.title || "Untitled",
            image: item.poster || "",
            href: "anime/" + item.session
        }));

        console.log("Transformed Results: " + JSON.stringify(transformed));
        return JSON.stringify(transformed);
    } catch (error) {
        console.log("[searchResults] Fetch error: " + error);
        return JSON.stringify([{ title: "Error", image: "", href: "" }]);
    }
}

// ─── Extract Details (unchanged) ───
async function extractDetails(url) {
    try {
        const match = url.match(/anime\/([^\/]+)/);
        if (!match) throw new Error("Invalid URL format");
        const session = match[1];
        const details = await Anikoto.getDetails(session);
        if (!details) throw new Error("Could not fetch details");

        const transformed = [{
            description: details.synopsis || "No description available",
            aliases: "Duration: " + (details.duration || "Unknown"),
            airdate: "Aired: " + (details.aired || "Unknown")
        }];

        console.log(JSON.stringify(transformed));
        return JSON.stringify(transformed);
    } catch (error) {
        console.log("Details error: " + error);
        return JSON.stringify([{
            description: "Error loading description",
            aliases: "Duration: Unknown",
            airdate: "Aired/Released: Unknown"
        }]);
    }
}

// ─── Extract Episodes (unchanged) ───
async function extractEpisodes(url) {
    try {
        const match = url.match(/anime\/([^\/]+)/);
        if (!match) throw new Error("Invalid URL format");
        const session = match[1];
        const episodesData = await Anikoto.getEpisodes(session);
        if (!episodesData) return JSON.stringify([]);

        const sorted = episodesData.sort((a, b) => a.episode - b.episode);
        const episodesArray = sorted.map(ep => ({
            href: "anime/" + session + "/" + ep.session + "?num=" + ep.episode,
            number: ep.episode,
            title: ep.title || "Episode " + ep.episode
        }));

        console.log(episodesArray);
        return JSON.stringify(episodesArray);
    } catch (error) {
        console.log("Fetch error in extractEpisodes: " + error);
        return JSON.stringify([]);
    }
}

// ─── DdosGuardInterceptor (bypass DDoS protection) ───
class DdosGuardInterceptor {
    constructor() {
        this.errorCodes = [403];
        this.serverCheck = ["ddos-guard"];
        this.cookieStore = {};
    }

    async fetchWithBypass(url, options = {}) {
        let response = await this.fetchWithCookies(url, options);
        if (this.errorCodes.includes(response.status)) {
            const newCookie = await this.getNewCookie(url);
            if (newCookie || this.cookieStore["__ddg2_"]) {
                return this.fetchWithCookies(url, options);
            }
            return response;
        }

        let responseText;
        try { responseText = await response.text(); } catch (e) { return response; }

        const isBlocked = responseText.includes('ddos-guard/js-challenge') ||
                         responseText.includes('DDoS-Guard') ||
                         responseText.includes('data-ddg-origin');
        if (!isBlocked) {
            response.text = async () => responseText;
            return response;
        }

        if (this.cookieStore["__ddg2_"]) {
            return this.fetchWithCookies(url, options);
        }

        const newCookie = await this.getNewCookie(url);
        if (!newCookie) {
            response.text = async () => responseText;
            return response;
        }
        return this.fetchWithCookies(url, options);
    }

    async fetchWithCookies(url, options) {
        const cookieHeader = this.getCookieHeader();
        const headers = options.headers || {};
        if (cookieHeader) headers.Cookie = cookieHeader;
        const response = await soraFetch(url, { headers });
        try {
            const setCookie = response.headers ? (response.headers["Set-Cookie"] || response.headers["set-cookie"]) : null;
            if (setCookie) this.storeCookies(setCookie);
        } catch (e) {}
        return response;
    }

    storeCookies(setCookieString) {
        const cookies = Array.isArray(setCookieString) ? setCookieString : [setCookieString];
        cookies.forEach(cookieHeader => {
            const parts = cookieHeader.split(";");
            if (parts.length > 0) {
                const [key, value] = parts[0].split("=");
                if (key) this.cookieStore[key.trim()] = value?.trim() || "";
            }
        });
    }

    getCookieHeader() {
        return Object.entries(this.cookieStore).map(([k, v]) => `${k}=${v}`).join("; ");
    }

    async getNewCookie(targetUrl) {
        try {
            const wellKnownResponse = await soraFetch("https://check.ddos-guard.net/check.js");
            const wellKnownText = await wellKnownResponse.text();
            const paths = wellKnownText.match(/['"](\/\.well-known\/ddos-guard\/[^'"]+)['"]/g);
            if (!paths || paths.length === 0) return null;
            const localPath = paths[0].replace(/['"]/g, '');
            const match = targetUrl.match(/^(https?:\/\/[^\/]+)/);
            if (!match) return null;
            const baseUrl = match[1];
            const localUrl = baseUrl + localPath;

            await soraFetch(localUrl, { headers: { 'Referer': targetUrl } });
            const checkPaths = wellKnownText.match(/['"]https:\/\/check\.ddos-guard\.net\/[^'"]+['"]/g);
            if (checkPaths && checkPaths.length > 0) {
                const checkUrl = checkPaths[0].replace(/['"]/g, '');
                await soraFetch(checkUrl, { headers: { 'Referer': targetUrl } });
            }
            return this.cookieStore["__ddg2_"] || null;
        } catch (e) {
            return null;
        }
    }
}

// ─── Packer unpacker ───
function unpack(source) {
    function _filterargs(source) {
        const juicers = [
            /}\('(.*)', *(\d+|\[\]), *(\d+), *'(.*)'\.split\('\|'\), *(\d+), *(.*)\)\)/,
            /}\('(.*)', *(\d+|\[\]), *(\d+), *'(.*)'\.split\('\|'\)/,
        ];
        for (const juicer of juicers) {
            const args = juicer.exec(source);
            if (args) {
                return {
                    payload: args[1],
                    symtab: args[4].split("|"),
                    radix: parseInt(args[2]),
                    count: parseInt(args[3])
                };
            }
        }
        throw Error("Could not make sense of p.a.c.k.e.r data");
    }

    let { payload, symtab, radix, count } = _filterargs(source);
    if (count != symtab.length) throw Error("Malformed symtab.");

    let unbase;
    const ALPHABET = {
        62: "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ",
        95: "' !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~'",
    };
    if (radix <= 36) unbase = (value) => parseInt(value, radix);
    else {
        const dict = {};
        [...ALPHABET[radix] || ALPHABET[62]].forEach((c, i) => { dict[c] = i; });
        unbase = (value) => {
            let ret = 0;
            [...value].reverse().forEach((c, i) => { ret += Math.pow(radix, i) * dict[c]; });
            return ret;
        };
    }

    function lookup(word) {
        if (radix == 1) return symtab[parseInt(word)];
        return symtab[unbase(word)] || word;
    }

    source = payload.replace(/\b\w+\b/g, lookup);
    return source;
}

// ─── soraFetch (existing wrapper) ───
async function soraFetch(url, options = { headers: {}, method: "GET", body: null, encoding: "utf-8" }) {
    try {
        return await fetchv2(
            url,
            options.headers ?? {},
            options.method ?? "GET",
            options.body ?? null,
            true,
            options.encoding ?? "utf-8"
        );
    } catch (e) {
        try {
            return await fetch(url, options);
        } catch (error) {
            return null;
        }
    }
}