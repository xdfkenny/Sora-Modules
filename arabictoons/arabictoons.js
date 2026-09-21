async function searchResults(keyword) {
    try {
        const encodedKeyword = encodeURIComponent(keyword);
        const response = await soraFetch(`https://www.arabic-toons.com/search_results.php?q=${encodedKeyword}&ajax=1`);
        const data = await response.json();

        const results = data.results.series.map(item => ({
            title: item.title,
            image: `https://www.arabic-toons.com/${item.image}`,
            href: `https://www.arabic-toons.com/${slugify(item.subtitle)}-${item.id}-anime-streaming.html`,
        }));

        console.log(results);
        return JSON.stringify(results);
    } catch (error) {
        console.log("Fetch error in searchResults: " + error);
        return JSON.stringify([{ title: "Error", image: "", href: "" }]);
    }
}

// searchResults(`ناروتو`);
// extractDetails(`https://www.arabic-toons.com/serie-1711928376-anime-streaming.html`);
// extractEpisodes(`https://www.arabic-toons.com/serie-1711928376-anime-streaming.html`);
// extractStreamUrl(`https://www.arabic-toons.com/sadw-altnyn-1711928376-41358.html#sets`);

async function extractDetails(url) {
    console.log('Extracting details from: ' + url);

    const results = [];
    const response = await soraFetch(url);
    const html = await response.text();

    // Match <h3> containing the exact text (with optional extra tags) and then the following <div>
    const match = html.match(/<h3[^>]*>[\s\S]*?قصة الكرتون\s*\/\s*الأنمي[\s\S]*?<\/h3>\s*<div[^>]*>([\s\S]*?)<\/div>/);
    const description = match ? match[1].trim().replace(/<[^>]+>/g, '').replace(/\s+/g, ' ') : 'N/A';

    results.push({
        description: description,
        aliases: '',
        airdate: ''
    });

    console.log(`Details: ${JSON.stringify(results)}`);
    return JSON.stringify(results);
}

async function extractEpisodes(url) {
    const results = [];
    const response = await soraFetch(url);
    const html = await response.text();

    // Match each episode link and its number from <div class="episode-number">
    const episodeRegex = /<a[^>]+href="([^"]+\.html#sets)"[^>]*>[\s\S]*?<div class="episode-number">(\d+)<\/div>/g;

    let match;
    while ((match = episodeRegex.exec(html)) !== null) {
        results.push({
            href: `https://www.arabic-toons.com/${match[1].trim()}`,
            number: parseInt(match[2], 10)
        });
    }

    // If no episodes found, assume it's a movie
    if (results.length === 0) {
        results.push({
            href: url,
            number: 1
        });
    }

    console.log(`Results: ${JSON.stringify(results)}`);
    return JSON.stringify(results);
}

async function extractStreamUrl(url) {
    const response = await soraFetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:144.0) Gecko/20100101 Firefox/144.0',
        }
    });
    const html = await response.text();

    // Current markup: <video>...<source src="https://...index.m3u8?tkn=..." type="application/vnd.apple.mpegurl">
    const sourceMatch = html.match(/<source[^>]+src="([^"]+\.m3u8[^"]*)"[^>]*>/i);
    let streamUrl = sourceMatch ? sourceMatch[1] : null;

    // Legacy: obfuscated player config object
    // More robust regex: matches any whitespace, allows single or double quotes,
    // and captures the values even if the object is minified or spread across lines.
    if (!streamUrl) {
        const regex = /(?:jC1kO|protocol)\s*:\s*["']([^"']+)["'][\s\S]*?(?:hF3nV|host)\s*:\s*["']([^"']+)["'][\s\S]*?(?:iA5pX|path)\s*:\s*["']([^"']+)["'][\s\S]*?(?:tN4qY|query)\s*:\s*["']([^"']+)["']/i;
        const match = regex.exec(html);

        if (match) {
            const protocol = match[1];
            const host = match[2];
            const path = match[3];
            const query = match[4];
            streamUrl = `${protocol}://${host}/${path}?${query}`;
        }
    }
        console.log(`Stream URL: ${streamUrl}`);

    if (streamUrl) {
        // Essential headers for the stream to work
        const headers = {
            "Origin": "https://www.arabic-toons.com",
            "Referer": "https://www.arabic-toons.com/",
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:146.0) Gecko/20100101 Firefox/146.0"
        };

        // Return as JSON string as required by the documentation
        return JSON.stringify({
            streams: [{
                title: "Stream",
                streamUrl,
                headers,
            }],
            subtitles: ""
        });
    }

    console.log('Stream URL not found');
    // Return empty streams array as JSON string when no stream found
    return JSON.stringify({ streams: [], subtitles: "" });
}

function slugify(title) {
    return title
      .toLowerCase()
      .normalize("NFKD")                 // remove accents
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s-]/g, "")      // remove symbols
      .trim()
      .replace(/\s+/g, "-")              // spaces → dash
      .replace(/-+/g, "-");              // collapse dashes
}

async function soraFetch(url, options = { headers: {}, method: 'GET', body: null }) {
    const headers = Object.assign({}, options.headers || {});
    if (!headers['User-Agent'] && !headers['user-agent']) {
        headers['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    }
    try {
        return await fetchv2(url, headers, options.method ?? 'GET', options.body ?? null);
    } catch(e) {
        try {
            return await fetch(url, Object.assign(Object.assign({}, options), { headers }));
        } catch(error) {
            return null;
        }
    }
}
