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

async function extractDetails(url) {
    const details = [];
    const response = await fetchv2(url);
    const html = await response.text();
    const descriptionMatch = html.match(/<div class="anime-description">([\s\S]*?)<\/div>/);
    let description = descriptionMatch ? descriptionMatch[1]
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/<br \/>\n/g, ' ')
        .replace(/\s+/g, ' ')
        .trim() : '';


    const nameMatch = html.match(/<h2 class="anime-name[^>]*>([^<]+)<\/h2>/);
    const engNameMatch = html.match(/<h3 class="anime-eng-name">([^<]+)<\/h3>/);

    const airdateMatch = html.match(/<span class="bt">Datum:<\/span>([^<]+)/);
    let airdate = airdateMatch ? airdateMatch[1].trim() : '';

    let name = nameMatch ? nameMatch[1].trim() : '';
    let engName = engNameMatch ? engNameMatch[1].trim() : '';
    let aliases = name === engName ? 'N/A' : engName;

    if (description || airdate) {
        details.push({
            description: description,
            aliases: aliases,
            airdate: airdate
        });
    }

    console.log(details);
    return JSON.stringify(details);
}

async function extractEpisodes(url) {
    const episodes = [];
    const response = await fetchv2(url);
    const html = await response.text();
    const baseUrl = 'https://www.animesrbija.com';
    
    const episodeRegex = /<li\s+class="anime-episode-item">\s*<span\s+class="anime-episode-num">([^<]+)<\/span>\s*<a\s+class="anime-episode-link"\s+href="([^"]+)"/g;
    
    let match;
    while ((match = episodeRegex.exec(html)) !== null) {
        const episodeText = match[1].trim();
        const href = baseUrl + match[2];
        let number;
        
        if (episodeText.toLowerCase() === 'film') {
            number = 1;
        } else {
            const numberMatch = episodeText.match(/\d+/);
            number = numberMatch ? parseInt(numberMatch[0], 10) : null;
                }
        
        episodes.push({
            href: href,
            number: number
        });
    }
    
    episodes.reverse();
    console.log(JSON.stringify(episodes));
    return JSON.stringify(episodes);
}

async function extractStreamUrl(url) {
    const response = await fetchv2(url);
    const html = await response.text();

    const playerRegex = /"player1":\s*"?(!?https?:\/\/[^"\n]+\.m3u8)"/i;

    const match = html.match(playerRegex);
    if (match) {
        let playerUrl = match[1].trim();
        if (playerUrl.startsWith('!')) {
            playerUrl = playerUrl.substring(1);
        }
        console.log("URL", playerUrl);
        return playerUrl;
    } else {
        console.log("Link not found");
        return null;
    }
}



