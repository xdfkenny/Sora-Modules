// AnimesFHD v1.0.0 — public JSON API, Sora/Luna fetchv2 runtime.
const ANIMESFHD_BASE = 'https://animesfhd.net';
const ANIMESFHD_HEADERS = {
    'Referer': ANIMESFHD_BASE + '/',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
};

async function soraFetch(url) {
    try {
        const response = await fetchv2(url, ANIMESFHD_HEADERS, 'GET', null);
        if (!response || response.ok === false || response.status >= 400) return null;
        // Await also supports hosts whose json() returns a plain object.
        return await response.json();
    } catch (error) {
        return null;
    }
}

function animesfhdAbsolute(value) {
    const url = typeof value === 'string' ? value.trim() : '';
    if (/^https?:\/\/[^\s/]+(?:\/[^\s]*)?$/i.test(url)) return url;
    if (/^\/\/[^\s/]+(?:\/[^\s]*)?$/.test(url)) return 'https:' + url;
    if (/^\/[^/\s][^\s]*$/.test(url)) return ANIMESFHD_BASE + url;
    return '';
}

function animesfhdId(value) {
    const id = String(value == null ? '' : value);
    return /^\d+$/.test(id) && Number(id) > 0 && Number(id) <= 9007199254740991 ? id : '';
}

function animesfhdPageId(url, kind) {
    const match = String(url || '').match(/^https:\/\/animesfhd\.net\/(serie|episod)\/(\d+)\/?(?:[?#].*)?$/);
    return match && match[1] === kind ? animesfhdId(match[2]) : '';
}

function animesfhdAudio(value) {
    if (value === 'dublado') return 'Dublado';
    if (value === 'legendado') return 'Legendado';
    return '';
}

async function animesfhdSearchVersions(series) {
    const id = animesfhdId(series && series.id);
    if (!id || !series.title) return [];
    const data = await soraFetch(ANIMESFHD_BASE + '/api/series/' + id + '?page=1&per_page=1');
    const versions = data && Array.isArray(data.versions) ? data.versions.filter(v => v && animesfhdId(v.series_id)) : [];
    // The list API groups audio/season variants. Expand only its explicit
    // version links so Sora can select each one without mixing episode numbers.
    if (!versions.length) versions.push({ series_id: id, title: series.title, audio: series.category });
    return versions.map(function (version) {
        const title = version.title || series.title;
        const labels = [title];
        if (versions.length > 1 && version.season_label && version.season_label !== title) labels.push(version.season_label);
        const audio = animesfhdAudio(version.audio);
        if (audio) labels.push(audio);
        return {
            title: labels.join(' - '),
            image: animesfhdAbsolute(series.cover_image),
            href: ANIMESFHD_BASE + '/serie/' + animesfhdId(version.series_id)
        };
    });
}

async function searchResults(keyword) {
    try {
        const query = String(keyword || '').trim();
        const url = ANIMESFHD_BASE + '/api/series?pagination=1&page=1&per_page=24' +
            (query ? '&q=' + encodeURIComponent(query) : '&sort=popular');
        const data = await soraFetch(url);
        if (!data || !Array.isArray(data.series)) return JSON.stringify([]);
        const results = [];
        const seen = {};
        // Bound API traffic: only the six best matches are expanded into their
        // season/audio versions; the rest are listed as returned by the search.
        const series = data.series.slice(0, 24);
        const expand = s => series.indexOf(s) < 6 ? animesfhdSearchVersions(s) : Promise.resolve(animesfhdId(s && s.id) && s.title
            ? [{ title: s.title, image: animesfhdAbsolute(s.cover_image), href: ANIMESFHD_BASE + '/serie/' + animesfhdId(s.id) }] : []);
        for (let i = 0; i < series.length; i += 4) {
            const batch = await Promise.all(series.slice(i, i + 4).map(expand));
            for (const items of batch) {
                for (const item of items) {
                    if (seen[item.href]) continue;
                    seen[item.href] = true;
                    results.push(item);
                }
            }
        }
        return JSON.stringify(results);
    } catch (error) {
        return JSON.stringify([]);
    }
}

async function extractDetails(url) {
    const fallback = [{ description: 'N/A', aliases: 'N/A', airdate: 'N/A' }];
    try {
        const id = animesfhdPageId(url, 'serie');
        if (!id) return JSON.stringify(fallback);
        const data = await soraFetch(ANIMESFHD_BASE + '/api/series/' + id + '?page=1&per_page=1');
        if (!data || !data.series) return JSON.stringify(fallback);
        const series = data.series;
        return JSON.stringify([{
            description: series.description || 'N/A',
            aliases: String(series.alt_titles || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean).join(', ') || 'N/A',
            airdate: series.release_date || (series.year ? String(series.year) : 'N/A')
        }]);
    } catch (error) {
        return JSON.stringify(fallback);
    }
}

async function extractEpisodes(url) {
    try {
        const id = animesfhdPageId(url, 'serie');
        if (!id) return JSON.stringify([]);
        const episodes = [];
        const seen = {};
        // 20,000 episodes is a safety ceiling for a broken pagination flag.
        for (let page = 1; page <= 100; page++) {
            const data = await soraFetch(ANIMESFHD_BASE + '/api/series/' + id + '?page=' + page + '&per_page=200');
            if (!data || !Array.isArray(data.episodes)) return JSON.stringify([]);
            const before = episodes.length;
            for (const episode of data.episodes) {
                if (!episode) continue;
                const episodeId = animesfhdId(episode.id);
                const number = Number(episode.episode_number);
                if (!episodeId || seen[episodeId] || episode.episode_number == null || episode.episode_number === '' || !isFinite(number) || number < 0) continue;
                seen[episodeId] = true;
                episodes.push({ href: ANIMESFHD_BASE + '/episod/' + episodeId, number: number });
            }
            if (!data.has_more) return JSON.stringify(episodes.sort((a, b) => a.number - b.number));
            // Do not present a partial list as complete after a broken page.
            if (episodes.length === before) return JSON.stringify([]);
        }
        return JSON.stringify([]);
    } catch (error) {
        return JSON.stringify([]);
    }
}

async function extractStreamUrl(url) {
    try {
        const id = animesfhdPageId(url, 'episod');
        if (!id) return JSON.stringify({ streams: [] });
        const data = await soraFetch(ANIMESFHD_BASE + '/api/episodes/' + id);
        if (!data || !Array.isArray(data.sources)) return JSON.stringify({ streams: [] });
        const streams = [];
        const sourceSubtitles = [];
        const seen = {};
        for (const source of data.sources) {
            if (!source || source.native_video !== true || String(source.kind).toLowerCase() === 'embed') continue;
            const streamUrl = animesfhdAbsolute(source.url);
            if (!streamUrl || seen[streamUrl]) continue;
            seen[streamUrl] = true;
            const labels = [source.label || 'Player ' + (streams.length + 1)];
            const audio = animesfhdAudio(source.audio);
            if (audio) labels.push(audio);
            // Keep the stable API URL: the player follows 307s and receives fresh
            // MP4/HLS targets. In particular, preserve s6's playlist=.m3u8.
            streams.push({ title: labels.join(' - '), streamUrl: streamUrl, headers: ANIMESFHD_HEADERS });
            sourceSubtitles.push(animesfhdAbsolute(source.subtitle_url));
        }
        const result = { streams: streams };
        let subtitle = animesfhdAbsolute(data.episode && data.episode.subtitle_url);
        // Sora's contract has one subtitle URL for the whole stream list.
        // Only promote source-specific subtitles when every stream shares it.
        if (!subtitle && sourceSubtitles.length && sourceSubtitles.every(s => s && s === sourceSubtitles[0])) subtitle = sourceSubtitles[0];
        if (streams.length && subtitle) result.subtitles = subtitle;
        return JSON.stringify(result);
    } catch (error) {
        return JSON.stringify({ streams: [] });
    }
}
