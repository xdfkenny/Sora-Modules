// Nimegami module — site was rebuilt as a Next.js app (release 20261108),
// old WordPress markup (?s= search, <h4>Episode, download_div) is gone.
// Rewritten 2026-11:
//   search:   GET /anime/?q=<kw>  — results are server-rendered in the
//             Next.js flight payload (escaped JSON inside the HTML)
//   details:  GET /<slug>/        — <div class="synopsis-block"><p>…</p>
//   episodes: per-episode download blocks id="download_episode_N", links
//             /<slug>/download/<N>/<quality>/<hash>/  (302 -> file host)

const NIMEGAMI_BASE = "https://nimegami.id";
const NIMEGAMI_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

async function nimegamiFetch(url) {
    try {
        return await fetchv2(url, { "User-Agent": NIMEGAMI_UA }, "GET", null);
    } catch (e) {
        try {
            return await fetch(url, { headers: { "User-Agent": NIMEGAMI_UA } });
        } catch (e2) {
            return null;
        }
    }
}

function qualityToNumber(q) {
    const m = String(q).match(/(\d+)/);
    return m ? parseInt(m[1], 10) : 0;
}

async function searchResults(keyword) {
    const results = [];
    try {
        const url = NIMEGAMI_BASE + "/anime/?q=" + encodeURIComponent(keyword);
        const response = await nimegamiFetch(url);
        if (!response) throw new Error("no response");
        const html = await response.text();

        // Next.js flight payload, escaped JSON inside <script> strings:
        // \"href\":\"/slug/\",\"prefetch\":false,\"className\":\"poster-link\",\"aria-label\":\"Lihat TITLE\"
        const cardRegex = /\\"href\\":\\"(\/[^"\\]+)\\",\\"prefetch\\":false,\\"className\\":\\"poster-link\\",\\"aria-label\\":\\"Lihat ([^"\\]+)\\"/g;
        const srcRegex = /\\"src\\":\\"([^"\\]+)\\"/;

        let match;
        while ((match = cardRegex.exec(html)) !== null) {
            let image = "";
            const rest = html.substring(match.index + match[0].length, match.index + match[0].length + 600);
            const srcMatch = rest.match(srcRegex);
            if (srcMatch) {
                image = srcMatch[1];
                if (image && !image.startsWith("http")) image = NIMEGAMI_BASE + image;
            }
            results.push({
                title: match[2].trim(),
                image: image,
                href: NIMEGAMI_BASE + match[1]
            });
        }

        return JSON.stringify(results);
    } catch (err) {
        return JSON.stringify([{
            title: "Error",
            image: "Error",
            href: "Error"
        }]);
    }
}

async function extractDetails(url) {
    try {
        const response = await nimegamiFetch(url);
        if (!response) throw new Error("no response");
        const html = await response.text();

        let description = "N/A";
        const synopsisMatch = html.match(/<div class="synopsis-block">[\s\S]*?<p>([\s\S]*?)<\/p>/i);
        if (synopsisMatch) {
            description = synopsisMatch[1]
                .replace(/<[^>]+>/g, ' ')
                .replace(/&nbsp;/g, ' ')
                .replace(/&amp;/g, '&')
                .replace(/\s+/g, ' ')
                .trim();
        }

        let airdate = "N/A";
        const yearMatch = html.match(/\\"year\\":\\"?(\d{4})/);
        if (yearMatch) airdate = yearMatch[1];

        return JSON.stringify([{
            description: description,
            aliases: "N/A",
            airdate: airdate
        }]);
    } catch (err) {
        return JSON.stringify([{
            description: "Error",
            aliases: "Error",
            airdate: "Error"
        }]);
    }
}

async function extractEpisodes(url) {
    const results = [];
    try {
        const response = await nimegamiFetch(url);
        if (!response) throw new Error("no response");
        const html = await response.text();

        // Per-episode download links: /<slug>/download/<ep>/<quality>/<hash>/
        // (batch links use /download/batch/ and are excluded by the \d+ group)
        const linkRegex = /href="\/[^"]+\/download\/(\d+)\/(\d+p)\/[0-9a-f]+\/"/g;
        const best = {};
        let match;
        while ((match = linkRegex.exec(html)) !== null) {
            const epNum = parseInt(match[1], 10);
            const quality = qualityToNumber(match[2]);
            if (!best[epNum] || quality > best[epNum].quality) {
                best[epNum] = {
                    number: epNum,
                    href: NIMEGAMI_BASE + match[0].slice('href="'.length, -1),
                    quality: quality
                };
            }
        }

        const numbers = Object.keys(best).map(Number).sort((a, b) => a - b);
        for (const n of numbers) {
            results.push({ number: n, href: best[n].href });
        }

        return JSON.stringify(results);
    } catch (err) {
        return JSON.stringify([{
            number: "Error",
            title: "Error",
            href: "Error",
            quality: "Error"
        }]);
    }
}

async function extractStreamUrl(url) {
    try {
        // url is a nimegami download interstitial that 302s to the file host
        // (files.im / berkasdrive). Verify it resolves, then hand the app the
        // interstitial URL — players follow the redirect to the mp4.
        const response = await nimegamiFetch(url);
        const status = response && response.status ? response.status : 0;

        const streams = [];
        if (status >= 200 && status < 400) {
            streams.push({
                title: "Nimegami Download",
                streamUrl: url,
                headers: {}
            });
        }

        return JSON.stringify({
            streams: streams,
            subtitle: ""
        });
    } catch (err) {
        return JSON.stringify({
            streams: [],
            subtitle: ""
        });
    }
}
