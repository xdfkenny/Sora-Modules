async function searchResults(keyword) {
    try {
        const encodedKeyword = encodeURIComponent(keyword);

        // Primary: full search page (returns rows with cover images)
        try {
            const url = `https://readnovelfull.com/novel-list/search?keyword=${encodedKeyword}`;
            const response = await soraFetch(url);
            if (response && response.status === 200) {
                const html = await response.text();
                const results = [];
                const rowRegex = /<div class="row">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/g;
                let rowMatch;
                while ((rowMatch = rowRegex.exec(html)) !== null) {
                    const rowHtml = rowMatch[1];
                    const imgMatch = rowHtml.match(/<img\s+src="([^"]+)"[^>]*class="cover"/);
                    const linkMatch = rowHtml.match(/<h3 class="novel-title">\s*<a href="([^"]+)"\s+title="([^"]+)"/);
                    if (imgMatch && linkMatch) {
                        let image = imgMatch[1];
                        if (!image.startsWith("http")) image = "https:" + image;
                        results.push({
                            title: decodeHtmlEntities(linkMatch[2]),
                            href: "https://readnovelfull.com" + linkMatch[1],
                            image
                        });
                    }
                }
                if (results.length > 0) {
                    console.log(JSON.stringify(results));
                    return JSON.stringify(results);
                }
            }
        } catch (e) {
            console.error("Primary search failed, trying ajax: " + e);
        }

        // Fallback: ajax lightweight search (HTML anchor list, no images) — fetch each page for the cover
        const ajaxUrl = `https://readnovelfull.com/ajax/search-novel?keyword=${encodedKeyword}`;
        const ajaxResponse = await soraFetch(ajaxUrl);
        const ajaxHtml = await ajaxResponse ? await ajaxResponse.text() : '';
        const anchorRegex = /<a\s+href="(\/[^"]+\.html)"\s+class="list-group-item"\s+title="([^"]+)"/g;
        const seen = {};
        const pages = [];
        let anchorMatch;
        while ((anchorMatch = anchorRegex.exec(ajaxHtml)) !== null) {
            const href = "https://readnovelfull.com" + anchorMatch[1];
            if (!seen[href]) {
                seen[href] = true;
                pages.push({ title: decodeHtmlEntities(anchorMatch[2]), href });
            }
        }

        const results = [];
        const coverJobs = pages.slice(0, 10).map(p =>
            fetchCover(p.href).then(image => ({ ...p, image: image || "" }))
        );
        const settled = await Promise.all(coverJobs);
        for (const r of settled) results.push(r);

        console.log(JSON.stringify(results));
        return JSON.stringify(results);
    } catch (error) {
        console.error("Error fetching or parsing: " + error);
        return JSON.stringify([{
            title: "Error",
            href: "",
            image: ""
        }]);
    }
}

async function fetchCover(novelUrl) {
    try {
        const response = await soraFetch(novelUrl);
        if (!response) return "";
        const html = await response.text();
        const ogMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i)
            || html.match(/<img\s+src="([^"]+)"[^>]*class="cover"/);
        if (ogMatch) {
            let image = ogMatch[1];
            if (!image.startsWith("http")) image = "https:" + image;
            return image;
        }
        return "";
    } catch (e) {
        return "";
    }
}

async function extractDetails(url) {
  try {
    const response = await soraFetch(url);
    const htmlText = await response.text();

    const descMatch = htmlText.match(/<div class="desc-text"[^>]*itemprop="description"[^>]*>([\s\S]*?)<\/div>/i);

    let description = descMatch
      ? descMatch[1]
          .replace(/<p[^>]*>/gi, '')
          .replace(/<\/p>/gi, '')
          .replace(/\s+/g, ' ')
          .trim()
      : "No description available";

    const aliases = 'N/A';
    const airdate = 'N/A';

    const transformedResults = [{
      description,
      aliases,
      airdate
    }];

    console.log(JSON.stringify(transformedResults));
    return JSON.stringify(transformedResults);

  } catch (error) {
    console.log('Details error:' + error);
    return JSON.stringify([{
      description: 'Error loading description',
      aliases: 'N/A',
      airdate: 'N/A'
    }]);
  }
}

async function extractChapters(url) {
  try {
    const response = await soraFetch(url);
    const htmlText = await response.text();

    const novelIdMatch = htmlText.match(/<div id="rating"[^>]*data-novel-id="([^"]+)"[^>]*>/i);
    if (!novelIdMatch) {
      throw new Error("Novel ID not found");
    }
    const novelId = novelIdMatch[1];

    const chaptersResponse = await soraFetch(`https://readnovelfull.com/ajax/chapter-archive?novelId=${novelId}`);
    const chaptersHtml = await chaptersResponse.text();

    const chapters = [];
    const chapterRegex = /<a\s+href="([^"]+)"\s+title="([^"]+)"[^>]*>[\s\S]*?<span[^>]*class="[^"]*\bnchr-text\b[^"]*"[^>]*>([\s\S]*?)<\/span>/gi;

    let match;
    while ((match = chapterRegex.exec(chaptersHtml)) !== null) {
      const href = "https://readnovelfull.com" + match[1];
      const titleFromAttr = match[2].trim();
      const titleFromSpan = match[3].replace(/\s+/g, ' ').trim();

      const title = titleFromAttr || titleFromSpan;

      chapters.push({ title, href });
    }

    chapters.sort((a, b) => {
      const numA = parseFloat(a.title.match(/Chapter\s+(\d+)/i)?.[1]) || 0;
      const numB = parseFloat(b.title.match(/Chapter\s+(\d+)/i)?.[1]) || 0;
      return numA - numB;
    });

    chapters.forEach((chapter, index) => {
      chapter.number = index + 1;
    });

    console.log(JSON.stringify(chapters));
    return JSON.stringify(chapters);

  } catch (error) {
    console.error('Fetch error in extractChapters:', error);
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
    let htmlText = await response.text();

    const startPattern = /<div id="chr-content"[^>]*>/;
    const endPattern = /<\/div><hr class="chr-end">\s*<div class="chr-nav" id="chr-nav-bottom">/;

    const startMatch = htmlText.search(startPattern);
    const endMatch = htmlText.search(endPattern);

    if (startMatch === -1 || endMatch === -1) {
      throw new Error("Content markers not found");
    }

    const startIndex = htmlText.match(startPattern)[0].length + startMatch;
    let content = htmlText.substring(startIndex, endMatch).trim();

    content = content.replace(/<div id="pf-\d+-\d+"[^>]*>[\s\S]*?<\/div>/gi, '');
    content = content.replace(/<script[\s\S]*?<\/script>/gi, '');
    content = content.replace(/<div class="text-center ads-holder[^>]*>[\s\S]*?<\/div>/gi, '');
    content = content.replace(/<div class="ads-holder[^>]*>[\s\S]*?<\/div>/gi, '');
    content = content.trim();

    if (!content) {
      throw new Error("No content found between markers");
    }

    console.log(content);
    return content;

  } catch (error) {
    console.log("Fetch error in extractText: " + error);
    return '<p>Error extracting text</p>';
  }
}

async function soraFetch(url, options = {
    headers: {},
    method: 'GET',
    body: null
}) {
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
