/* SpacePowerFans — rewritten for the madar theme (kiranime REST is gone).
   Search: GET /wp-json/madar/v1/search?q= (same API the site's live search uses)
   Details/Episodes: scrape the /anime/<slug>/ page
   Streams: parse the data-player-sources JSON on the /watch/... page */

const SPF_REST = "https://spacepowerfans.com/wp-json/madar/v1/search?q=";

async function searchResults(keyword) {
    try {
        const url = SPF_REST + encodeURIComponent((keyword || "").trim());
        const response = await soraFetch(url, {
            headers: { "Accept": "application/json", "Referer": "https://spacepowerfans.com/" }
        });
        if (!response) return JSON.stringify([]);
        const text = typeof response.text === "function" ? await response.text() : String(response);
        const data = JSON.parse(text);
        if (!Array.isArray(data)) return JSON.stringify([]);

        const results = [];
        for (const item of data) {
            if (!item || !item.url) continue;
            results.push({
                title: item.title || item.title_en || "Unknown",
                image: item.poster || "",
                href: item.url
            });
        }
        return JSON.stringify(results);
    } catch (error) {
        console.log("[searchResults] error: " + error);
        return JSON.stringify([]);
    }
}

async function extractDetails(url) {
    try {
        const response = await soraFetch(url, {
            headers: { "Referer": "https://spacepowerfans.com/" }
        });
        const html = await response.text();

        let description = "N/A";
        const descMatch = html.match(/property="og:description" content="([^"]*)"/) ||
                          html.match(/<meta name="description" content="([^"]*)"/);
        if (descMatch) description = descMatch[1].trim();

        let image = "";
        const imgMatch = html.match(/property="og:image" content="([^"]*)"/);
        if (imgMatch) image = imgMatch[1];

        let airdate = "N/A";
        const yearMatch = html.match(/data-year="(\d{4})"/) ||
                          html.match(/(\d{4})<\/span>\s*<span[^>]*>/);
        if (yearMatch) airdate = yearMatch[1];

        const results = [{
            description: description,
            aliases: "N/A",
            airdate: airdate
        }];
        return JSON.stringify(results);
    } catch (error) {
        console.log("[extractDetails] error: " + error);
        return JSON.stringify([{ description: "N/A", aliases: "N/A", airdate: "N/A" }]);
    }
}

async function extractEpisodes(url) {
    try {
        const response = await soraFetch(url, {
            headers: { "Referer": "https://spacepowerfans.com/" }
        });
        const html = await response.text();

        const episodes = [];
        // New madar theme: <a class="ep__link" href="WATCH_URL"> ... <span class="ep__num">55</span>
        const blockRegex = /<a[^>]+class="[^"]*ep__link[^"]*"[^>]+href="([^"]+)"[\s\S]*?<span class="ep__num">([^<]*)<\/span>/g;
        let match;
        while ((match = blockRegex.exec(html)) !== null) {
            const href = match[1].trim();
            const numText = match[2].trim();
            const num = parseInt(numText, 10);
            episodes.push({
                href: href,
                number: isNaN(num) ? episodes.length + 1 : num
            });
        }

        if (episodes.length === 0) {
            // Fallback: any /watch/ link counts as a single-episode (movie) page
            const watchRegex = /href="(https:\/\/spacepowerfans\.com\/watch\/[^"]+)"/g;
            const seen = new Set();
            let wm;
            while ((wm = watchRegex.exec(html)) !== null) {
                if (seen.has(wm[1])) continue;
                seen.add(wm[1]);
                episodes.push({ href: wm[1], number: episodes.length + 1 });
            }
        }

        episodes.sort((a, b) => a.number - b.number);
        return JSON.stringify(episodes);
    } catch (error) {
        console.log("[extractEpisodes] error: " + error);
        return JSON.stringify([]);
    }
}

async function extractStreamUrl(url) {
    try {
        const response = await soraFetch(url, {
            headers: { "Referer": "https://spacepowerfans.com/" }
        });
        const html = await response.text();

        // data-player-sources JSON: [{"id":1,"name":"Mega","links":[{"q":"720p","url":"..."}]}, ...]
        const jsonMatch = html.match(/data-player-sources>([\s\S]*?)<\/script>/);
        if (!jsonMatch) return JSON.stringify({ streams: [], subtitles: "" });

        let servers;
        try { servers = JSON.parse(jsonMatch[1]); } catch (e) { return JSON.stringify({ streams: [], subtitles: "" }); }

        const streams = [];
        const direct = [];
        const embeds = [];
        for (const server of Array.isArray(servers) ? servers : []) {
            const name = server && server.name ? server.name : "Server";
            for (const link of Array.isArray(server.links) ? server.links : []) {
                if (!link || !link.url) continue;
                const quality = link.q ? ` ${link.q}` : "";
                const entry = {
                    title: `${name}${quality}`,
                    streamUrl: link.url,
                    headers: { "Referer": "https://spacepowerfans.com/" }
                };
                // Direct files are playable; iframe embeds (mega.nz etc.) are not
                if (/\.(mp4|m3u8|mkv|webm)(\?|$)/i.test(link.url)) direct.push(entry);
                else embeds.push(entry);
            }
        }

        // Direct links first; embed fallbacks last (player may still handle them)
        for (const e of direct) streams.push(e);
        for (const e of embeds) streams.push(e);

        return JSON.stringify({ streams: streams, subtitles: "" });
    } catch (error) {
        console.log("[extractStreamUrl] error: " + error);
        return JSON.stringify({ streams: [], subtitles: "" });
    }
}

async function soraFetch(url, options = { headers: {}, method: 'GET', body: null }) {
    try {
        return await fetchv2(url, options.headers ?? {}, options.method ?? 'GET', options.body ?? null);
    } catch (e) {
        try {
            return await fetch(url, options);
        } catch (error) {
            return null;
        }
    }
}
