const BASE_URL = "https://novelbuddy.com";
const API_URL = "https://api.novelbuddy.me";

async function searchResults(keyword) {
    try {
        const responseText = await soraFetch(`https://novelbuddy.com/search?q=${encodeURIComponent(keyword)}`);
        const html = await responseText.text();
        const items = extractNextData(html, "ssrItems");
        const results = [];
        if (Array.isArray(items)) {
            for (const item of items) {
                results.push({
                    title: (item.name || "").trim(),
                    href: BASE_URL + (item.url || ""),
                    image: item.cover || ""
                });
            }
        }
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
        const htmlText = await response.text();

        const manga = extractNextData(htmlText, "initialManga");
        let description = 'No description available';
        if (manga && manga.summary && String(manga.summary).trim()) {
            description = String(manga.summary).replace(/\s+/g, ' ').trim();
        } else {
            const descMatch = htmlText.match(/<p class="content"[^>]*>([\s\S]*?)<\/p>/);
            if (descMatch) description = descMatch[1].replace(/<\/?[^>]+>/g, '').trim();
        }

        let authors = 'Unknown';
        let genres = 'Unknown';
        let status = 'Unknown';
        let chaptersCount = 'Unknown';
        if (manga) {
            if (Array.isArray(manga.authors) && manga.authors.length) {
                authors = manga.authors.map(a => a.name || '').filter(Boolean).join(', ');
            }
            if (Array.isArray(manga.genres) && manga.genres.length) {
                genres = manga.genres.map(g => g.name || '').filter(Boolean).join(', ');
            }
            if (manga.status) status = manga.status;
            if (manga.displayChapters) chaptersCount = manga.displayChapters;
            else if (Array.isArray(manga.chapters)) chaptersCount = String(manga.chapters.length);
        }

        const aliases = `
Author(s): ${authors}
Status: ${status}
Genres: ${genres}
Chapters: ${chaptersCount}
        `.trim();

        const transformedResults = [{
            description,
            aliases,
            airdate: ''
        }];

        console.log(JSON.stringify(transformedResults));
        return JSON.stringify(transformedResults);
    } catch (error) {
        console.log('Details error: ' + error);
        return JSON.stringify([{
            description: 'Error loading description',
            aliases: 'Unknown',
            airdate: ''
        }]);
    }
}

async function extractChapters(url) {
    try {
        const response = await soraFetch(url);
        const htmlText = await response.text();

        const manga = extractNextData(htmlText, "initialManga");
        let mangaId = manga && manga.id ? manga.id : null;
        if (!mangaId) mangaId = extractNextData(htmlText, "mangaHsid");
        if (!mangaId) {
            const idMatch = htmlText.match(/"id":"([A-Za-z0-9]+)"/);
            mangaId = idMatch ? idMatch[1] : null;
        }
        if (!mangaId) {
            console.log('Could not find manga id');
            return JSON.stringify([]);
        }

        const apiResponse = await soraFetch(`${API_URL}/titles/${mangaId}/chapters`);
        const apiText = await apiResponse.text();
        let chapterData = null;
        try {
            chapterData = JSON.parse(apiText);
        } catch (e) {
            console.log('Chapters API returned non-JSON');
            return JSON.stringify([]);
        }
        const chapterList = chapterData && chapterData.data && chapterData.data.chapters
            ? chapterData.data.chapters
            : (chapterData && chapterData.chapters ? chapterData.chapters : []);
        if (!Array.isArray(chapterList) || !chapterList.length) {
            console.log('No chapters found');
            return JSON.stringify([]);
        }

        // Sort oldest -> newest, then renumber from 1
        chapterList.sort((a, b) => {
            const na = parseInt(a.number, 10) || 0;
            const nb = parseInt(b.number, 10) || 0;
            return na - nb;
        });

        const chapters = chapterList.map((ch, i) => ({
            href: BASE_URL + (ch.url || ""),
            title: (ch.name || `Chapter ${i + 1}`).trim(),
            number: i + 1
        }));

        console.log(`Extracted ${chapters.length} chapters`);
        return JSON.stringify(chapters);
    } catch (error) {
        console.log('Fetch error in extractChapters: ' + error);
        return JSON.stringify([]);
    }
}

async function extractText(url) {
    try {
        const response = await soraFetch(url);
        const htmlText = await response.text();

        const chapter = extractNextData(htmlText, "initialChapter");
        if (chapter && chapter.content) {
            return String(chapter.content).trim();
        }

        const startIndex = htmlText.indexOf('<div class="content-inner">');
        if (startIndex === -1) throw new Error("content-inner div not found");

        const subHtml = htmlText.slice(startIndex);

        const pTagRegex = /<p[^>]*>[\s\S]*?<\/p>/g;
        const pMatches = subHtml.match(pTagRegex);

        if (!pMatches || pMatches.length === 0) throw new Error("No <p> tags found");

        const filtered = pMatches.filter(p => {
            if (p.includes('class="mt-4"')) return false;
            const text = p.replace(/<[^>]*>/g, '').trim().toLowerCase();
            if (
                text === '©novelbuddy' ||
                text === 'or login with' ||
                text === 'or login with mangabuddy account'
            ) return false;
            return true;
        });

        const content = filtered.join('\n').trim();
        console.log(content);
        return content;
    } catch (error) {
        console.log("Fetch error in extractText: " + error);
        return '<p>Error extracting text</p>';
    }
}

// Extract a value from the __NEXT_DATA__ JSON embedded in the page
function extractNextData(html, key) {
    const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
    if (!m) return null;
    let data = null;
    try {
        data = JSON.parse(m[1]);
    } catch (e) {
        return null;
    }
    return deepFind(data, key);
}

function deepFind(obj, key) {
    if (obj == null) return null;
    if (typeof obj !== 'object') return null;
    if (obj[key] !== undefined) return obj[key];
    if (Array.isArray(obj)) {
        for (const item of obj) {
            const r = deepFind(item, key);
            if (r !== undefined && r !== null) return r;
        }
        return null;
    }
    for (const k in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, k)) {
            const r = deepFind(obj[k], key);
            if (r !== undefined && r !== null) return r;
        }
    }
    return null;
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