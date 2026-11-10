// LightNovelWorld module — lightnovelworld.org SHUT DOWN (landing page says
// "This site has shut down" and points at chikari.moe/novels as successor).
// Rewritten 2026-11 against the chikari.moe JSON API:
//   search:   GET /api/novels/search?q=<kw>
//   details:  GET /api/novels/<slug>
//   chapters: GET /api/novels/<slug>/chapters?limit=1000  -> {items:[{number,title}]}
//   chapter:  GET /api/novels/<slug>/chapters/<number>/read -> {body: "plain text"}

const LNW_BASE = "https://chikari.moe";
const LNW_API = "https://chikari.moe/api";

function lnwSlugFromUrl(url) {
    const m = String(url).match(/\/novels?\/([^\/?#]+)/i);
    return m ? m[1] : "";
}

async function searchResults(keyword) {
    try {
        const url = LNW_API + "/novels/search?q=" + encodeURIComponent(keyword);
        const response = await soraFetch(url);
        if (!response) {
            throw new Error("No response received from search API");
        }
        const json = await response.json();
        const list = Array.isArray(json) ? json : (json && json.items) || [];

        const results = [];
        for (const novel of list) {
            if (!novel || !novel.slug) continue;
            results.push({
                title: String(novel.title || "").trim(),
                href: LNW_BASE + "/novels/" + novel.slug + "/",
                image: novel.cover_url || ""
            });
        }

        console.log(JSON.stringify(results));
        return JSON.stringify(results);
    } catch (error) {
        console.error("Error fetching or parsing search: " + error);
        return JSON.stringify([{
            title: "Error",
            href: "",
            image: ""
        }]);
    }
}

async function extractDetails(url) {
    try {
        const slug = lnwSlugFromUrl(url);
        if (!slug) throw new Error("Could not parse novel slug from url: " + url);
        const response = await soraFetch(LNW_API + "/novels/" + slug);
        if (!response) {
            throw new Error("No response received from details API");
        }
        const json = await response.json();

        let description = String(json && json.description || "").trim();
        if (!description) description = "No description available";

        const status = json && json.status ? String(json.status) : "";
        const year = json && json.year ? String(json.year) : "";
        const airdate = [status, year].filter(Boolean).join(" · ") || "N/A";

        const transformedResults = [{
            description: decodeHtmlEntities(description).replace(/\s+/g, ' ').trim(),
            aliases: 'N/A',
            airdate: airdate
        }];

        console.log(JSON.stringify(transformedResults));
        return JSON.stringify(transformedResults);
    } catch (error) {
        console.error('Details error: ' + error);
        return JSON.stringify([{
            description: 'Error loading description',
            aliases: 'N/A',
            airdate: 'N/A'
        }]);
    }
}

async function extractChapters(url) {
    try {
        const slug = lnwSlugFromUrl(url);
        if (!slug) throw new Error("Could not parse novel slug from url: " + url);

        const response = await soraFetch(LNW_API + "/novels/" + slug + "/chapters?limit=1000");
        if (!response) {
            throw new Error("No response received from chapters API");
        }
        const json = await response.json();
        const items = (json && Array.isArray(json.items)) ? json.items : [];

        const allChapters = [];
        for (const item of items) {
            if (!item || typeof item.number === "undefined") continue;
            const num = Number(item.number);
            allChapters.push({
                title: String(item.title || ("Chapter " + num)).replace(/\s+/g, ' ').trim(),
                href: LNW_BASE + "/novels/" + slug + "/" + num,
                number: num
            });
        }

        allChapters.sort((a, b) => a.number - b.number);

        console.log(JSON.stringify(allChapters));
        return JSON.stringify(allChapters);
    } catch (error) {
        console.error('Fetch error in extractChapters: ', error);
        return JSON.stringify([{
            href: url,
            title: "Error fetching chapters",
            number: 0
        }]);
    }
}

async function extractText(url) {
    try {
        const slug = lnwSlugFromUrl(url);
        const numMatch = String(url).match(/\/novels?\/[^\/?#]+\/(\d+(?:\.\d+)?)/i);
        if (!slug || !numMatch) throw new Error("Could not parse novel slug/chapter from url: " + url);
        const num = numMatch[1];

        const response = await soraFetch(LNW_API + "/novels/" + slug + "/chapters/" + num + "/read");
        if (!response) {
            throw new Error("No response received from chapter API");
        }
        const json = await response.json();
        const body = String(json && json.body || "").trim();
        if (!body) throw new Error("Chapter body empty");

        const paragraphs = body
            .split(/\n\s*\n/)
            .map(p => p.replace(/\s+/g, ' ').trim())
            .filter(p => p.length > 0);

        if (paragraphs.length === 0) throw new Error("No paragraphs extracted");

        const content = paragraphs.map(p => `<p>${decodeHtmlEntities(p)}</p>`).join('\n');

        console.log(content);
        return content;
    } catch (error) {
        console.error("Fetch error in extractText: " + error);
        return '<p>Error extracting text</p>';
    }
}

async function soraFetch(url, options = {
    headers: {},
    method: 'GET',
    body: null
}) {
    const headers = options.headers ?? {};
    if (!headers["User-Agent"] && !headers["user-agent"]) {
        headers["User-Agent"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
    }
    try {
        return await fetchv2(url, headers, options.method ?? 'GET', options.body ?? null);
    } catch (e) {
        try {
            return await fetch(url, options);
        } catch (error) {
            return null;
        }
    }
}

function decodeHtmlEntities(text) {
    const entities = {
        '&#x2014;': '—',
        '&#x2013;': '–',
        '&amp;': '&',
        '&lt;': '<',
        '&gt;': '>',
        '&quot;': '"',
        '&#x27;': "'",
        '&#x2F;': '/',
        '&#x60;': '`',
        '&#x3D;': '=',
        '&nbsp;': ' '
    };

    return String(text).replace(/&#x[\dA-Fa-f]+;|&\w+;/g, (match) => {
        return entities[match] || match;
    });
}
