// AniZone module v2.0.0 — rebuilt for the Laravel Livewire/Alpine front-end.
// Search/detail/episode data is embedded server-side as Alpine `items: JSON.parse('...')`
// payloads (6-char anime codes, e.g. /anime/xcve2ypo/1); stream is a Vidstack player
// payload on the watch page. All scraping = indexOf/substring/regex, no DOM APIs.

async function searchResults(keyword) {
    try {
        const encodedKeyword = encodeURIComponent(keyword);
        const responseText = await soraFetch(`https://anizone.to/anime?search=${encodedKeyword}`);
        const html = await responseText.text();

        const results = [];

        results.push({
            title: "Use External Player",
            image: "https://git.luna-app.eu/ibro/services/raw/branch/main/anizone/UseExternalPlayer.png",
            href: ""
        });

        const items = extractAlpineJson(html, "items");
        if (items && items.length) {
            for (const item of items) {
                const title = item.main_title || pickTitle(item.title_list) || 'Unknown';
                let href = String(item.url || `https://anizone.to/anime/${item.slug || ''}`);
                href = href.replace(/^http:\/\//i, 'https://');
                const image = item.cover || '';
                if (!href || !/anizone\.to\/anime\//.test(href)) continue;
                results.push({ title: String(title).trim(), image: image, href: href });
            }
        }

        console.log(`[AniZone] search "${keyword}" -> ${results.length - 1} results`);
        return JSON.stringify(results);
    } catch (error) {
        console.log('Fetch error in searchResults: ' + error);
        return JSON.stringify([{ title: 'Error', image: '', href: '' }]);
    }
}

async function extractDetails(url) {
    try {
        const response = await soraFetch(url);
        const htmlText = await response.text();

        const descriptionMatch = htmlText.match(/<h3 class="sr-only">Synopsis<\/h3>\s*<div>([\s\S]*?)<\/div>/);
        const description = descriptionMatch ? descriptionMatch[1].replace(/\s+/g, ' ').trim() : 'No description available';

        const yearMatch = htmlText.match(/<span class="inline-block">(\d{4})<\/span>/);
        const airdate = yearMatch ? `Released: ${yearMatch[1]}` : 'Released: Unknown';

        const typeMatch = htmlText.match(/<span class="inline-block">(TV Series|Movie|ONA|OVA|Special|Music Video|TV Special|Web|Other)<\/span>/);
        const mediaType = typeMatch ? typeMatch[1].trim() : 'Unknown';

        const statusMatch = htmlText.match(/<span class="inline-block">(Completed|Ongoing|Upcoming)<\/span>/);
        const status = statusMatch ? statusMatch[1].trim() : 'Unknown';

        const items = extractAlpineJson(htmlText, "items");
        const episodeCount = items && items.length ? items.length : 'Unknown';

        const genreRegex = /href="https:\/\/anizone\.to\/tag\/[^"]+" title="([^"]+)"/g;
        let genreList = [];
        let match;
        while ((match = genreRegex.exec(htmlText)) !== null) {
            if (genreList.indexOf(match[1].trim()) === -1) genreList.push(match[1].trim());
        }

        const aliases = `
Type: ${mediaType}
Status: ${status}
Episodes: ${episodeCount}
Genres: ${genreList.join(', ') || 'Unknown'}
        `.trim();

        const transformedResults = [{
            description,
            aliases,
            airdate
        }];

        console.log(transformedResults);
        return JSON.stringify(transformedResults);
    } catch (error) {
        console.log('Details error: ' + error);
        return JSON.stringify([{
            description: 'Error loading description',
            aliases: 'Unknown',
            airdate: 'Unknown'
        }]);
    }
}

async function extractEpisodes(url) {
    try {
        const response = await soraFetch(url);
        const html = await response.text();

        const items = extractAlpineJson(html, "items");
        const episodes = [];

        if (items && items.length) {
            for (const item of items) {
                const num = parseInt(item.slug, 10);
                const number = isNaN(num) ? (episodes.length + 1) : num;
                let href = String(item.url || `${url}/${number}`);
                href = href.replace(/^http:\/\//i, 'https://');
                const epTitle = (item.title_list && (item.title_list['1'] || item.title_list['5'] || item.title_list['8']))
                    ? String(item.title_list['1'] || item.title_list['5'] || item.title_list['8']).trim()
                    : `Episode ${number}`;
                episodes.push({
                    title: epTitle,
                    href: href,
                    number: number
                });
            }
        } else {
            // Fallback: old behaviour, derive from episode count if the JSON payload is absent
            const episodeMatch = html.match(/>\s*(\d+)\s*Episodes?\s*</i);
            const episodeCount = episodeMatch ? parseInt(episodeMatch[1], 10) : 0;
            for (let i = 1; i <= episodeCount; i++) {
                episodes.push({ title: `Episode ${i}`, href: `${url}/${i}`, number: i });
            }
        }

        console.log(`[AniZone] episodes: ${episodes.length}`);
        return JSON.stringify(episodes);
    } catch (error) {
        console.log('Fetch error in extractEpisodes: ' + error);
        return JSON.stringify([]);
    }
}

async function extractStreamUrl(url) {
    try {
        const response = await soraFetch(url);
        const htmlText = await response.text();

        const player = extractAlpineJson(htmlText, "vidstackPlayer");
        let streamUrl = null;
        let subtitleUrl = null;

        if (player && player.src) {
            streamUrl = String(player.src);
            if (player.subtitles && player.subtitles.length) {
                for (const sub of player.subtitles) {
                    const label = String(sub.title || '');
                    if (sub.file && !/song/i.test(label)) {
                        subtitleUrl = String(sub.file);
                        break;
                    }
                }
            }
        }

        if (!streamUrl) {
            const streamMatch = htmlText.match(/"(https:[^"]+\.m3u8)"/);
            streamUrl = streamMatch ? streamMatch[1] : null;
        }

        const result = {
            streams: streamUrl ? [{ title: 'HLS', streamUrl: streamUrl }] : [],
            stream: streamUrl,
            subtitles: subtitleUrl ? [{ title: 'English', url: subtitleUrl }] : [],
            subtitle: subtitleUrl || ''
        };

        console.log(`[AniZone] stream: ${streamUrl ? 'found' : 'not found'}`);
        return JSON.stringify(result);
    } catch (error) {
        console.log('Fetch error in extractStreamUrl: ' + error);
        return JSON.stringify({ streams: [], subtitles: [] });
    }
}

// Extracts and decodes an Alpine x-data payload, either as a property
//   <name>: JSON.parse('ESCAPED_JSON')
// or as a function-call argument
//   <name>(JSON.parse('ESCAPED_JSON'))
// Livewire escapes quotes as \u0022/\u0027 inside the attribute, so the first
// unescaped "')" after the payload start marks its true end.
function extractAlpineJson(html, name) {
    try {
        let marker = name + ": JSON.parse('";
        let idx = html.indexOf(marker);
        if (idx === -1) {
            marker = name + "(JSON.parse('";
            idx = html.indexOf(marker);
        }
        if (idx === -1) return null;
        const start = idx + marker.length;
        const end = html.indexOf("')", start);
        if (end === -1) return null;
        const raw = html.substring(start, end);
        const decoded = decodeJsEscapes(raw);
        return JSON.parse(decoded);
    } catch (error) {
        console.log('extractAlpineJson error: ' + error);
        return null;
    }
}

function decodeJsEscapes(str) {
    try {
        let out = '';
        for (let i = 0; i < str.length; i++) {
            const c = str[i];
            if (c === '\\') {
                const n = str[i + 1];
                if (n === 'u') {
                    const hex = str.substring(i + 2, i + 6);
                    const code = parseInt(hex, 16);
                    if (!isNaN(code)) {
                        out += String.fromCharCode(code);
                        i += 5;
                    } else {
                        out += c;
                    }
                } else if (n === 'n') { out += '\n'; i++; }
                else if (n === 't') { out += '\t'; i++; }
                else if (n === 'r') { out += '\r'; i++; }
                else if (n === 'b') { out += '\b'; i++; }
                else if (n === 'f') { out += '\f'; i++; }
                else if (n === '/') { out += '/'; i++; }
                else if (n === '\\') { out += '\\'; i++; }
                else if (n === '"') { out += '"'; i++; }
                else if (n === "'") { out += "'"; i++; }
                else if (n !== undefined) { out += n; i++; }
                else { out += c; }
            } else {
                out += c;
            }
        }
        return out;
    } catch (error) {
        console.log('decodeJsEscapes error: ' + error);
        return str;
    }
}

function pickTitle(titleList) {
    if (!titleList) return '';
    return titleList['1'] || titleList['5'] || titleList['8'] || Object.values(titleList)[0] || '';
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
