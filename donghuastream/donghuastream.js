// DonghuaStream module v1.1.0
// Upstream notes (2026-11): episode pages lazy-load the player iframe via
// LiteSpeed cache (data-litespeed-src, src=about:blank). Current embeds are
// either geo.dailymotion.com players (working) or play.streamplay.co.in/embed
// (backend /pl/<uuid> returns empty -> player shows "Server error!" even in a
// real browser; upstream dead, best-effort only).

function dsUnescape(s) {
    return String(s)
        .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(code))
        .replace(/&quot;/g, '"')
        .replace(/&#038;|&amp;/g, '&')
        .replace(/&#8211;|&ndash;/g, '-')
        .replace(/&apos;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');
}

async function searchResults(keyword) {
    try {
        const results = [];
        const response = await fetchv2(`https://donghuastream.org/?s=${encodeURIComponent(keyword)}`);
        const html = await response.text();

        const regex = /<article class="bs"[^>]*>[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"[^>]*>[\s\S]*?<h2[^>]*>([\s\S]*?)<\/h2>/g;

        let match;
        while ((match = regex.exec(html)) !== null) {
            results.push({
                title: dsUnescape(match[3].replace(/<[^>]+>/g, '')).trim(),
                image: match[2].trim(),
                href: match[1].trim()
            });
        }

        return JSON.stringify(results);
    } catch (e) {
        return JSON.stringify([]);
    }
}

async function extractDetails(url) {
    try {
        const response = await fetchv2(url);
        const html = await response.text();

        const match = html.match(/<div class="entry-content"[^>]*>([\s\S]*?)<\/div>/);

        let description = "N/A";
        if (match) {
            description = dsUnescape(match[1].replace(/<[^>]+>/g, '')).trim();
        }

        const alt = html.match(/Alternative Title[s]?\s*<\/?[a-z]+>?\s*:?\s*<\/span>\s*([^<]+)/i);
        let aliases = 'N/A';
        if (alt) aliases = dsUnescape(alt[1]).trim();

        const date = html.match(/"datePublished"\s*:\s*"([^"]+)"/);
        const airdate = date ? date[1] : 'N/A';

        return JSON.stringify([{
            description: description || 'N/A',
            aliases: aliases,
            airdate: airdate
        }]);
    } catch (e) {
        return JSON.stringify([{ description: 'N/A', aliases: 'N/A', airdate: 'N/A' }]);
    }
}

async function extractEpisodes(url) {
    try {
        const results = [];
        const response = await fetchv2(url);
        const html = await response.text();

        // Anchor on the epl-num container; do not let .*? cross a closing </a>
        // (old regex matched the facebook sharer link instead of the episode).
        const regex = /<a[^>]+href="([^"]+)"[^>]*>(?:(?!<\/a>)[\s\S])*?<div class="epl-num">\s*(\d+)[\s\S]*?<\/a>/g;
        const seen = {};
        let match;

        while ((match = regex.exec(html)) !== null) {
            const href = match[1].trim();
            const num = parseInt(match[2], 10);
            if (!href || !num || seen[href]) continue;
            seen[href] = true;
            results.push({ href: href, number: num });
        }

        results.sort((a, b) => a.number - b.number);
        return JSON.stringify(results);
    } catch (e) {
        return JSON.stringify([]);
    }
}

// DailyMotion's CDN (cdndirector) rejects requests without a browser UA +
// Referer (403). Send them on every HLS fetch and expose them on the stream
// entry so the consumer player can do the same.
const DS_HLS_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36',
    'Referer': 'https://www.dailymotion.com/'
};

async function extractStreamUrl(url) {
    try {
        const response = await fetchv2(url);
        const html = await response.text();

        // Player iframe is lazily loaded: <iframe src="about:blank" data-litespeed-src="...">
        // Grab the iframe from either attribute (plus bare-string fallbacks).
        let iframeUrl = null;
        const lazy = html.match(/<iframe[^>]*data-litespeed-src\s*=\s*["']([^"']+)["'][^>]*>/i);
        if (lazy) iframeUrl = lazy[1];
        if (!iframeUrl) {
            const plain = html.match(/<iframe[^>]*\ssrc\s*=\s*["']([^"']+)["'][^>]*>/i);
            if (plain && !/about:blank/i.test(plain[1])) iframeUrl = plain[1];
        }
        if (!iframeUrl) {
            const dm = html.match(/geo\.dailymotion\.com\/player\/[a-z0-9]+\.html\?video=([a-zA-Z0-9]+)/i);
            if (dm) iframeUrl = 'https://geo.dailymotion.com/player/x19jsm.html?video=' + dm[1];
        }

        if (!iframeUrl) return JSON.stringify({ streams: [] });
        if (iframeUrl.indexOf('//') === 0) iframeUrl = 'https:' + iframeUrl;

        // DailyMotion embed -> metadata API -> master m3u8 -> best variant
        const dmMatch = iframeUrl.match(/geo\.dailymotion\.com\/player\/[a-z0-9]+\.html\?video=([a-zA-Z0-9]+)/i)
            || iframeUrl.match(/dailymotion\.com\/embed\/video\/([a-zA-Z0-9]+)/i);
        if (dmMatch) {
            const videoId = dmMatch[1];
            const metaRes = await fetchv2(`https://www.dailymotion.com/player/metadata/video/${videoId}`);
            const metaText = await metaRes.text();
            let metaJson;
            try { metaJson = JSON.parse(metaText); } catch (e) { return JSON.stringify({ streams: [] }); }
            const hlsLink = metaJson.qualities && metaJson.qualities.auto && metaJson.qualities.auto[0] && metaJson.qualities.auto[0].url;
            if (!hlsLink) return JSON.stringify({ streams: [] });
            const bestHls = await dsBestHls(hlsLink);
            return JSON.stringify({ streams: [{ title: 'DailyMotion', streamUrl: bestHls, headers: DS_HLS_HEADERS }] });
        }

        // StreamPlay embed -> /pl/<uuid> JSON (upstream currently broken server-side;
        // kept best-effort in case they fix it). Fallback: hand back the embed page.
        const spMatch = iframeUrl.match(/play\.streamplay\.co\.in\/embed\/([a-f0-9-]+)/i);
        if (spMatch) {
            const uuid = spMatch[1];
            try {
                const plRes = await fetchv2(`https://play.streamplay.co.in/pl/${uuid}?_=${Date.now()}`,
                    { Referer: 'https://play.streamplay.co.in/embed/' + uuid, 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json' });
                const plText = await plRes.text();
                const plJson = JSON.parse(plText);
                const file = plJson && (plJson.file || (plJson.sources && plJson.sources[0] && plJson.sources[0].file) || plJson.source);
                if (file) {
                    return JSON.stringify({ streams: [{ title: 'StreamPlay', streamUrl: file }] });
                }
            } catch (e) { /* upstream dead */ }
            return JSON.stringify({ streams: [{ title: 'StreamPlay (embed)', streamUrl: iframeUrl }] });
        }

        // Unknown embed host: return the iframe URL itself as a fallback stream.
        return JSON.stringify({ streams: [{ title: 'Embed', streamUrl: iframeUrl }] });
    } catch (e) {
        return JSON.stringify({ streams: [] });
    }
}

async function dsBestHls(hlsUrl) {
    try {
        const res = await fetchv2(hlsUrl, DS_HLS_HEADERS);
        const text = await res.text();
        const regex = /#EXT-X-STREAM-INF:[^\n]*RESOLUTION=(\d+)x(\d+)[^\n]*\n([^\n]+)/g;
        const streams = [];
        let match;

        while ((match = regex.exec(text)) !== null) {
            streams.push({
                width: parseInt(match[1]),
                height: parseInt(match[2]),
                url: match[3].trim()
            });
        }

        if (streams.length === 0) return hlsUrl;
        streams.sort((a, b) => b.height - a.height);
        return streams[0].url;
    } catch (e) {
        return hlsUrl;
    }
}
