/**
 * ReadFreeComicsOnline — readfreecomicsonline.com
 * v2.0.0 rebuild (2026-11-12)
 *
 * Upstream theme changed on single-post pages:
 *  - post title is now <h1 class="single-title"> (was <h2 class="entry-title">)
 *  - category links on post pages are class="single-cat" (no rel="tag")
 *  - chapter images live in <div class="comic-pages"> (entry-content is now
 *    a one-paragraph boilerplate; old entry-content scoping picked up the
 *    "More Manga" related-posts sidebar images instead)
 *  - archive (category) pages still use <h2 class="entry-title"> article blocks
 *
 * Search result id = series category URL (/category/<slug>/) derived from the
 * chapter title slug and cross-checked against the article's own category
 * links. extractChapters accepts a category archive (multi-chapter) or a
 * single post URL (single-chapter fallback). extractImages scopes to the
 * comic-pages container so related-posts sidebar art is never returned.
 */

function rfcoLog(msg) {
    try {
        if (typeof console !== "undefined" && console.log) console.log("[ReadFreeComicsOnline] " + msg);
    } catch (e) {}
}

rfcoLog("module script loaded v2.0.0");

function toAbsolute(u) {
    u = String(u || "").trim();
    if (u.indexOf("//") === 0) {
        u = "https:" + u;
    } else if (u.indexOf("http://") === 0) {
        u = "https://" + u.substring(7);
    } else if (u.indexOf("https://") !== 0 && u.length > 0) {
        u = "https://readfreecomicsonline.com" + (u.indexOf("/") === 0 ? "" : "/") + u;
    }
    return u;
}

function soraFetch(url, options) {
    if (typeof fetchv2 === "function") {
        return fetchv2(url, (options && options.headers) || undefined, (options && options.method) || "GET", options && options.body);
    }
    return fetch(url, options);
}

async function rfcoGetText(url) {
    const response = await soraFetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36", "Accept": "text/html" }
    });
    if (!response || !response.text) return "";
    const t = response.text();
    return typeof t === "string" ? t : await t;
}

function getArticleBlocks(html) {
    const blocks = [];
    const regex = /<article[^>]*id="post-[\s\S]*?<\/article>/g;
    let m;
    while ((m = regex.exec(html)) !== null) {
        blocks.push(m[0]);
    }
    return blocks;
}

// Archive pages: <h2 class="entry-title" ...><a href="URL">TITLE</a></h2>
function parseArchiveArticle(block) {
    const titleMatch = /<h2 class="entry-title"[^>]*>\s*<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/.exec(block);
    if (!titleMatch) return null;

    const url = toAbsolute(titleMatch[1]);
    const title = String(titleMatch[2]).replace(/<[^>]*>/g, "").trim();
    if (!title) return null;

    let thumb = "";
    const imgRegex = /<img[^>]+src="([^"]+)"/g;
    let imgMatch;
    while ((imgMatch = imgRegex.exec(block)) !== null) {
        if (imgMatch[1].indexOf("/wp-content/uploads/") !== -1) {
            thumb = toAbsolute(imgMatch[1]);
            break;
        }
    }

    const dateMatch = /<time class="entry-date published" datetime="([^"]+)"/.exec(block);
    const ts = dateMatch ? new Date(dateMatch[1]).getTime() : 0;

    // category links (rel="category tag" on archives)
    const catLinks = [];
    const catRegex = /<a href="([^"]*\/category\/[^"]*)"[^>]*>/g;
    let cm;
    while ((cm = catRegex.exec(block)) !== null) {
        catLinks.push(toAbsolute(cm[1]));
    }

    return { url: url, title: title, thumb: thumb, ts: ts, catLinks: catLinks };
}

function titleToSlug(title) {
    return String(title)
        .toLowerCase()
        .replace(/&(amp;)?/g, " and ")
        .replace(/['\u2019\u2018\u201c\u201d]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

// Strip trailing "Chapter 123 ..." / "Issue 5 ..." / "#4 ..." so that e.g.
// "One Piece Chapter 1171: Ragnir" -> slug "one-piece".
function seriesSlugFromTitle(title) {
    const stripped = String(title)
        .replace(/\s*[-\u2013\u2014:]?\s*(chapter|ch\.?|issue|no\.?)\s*#?\s*\d+[\s\S]*$/i, "")
        .replace(/\s*#\s*\d+[\s\S]*$/, "");
    return titleToSlug(stripped || title);
}

// Chapter/issue number from a post title.
function numberFromTitle(title) {
    let m = /\b(?:chapter|ch\.?|issue|no\.?)\s*#?\s*(\d+(?:\.\d+)?)/i.exec(title);
    if (!m) m = /#\s*(\d+(?:\.\d+)?)/.exec(title);
    return m ? parseFloat(m[1]) : 0;
}

function categoryUrlForSlug(slug) {
    return "https://readfreecomicsonline.com/category/" + slug + "/";
}

async function searchResults(keyword) {
    const results = [];
    try {
        const html = await rfcoGetText("https://readfreecomicsonline.com/?s=" + encodeURIComponent(keyword));
        const blocks = getArticleBlocks(html);

        const seen = {};
        for (let i = 0; i < blocks.length; i++) {
            const item = parseArchiveArticle(blocks[i]);
            if (!item) continue;

            // series identity: title-derived category slug, verified against
            // the article's own /category/ links when possible
            const slug = seriesSlugFromTitle(item.title);
            let seriesId = categoryUrlForSlug(slug);
            for (let c = 0; c < item.catLinks.length; c++) {
                if (item.catLinks[c].toLowerCase().indexOf("/category/" + slug + "/") !== -1) {
                    seriesId = item.catLinks[c];
                    break;
                }
            }

            if (seen[seriesId]) continue;
            seen[seriesId] = true;

            results.push({
                id: seriesId,
                imageURL: item.thumb,
                title: item.title.replace(/\s*[-\u2013\u2014:]?\s*(chapter|ch\.?|issue|no\.?)\s*#?\s*\d+[\s\S]*$/i, "").replace(/\s*#\s*\d+[\s\S]*$/, "").trim() || item.title
            });
        }
        return results;
    } catch (err) {
        rfcoLog("searchResults error: " + (err && err.message));
        return results;
    }
}

async function extractDetails(url) {
    try {
        const html = await rfcoGetText(url);

        let description = "";
        const descMatch = /<meta property="og:description" content="([^"]+)"/.exec(html);
        if (descMatch) description = descMatch[1].trim();

        const tags = [];
        const blocks = getArticleBlocks(html);
        const scope = blocks.length > 0 ? blocks[0] : html;
        const catRegex = /<a href="[^"]*\/category\/([^"/]+)\/?"[^>]*>([\s\S]*?)<\/a>/g;
        let cm;
        while ((cm = catRegex.exec(scope)) !== null) {
            const name = String(cm[2]).replace(/<[^>]*>/g, "").trim();
            if (name && tags.indexOf(name) === -1) tags.push(name);
        }

        return { description: description, tags: tags };
    } catch (err) {
        rfcoLog("extractDetails error: " + (err && err.message));
        return { description: "", tags: [] };
    }
}

function chapterEntryFromArticle(item, seenUrls) {
    if (!item || seenUrls[item.url]) return null;
    seenUrls[item.url] = true;
    const num = numberFromTitle(item.title);
    return { url: item.url, title: item.title, num: num, ts: item.ts };
}

function chaptersFromArticles(items) {
    const seenUrls = {};
    const entries = [];
    for (let i = 0; i < items.length; i++) {
        const e = chapterEntryFromArticle(items[i], seenUrls);
        if (e) entries.push(e);
    }
    // ascending by chapter number; unnumbered by publish date at the end
    entries.sort(function (a, b) {
        if (a.num > 0 && b.num > 0) return a.num - b.num;
        if (a.num > 0) return -1;
        if (b.num > 0) return 1;
        return a.ts - b.ts;
    });
    const results = [];
    let last = 0;
    for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        let chapterNum = e.num;
        if (!chapterNum) chapterNum = (last || 0) + 0.5 + i * 0.01;
        else last = chapterNum;
        results.push([String(chapterNum), [{ id: e.url, title: e.title, chapter: chapterNum }]]);
    }
    return results;
}

async function extractChapters(url) {
    try {
        const base = String(url || "").replace(/\/$/, "");
        const items = [];

        // Single post URL (search fell back to the chapter page itself):
        // parse the post page, one chapter.
        if (base.indexOf("/category/") === -1) {
            const html = await rfcoGetText(base + "/");
            const titleMatch = /<h1 class="single-title"[^>]*>([\s\S]*?)<\/h1>/.exec(html);
            const linkMatch = /<link rel="canonical" href="([^"]+)"/.exec(html);
            const postUrl = toAbsolute(linkMatch ? linkMatch[1] : base);
            const title = titleMatch ? String(titleMatch[1]).replace(/<[^>]*>/g, "").trim() : "";
            if (title) {
                const dateMatch = /<time class="entry-date published" datetime="([^"]+)"/.exec(html);
                const num = numberFromTitle(title);
                const chapterNum = num || 1;
                return { en: [[String(chapterNum), [{ id: postUrl, title: title, chapter: chapterNum }]]] };
            }
            return { en: [] };
        }

        // Category archive: paginate while WP serves /page/N/.
        for (let page = 1; page <= 10; page++) {
            const pageUrl = page === 1 ? base + "/" : base + "/page/" + page + "/";
            let html;
            try {
                html = await rfcoGetText(pageUrl);
            } catch (e) {
                break;
            }
            const blocks = getArticleBlocks(html);
            if (blocks.length === 0) break;
            let added = 0;
            for (let i = 0; i < blocks.length; i++) {
                const item = parseArchiveArticle(blocks[i]);
                if (item) { items.push(item); added++; }
            }
            if (added === 0) break;
        }

        return { en: chaptersFromArticles(items) };
    } catch (err) {
        rfcoLog("extractChapters error: " + (err && err.message));
        return { en: [] };
    }
}

async function extractImages(url) {
    const images = [];
    try {
        const html = await rfcoGetText(url);

        // Scope to the reader container only. entry-content is now
        // boilerplate and the "More Manga" related-posts sidebar sits after
        // it — a page-wide scan returned unrelated sidebar art.
        const startIdx = html.indexOf('class="comic-pages"');
        let scoped = html;
        if (startIdx !== -1) {
            let endIdx = html.indexOf('class="single-related"', startIdx);
            if (endIdx === -1) endIdx = html.indexOf("<aside", startIdx);
            if (endIdx === -1) endIdx = html.indexOf("rfco-footer", startIdx);
            scoped = html.substring(startIdx, endIdx === -1 ? html.length : endIdx);
        }

        const seen = {};
        const imgRegex = /<img[^>]+src="([^"]+)"/g;
        let m;
        while ((m = imgRegex.exec(scoped)) !== null) {
            const src = m[1];
            if (src.indexOf("/wp-content/uploads/") === -1) continue;
            if (!/\.(webp|jpe?g|png)(\?|$)/i.test(src)) continue;
            const abs = toAbsolute(src);
            if (seen[abs]) continue;
            seen[abs] = true;
            images.push(abs);
        }
        return images;
    } catch (err) {
        rfcoLog("extractImages error: " + (err && err.message));
        return images;
    }
}
