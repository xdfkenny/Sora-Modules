/* MangaBall — Shirox manga source module
 * Author: Jay
 * Site: https://mangaball.com   API: https://api.mangaball.com/api/v1
 */

const SITE = "https://mangaball.com";
const API = "https://api.mangaball.com/api/v1";
const COVER_CDN = "https://bulbasaur.poke-black-and-white.net/covers/";

/* Hide adult / hentai titles from search results. */
const FILTER_ADULT = true;

/* Show the English title where the API carries one, instead of romaji. */
const PREFER_ENGLISH_TITLES = true;

/* MangaDex cover thumbnail width: 256 (fastest) or 512 (sharper). */
const COVER_THUMB_SIZE = 512;

/* Languages to pull chapters for. One code = one request and a small
 * payload; add more codes (e.g. ["en", "es"]) for extra reader tabs, or
 * set to [] to pull every language MangaBall has (slow on big series). */
const CHAPTER_LANGUAGES = ["en"];

const CHAPTER_LIMIT = 500;
const MAX_CHAPTER_PAGES = 4;
const MAX_VARIANTS_PER_CHAPTER = 10;

/* Upstream source quality. MangaBall mirrors other sites and labels each
 * upload with a Pokemon "group" name, but the real quality signal is the
 * `site` field (the site it was scraped from). Higher = better scan. */
const SITE_QUALITY = {
    "mangadex": 100,
    "comick": 95,
    "weebcentral": 88,
    "mangapark": 86,
    "mangakatana": 84,
    "mangafire": 80,
    "mangabuddy": 78,
    "mangareader": 74,
    "mangasee": 72,
    "asurascans": 70,
    "flamecomics": 68,
    "mangahub": 60,
    "readcomicsonline": 56,
    "godamh": 54,
    "zinmanga": 52,
    "likemanga": 50,
    "daomeoden": 48,
    "komiku": 46,
    "komikcast": 46,
    "kiryuu": 44,
    "leercapitulo": 42,
    "mangaonline": 40,
    "hentairead": 30
};

const SITE_LABELS = {
    "mangadex": "MangaDex",
    "comick": "Comick",
    "weebcentral": "WeebCentral",
    "mangapark": "MangaPark",
    "mangakatana": "MangaKatana",
    "mangafire": "MangaFire",
    "mangabuddy": "MangaBuddy",
    "mangahub": "MangaHub",
    "godamh": "GoDaMH",
    "zinmanga": "ZinManga",
    "likemanga": "LikeManga",
    "daomeoden": "DaoMeoDen",
    "komiku": "Komiku",
    "komikcast": "KomikCast",
    "kiryuu": "Kiryuu",
    "leercapitulo": "LeerCapitulo",
    "mangaonline": "MangasOnline",
    "readcomicsonline": "ReadComicsOnline",
    "hentairead": "HentaiRead"
};

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

async function soraFetch(url, options) {
    if (!options) options = {};
    const headers = options.headers || {};
    if (!headers["Accept"]) headers["Accept"] = "application/json, text/plain, */*";
    if (!headers["Origin"]) headers["Origin"] = SITE;
    if (!headers["Referer"]) headers["Referer"] = SITE + "/";
    try {
        return await fetchv2(url, headers, options.method || "GET", options.body || null);
    } catch (e) {
        try {
            return await fetch(url, {
                method: options.method || "GET",
                headers: headers,
                body: options.body || null
            });
        } catch (error) {
            return null;
        }
    }
}

/* iOS ATS refuses plain http, so everything is forced to https. */
function httpsify(u) {
    u = String(u || "").trim();
    if (u.length === 0) return "";
    if (u.indexOf("//") === 0) return "https:" + u;
    if (u.indexOf("http://") === 0) return "https://" + u.substring(7);
    if (u.indexOf("https://") === 0) return u;
    return SITE + (u.indexOf("/") === 0 ? "" : "/") + u;
}

function objectId(url) {
    const m = /([a-f0-9]{24})/i.exec(String(url || ""));
    return m ? m[1] : null;
}

/* MangaDex serves resized covers by appending .256.jpg / .512.jpg to the
 * whole filename. The originals are multi-megabyte scans, so a grid of 36
 * of them is what makes search feel slow. */
function thumbify(u) {
    if (!u) return u;
    if (u.indexOf("uploads.mangadex.org/covers/") === -1) return u;
    if (/\.(?:256|512)\.jpg$/i.test(u)) return u;
    return u + "." + COVER_THUMB_SIZE + ".jpg";
}

/* MangaBall's own cover host is Cloudflare hotlink-protected and 403s the
 * app's image loader, so the mirrored sources are tried first and the
 * MangaBall CDN is only a last resort. */
function coverUrl(item) {
    const img = item && item.image ? item.image : null;
    if (!img) return "";
    if (img.cdn_mangadex) return thumbify(httpsify(img.cdn_mangadex));
    if (img.cdn_mangaupdate) return httpsify(img.cdn_mangaupdate);
    if (img.file) return httpsify(img.file);
    if (img.cover && img.cover.path) {
        const p = String(img.cover.path).replace(/\\/g, "/").replace(/^\/+/, "");
        return COVER_CDN + p;
    }
    return "";
}

/* ------------------------------------------------------------------ */
/* adult filtering                                                     */
/* ------------------------------------------------------------------ */

const ADULT_TAGS = {
    "hentai": true,
    "pornographic": true,
    "smut": true,
    "adult": true,
    "erotica": true
};

function isAdult(item) {
    if (!item) return false;
    if (item.is18plus === true) return true;

    /* MangaBall prefixes adult uploads with "[H]" */
    const name = String(item.name || "");
    if (/^\s*[\[(（【]\s*h\s*[\])）】]/i.test(name)) return true;

    if (Array.isArray(item.tags)) {
        for (let i = 0; i < item.tags.length; i++) {
            const t = item.tags[i];
            if (!t) continue;
            const tn = String(typeof t === "string" ? t : t.name || "").toLowerCase().trim();
            if (ADULT_TAGS[tn]) return true;
        }
    }
    return false;
}

/* ------------------------------------------------------------------ */
/* English titles                                                      */
/* ------------------------------------------------------------------ */

/* CJK, Hangul, Cyrillic, Arabic, Thai, fullwidth */
const NON_LATIN = /[Ѐ-ӿ؀-ۿ฀-๿　-ヿ㐀-䶿一-鿿가-힯＀-￯]/;

const ENGLISH_HINT = /\b(the|of|and|an|in|on|to|with|who|that|my|is|are|was|from|for|at|by|his|her|its|their|this|but|not|all|you|we|it|be|has|have|how|what|when|where|why|after|before|end|world|story|life|love|become|beyond|journey|funeral|family|king|queen|girl|boy|man|woman|day|night|god|hero|magic|school|adventures?)\b/i;

/* Romanised Japanese reads as Latin script but is not an English title. */
const ROMAJI_HINT = /(^|\s)(no|wo|ga|ni|wa|ka|mo|yo|na|da|desu|shite|suru|kara|made|tachi|san|kun|chan|sama)(\s|$)/i;

function normalizeTitle(s) {
    return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function englishTitle(item) {
    const name = String(item && item.name ? item.name : "").trim();
    if (!PREFER_ENGLISH_TITLES) return name;

    const alts = Array.isArray(item.alternateName) ? item.alternateName : [];
    if (alts.length === 0) return name;

    const baseline = normalizeTitle(name);
    let best = null;
    let bestScore = -999;

    for (let i = 0; i < alts.length; i++) {
        const a = String(alts[i] || "").trim();
        if (!a || a === "-" || a.length < 2) continue;
        if (NON_LATIN.test(a)) continue;
        if (normalizeTitle(a) === baseline) continue;

        let score = 0;
        if (ENGLISH_HINT.test(a)) score += 2;
        if (ROMAJI_HINT.test(a)) score -= 3;
        /* earlier entries are the more canonical ones */
        score -= i * 0.01;

        if (score > bestScore) { bestScore = score; best = a; }
    }

    /* only swap when the alternate actually looks like English */
    if (best && bestScore > 0) return best;
    return name;
}

function siteLabel(site) {
    const s = String(site || "").toLowerCase();
    if (!s) return "MangaBall";
    if (SITE_LABELS[s]) return SITE_LABELS[s];
    return s.charAt(0).toUpperCase() + s.substring(1);
}

function qualityScore(entry) {
    const s = String(entry.site || "").toLowerCase();
    let score = SITE_QUALITY[s];
    if (score === undefined) score = 20;
    /* a real chapter title means the upload carries proper metadata */
    if (entry.realTitle) score += 5;
    /* popularity as a tie-break between equal sources */
    const views = parseInt(entry.views, 10);
    if (!isNaN(views)) score += Math.min(views / 1000, 3);
    return score;
}

/* ------------------------------------------------------------------ */
/* chapter titles                                                      */
/* ------------------------------------------------------------------ */

/* Most uploads name themselves "Chapter 147", "147", "" or the scanlation
 * group. Strip all of that so only a genuine chapter title survives. */
function realChapterTitle(raw, number, groupName) {
    let t = String(raw || "").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
    if (!t) return "";

    const num = String(number);

    /* drop a leading volume marker: "Vol. 3 Chapter 12: Dawn" */
    t = t.replace(/^vol(?:ume)?\.?\s*\d+(?:\.\d+)?\s*[,:;\-–—]?\s*/i, "").trim();
    if (!t) return "";

    /* "Capitulo 145: Clarividencia" -> "Clarividencia" */
    const prefixed = new RegExp(
        "^(?:chapter|chap|ch|cap[ií]tulo|cap[ií]tol|capitulo|cap|chuong|chương|episode|ep|\\u7b2c)\\s*\\.?\\s*0*" +
        num.replace(".", "\\.") +
        "(?:\\.0+)?\\s*(?:\\u8bdd|\\u8a71|\\u7ae0)?\\s*[:：．.\\-–—]?\\s*",
        "i"
    );
    t = t.replace(prefixed, "").trim();

    /* bare number, or "Chapter 147" / "第147话" with nothing after it */
    if (!t) return "";
    if (/^[0-9]+(\.[0-9]+)?$/.test(t)) return "";
    if (/^(chapter|chap|ch|cap[ií]tulo|capitulo|chuong|chương|episode|ep)\b[\s.:#-]*[0-9]*(\.[0-9]+)?$/i.test(t)) return "";
    if (/^第?\s*[0-9]+\s*[话話章]$/.test(t)) return "";

    /* scanlation-group / watermark noise rather than a title */
    if (groupName && t.toLowerCase() === String(groupName).toLowerCase()) return "";
    if (/^(official(\s+translation)?|official\s+release|raw|raws)$/i.test(t)) return "";
    if (/\b(scans?|scanlations?|scanlation|fansub|team|group|translations?)\b\s*$/i.test(t) &&
        t === t.toUpperCase()) return "";
    if (/^(read|download)\b/i.test(t)) return "";

    /* strip a leading separator left over from the prefix removal */
    t = t.replace(/^[\s:：.\-–—]+/, "").trim();
    if (t.length < 2) return "";
    if (t.length > 120) t = t.substring(0, 120).trim();
    return t;
}

function displayTitle(number, realTitle) {
    const base = "Chapter " + number;
    return realTitle ? base + ": " + realTitle : base;
}

/* ------------------------------------------------------------------ */
/* searchResults                                                       */
/* ------------------------------------------------------------------ */

async function searchResults(keyword, page = 1) {
    const results = [];
    try {
        /* adult_mode=no_18 does NOT filter adult titles — it only forces
         * every is18plus flag to false, which destroys the one signal
         * worth having. Ask for the honest data and filter it here. */
        const url = API + "/title/search-advanced"
            + "?keyword=" + encodeURIComponent(keyword)
            + "&sort_by=lastupdate&sort_order=desc"
            + "&tag_mode=AND&use_user_settings=false"
            + "&page=" + (page || 1) + "&limit=36";

        const response = await soraFetch(url, { method: "GET" });
        if (!response) return results;

        const json = await response.json();
        const data = json && Array.isArray(json.data) ? json.data : [];

        for (let i = 0; i < data.length; i++) {
            const item = data[i];
            if (!item) continue;
            const id = item.id || item._id;
            if (!id || !item.name) continue;
            if (FILTER_ADULT && isAdult(item)) continue;
            results.push({
                id: SITE + "/title-detail/" + String(id),
                imageURL: coverUrl(item),
                title: englishTitle(item)
            });
        }
        return results;
    } catch (err) {
        console.log("searchResults error: " + err);
        return results;
    }
}

/* ------------------------------------------------------------------ */
/* extractDetails                                                      */
/* ------------------------------------------------------------------ */

async function extractDetails(url) {
    try {
        const titleId = objectId(url);
        if (!titleId) return { description: "", tags: [] };

        const response = await soraFetch(API + "/title/" + titleId, { method: "GET" });
        if (!response) return { description: "", tags: [] };

        const json = await response.json();
        const data = json && json.data ? json.data : null;
        if (!data) return { description: "", tags: [] };

        let description = "";
        if (Array.isArray(data.description)) {
            for (let i = 0; i < data.description.length; i++) {
                const d = data.description[i];
                if (typeof d === "string" && d.trim()) { description = d.trim(); break; }
                if (d && typeof d.description === "string" && d.description.trim()) {
                    description = d.description.trim(); break;
                }
            }
        } else if (typeof data.description === "string") {
            description = data.description.trim();
        }
        description = description.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

        const tags = [];
        if (Array.isArray(data.tags)) {
            for (let i = 0; i < data.tags.length; i++) {
                const t = data.tags[i];
                if (!t) continue;
                const name = typeof t === "string" ? t : t.name;
                if (name) tags.push(String(name).trim());
            }
        }

        return { description: description, tags: tags };
    } catch (err) {
        console.log("extractDetails error: " + err);
        return { description: "", tags: [] };
    }
}

/* ------------------------------------------------------------------ */
/* extractChapters                                                     */
/* ------------------------------------------------------------------ */

async function extractChapters(url) {
    try {
        const titleId = objectId(url);
        if (!titleId) return { en: [] };

        /* 1. pull uploads, one request per configured language. Asking for
         * every language at once drags in thousands of rows (Frieren alone
         * is 2258 across 10 languages) and the reader stalls on it. */
        const wanted = (CHAPTER_LANGUAGES && CHAPTER_LANGUAGES.length > 0)
            ? CHAPTER_LANGUAGES : [""];
        const raw = [];

        for (let w = 0; w < wanted.length; w++) {
            const code = wanted[w];
            let page = 1;
            let totalPages = 1;

            while (page <= totalPages && page <= MAX_CHAPTER_PAGES) {
                let listUrl = API + "/title/chapter-listing"
                    + "?title_id=" + titleId
                    + "&page=" + page
                    + "&limit=" + CHAPTER_LIMIT
                    + "&sort_order=desc";
                if (code) listUrl += "&lang=" + encodeURIComponent(code);

                const response = await soraFetch(listUrl, { method: "GET" });
                if (!response) break;

                let json = null;
                try { json = await response.json(); } catch (e) { json = null; }
                const data = json && Array.isArray(json.data) ? json.data : [];
                for (let i = 0; i < data.length; i++) raw.push(data[i]);

                if (json && json.pagination && json.pagination.total_pages) {
                    totalPages = parseInt(json.pagination.total_pages, 10) || 1;
                }
                if (data.length === 0) break;
                page++;
            }
        }

        console.log("extractChapters uploads: " + raw.length);
        if (raw.length === 0) return { en: [] };

        /* 2. bucket by language, then by chapter number */
        const byLang = {};

        for (let i = 0; i < raw.length; i++) {
            const c = raw[i];
            if (!c) continue;
            const id = c.id || c._id;
            if (!id) continue;
            if (c.status && String(c.status) !== "published") continue;

            const numRaw = (c.chapter_number !== undefined && c.chapter_number !== null)
                ? c.chapter_number : c.number;
            const numVal = parseFloat(numRaw);
            if (isNaN(numVal)) continue;
            const numKey = String(numRaw);

            const lang = String(c.lang || "en").toLowerCase();
            const groupName = c.group_name || (c.group ? c.group.name : "");
            const rawName = c.name || "";

            const entry = {
                chapterId: String(id),
                number: numKey,
                numeric: numVal,
                lang: lang,
                site: String(c.site || "").toLowerCase(),
                rawName: rawName,
                realTitle: realChapterTitle(rawName, numKey, groupName),
                views: c.views_count || c.views || 0
            };

            if (!byLang[lang]) byLang[lang] = {};
            if (!byLang[lang][numKey]) byLang[lang][numKey] = [];
            byLang[lang][numKey].push(entry);
        }

        /* 3. rank each chapter's uploads, best scan first */
        const out = {};
        const langs = [];
        for (const l in byLang) { if (byLang.hasOwnProperty(l)) langs.push(l); }
        /* English first so the reader opens on it */
        langs.sort(function (a, b) {
            if (a === "en") return -1;
            if (b === "en") return 1;
            return a < b ? -1 : (a > b ? 1 : 0);
        });

        for (let li = 0; li < langs.length; li++) {
            const lang = langs[li];
            const buckets = byLang[lang];
            const chapterList = [];

            for (const numKey in buckets) {
                if (!buckets.hasOwnProperty(numKey)) continue;
                const entries = buckets[numKey];

                entries.sort(function (a, b) { return qualityScore(b) - qualityScore(a); });

                /* one real title for the whole chapter, taken from the best
                 * upload that actually has one */
                let chapterTitle = "";
                for (let k = 0; k < entries.length; k++) {
                    if (entries[k].realTitle) { chapterTitle = entries[k].realTitle; break; }
                }

                const label = displayTitle(numKey, chapterTitle);
                const variants = [];
                const cap = Math.min(entries.length, MAX_VARIANTS_PER_CHAPTER);
                for (let k = 0; k < cap; k++) {
                    const e = entries[k];
                    variants.push({
                        id: SITE + "/chapter-detail/" + e.chapterId + "?chapter=" + e.number,
                        title: label,
                        chapter: e.numeric,
                        scanlation_group: siteLabel(e.site)
                    });
                }

                chapterList.push([numKey, variants]);
            }

            chapterList.sort(function (a, b) { return parseFloat(a[0]) - parseFloat(b[0]); });
            out[lang] = chapterList;
        }

        if (langs.length === 0) return { en: [] };
        return out;
    } catch (err) {
        console.log("extractChapters error: " + err);
        return { en: [] };
    }
}

/* ------------------------------------------------------------------ */
/* extractImages                                                       */
/* ------------------------------------------------------------------ */

/* Page-image CDN gate. The manga reader attaches only the manifest
 * baseUrl as Referer to image loads (module JS cannot set image headers),
 * and the Pokemon-named storage hosts differ in what they demand:
 *   - *.red-and-blue.net  : Referer https://mangaball.com/ alone is enough
 *   - *.poke-black-and-white.net : also needs a full browser User-Agent,
 *     which the reader's image loader does not send -> reader shows 403s
 * So before handing URLs back we probe page 1 with a ranged GET carrying
 * ONLY that Referer. If the host is strict, we walk the other uploads of
 * the same chapter number (variant list from extractChapters) until we
 * find one hosted on a reader-compatible CDN. */

const IMAGE_PROBE_REFERER = "https://mangaball.com/";

/* True when the reader (Referer-only image requests) can load this URL. */
async function readerCanLoad(url) {
    try {
        const r = await fetchv2(String(url), { "Referer": IMAGE_PROBE_REFERER, "Range": "bytes=0-0" }, "GET", null);
        if (!r) return false;
        const st = parseInt(r.status, 10);
        return st === 200 || st === 206;
    } catch (e) {
        return false;
    }
}

/* Fetch one chapter's page list; also returns the ids needed to find
 * sibling uploads of the same chapter number. */
async function fetchChapterDetail(chapterId, chapterNum) {
    const endpoints = [
        API + "/chapter-detail?chapter_id=" + chapterId
            + "&user_id=demo_user" + (chapterNum ? "&chapter=" + chapterNum : ""),
        API + "/chapter/detail?chapter_id=" + chapterId
    ];
    for (let i = 0; i < endpoints.length; i++) {
        const response = await soraFetch(endpoints[i], { method: "GET" });
        if (!response) continue;
        let json = null;
        try { json = await response.json(); } catch (e) { json = null; }
        const pages = collectPages(json);
        if (pages.length > 0) {
            const data = json && json.data ? json.data : {};
            const chap = data.chapter || data;
            return {
                pages: pages,
                titleId: chap.title_id || null,
                number: (chap.chapter_number !== undefined && chap.chapter_number !== null)
                    ? String(chap.chapter_number) : (chapterNum || "")
            };
        }
    }
    return null;
}

/* All uploads (reader's preferred language) of one chapter number, best
 * scan first — the same ranking extractChapters uses. */
async function variantUploads(titleId, number) {
    const wanted = (CHAPTER_LANGUAGES && CHAPTER_LANGUAGES.length > 0)
        ? CHAPTER_LANGUAGES : [""];
    const raw = [];
    for (let w = 0; w < wanted.length; w++) {
        const code = wanted[w];
        let page = 1;
        let totalPages = 1;
        while (page <= totalPages && page <= MAX_CHAPTER_PAGES) {
            let listUrl = API + "/title/chapter-listing"
                + "?title_id=" + titleId
                + "&page=" + page
                + "&limit=" + CHAPTER_LIMIT
                + "&sort_order=desc";
            if (code) listUrl += "&lang=" + encodeURIComponent(code);
            const response = await soraFetch(listUrl, { method: "GET" });
            if (!response) break;
            let json = null;
            try { json = await response.json(); } catch (e) { json = null; }
            const data = json && Array.isArray(json.data) ? json.data : [];
            for (let i = 0; i < data.length; i++) raw.push(data[i]);
            if (json && json.pagination && json.pagination.total_pages) {
                totalPages = parseInt(json.pagination.total_pages, 10) || 1;
            }
            if (data.length === 0) break;
            page++;
        }
    }

    const buckets = {};
    for (let i = 0; i < raw.length; i++) {
        const c = raw[i];
        if (!c) continue;
        const id = c.id || c._id;
        if (!id) continue;
        if (c.status && String(c.status) !== "published") continue;
        const numRaw = (c.chapter_number !== undefined && c.chapter_number !== null)
            ? c.chapter_number : c.number;
        if (String(numRaw) !== String(number)) continue;
        buckets[String(id)] = {
            id: String(id),
            site: String(c.site || "").toLowerCase(),
            views: c.views_count || c.views || 0,
            realTitle: !!c.name
        };
    }

    const list = [];
    for (const k in buckets) { if (buckets.hasOwnProperty(k)) list.push(buckets[k]); }
    list.sort(function (a, b) { return qualityScore(b) - qualityScore(a); });
    return list;
}

function collectPages(json) {
    const out = [];
    if (!json) return out;

    const candidates = [];
    const data = json.data || json;
    if (data) {
        if (data.chapter && Array.isArray(data.chapter.pages)) candidates.push(data.chapter.pages);
        if (Array.isArray(data.pages)) candidates.push(data.pages);
        if (Array.isArray(data.images)) candidates.push(data.images);
        if (data.chapter && Array.isArray(data.chapter.images)) candidates.push(data.chapter.images);
    }
    if (Array.isArray(json.pages)) candidates.push(json.pages);
    if (Array.isArray(json.images)) candidates.push(json.images);

    for (let i = 0; i < candidates.length; i++) {
        const arr = candidates[i];
        if (arr && arr.length > 0) {
            for (let j = 0; j < arr.length; j++) {
                const p = arr[j];
                const u = (typeof p === "string") ? p : (p && (p.url || p.src || p.image));
                if (u) out.push(httpsify(u));
            }
            if (out.length > 0) return out;
        }
    }
    return out;
}

async function extractImages(url) {
    try {
        const chapterId = objectId(url);
        if (!chapterId) return [];

        let chapterNum = "";
        const nm = /[?&]chapter=([^&]+)/.exec(String(url));
        if (nm) chapterNum = nm[1];

        /* 1. the requested chapter's own pages */
        const det = await fetchChapterDetail(chapterId, chapterNum);
        if (det && det.pages.length > 0) {
            const ok = await readerCanLoad(det.pages[0]);
            console.log("extractImages probe " + (ok ? "ok" : "blocked") + ": " + det.pages[0]);
            if (ok) return det.pages;

            /* 2. host is UA-strict (poke-black-and-white) — the reader
             * cannot load these, so walk the sibling uploads of the same
             * chapter number for one hosted on a Referer-only CDN. */
            if (det.titleId && det.number) {
                const uploads = await variantUploads(det.titleId, det.number);
                let tried = 0;
                for (let i = 0; i < uploads.length && tried < MAX_VARIANTS_PER_CHAPTER; i++) {
                    if (uploads[i].id === chapterId) continue;
                    tried++;
                    const alt = await fetchChapterDetail(uploads[i].id, "");
                    if (!alt || alt.pages.length === 0) continue;
                    const altOk = await readerCanLoad(alt.pages[0]);
                    console.log("extractImages alt " + uploads[i].id + " " + (altOk ? "ok" : "blocked"));
                    if (altOk) return alt.pages;
                }
            }

            /* nothing probe-clean — hand back the original list rather
             * than nothing (a lenient reader build may still render it) */
            return det.pages;
        }

        /* last resort: the server-rendered reader page */
        const htmlResponse = await soraFetch(httpsify(url), {
            method: "GET",
            headers: { "Accept": "text/html,application/xhtml+xml" }
        });
        if (!htmlResponse) return [];
        const html = await htmlResponse.text();

        const found = [];
        const seen = {};
        const re = /https?:\/\/[^"'\s]+\/storage\/[^"'\s]+?-\d{3,4}\.(?:webp|jpg|jpeg|png)/gi;
        let m;
        while ((m = re.exec(html)) !== null) {
            const u = httpsify(m[0]);
            if (!seen[u]) { seen[u] = true; found.push(u); }
        }

        /* the reader lazy-loads past page ~6, so rebuild the rest from the
         * first URL's pattern once we know the total page count */
        if (found.length > 0) {
            let total = found.length;
            const tm = /(?:\/\s*)(\d{1,4})\s*(?:pages|页)/i.exec(html) || /1\s*\/\s*(\d{1,4})/.exec(html);
            if (tm) {
                const t = parseInt(tm[1], 10);
                if (!isNaN(t) && t > total && t < 1000) total = t;
            }
            const pm = /^(.*-)(\d{3,4})(\.(?:webp|jpg|jpeg|png))$/i.exec(found[0]);
            if (pm && total > found.length) {
                const pad = pm[2].length;
                const rebuilt = [];
                for (let n = 1; n <= total; n++) {
                    let s = String(n);
                    while (s.length < pad) s = "0" + s;
                    rebuilt.push(pm[1] + s + pm[3]);
                }
                console.log("extractImages count: " + rebuilt.length);
                return rebuilt;
            }
        }

        console.log("extractImages count: " + found.length);
        return found;
    } catch (err) {
        console.log("extractImages error: " + err);
        return [];
    }
}

/* Compatibility aliases: older Luna/Shirox builds call the legacy names
 * (searchContent/getContentData/getChapters/getChapterImages); current
 * builds call the names above. Page-image URLs need the platform Referer
 * (manifest baseUrl = https://mangaball.com/) — the poke-black-and-white /
 * red-and-blue CDN 403s any request without a mangaball.com Referer. */
async function searchContent(input, page) { return searchResults(input, page); }
async function getContentData(input) { return extractDetails(input); }
async function getChapters(input) { return extractChapters(input); }
async function getChapterImages(input) { return extractImages(input); }
