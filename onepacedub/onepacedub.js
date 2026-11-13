// One Pace (DUB) — v2.0.0
// Rebuilt for the current onepace.net/en/watch Next.js page.
// The old <h2>/<span class="flex-1"> markup is gone; the page now ships its
// catalog as a React Server Component flight payload containing escaped JSON
// per arc:  {\"slug\":..,\"title\":..,\"backdrops\":[{\"src\":..}]} plus watch
// releases  {\"sub_type\":..,\"sub\":..,\"dub\":..,\"cut\":..,\"items\":[{\"id\":\"<pixeldrain>\",\"resolution\":NNN}]}.
// All parsing is regex/indexOf/substring only.

var ONEPACE_WATCH_URL = 'https://onepace.net/en/watch';
var PIXELDRAIN_LIST_API = 'https://pixeldrain.net/api/list/';
var PIXELDRAIN_FILE_API = 'https://pixeldrain.net/api/file/';
var MODULE_TAG = '[OnePaceDub v2.0.0]';

function soraFetch(url, options) {
    options = options || {};
    try {
        return fetchv2(url, options.headers || {}, options.method || 'GET', options.body || null);
    } catch (e) {
        try {
            return fetch(url, options);
        } catch (e2) {
            return null;
        }
    }
}

function decodeEntities(s) {
    if (!s) return '';
    return String(s)
        .replace(/&amp;/g, '&')
        .replace(/&#x27;|&#39;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&nbsp;/g, ' ');
}

// Parse the RSC flight payload into [{title, image, releases:[{prefix, suffix, items:[{id,res}]}]}]
function parseOnePaceCatalog(html) {
    var segRe = /\\"slug\\":\\"([a-z0-9-]+)\\",\\"title\\":\\"([^\\]+)\\"/g;
    var segs = [];
    var m;
    while ((m = segRe.exec(html)) !== null) {
        segs.push({ idx: m.index, slug: m[1], title: decodeEntities(m[2]) });
    }
    if (segs.length === 0) return [];

    // first backdrop image inside each segment's window
    for (var i = 0; i < segs.length; i++) {
        var start = segs[i].idx;
        var end = (i + 1 < segs.length) ? segs[i + 1].idx : html.length;
        var window = html.substring(start, end);
        var img = window.match(/\\"backdrops\\":\[\{\\"src\\":\\"([^\\]+)\\"/);
        segs[i].image = img ? 'https://onepace.net' + img[1] : '';
    }

    // watch releases with pixeldrain items
    var relRe = /\\"sub_type\\":\\"([^\\]*)\\",\\"sub\\":\\"([^\\]*)\\",\\"dub\\":\\"([^\\]*)\\",\\"cut\\":\\"([^\\]*)\\",\\"items\\":\[(.*?)\]\}/g;
    var releases = [];
    while ((m = relRe.exec(html)) !== null) {
        releases.push({ idx: m.index, subType: m[1], sub: m[2], dub: m[3], cut: m[4], itemsRaw: m[5] });
    }

    // assign each release to its owning segment (last segment starting before it)
    var catalog = [];
    var r = 0;
    for (var s = 0; s < segs.length; s++) {
        var segEnd = (s + 1 < segs.length) ? segs[s + 1].idx : html.length;
        var entry = { title: segs[s].title, image: segs[s].image, releases: [] };
        while (r < releases.length && releases[r].idx < segEnd) {
            if (releases[r].idx >= segs[s].idx) entry.releases.push(releases[r]);
            r++;
        }
        catalog.push(entry);
    }
    return catalog;
}

// Map a watch release to a DUB entry descriptor, or null if not English-dub audio.
function releaseToDescriptor(rel) {
    var prefix = '';
    if (rel.subType === 'cc') {
        prefix = '[CC] ';
    } else if (rel.subType === 'dubtitles') {
        return null; // Japanese audio with dub-script subs — not dub audio
    } else if (rel.dub !== 'en') {
        return null; // subtitle-only release (dub track is original language)
    }
    var cutSuffix = '';
    if (rel.cut === 'extended') cutSuffix = ' Extended';
    else if (rel.cut === 'alternate_g8') cutSuffix = ' Alternate (G-8)';
    else if (rel.cut && rel.cut !== '$undefined') cutSuffix = ' ' + rel.cut.charAt(0).toUpperCase() + rel.cut.slice(1);
    return { prefix: prefix, suffix: cutSuffix };
}

function parseItems(itemsRaw) {
    var out = [];
    var itemRe = /\{\\"id\\":\\"([A-Za-z0-9]+)\\",\\"resolution\\":(\d+)\}/g;
    var m;
    while ((m = itemRe.exec(itemsRaw)) !== null) {
        out.push({ id: m[1], res: m[2] });
    }
    // keep a stable 480 -> 720 -> 1080 order
    out.sort(function (a, b) { return parseInt(a.res, 10) - parseInt(b.res, 10); });
    return out;
}

async function searchResults(keyword) {
    try {
        var response = await soraFetch(ONEPACE_WATCH_URL, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        if (!response) return JSON.stringify([]);
        var html = await response.text();
        if (!html || html.length < 1000) return JSON.stringify([]);

        var catalog = parseOnePaceCatalog(html);
        var results = [];
        var kw = (keyword || '').toLowerCase();
        var matchAll = kw === 'all' || kw === 'everything' || kw === '';

        if (matchAll) {
            results.push({
                title: "Use «all» or «everything» to get all content.",
                href: "",
                image: "https://raw.githubusercontent.com/JayGxnzalez/Modules/main/One-Pace-DUB/One_Pace_Logo.png"
            });
        }

        for (var i = 0; i < catalog.length; i++) {
            var arc = catalog[i];
            for (var j = 0; j < arc.releases.length; j++) {
                var desc = releaseToDescriptor(arc.releases[j]);
                if (!desc) continue;
                var items = parseItems(arc.releases[j].itemsRaw);
                for (var k = 0; k < items.length; k++) {
                    var title = desc.prefix + arc.title + desc.suffix + ' - ' + items[k].res + 'p';
                    if (!matchAll && title.toLowerCase().indexOf(kw) === -1) continue;
                    results.push({
                        title: title,
                        href: 'https://pixeldrain.net/l/' + items[k].id,
                        image: arc.image
                    });
                }
            }
        }
        console.log(MODULE_TAG + ' searchResults(' + keyword + '): ' + results.length + ' results');
        return JSON.stringify(results);
    } catch (e) {
        console.log(MODULE_TAG + ' searchResults error: ' + e);
        return JSON.stringify([]);
    }
}

function extractListData(listId) {
    var data = null;
    return soraFetch(PIXELDRAIN_LIST_API + listId).then(async function (response) {
        if (!response) return null;
        var body = await response.text();
        try { data = JSON.parse(body); } catch (e) { data = null; }
        if (!data || !data.title || !data.files || !data.files.length) return null;
        return data;
    });
}

async function extractDetails(url) {
    try {
        var match = String(url || '').match(/pixeldrain\.net\/l\/([^\/?#]+)/);
        if (!match) {
            return JSON.stringify([{ description: 'Invalid One Pace pixeldrain URL', aliases: '', airdate: '' }]);
        }
        var data = await extractListData(match[1]);
        if (!data) {
            return JSON.stringify([{ description: 'Pixeldrain list unavailable for ' + match[1], aliases: '', airdate: '' }]);
        }
        var description = 'Title: ' + data.title + '\nFile Count: ' + data.file_count;
        return JSON.stringify([{ description: description, aliases: description, airdate: '' }]);
    } catch (e) {
        console.log(MODULE_TAG + ' extractDetails error: ' + e);
        return JSON.stringify([{ description: 'Error fetching details', aliases: '', airdate: '' }]);
    }
}

async function extractEpisodes(url) {
    try {
        var match = String(url || '').match(/pixeldrain\.net\/l\/([^\/?#]+)/);
        if (!match) return JSON.stringify([]);
        var data = await extractListData(match[1]);
        if (!data) return JSON.stringify([]);
        var episodes = [];
        for (var i = 0; i < data.files.length; i++) {
            episodes.push({ href: data.files[i].id, number: i + 1 });
        }
        console.log(MODULE_TAG + ' extractEpisodes(' + match[1] + '): ' + episodes.length + ' files');
        return JSON.stringify(episodes);
    } catch (e) {
        console.log(MODULE_TAG + ' extractEpisodes error: ' + e);
        return JSON.stringify([]);
    }
}

async function extractStreamUrl(url) {
    try {
        var fileId = String(url || '').replace(/[^A-Za-z0-9]/g, '');
        if (!fileId) return JSON.stringify({ streams: [] });
        return JSON.stringify({
            streams: [{ title: 'Pixeldrain', streamUrl: PIXELDRAIN_FILE_API + fileId + '?download' }]
        });
    } catch (e) {
        console.log(MODULE_TAG + ' extractStreamUrl error: ' + e);
        return JSON.stringify({ streams: [] });
    }
}
