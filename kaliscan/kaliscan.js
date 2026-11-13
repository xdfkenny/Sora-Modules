// KaliScan — rebuilt on kaliscan.org (Madara/wp-manga WordPress site).
// The original kaliscan.io is DNS-dead (NXDOMAIN); kaliscan.org is a live
// manga reader with /manga/<slug>/ pages, chapter lists at POST
// <manga-url>ajax/chapters/ and lazy images (wp-manga-chapter-img data-src).
// Build marker: [KaliScan] module script loaded v2.0.0 (kaliscan.org)

var KALISCAN_BASE = "https://kaliscan.org";

// Shared fetch wrapper: fetchv2(url, headers, method, body), text() is a real promise.
function soraFetch(url, headers, method, body) {
    if (!headers) headers = {};
    if (!headers["User-Agent"]) headers["User-Agent"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
    if (!headers["Referer"]) headers["Referer"] = KALISCAN_BASE + "/";
    const response = fetchv2(url, headers, method || "GET", body);
    return Promise.resolve(response).then(function (r) {
        return {
            text: function () { return Promise.resolve(r.text()).then(function (t) { return String(t); }); },
            status: r.status
        };
    });
}

async function searchResults(keyword) {
    const results = [];
    try {
        const response = await soraFetch(KALISCAN_BASE + "/?s=" + encodeURIComponent(keyword) + "&post_type=wp-manga");
        const html = await response.text();

        // Madara search results: tab-thumb <a title="..." href="..."><img data-src="..."></a>
        // (the anchor's title attribute is the manga title; img src is a lazy placeholder)
        const thumbRegex = /<a href="([^"]+\/manga\/[^"]+\/)"[^>]*title="([^"]*)"[^>]*>\s*<img[^>]*data-src="([^"]+)"[^>]*>/gi;

        let match;
        const seen = new Set();
        while ((match = thumbRegex.exec(html)) !== null) {
            const href = match[1].trim();
            if (!href || seen.has(href)) continue;
            seen.add(href);
            const title = match[2].trim();
            const image = match[3].trim();
            if (!title) continue;

            results.push({
                id: href,
                href: href,
                image: image,
                imageURL: image,
                title: title
            });
        }

        // Fallback: layouts without tab-thumb images — use post-title h3 anchors
        if (results.length === 0) {
            const looseRegex = /post-title">\s*<h3[^>]*><a href="([^"]+)">([\s\S]*?)<\/a>/gi;
            let lMatch;
            while ((lMatch = looseRegex.exec(html)) !== null) {
                const href = lMatch[1].trim();
                if (!href || seen.has(href)) continue;
                seen.add(href);
                results.push({
                    id: href,
                    href: href,
                    image: "",
                    imageURL: "",
                    title: lMatch[2].replace(/<[^>]+>/g, '').trim()
                });
            }
        }

        return results;
    } catch (err) {
        return [];
    }
}

async function extractDetails(url) {
    try {
        const response = await soraFetch(url);
        const html = await response.text();

        const descRegex = /<meta name="description" content="([^"]+)"/i;
        const descMatch = descRegex.exec(html);
        const description = descMatch ? descMatch[1].trim() : "N/A";

        // Madara "Alternative" field, when present
        let aliases = "N/A";
        const altRegex = /mg_alternative[\s\S]*?summary-content">([\s\S]*?)<\/div>/i;
        const altMatch = altRegex.exec(html);
        if (altMatch) {
            const alt = altMatch[1].replace(/<[^>]+>/g, '').trim();
            if (alt && alt.length > 0 && alt.length < 500) aliases = alt;
        }

        return [{
            description: description,
            aliases: aliases,
            airdate: "N/A"
        }];
    } catch (err) {
        return [{
            description: "Error",
            aliases: "Error",
            airdate: "Error"
        }];
    }
}

async function extractChapters(url) {
    const results = { en: [] };
    try {
        const cleanUrl = url.trim();
        const chapUrl = cleanUrl.endsWith("/") ? cleanUrl + "ajax/chapters/" : cleanUrl + "/ajax/chapters/";
        const response = await soraFetch(chapUrl, {}, "POST");
        const html = await response.text();

        const regex = /<a href="([^"]*)"[^>]*>\s*Chapter\s*([\d.]+[^<]*)<\/a>/gi;
        let match;
        const seen = new Set();

        while ((match = regex.exec(html)) !== null) {
            const chapterUrl = match[1].startsWith("http") ? match[1].trim() : KALISCAN_BASE + match[1].trim();
            if (seen.has(chapterUrl)) continue;
            seen.add(chapterUrl);
            const chapterStr = match[2].trim();
            const chapterNum = parseFloat(chapterStr, 10) || 0;
            // Language map entry: [chapterStr, [{id,title,chapter}]]
            results.en.push([chapterStr, [{
                id: chapterUrl,
                title: "Chapter " + chapterStr,
                chapter: chapterNum
            }]]);
        }

        return results;
    } catch (err) {
        return results;
    }
}

async function extractImages(url) {
    const results = [];
    try {
        const response = await soraFetch(url);
        const html = await response.text();

        // Lazy-loaded chapter pages: <img id="image-N" data-src="..." class="wp-manga-chapter-img ...">
        // data-src values carry stray whitespace/newlines — trim before use.
        const regex = /<img[^>]*class="wp-manga-chapter-img[^"]*"[^>]*data-src="([^"]*)"[^>]*>|<img[^>]*data-src="([^"]*)"[^>]*class="wp-manga-chapter-img[^"]*"/gi;
        let match;
        while ((match = regex.exec(html)) !== null) {
            const img = (match[1] || match[2]).replace(/[\r\n\t]/g, '').trim();
            if (img) results.push(img);
        }

        return results;
    } catch (err) {
        return [];
    }
}
