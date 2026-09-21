async function searchResults(keyword) {
    try {
        const encodedKeyword = encodeURIComponent(keyword);
        const url = `https://lightnovelworld.org/api/search/?q=${encodedKeyword}&search_type=title`;
        const response = await soraFetch(url);
        if (!response) {
            throw new Error("No response received from search API");
        }
        const json = await response.json();

        const results = [];
        if (json && json.novels) {
            for (const novel of json.novels) {
                let image = novel.cover_path || "";
                if (image && !image.startsWith("http")) {
                    image = "https://lightnovelworld.org" + image;
                }

                results.push({
                    title: decodeHtmlEntities(novel.title || ""),
                    href: `https://lightnovelworld.org/novel/${novel.slug}/`,
                    image: image
                });
            }
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
        const response = await soraFetch(url);
        if (!response) {
            throw new Error("No response received from details page");
        }
        const htmlText = await response.text();

        let description = "";
        const jsonLdRegex = /<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
        let match;
        while ((match = jsonLdRegex.exec(htmlText)) !== null) {
            try {
                const data = JSON.parse(match[1]);
                if (data && data["@type"] === "Book" && data.description) {
                    description = data.description;
                    break;
                } else if (Array.isArray(data)) {
                    const book = data.find(item => item && item["@type"] === "Book");
                    if (book && book.description) {
                        description = book.description;
                        break;
                    }
                }
            } catch (e) {
            }
        }

        if (!description || description.trim() === "") {
            const descMatch = htmlText.match(/class="description-text"[^>]*>([\s\S]*?)<\/p>/i)
                || htmlText.match(/class="novel-description"[^>]*>([\s\S]*?)<\/div>/i);
            if (descMatch) {
                description = descMatch[1].replace(/<[^>]+>/g, '').trim();
            } else {
                description = "No description available";
            }
        }

        const aliases = 'N/A';
        const airdate = 'N/A';

        const transformedResults = [{
            description: decodeHtmlEntities(description).replace(/\s+/g, ' ').trim(),
            aliases,
            airdate
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
        let chaptersUrl = url;
        const urlObj = url.split('?');
        let basePath = urlObj[0];
        const queryParams = urlObj[1] ? '?' + urlObj[1] : '';
        if (!basePath.endsWith('/chapters') && !basePath.endsWith('/chapters/')) {
            basePath = basePath.replace(/\/$/, '') + '/chapters/';
        }
        chaptersUrl = basePath + queryParams;

        const response = await soraFetch(chaptersUrl);
        if (!response) {
            throw new Error("No response received from chapters page");
        }
        const htmlText = await response.text();

        const allChapters = parseChaptersFromHtml(htmlText);

        let totalPages = 1;
        const selectMatch = htmlText.match(/<select[^>]*id="pageSelect"[^>]*>([\s\S]*?)<\/select>/i);
        if (selectMatch) {
            const optRegex = /value="(\d+)"/gi;
            let optMatch;
            while ((optMatch = optRegex.exec(selectMatch[1])) !== null) {
                const pNum = parseInt(optMatch[1], 10);
                if (pNum > totalPages) {
                    totalPages = pNum;
                }
            }
        } else {
            const fallbackMatch = htmlText.match(/<span>\s*of\s*(\d+)\s*<\/span>/i);
            if (fallbackMatch) {
                totalPages = parseInt(fallbackMatch[1], 10);
            }
        }

        if (totalPages > 1) {
            const baseUrlClean = chaptersUrl.split('?')[0].replace(/\/$/, '');
            const promises = [];

            for (let i = 2; i <= totalPages; i++) {
                const pageUrl = `${baseUrlClean}/?page=${i}`;
                promises.push((async (pUrl) => {
                    try {
                        const pResp = await soraFetch(pUrl);
                        if (pResp) {
                            const pHtml = await pResp.text();
                            return parseChaptersFromHtml(pHtml);
                        }
                    } catch (err) {
                        console.error(`Error fetching chapters page ${pUrl}:`, err);
                    }
                    return [];
                })(pageUrl));
            }

            const nestedResults = await Promise.all(promises);
            for (const pageCaps of nestedResults) {
                allChapters.push(...pageCaps);
            }
        }

        allChapters.sort((a, b) => {
            const getNum = (item) => {
                const urlMatch = item.href.match(/chapter[-/](\d+)/i);
                if (urlMatch) return parseFloat(urlMatch[1]);
                const titleMatch = item.title.match(/(?:Chapter|Ch\.)\s*(\d+(\.\d+)?)/i);
                if (titleMatch) return parseFloat(titleMatch[1]);
                return 0;
            };
            return getNum(a) - getNum(b);
        });

        allChapters.forEach((chapter, index) => {
            chapter.number = index + 1;
        });

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
        const response = await soraFetch(url);
        if (!response) {
            throw new Error("No response received from chapter text page");
        }
        const htmlText = await response.text();

        const startIdx = htmlText.indexOf('id="chapterText"');
        if (startIdx === -1) {
            throw new Error("Chapter content container (id='chapterText') not found");
        }

        const targets = ['data-ad-position="2"', 'class="chapter-nav"', 'chapterSelectBottom', 'id="commentContent"'];
        let endIdx = -1;
        for (const target of targets) {
            const idx = htmlText.indexOf(target, startIdx);
            if (idx !== -1 && (endIdx === -1 || idx < endIdx)) {
                endIdx = idx;
            }
        }

        if (endIdx === -1) {
            endIdx = htmlText.length;
        }

        const chunk = htmlText.substring(startIdx, endIdx);

        const paragraphs = [];
        const pRegex = /<p\b[^>]*>([\s\S]*?)<\/p>/gi;
        let match;
        while ((match = pRegex.exec(chunk)) !== null) {
            paragraphs.push(match[1].trim());
        }

        if (paragraphs.length === 0) {
            throw new Error("No paragraph tags found inside the content area");
        }

        const content = paragraphs.map(p => `<p>${decodeHtmlEntities(p)}</p>`).join('\n');

        console.log(content);
        return content;
    } catch (error) {
        console.error("Fetch error in extractText: " + error);
        return '<p>Error extracting text</p>';
    }
}

function parseChaptersFromHtml(htmlPage) {
    const pageChapters = [];
    const regex = /<div\s+class="chapter-card"[^>]*onclick="location\.href='([^']+)'"[^>]*>[\s\S]*?<h3\s+class="chapter-title"[^>]*>\s*([\s\S]*?)\s*<\/h3>/gi;
    let match;
    while ((match = regex.exec(htmlPage)) !== null) {
        let href = match[1].trim();
        if (!href.startsWith('http')) {
            href = "https://lightnovelworld.org" + href;
        }
        let title = match[2].replace(/\s+/g, ' ').trim();
        pageChapters.push({
            title: decodeHtmlEntities(title),
            href: href
        });
    }
    return pageChapters;
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

    return text.replace(/&#x[\dA-Fa-f]+;|&\w+;/g, (match) => {
        return entities[match] || match;
    });
}
