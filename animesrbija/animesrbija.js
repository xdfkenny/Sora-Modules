async function searchResults(keyword) {
    const results = [];
    const baseUrl = "https://www.animesrbija.com";
    try {
        // The filter page is a Next.js App Router page; its React Query cache
        // is streamed as clean JSON when requested with the RSC header.
        const response = await fetchv2(
            "https://www.animesrbija.com/filter?q=" + encodeURIComponent(keyword),
            { "RSC": "1", "User-Agent": "Mozilla/5.0" }
        );
        const text = await response.text();

        // Locate the dehydrated entry for our query, then its "items" array.
        const qMarker = '"q":' + JSON.stringify(keyword);
        const qIdx = text.indexOf(qMarker);
        let items = [];
        if (qIdx !== -1) {
            const dataIdx = text.indexOf('"data":{"items":', qIdx);
            if (dataIdx !== -1) {
                const arrStart = text.indexOf('[', dataIdx + '"data":{"items":'.length);
                let depth = 0, inStr = false, esc = false, pos = arrStart;
                for (pos = arrStart; pos < text.length; pos++) {
                    const c = text[pos];
                    if (inStr) {
                        if (esc) esc = false;
                        else if (c === '\\') esc = true;
                        else if (c === '"') inStr = false;
                    } else {
                        if (c === '"') inStr = true;
                        else if (c === '[' || c === '{') depth++;
                        else if (c === ']' || c === '}') {
                            depth--;
                            if (depth === 0) break;
                        }
                    }
                }
                items = JSON.parse(text.slice(arrStart, pos + 1));
            }
        }

        for (const item of items) {
            if (!item || !item.title) continue;
            let image = item.img || "";
            if (image && !image.startsWith("http")) image = baseUrl + image;
            results.push({
                title: item.title,
                image: image,
                href: baseUrl + "/anime/" + (item.slug || "")
            });
        }
    } catch (err) {
        console.error("animesrbija search error:", err);
    }
    console.log(results);
    return JSON.stringify(results);
}

// --- Rewritten 2026-11: site moved to Next.js + JSON API. Old server-side
// markup (anime-description, anime-episode-item, "player1" m3u8 in HTML) is
// gone. New endpoints:
//   details:  GET /api/anime/<slug>          -> JSON (description, aired, ...)
//   episodes: GET /api/anime/<slug> -> id, GET /api/episodes/<id> -> [{number}]
//   watch:    /epizoda?animeId=<id>&ep=<n>   -> page embeds Filemoon-style
//             embed URL https://<host>/e/<code>/<file> (players "custom" modes
//             are token-locked; Filemoon embed is the extractable one)

const SRB_BASE = "https://www.animesrbija.com";

async function srbGet(url) {
    try {
        return await fetchv2(url, { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" }, "GET", null);
    } catch (e) {
        return null;
    }
}

function srbSlugFromUrl(url) {
    const m = String(url).match(/\/anime\/([^\/?#]+)/i);
    return m ? m[1] : "";
}

async function srbAnimeId(slug) {
    const resp = await srbGet(SRB_BASE + "/api/anime/" + slug);
    if (!resp) return null;
    try {
        const json = await resp.json();
        return json && json.id ? json.id : null;
    } catch (e) {
        return null;
    }
}

async function extractDetails(url) {
    try {
        const slug = srbSlugFromUrl(url);
        if (!slug) throw new Error("no slug in url: " + url);
        const resp = await srbGet(SRB_BASE + "/api/anime/" + slug);
        if (!resp) throw new Error("no response");
        const json = await resp.json();

        let description = String(json.description || json.plot || "").trim();
        if (!description) {
            // fall back to the anime page's meta description
            const pageResp = await srbGet(SRB_BASE + "/anime/" + slug);
            if (pageResp) {
                const pageHtml = await pageResp.text();
                const m = pageHtml.match(/<meta name="description" content="([^"]+)"/);
                if (m) description = m[1].replace(/ online sa prevodom.*$/i, "").trim();
            }
        }
        if (!description) description = "No description available";
        const aliases = String(json.japaneseTitle || "N/A");
        const airdate = [json.aired, json.status].filter(Boolean).join(" · ") || "N/A";

        return JSON.stringify([{
            description: description.replace(/\s+/g, ' ').trim(),
            aliases: aliases,
            airdate: airdate
        }]);
    } catch (error) {
        return JSON.stringify([{
            description: 'Error loading description',
            aliases: 'N/A',
            airdate: 'N/A'
        }]);
    }
}

async function extractEpisodes(url) {
    try {
        const slug = srbSlugFromUrl(url);
        if (!slug) throw new Error("no slug in url: " + url);
        const animeId = await srbAnimeId(slug);
        if (!animeId) throw new Error("could not resolve anime id");

        const resp = await srbGet(SRB_BASE + "/api/episodes/" + animeId);
        if (!resp) throw new Error("no response from episodes api");
        const json = await resp.json();
        const items = Array.isArray(json) ? json : (json.items || []);

        const episodes = [];
        for (const item of items) {
            if (!item || typeof item.number === "undefined") continue;
            episodes.push({
                href: SRB_BASE + "/epizoda?animeId=" + animeId + "&ep=" + item.number,
                number: Number(item.number)
            });
        }
        episodes.sort((a, b) => a.number - b.number);
        return JSON.stringify(episodes);
    } catch (error) {
        return JSON.stringify([]);
    }
}

async function extractStreamUrl(url) {
    try {
        const resp = await srbGet(url);
        if (!resp) return JSON.stringify({ streams: [], subtitle: "" });
        const html = await resp.text();

        // The episode page embeds the player source(s), e.g.
        // https://bysezejataos.com/e/x64pco9b5ho2/xsaBRT_-_01 (Filemoon-like)
        const embedRegex = /https?:\/\/[a-z0-9.-]+\/e\/[a-z0-9]+\/[a-zA-Z0-9_.-]+/g;
        const seen = {};
        const streams = [];
        let match;
        while ((match = embedRegex.exec(html)) !== null) {
            const embedUrl = match[0];
            if (seen[embedUrl]) continue;
            seen[embedUrl] = true;
            streams.push({
                title: "Server " + (streams.length + 1),
                streamUrl: embedUrl,
                headers: {}
            });
        }

        return JSON.stringify({ streams: streams, subtitle: "" });
    } catch (error) {
        return JSON.stringify({ streams: [], subtitle: "" });
    }
}
