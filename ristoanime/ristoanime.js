async function searchResults(keyword) {
    try {
        const encodedKeyword = encodeURIComponent(keyword);
        const response = await soraFetch(`https://ristoanime.co/?s=${encodedKeyword}`);
        const html = await response.text();

        const regex = /<div class="MovieItem">[\s\S]*?<a href="([^"]+)"[\s\S]*?background-image:\s*url\(([^)]+)\)[\s\S]*?<h4>(.*?)<\/h4>/g;

        const results = [];
        let match;

        while ((match = regex.exec(html)) !== null) {
            results.push({
                title: match[3].trim(),
                image: match[2].trim(),
                href: match[1].trim()
            });
        }

        console.log(results);
        return JSON.stringify(results);
    } catch (error) {
        console.log("Fetch error in searchResults: " + error);
        return JSON.stringify([{ title: "Error", image: "", href: "" }]);
    }
}

async function extractDetails(url) {
    try {
        const response = await soraFetch(url);
        const html = await response.text();

        const descriptionMatch = html.match(/<div class="StoryArea">[\s\S]*?<p>(.*?)<\/p>/);
        const description = descriptionMatch ? descriptionMatch[1].trim() : 'No description available';

        const aliasesMatch = html.match(/<h1 class="PostTitle">[\s\S]*?<a[^>]*>(.*?)<\/a>/);
        const aliases = aliasesMatch ? aliasesMatch[1].trim() : 'No aliases available';

        const airdateMatch = html.match(/<li>\s*<div class="icon">\s*<i class="far fa-calendar"><\/i>\s*<\/div>\s*<span>\s*تاريخ الاصدار\s*:\s*<\/span>\s*<a[^>]*>\s*(\d{4})\s*<\/a>/);
        const airdate = airdateMatch ? `Aired: ${airdateMatch[1].trim()}` : 'Aired: Unknown';

        const transformedResults = [{
            description,
            aliases,
            airdate
        }];

        return JSON.stringify(transformedResults);
    } catch (error) {
        console.log('Details error:', error);
        return JSON.stringify([{
            description: 'Error loading description',
            aliases: 'No aliases available',
            airdate: 'Aired: Unknown'
        }]);
    }
}

async function extractEpisodes(url) {
    try {
        const response = await soraFetch(url);
        const html = await response.text();

        const episodeRegex = /<a href="([^"]+)">\s*الحلقة\s*<em>(\d+)<\/em>\s*<\/a>/g;
        const episodes = [];
        let match;

        while ((match = episodeRegex.exec(html)) !== null) {
            const href = match[1].trim();
            const number = match[2].trim();

            episodes.push({
                href: `${href}watch/`,
                number: Number(number)
            });
        }

        if (episodes.length > 0 && episodes[0].number !== "1") {
            episodes.reverse();
        }

        return JSON.stringify(episodes);
    } catch (error) {
        console.log("Fetch error in extractEpisodes:", error);
        return JSON.stringify([]);
    }
}

async function extractStreamUrl(url) {
    console.log("Ristoanime URL: " + url);

    try {
        const response = await soraFetch(url);
        const html = await response.text();

        // Grab the active hoster embed (first data-watch entry)
        const watchMatch = html.match(/data-watch="([^"]+)"/);
        if (!watchMatch) {
            console.log("No hoster embed found on watch page");
            return JSON.stringify({ streams: [], subtitles: "" });
        }
        let embedUrl = watchMatch[1];
        if (embedUrl.startsWith('//')) embedUrl = 'https:' + embedUrl;

        const hostMatch = embedUrl.match(/https?:\/\/([^\/]+)/);
        const embedHost = hostMatch ? hostMatch[1] : 'vidmoly.net';

        const embedRes = await soraFetch(embedUrl, {
            headers: { 'Referer': url, 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
        });
        const embedHtml = embedRes ? await embedRes.text() : "";

        // vidmoly-style player: sources: [{ file: 'https://...master.m3u8?...' }]
        const streams = [];
        const fileRegex = /file\s*:\s*['"]([^'"]+\.m3u8[^'"]*)['"]/g;
        let fm;
        while ((fm = fileRegex.exec(embedHtml)) !== null) {
            streams.push({
                title: "Stream",
                streamUrl: fm[1],
                headers: {
                    "Referer": "https://" + embedHost + "/",
                    "Origin": "https://" + embedHost
                }
            });
        }

        if (streams.length === 0) {
            console.log("No m3u8 found in embed page");
            return JSON.stringify({ streams: [], subtitles: "" });
        }

        return JSON.stringify({ streams, subtitles: "" });
    } catch (error) {
        console.log('Fetch error in extractStreamUrl: ' + error);
        return JSON.stringify({ streams: [], subtitles: "" });
    }
}

function decodeHTMLEntities(text) {
    text = text.replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec));
    
    const entities = {
        '&quot;': '"',
        '&amp;': '&',
        '&apos;': "'",
        '&lt;': '<',
        '&gt;': '>'
    };
    
    for (const entity in entities) {
        text = text.replace(new RegExp(entity, 'g'), entities[entity]);
    }

    return text;
}

async function soraFetch(url, options = { headers: {}, method: 'GET', body: null }) {
    try {
        return await fetchv2(url, options.headers ?? {}, options.method ?? 'GET', options.body ?? null);
    } catch(e) {
        try {
            return await fetch(url, options);
        } catch(error) {
            return null;
        }
    }
}
