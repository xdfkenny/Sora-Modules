function an1meDecodeEntities(s) {
    return String(s || "")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#8217;|&rsquo;/g, "'")
        .replace(/&#8216;|&lsquo;/g, "'")
        .replace(/&#8220;|&ldquo;/g, '"')
        .replace(/&#8221;|&rdquo;/g, '"')
        .replace(/&#8211;|&ndash;/g, "-")
        .replace(/&#8212;|&mdash;/g, "-")
        .replace(/&#038;|&#38;/g, "&")
        .replace(/&#(\d+);/g, function (m, d) {
            try { return String.fromCharCode(parseInt(d, 10)); } catch (e) { return m; }
        })
        .trim();
}

async function searchResults(keyword) {
    const results = [];
    try {
        const headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
            "Accept": "application/json"
        };
        const apiUrl = "https://an1me.to/wp-json/wp/v2/anime?search=" + encodeURIComponent(keyword) + "&per_page=30&_embed=1";
        const res = await fetchv2(apiUrl, headers);
        const body = await res.text();
        let data;
        try { data = JSON.parse(body); } catch (e) { data = []; }
        if (!Array.isArray(data)) return JSON.stringify([]);
        for (let i = 0; i < data.length; i++) {
            const item = data[i] || {};
            const href = (item.link || "").trim();
            if (!href) continue;
            let title = "Anime";
            try {
                title = an1meDecodeEntities(item.title && item.title.rendered) || "Anime";
            } catch (e) {}
            let image = "";
            try {
                const fm = item._embedded && item._embedded["wp:featuredmedia"] && item._embedded["wp:featuredmedia"][0];
                if (fm && fm.source_url) image = fm.source_url;
            } catch (e) {}
            results.push({ title: title, image: image, href: href });
        }
        return JSON.stringify(results);
    } catch (err) {
        return JSON.stringify([]);
    }
}

async function extractDetails(url) {
    try {
        const headers = {
            "Referer": "https://an1me.to/",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
        };
        const response = await fetchv2(url, headers);
        const html = await response.text();

        const match = html.match(/aria-label="Anime Overview"[^>]*>([\s\S]*?)<\/section>/) ||
            html.match(/<div[^>]*class="[^"]*entry-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i);

        const description = match
            ? match[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
            : "N/A";

        return JSON.stringify([{
            description,
            aliases: "N/A",
            airdate: "N/A"
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
        const headers = {
            "X-Requested-With": "XMLHttpRequest",
            "Referer": "https://an1me.to/",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
        };
        const response = await fetchv2(url, headers);
        const html = await response.text();
        
        const postIdMatch = html.match(/postid-(\d+)/) || 
                          html.match(/post_id['"]\s*,\s*['"](\d+)['"]/) ||
                          html.match(/anime_id['"]\s*:\s*(\d+)/);

        if (!postIdMatch) {
            const epRegex = /<a[^>]+href="(https:\/\/an1me\.to\/[^\/]+\/episode-\d+[^"]*)"[^>]*>/gi;
            let epMatch;
            const seen = new Set();
            let index = 1;
            while ((epMatch = epRegex.exec(html)) !== null) {
                const href = epMatch[1].trim();
                if (!seen.has(href)) {
                    seen.add(href);
                    results.push({ href: href, number: index });
                    index++;
                }
            }
            if (results.length > 0) return JSON.stringify(results);
            return JSON.stringify([{ href: url, number: 1 }]);
        }

        const animeId = postIdMatch[1];
        const firstPageUrl = `https://an1me.to/wp-admin/admin-ajax.php?action=get_episodes&anime_id=${animeId}&page=1&order=desc`;
        const firstPageRes = await fetchv2(firstPageUrl, headers);
        const firstPageData = await firstPageRes.json();

        if (firstPageData.success && firstPageData.data && Array.isArray(firstPageData.data.episodes)) {
            firstPageData.data.episodes.forEach(ep => {
                results.push({
                    href: ep.url,
                    number: parseFloat(ep.meta_number) || results.length + 1
                });
            });
        }
        
        if (results.length === 0) {
            results.push({ href: url, number: 1 });
        }

        return JSON.stringify(results);
    } catch (err) {
        return JSON.stringify([{
            href: url,
            number: 1
        }]);
    }
}

async function extractStreamUrl(url) {
    try {
        const headers = {
            "Referer": "https://an1me.to/",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
        };
        const response = await fetchv2(url, headers);
        const html = await response.text();
        
        const iframeMatch = html.match(/<iframe[^>]+src=["']([^"']+)["']/i);
        if (iframeMatch) {
            let iframeUrl = iframeMatch[1].replace(/&#038;/g, '&').replace(/&amp;/g, '&');
            return JSON.stringify({
                streams: [{ title: "An1me Player", streamUrl: iframeUrl, headers: { Referer: "https://an1me.to/" } }],
                subtitle: ""
            });
        }
        
        return JSON.stringify({
            streams: [{ title: "An1me Player", streamUrl: url, headers: { Referer: "https://an1me.to/" } }],
            subtitle: ""
        });
    } catch (err) {
        return JSON.stringify({
            streams: [{ title: "An1me Player", streamUrl: url, headers: { Referer: "https://an1me.to/" } }],
            subtitle: ""
        });
    }
}
