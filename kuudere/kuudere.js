// Kuudere → Re:ANIME (kuudere.to rebranded to reanime.cz, SvelteKit SSR, Oct 2026)
// The old kuudere.to JSON API (kuudere.to/search?keyword=, /api/watch/<id>/<n>) is
// gone with the rebrand. Re:ANIME serves search/detail/episode data server-side
// rendered in the initial HTML, and streams through flixcloud.cc embeds.
//
// Stream note: flixcloud serves its HLS playlists base64+XOR-encoded and only its
// own patched hls.js decodes them (key derived from a per-page WASM payload), so a
// native HLS player cannot play the raw m3u8s. extractStreamUrl therefore returns
// the flixcloud embed URL — playback happens in the site's own player (webview /
// external browser), mirroring how the site itself plays video.

async function searchResults(keyword) {
    try {
        const encodedKeyword = encodeURIComponent(keyword);
        const response = await soraFetch(`https://reanime.cz/search?q=${encodedKeyword}`);
        const html = await response.text();

        const results = [];
        const seen = {};
        const cardRe = /<a href="(\/anime\/[^"]+)"[^>]*>[\s\S]{0,2500}?<img src="([^"]+)" alt="([^"]*)"/g;
        let m;
        while ((m = cardRe.exec(html)) !== null) {
            const href = "https://reanime.cz" + m[1];
            if (seen[href]) continue;
            seen[href] = true;
            const title = (m[3] || "").trim() || decodeURIComponent(m[1].split("/").pop() || "");
            results.push({ title: title, image: m[2], href: href });
        }

        if (!results.length) throw new Error("no search results parsed");
        console.log(JSON.stringify(results));
        return JSON.stringify(results);
    } catch (error) {
        console.log('Fetch error in searchResults: ' + error);
        return JSON.stringify([{ title: 'Error', image: '', href: '' }]);
    }
}

async function extractDetails(url) {
    try {
        const response = await soraFetch(url);
        const html = await response.text();

        const unescapeJs = (s) => s
            .replace(/\\n/g, '\n')
            .replace(/\\"/g, '"')
            .replace(/\\'/g, "'")
            .replace(/\\\\/g, '\\');

        const grab = (re) => { const m = html.match(re); return m ? m[1] : null; };

        let description = grab(/description:"((?:[^"\\]|\\.)*)"/);
        description = description ? unescapeJs(description).replace(/<[^>]+>/g, '').trim() : 'No description available';

        const genresM = html.match(/genres:\[([^\]]*)\]/);
        const synM = html.match(/synonyms:\[([^\]]*)\]/);
        const format = grab(/format:"([^"]*)"/) || 'N/A';
        const status = grab(/status:"([^"]*)"/) || 'N/A';
        const season = grab(/season:"([^"]*)"/) || '';
        const year = grab(/season_year:(\d{4})/) || '';
        const duration = grab(/duration:(\d+)/) || '';
        const epTotal = grab(/episodes_total:(\d+)/) || '';

        const aliasParts = [];
        if (genresM) {
            const g = genresM[1].match(/"([^"]+)"/g);
            if (g) aliasParts.push('Genres: ' + g.map(s => s.replace(/"/g, '')).join(', '));
        }
        if (synM) {
            const s = synM[1].match(/"([^"]+)"/g);
            if (s && s.length) aliasParts.push('Also known as: ' + s.slice(0, 4).map(x => x.replace(/"/g, '')).join(', '));
        }
        aliasParts.push('Type: ' + format, 'Status: ' + status);
        if (epTotal && epTotal !== '0') aliasParts.push('Episodes: ' + epTotal);
        if (duration) aliasParts.push('Duration: ' + duration + ' min');

        const airdate = (season ? season + ' ' : '') + (year || 'N/A');

        const transformedResults = [{ description, aliases: aliasParts.join('\n'), airdate }];
        console.log(JSON.stringify(transformedResults));
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
        const slugM = url.match(/\/anime\/([^\/?#]+)/);
        if (!slugM) throw new Error("cannot parse slug from url");
        const slug = slugM[1];

        const response = await soraFetch(`https://reanime.cz/watch/${slug}`);
        const html = await response.text();

        const aidM = html.match(/anilist_id:(\d+)/);
        const aid = aidM ? aidM[1] : null;

        const numbers = {};
        const re = new RegExp('/watch/' + slug + '\\?ep=(\\d+)', 'g');
        let m;
        while ((m = re.exec(html)) !== null) numbers[parseInt(m[1], 10)] = true;

        let nums = Object.keys(numbers).map(Number).sort((a, b) => a - b);
        if (!nums.length) throw new Error("no episode links found");

        const episodes = nums.map(n => ({
            title: 'Episode ' + n,
            href: aid
                ? `https://reanime.cz/api/flix/${aid}/${n}`
                : `https://reanime.cz/watch/${slug}?ep=${n}`,
            number: n
        }));

        console.log('episodes: ' + episodes.length);
        return JSON.stringify(episodes);
    } catch (error) {
        console.log('Fetch error in extractEpisodes: ' + error);
        return JSON.stringify([]);
    }
}

async function extractStreamUrl(url) {
    try {
        let dataLink = null;
        if (/\/api\/flix\/\d+\/\d+/.test(url)) {
            const response = await soraFetch(url);
            const data = await response.json();
            const servers = (data && data.servers) || [];
            const pick = servers.find(s => s.serverName === 'HD-1' && s.dataType === 'sub') ||
                servers.find(s => s.dataType === 'sub') || servers[0];
            if (pick && pick.dataLink) dataLink = pick.dataLink;
        } else {
            const m = url.match(/[?&]ep=(\d+)/);
            const slugM = url.match(/\/watch\/([^\/?#]+)/);
            if (m && slugM) {
                const resp = await soraFetch(url);
                const html = await resp.text();
                const aidM = html.match(/anilist_id:(\d+)/);
                if (aidM) {
                    const r2 = await soraFetch(`https://reanime.cz/api/flix/${aidM[1]}/${m[1]}`);
                    const data = await r2.json();
                    const servers = (data && data.servers) || [];
                    const pick = servers.find(s => s.serverName === 'HD-1' && s.dataType === 'sub') ||
                        servers.find(s => s.dataType === 'sub') || servers[0];
                    if (pick && pick.dataLink) dataLink = pick.dataLink;
                }
            }
        }

        if (!dataLink) throw new Error('no stream source found');

        const results = {
            streams: [{
                title: "Re:ANIME (site player)",
                streamUrl: dataLink,
                headers: { "Referer": "https://reanime.cz/" }
            }],
            subtitles: ""
        };
        console.log(JSON.stringify(results));
        return JSON.stringify(results);
    } catch (error) {
        console.log('Fetch error in extractStreamUrl: ' + error);
        const result = { streams: [], subtitles: "" };
        return JSON.stringify(result);
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
