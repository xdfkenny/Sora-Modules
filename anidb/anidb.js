const BASE_URL = 'https://anidb.app';
const BROWSE_URL = `${BASE_URL}/browse?q=`;
const SUGGEST_URL = `${BASE_URL}/search/suggestions?q=`;
const EPISODES_API = `${BASE_URL}/api/frontend/anime/%s/episodes`;
const LANGUAGES_API = `${BASE_URL}/api/frontend/episode/%s/languages`;

/* Mirror: anidb.se — an anidb-named streaming mirror used as fallback while
 * anidb.app is under maintenance (503 on every page/API route). Search
 * results that come from the mirror keep the mirror's own URLs; when the
 * main site is up again its URLs keep working because every step that
 * fails on the main site re-maps the show onto the mirror. */
const MIRROR_HOST = 'anidb.se';
const MIRROR_URL = `https://${MIRROR_HOST}`;
const MIRROR_SEARCH_URL = `${MIRROR_URL}/?s=`;

/* MAIN FUNCTIONS */

/**
 * Searches anidb.app for anime titles matching the given keyword. While the
 * main site is down (maintenance page / network failure) it chains to the
 * classic AniDB XML API (via Shirox's fetchv2 impersonation), then to the
 * anidb.se mirror search. Mirror results keep the mirror's own URLs; when
 * the main site is up again its URLs keep working because every step that
 * fails on the main site re-maps the show onto the mirror.
 * Returns a JSON string array of {title, image, href} objects.
 */
async function searchResults(keyword) {
    try {
        const query = (keyword || '').trim();
        if (!query) return JSON.stringify([]);

        // Main site first. Fallback is result-based, not exception-based:
        // in-app fetchv2 may resolve a 503 response without throwing and
        // without exposing .ok, so "main produced nothing" is the signal.
        const main = await mainSearch(query);
        if (main.length > 0) return JSON.stringify(main);

        // Classic AniDB (anidb.net/...info) — the XML API behind ani-cli.
        // Its host sits behind a Cloudflare datacenter-IP block, so it only
        // resolves with browser impersonation (Shirox fetchv2 arg 5).
        const classic = await classicSearch(query);
        if (classic.length > 0) return JSON.stringify(classic);

        const mirror = parseMirrorSearch(await fetchText(`${MIRROR_SEARCH_URL}${encodeURIComponent(query)}`));
        return JSON.stringify(mirror);
    } catch (error) {
        console.log('Search error: ' + error);
        return JSON.stringify([]);
    }
}

async function mainSearch(query) {
    try {
        const browseSrc = await fetchTextOrThrow(`${BROWSE_URL}${encodeURIComponent(query)}`);
        const fromBrowse = parseBrowseCards(browseSrc);
        if (fromBrowse.length > 0) return fromBrowse;
        return parseBrowseCards(await fetchTextOrThrow(`${SUGGEST_URL}${encodeURIComponent(query)}`));
    } catch (e) {
        // main unreachable / maintenance / HTTP error: caller chains on
        return [];
    }
}

/* Classic AniDB (anidb.net) — the XML API behind ani-cli. anidb.app's
 * actual backend: same data, original site. Its host is Cloudflare-blocked
 * for datacenter IPs, so it only resolves with browser impersonation
 * (Shirox fetchv2 arg 5: { impersonate: 'chrome' }). On builds without
 * impersonation the classic fetches just 403 and the chain moves on. */
const CLASSIC_BASE = 'https://anidb.net';
var CLASSIC_CACHE = {};

function isClassicUrl(url) {
    return /anidb\.(net|info)\//i.test(String(url || ''));
}

function classicAnimeUrl(hime) {
    return `${CLASSIC_BASE}/anime.php?hime=${hime}`;
}

// Cached classic API fetch: the chain asks for the same show XML more than
// once (details + episodes + stream) within one browsing session.
async function classicFetchXml(path) {
    const key = CLASSIC_BASE + path;
    if (CLASSIC_CACHE[key]) return CLASSIC_CACHE[key];
    const xml = await fetchText(key, 'chrome');
    CLASSIC_CACHE[key] = xml;
    return xml;
}

function isUsableClassicXml(xml) {
    return !!xml && !/<html|<!DOCTYPE/i.test(xml.slice(0, 300));
}

async function classicSearch(query) {
    try {
        const xml = await fetchText(`${CLASSIC_BASE}/xml/v1/site/search/anime.php?s=${encodeURIComponent(query)}&limit=20`, 'chrome');
        return parseClassicSearchXml(xml);
    } catch (e) {
        return [];
    }
}

// Classic API responses are XML — parse with regex/indexOf only.
// Each <anime> block: <hime>135</hime><titles><title lang="en">One Piece</title>...
function parseClassicSearchXml(xml) {
    const results = [];
    if (!isUsableClassicXml(xml)) return results;

    const seen = new Set();
    const animeRe = /<anime[^>]*>[\s\S]*?<\/anime>/gi;
    let block;
    while ((block = animeRe.exec(xml)) !== null) {
        const chunk = block[0];
        const hime = extractFirst(chunk, /<hime>(\d+)<\/hime>/i);
        // Prefer the English title, then the main title, then any title.
        const title = extractFirst(chunk, /<title[^>]*lang="en"[^>]*>([\s\S]*?)<\/title>/i)
            || extractFirst(chunk, /<title[^>]*lang="main"[^>]*>([\s\S]*?)<\/title>/i)
            || extractFirst(chunk, /<title[^>]*>([\s\S]*?)<\/title>/i);
        if (!hime || !title || seen.has(hime)) continue;
        seen.add(hime);
        results.push({
            title: cleanText(title),
            image: '',
            href: classicAnimeUrl(hime)
        });
    }
    return results;
}

async function classicEpisodes(hime) {
    try {
        const xml = await classicFetchXml(`/xml/v1/info/anime/episodes/${hime}`);
        if (!isUsableClassicXml(xml)) return [];

        const episodes = [];
        const epRe = /<episode[^>]*>[\s\S]*?<\/episode>/gi;
        let block;
        while ((block = epRe.exec(xml)) !== null) {
            const chunk = block[0];
            const id = extractFirst(chunk, /<eid>(\d+)<\/eid>/i);
            const epNumber = extractFirst(chunk, /<ep>(\d+)<\/ep>/i);
            const episodeType = extractFirst(chunk, /<episode_type>([^<]*)<\/episode_type>/i);
            // Main-season episodes only; specials/OVA come from other
            // endpoints and would interleave badly.
            if (!id || !epNumber || episodeType !== 'main_season') continue;
            episodes.push({
                href: `${CLASSIC_BASE}/episode.php?eid=${id}`,
                number: parseInt(epNumber, 10)
            });
        }
        episodes.sort((a, b) => a.number - b.number);
        return episodes;
    } catch (e) {
        return [];
    }
}

// Classic show details: real synopsis + release date + all titles, straight
// from the same DB anidb.app fronts.
async function classicDetails(hime) {
    try {
        const xml = await classicFetchXml(`/xml/v1/info/anime/${hime}`);
        if (!isUsableClassicXml(xml)) return null;

        const description = cleanText(extractFirst(xml, /<anidb_synopsis>([\s\S]*?)<\/anidb_synopsis>/i));
        const airdate = extractFirst(xml, /<date>([\d-]+)<\/date>/i);

        const titles = [];
        const titleRe = /<title[^>]*>([\s\S]*?)<\/title>/gi;
        let t;
        while ((t = titleRe.exec(xml)) !== null) {
            const x = cleanText(t[1]);
            if (x) titles.push(x);
        }

        return {
            description: description || 'No description available',
            airdate: airdate || 'Unknown',
            aliases: titles.length > 1 ? titles.join(', ') : (titles[0] || 'No alternative titles')
        };
    } catch (e) {
        return null;
    }
}

// Mirror show URL for a classic hime: the mirror only exposes search, so we
// go hime -> English title (classic API) -> mirror search -> show card.
async function mirrorUrlForClassicHime(hime) {
    if (!hime) return '';
    const xml = await classicFetchXml(`/xml/v1/info/anime/${hime}`);
    if (!isUsableClassicXml(xml)) return '';
    const en = extractFirst(xml, /<title[^>]*lang="en"[^>]*>([\s\S]*?)<\/title>/i);
    const title = cleanText(en || extractFirst(xml, /<title[^>]*>([\s\S]*?)<\/title>/i));
    if (!title) return '';
    const found = parseMirrorSearch(await fetchText(`${MIRROR_SEARCH_URL}${encodeURIComponent(title)}`));
    return found.length ? found[0].href : '';
}

// Mirror stream for a classic episode URL: eid -> ep number + hime ->
// mirror show page -> the matching mirror episode page -> its direct mp4.
async function classicEpisodeStream(url) {
    try {
        const eid = extractFirst(String(url || ''), /[?&]eid=(\d+)/i);
        if (!eid) return null;
        const xml = await classicFetchXml(`/xml/v1/info/episode/${eid}`);
        if (!isUsableClassicXml(xml)) return null;
        const hime = extractFirst(xml, /<hime>(\d+)<\/hime>/i);
        const epNum = extractFirst(xml, /<ep>(\d+)<\/ep>/i);
        if (!hime || !epNum) return null;
        const mirrorShow = await mirrorUrlForClassicHime(hime);
        if (!mirrorShow) return null;
        const html = await fetchText(mirrorShow);
        const eps = parseMirrorEpisodes(html, mirrorShowSlug(mirrorShow));
        const match = eps.find(function (e) { return e.number === parseInt(epNum, 10); });
        if (!match) return null;
        return parseMirrorStream(await fetchText(match.href));
    } catch (e) {
        return null;
    }
}

/**
 * Fetches the anime watch page and extracts description, airdate and alternative titles.
 * @param {string} url - The anidb.app anime page URL (or an anidb.se mirror URL).
 * @returns {string} JSON array with a single {description, airdate, aliases} object.
 */
async function extractDetails(url) {
    try {
        if (isMirrorUrl(url)) {
            const mirrorDetails = parseMirrorDetails(await fetchText(String(url)));
            return JSON.stringify([mirrorDetails || detailsFallback()]);
        }
        if (isClassicUrl(url)) {
            const hime = extractFirst(String(url), /[?&]hime=(\d+)/i);
            return JSON.stringify([classicDetails(hime) || detailsFallback()]);
        }
        try {
            const html = await fetchTextOrThrow(String(url));
            if (/under maintenance/i.test(html)) throw new Error('main site maintenance page');
            return JSON.stringify([parseMainDetails(html)]);
        } catch (mainError) {
            // main site unreachable / maintenance: classic API first (real
            // synopsis + dates + aliases), mirror title-only last.
            const hime = parseAnimeId(url);
            const classic = hime ? classicDetails(hime) : null;
            if (classic) return JSON.stringify([classic]);
            const mirrorDetails = parseMirrorDetails(await fetchText(resolveMirrorUrl(url)));
            return JSON.stringify([mirrorDetails || detailsFallback()]);
        }
    } catch (error) {
        console.log('Details error: ' + error);
        return JSON.stringify([detailsFallback()]);
    }
}

/**
 * Extracts the list of episodes for an anime using the public JSON API.
 * The anime numeric ID is read from the tail of the passed URL. While the
 * main API is down it falls back to the anidb.se mirror, whose show pages
 * list the episodes it has (recent uploads only).
 * @param {string} url - The anime page URL, e.g. https://anidb.app/anime/one-piece-135
 *   or the mirror counterpart https://anidb.se/anime/one-piece/.
 * @returns {string} JSON string array of {href, number} objects.
 */
async function extractEpisodes(url) {
    try {
        if (isMirrorUrl(url)) {
            const html = await fetchText(String(url));
            const mirror = parseMirrorEpisodes(html, mirrorShowSlug(url));
            if (mirror.length > 0) return JSON.stringify(mirror);
            return JSON.stringify([]);
        }

        // Result-based fallback: in-app fetchv2 may resolve a 503 API
        // response without throwing, so "main produced no episodes" is the
        // signal to chain onto the classic XML API, then the mirror.
        const main = await mainEpisodes(url);
        if (main.length > 0) return JSON.stringify(main);

        const hime = parseAnimeId(url) || extractFirst(String(url || ''), /[?&]hime=(\d+)/i);
        if (hime) {
            const classicEps = await classicEpisodes(hime);
            if (classicEps.length > 0) {
                // Classic episode URLs are metadata-only (no stream); the
                // playable chain (extractStreamUrl) works off mirror episode
                // pages, so try to hand Sora mirror URLs for this show.
                const mirrorShow = await mirrorUrlForClassicHime(hime);
                if (mirrorShow) {
                    const html = await fetchText(mirrorShow);
                    const mirror = parseMirrorEpisodes(html, mirrorShowSlug(mirrorShow));
                    if (mirror.length > 0) return JSON.stringify(mirror);
                }
                return JSON.stringify(classicEps);
            }
        }

        const html = await fetchText(resolveMirrorUrl(url));
        const mirror = parseMirrorEpisodes(html, mirrorShowSlug(url));
        return JSON.stringify(mirror);
    } catch (error) {
        console.log('Episodes error: ' + error);
        return JSON.stringify([]);
    }
}

async function mainEpisodes(url) {
    try {
        const animeId = parseAnimeId(url);
        if (!animeId) return [];
        const response = await soraFetch(EPISODES_API.replace('%s', animeId));
        if (!response) return [];
        const data = await response.json();
        return parseMainEpisodes(data, BASE_URL);
    } catch (e) {
        return [];
    }
}

/**
 * Resolves an anime episode to its playable stream. Main site: JWPlayer
 * embeds exposing a "file" master playlist. Mirror fallback: the anidb.se
 * episode page's uvp-1 player exposing a direct mp4/hls source.
 * @param {string} url - The episode href emitted by extractEpisodes.
 * @returns {string} JSON object {streams:[{title, streamUrl, headers}], subtitle}.
 */
async function extractStreamUrl(url) {
    const fallback = JSON.stringify({ streams: [], subtitle: '' });
    try {
        if (isMirrorUrl(url)) {
            const mirror = parseMirrorStream(await fetchText(String(url)));
            return JSON.stringify({ streams: mirror ? [mirror] : [], subtitle: '' });
        }
        if (isClassicUrl(url)) {
            const classic = await classicEpisodeStream(url);
            return JSON.stringify({ streams: classic ? [classic] : [], subtitle: '' });
        }
        // While the main site is down, the app's episode URLs came from the
        // mirror's extractEpisodes and are already anidb.se URLs (handled
        // above). A raw anidb.app/episode/<id> URL has no mirror
        // counterpart, so main only.
        const main = await resolveMainStream(String(url));
        return JSON.stringify({ streams: main || [], subtitle: '' });
    } catch (error) {
        console.log('Stream error: ' + error);
        return fallback;
    }
}

async function resolveMainStream(url) {
    const episodeMatch = String(url || '').match(/\/episode\/(\d+)/);
    if (!episodeMatch) return null;

    const epId = episodeMatch[1];
    const response = await soraFetch(LANGUAGES_API.replace('%s', epId));
    if (!response) return null;
    const data = await response.json();

    const rawLangs = (data && (Array.isArray(data.languages) ? data.languages : Array.isArray(data.data) ? data.data : Array.isArray(data.streams) ? data.streams : [])) || [];
    if (!Array.isArray(rawLangs) || rawLangs.length === 0) return null;

    const languages = rawLangs
        .map((lang) => ({
            code: (lang.code || lang.language || '').toLowerCase(),
            name: lang.name || lang.label,
            embed_url: lang.embed_url || lang.url || lang.file
        }))
        .filter((l) => l.code && l.embed_url);

    const streams = [];
    const seenLang = new Set();

    // Resolve each language embed to its master playlist.
    // Prefer SUB (jpn) first, then DUB (eng), keeping every language as a
    // selectable stream in Sora's server picker.
    const preferred = languages.slice().sort((a, b) => {
        const ord = { jpn: 0, eng: 1, 'es': 2, 'pt-br': 3 };
        return (ord[a.code] ?? 9) - (ord[b.code] ?? 9);
    });

    const resolved = await Promise.all(preferred.map(async (lang) => {
        try {
            const master = await resolveEmbedMaster(lang.embed_url);
            if (!master) return null;
            return {
                title: prettifyLangLabel(lang),
                streamUrl: master,
                headers: makeStreamHeaders(),
                language: lang.code
            };
        } catch (e) {
            console.log('Embed resolve error: ' + (lang.code || lang.name) + ' -> ' + e);
            return null;
        }
    }));

    resolved.forEach((s) => {
        if (!s || !s.streamUrl) return;
        const key = s.language || s.streamUrl;
        if (seenLang.has(key)) return;
        seenLang.add(key);
        streams.push(s);
    });

    return streams.length ? streams : null;
}

/* MIRROR HELPERS (anidb.se) */

function isMirrorUrl(url) {
    return String(url || '').includes(MIRROR_HOST);
}

// Map a main-site show URL onto its anidb.se mirror URL. Main anime URLs are
// /anime/<slug>[-<id>]; the mirror drops the numeric id:
// https://anidb.app/anime/one-piece-135 -> https://anidb.se/anime/one-piece/
// Mirror URLs pass through unchanged; anything else yields ''.
function resolveMirrorUrl(url) {
    const u = String(url || '');
    if (u.includes(MIRROR_HOST)) return u;
    const m = u.match(/anidb\.app\/anime\/([a-z0-9-]+?)(?:-\d+)?\/?(?:[?#].*)?$/i);
    if (!m) return '';
    return `${MIRROR_URL}/anime/${m[1].replace(/-\d+$/, '')}/`;
}

// The show slug a mirror episode/show URL belongs to ("one-piece" from
// .../anime/one-piece/ or .../one-piece-episode-1180-english-subbed/).
function mirrorShowSlug(url) {
    const s = String(url || '').replace(/\/+$/, '');
    const m = s.match(/anidb\.se\/(?:anime\/)?([a-z0-9-]+)$/i);
    if (m) {
        const ep = m[1].match(/^(.+)-episode-\d+-.*/i);
        return ep ? ep[1] : m[1];
    }
    const main = s.match(/anidb\.app\/anime\/([a-z0-9-]+?)(?:-\d+)?\/?(?:[?#].*)?$/i);
    if (main) return main[1].replace(/-\d+$/, '');
    return '';
}

function parseMirrorSearch(html) {
    const results = [];
    const seen = new Set();
    if (!html) return results;

    // Result cards live in the main content; the sidebar carries unrelated
    // recent-episode/show cards, so stop parsing at the sidebar.
    const sideIdx = html.indexOf('id="sidebar"');
    const main = sideIdx > 0 ? html.slice(0, sideIdx) : html;

    const re = /<a[^>]*href="(https:\/\/anidb\.se\/(?:anime\/)?[a-z0-9-]+\/?)"[^>]*title="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
    let cardMatch;
    while ((cardMatch = re.exec(main)) !== null) {
        const rawHref = cardMatch[1];
        const showHref = /^https:\/\/anidb\.se\/anime\//i.test(rawHref) ? rawHref.replace(/\/?$/, '/') : '';
        if (!showHref || seen.has(showHref)) continue;
        seen.add(showHref);

        const title = cleanText(cardMatch[2] || '').replace(/-\d+$/, '') || mirrorTitleFromHref(showHref);

        // Thumbnails are lazy-loaded: the real URL lives in data-src, the
        // src attribute is a base64 SVG placeholder.
        const imgTag = cardMatch[3].match(/<img[^>]*>/i);
        let image = '';
        if (imgTag) {
            image = extractFirst(imgTag[0], /data-src="(https?:\/\/[^"]+)"/i)
                || extractFirst(imgTag[0], /src="(https?:\/\/[^"']+)"/i);
        }
        image = decodeHtml(image || '').trim();
        if (!/^https?:/i.test(image) || /data:image/i.test(image)) image = '';

        results.push({ title, image, href: showHref });
    }

    return results;
}

// Mirror show pages: the h1 holds the title; the mirror carries no
// synopsis or metadata, so details are best-effort.
function parseMirrorDetails(html) {
    if (!html) return null;
    const h1 = extractFirst(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i);
    const title = cleanText(h1.replace(/<\/?span[^>]*>/g, '') || h1);
    if (!title) return null;
    return {
        description: 'No description available',
        airdate: 'Unknown',
        aliases: title
    };
}

// Mirror episode list: episode links following the <slug>-episode-<n>-...
// pattern of the given show (the number is embedded in the URL, so the href
// shape is the filter — the mirror shows a mix of a teaser card and a full
// episode list depending on the page variant). The mirror only lists its
// available episodes (recent uploads), not a full season — acceptable
// fallback data.
function parseMirrorEpisodes(html, slug) {
    const results = [];
    const seen = new Set();
    if (!html || !slug) return results;

    const slugEsc = slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const epHrefRe = new RegExp('^https://anidb\\.se/' + slugEsc + '-episode-(\\d+)-[^/]*$', 'i');

    const re = /<a[^>]*href="(https:\/\/anidb\.se\/[a-z0-9-]+-episode-\d+[^/"]*)\/?"/gi;
    let link;
    while ((link = re.exec(html)) !== null) {
        const href = link[1];
        const epMatch = href.replace(/\/+$/, '').match(epHrefRe);
        if (!epMatch) continue;
        const number = parseInt(epMatch[1], 10);
        if (isNaN(number) || seen.has(href)) continue;
        seen.add(href);
        results.push({ href: href + '/', number: number });
    }

    results.sort((a, b) => b.number - a.number);
    return results;
}

// Mirror stream: the uvp-1 player on the episode page exposes its source in
// data-src (data-type distinguishes mp4 from hls).
function parseMirrorStream(html) {
    if (!html) return null;
    const videoTag = html.match(/<video[^>]*class="[^"]*uvp[^"]*"[^>]*>/i) || html.match(/<video[^>]*>/i);
    if (!videoTag) return null;
    const src = extractFirst(videoTag[0], /data-src="(https?:\/\/[^"]+)"/i);
    if (!src) return null;
    return {
        title: 'English (mirror)',
        streamUrl: decodeHtml(src),
        headers: makeMirrorHeaders()
    };
}

function mirrorTitleFromHref(href) {
    const m = String(href || '').match(/\/anime\/([^/]+)\/?$/i);
    if (!m) return 'Unknown Anime';
    return m[1].replace(/-\d+$/, '').replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function makeMirrorHeaders() {
    return {
        "Referer": MIRROR_URL + '/',
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    };
}

/* HELPERS */

// Resolve an anidb.app/embed/<token> page to its HLS master playlist URL.
async function resolveEmbedMaster(embedUrl) {
    if (!embedUrl) return null;

    // If the embed URL already points at media (m3u8), return as-is.
    if (/\.m3u8/i.test(embedUrl)) return embedUrl;

    const response = await soraFetch(embedUrl);
    if (!response) return null;
    const html = await response.text();

    const master = extractFirst(html, /sources\s*:\s*\[\s*\{\s*file\s*:\s*['"]([^'"]+\.m3u8[^'"]*)['"]/i)
        || extractFirst(html, /file\s*:\s*['"](https?:\/\/[^'"]+\.m3u8[^'']*)['"]/i)
        || extractFirst(html, /'(https?:\/\/[^']+\.m3u8(?:[^']*))'/i)
        || extractFirst(html, /["']file["']\s*:\s*["']([^"']+\.m3u8[^"']*)["']/i)
        || extractFirst(html, /playlist\s*:\s*['"]([^'"]+\.m3u8[^"']*)['"]/i)
        || extractFirst(html, /(https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/i);

    return master ? decodeHtml(master) : null;
}

// Parse the main-site episodes JSON payload (API shape varies between builds).
function parseMainEpisodes(data, baseUrl) {
    const rawEpisodes = (data && (Array.isArray(data.episodes) ? data.episodes : Array.isArray(data.data) ? data.data : Array.isArray(data.list) ? data.list : [])) || [];
    if (!Array.isArray(rawEpisodes)) return [];

    return rawEpisodes
        .map((ep, index) => {
            const number = ep.number !== undefined ? parseInt(ep.number, 10) : index + 1;
            const epId = ep.id || ep.episode_id || ep.episodeId;
            if (isNaN(number) || !epId) return null;
            return {
                href: `${baseUrl}/episode/${epId}`,
                number: number
            };
        })
        .filter(Boolean);
}

function prettifyLangLabel(lang) {
    const map = {
        jpn: 'Japanese (SUB)',
        eng: 'English (DUB)',
        'ch-s': 'Chinese (SUB)',
        'pt-br': 'Portuguese (SUB)',
        'es': 'Spanish (SUB)'
    };
    if (map[lang.code]) return map[lang.code];
    if (lang.name) return lang.name;
    return (lang.code || 'Unknown').toUpperCase();
}

function parseBrowseCards(html) {
    const results = [];
    const seen = new Set();

    // Multiple resilient regex patterns to support DOM/class changes.
    const regexes = [
        /<a[^>]*href="(https?:\/\/anidb\.app\/anime\/[^"]+)"[^>]*class="[^"]*anime-card[^"]*"[^>]*title="([^"]*)"[\s\S]*?<img[^>]*src="([^"]+)"[\s\S]*?<\/a>/gi,
        /<a[^>]*href="(https?:\/\/anidb\.app\/anime\/[^"]+)"[^>]*title="([^"]*)"[\s\S]*?<img[^>]*src="([^"]+)"[\s\S]*?<\/a>/gi,
        /<a[^>]*href="(https?:\/\/anidb\.app\/anime\/[^"]+)"[\s\S]*?<img[^>]*src="([^"]+)"[^>]*alt="([^"]*)"[\s\S]*?<\/a>/gi,
        /<a[^>]*href="(https?:\/\/anidb\.app\/anime\/[^"]+)"[\s\S]*?<\/a>/gi
    ];

    for (const rx of regexes) {
        let cardMatch;
        while ((cardMatch = rx.exec(html)) !== null) {
            const href = cardMatch[1];
            let title = cleanText(cardMatch[2] || cardMatch[3] || '');
            let image = decodeHtml(cardMatch[3] || cardMatch[2] || '').trim();

            // Handle the image/title capture swap in some patterns.
            if (image && !image.startsWith('http') && title && title.startsWith('http')) {
                const temp = title;
                title = image;
                image = temp;
            }

            if (!title) {
                const slugMatch = href.match(/\/([^/]+)$/);
                title = slugMatch ? slugMatch[1].replace(/-\d+$/, '').replace(/-/g, ' ') : 'Unknown Anime';
            }

            if (!href || seen.has(href)) continue;
            seen.add(href);
            results.push({
                title: cleanText(title),
                image: image.startsWith('http') ? image : '',
                href
            });
        }
        if (results.length > 0) break;
    }

    return results;
}

// anidb.app anime URLs are /anime/<slug>-<numericId>. Return the numeric id.
function parseAnimeId(url) {
    const m = String(url || '').match(/\/anime\/[^/]+-(\d+)\/?$/i);
    if (m && m[1]) return m[1];
    const fallback = String(url || '').match(/-(\d+)\/?$/);
    return fallback ? fallback[1] : '';
}

// Helper to grab the <dd> value following a <dt> with the given label
// inside the "Details" <dl> block, with fallback patterns.
function extractDt(html, label) {
    const re = new RegExp(`<dt[^>]*>[^<]*${label}[^<]*<\\/dt>\\s*<dd[^>]*>([\\s\\S]*?)<\\/dd>`, 'i');
    const m = (html || '').match(re);
    if (m && m[1]) return cleanText(m[1]);

    const altRe = new RegExp(`(?:<dt[^>]*>|<span[^>]*>)\\s*${label}\\s*(?:<\\/dt>|<\\/span>)\\s*(?:<dd[^>]*>|<span[^>]*>)([\\s\\S]*?)(?:<\\/dd>|<\\/span>)`, 'i');
    const altM = (html || '').match(altRe);
    if (altM && altM[1]) return cleanText(altM[1]);

    return '';
}

function extractFirst(text, regex) {
    const match = (text || '').match(regex);
    return match ? match[1] : '';
}

function decodeHtml(text) {
    return String(text || '')
        .replace(/&#039;/g, "'")
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, '&')
        .replace(/&#038;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');
}

function cleanText(text) {
    return decodeHtml(String(text || ''))
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/?[^>]+(>|$)/g, '')
        .replace(/\s+\n/g, '\n')
        .replace(/\n\s+/g, '\n')
        .replace(/[ \t]+/g, ' ')
        .trim();
}

// Stream headers that match the anidb.app playback origin.
function makeStreamHeaders() {
    return {
        "Referer": BASE_URL + '/',
        "Origin": BASE_URL,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    };
}

// Parse details from a main-site show page.
function parseMainDetails(html) {
    const description = extractFirst(html, /<meta[^>]*property="og:description"[^>]*content="([^"]+)"/i)
        || extractFirst(html, /<meta[^>]*name="description"[^>]*content="([^"]+)"/i)
        || extractFirst(html, /<p\s+class="[^"]*(?:leading-relaxed|description|plot|summary)[^"]*"[^>]*>([\s\S]*?)<\/p>/i)
        || extractFirst(html, /<div\s+class="[^"]*(?:description|plot|summary|synopsis)[^"]*">([\s\S]*?)<\/div>/i)
        || 'No description available';

    const airdate = extractDt(html, 'Aired')
        || extractDt(html, 'Season')
        || extractDt(html, 'Released')
        || extractFirst(html, /<div class="text-sm"><dt[^>]*name="(?:Year|Airdate|Date)"[^>]*>([^<]+)<\/dt>/i)
        || 'Unknown';

    const aliases = extractDt(html, 'Synonyms')
        || extractDt(html, 'Alternative')
        || extractDt(html, 'Titles')
        || 'No alternative titles';

    return {
        description: cleanText(description),
        airdate: cleanText(airdate),
        aliases: cleanText(aliases)
    };
}

async function soraFetch(url, options) {
    const opts = options || {};
    const mergedHeaders = mergeHeaders(url, opts);
    const method = opts.method || 'GET';
    const body = typeof opts.body === 'undefined' ? null : opts.body;

    try {
        // Shirox's fetchv2 accepts a 5th arg ({ impersonate: 'chrome', ... })
        // that dresses the request up as a real browser — useful against
        // datacenter-IP blocks; older Sora/Luna builds ignore it.
        return await fetchv2(url, mergedHeaders, method, body, opts.impersonate ? { impersonate: opts.impersonate } : undefined);
    } catch (e) {
        try {
            const text = await fetch(url, {
                method: method,
                headers: mergedHeaders,
                body: body
            });
            return {
                text: async () => text,
                json: async () => JSON.parse(text)
            };
        } catch (error) {
            console.log('soraFetch error: ' + error);
            return null;
        }
    }
}

// Fetch URL text; throws on non-2xx so callers can chain to the mirror.
// (fetchv2 may reject on network failure but still resolve on 4xx/5xx,
// hence the explicit status check.)
async function fetchTextOrThrow(url, impersonate) {
    const response = await soraFetch(url, impersonate ? { impersonate: impersonate } : undefined);
    if (!response) throw new Error('no response: ' + url);
    if (response.ok !== undefined && response.ok === false) {
        const status = response.status || 0;
        if (status >= 400) throw new Error('http ' + status + ': ' + url);
    }
    return await response.text();
}

async function fetchText(url, impersonate) {
    if (!url) return '';
    const response = await soraFetch(url, impersonate ? { impersonate: impersonate } : undefined);
    if (!response) return '';
    return await response.text();
}

function mergeHeaders(url, opts) {
    const base = opts.headers || {};
    const defaults = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    };

    const host = String(url || '').replace(/^https?:\/\//, '').split('/')[0] || '';
    if (/anidb\.app|hls\.anidb\.app/i.test(host)) {
        defaults['Accept'] = '*/*';
        defaults['Accept-Language'] = 'en-US,en;q=0.9';
        defaults['Referer'] = BASE_URL + '/';
        defaults['Origin'] = BASE_URL;
    }
    if (host === MIRROR_HOST || host.endsWith('.' + MIRROR_HOST)) {
        defaults['Referer'] = MIRROR_URL + '/';
        defaults['Accept'] = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';
    }

    const out = {};
    let k;
    for (k in defaults) if (Object.prototype.hasOwnProperty.call(defaults, k)) out[k] = defaults[k];
    for (k in base) if (Object.prototype.hasOwnProperty.call(base, k)) out[k] = base[k];
    return out;
}
